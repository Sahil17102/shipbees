"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markXpressbeesManualAwbFailed = exports.markXpressbeesManualAwbUsed = exports.reserveNextXpressbeesManualAwb = exports.createXpressbeesManualAwbRange = exports.getXpressbeesManualAwbSummary = void 0;
const classes_1 = require("../../utils/classes");
const client_1 = require("../client");
const DIGITS_ONLY = /^[0-9]+$/;
const normalizeAwb = (value) => String(value ?? '')
    .trim()
    .replace(/\D/g, '');
const toAwbBigInt = (value, fieldName) => {
    if (!DIGITS_ONLY.test(value)) {
        throw new classes_1.HttpError(400, `${fieldName} must contain digits only`);
    }
    return BigInt(value);
};
const formatAwb = (value, width) => value.toString().padStart(width, '0');
const safeCount = (value) => value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
const calculateRangeMath = (row) => {
    const start = toAwbBigInt(row.start_awb, 'AWB start number');
    const end = toAwbBigInt(row.end_awb, 'AWB ending number');
    const next = toAwbBigInt(row.next_awb, 'Current AWB number');
    const total = end >= start ? end - start + 1n : 0n;
    const remaining = row.status === 'active' && next <= end ? end - next + 1n : 0n;
    return {
        start,
        end,
        next,
        width: Math.max(row.start_awb.length, row.end_awb.length, row.next_awb.length),
        totalCount: safeCount(total),
        remainingCount: safeCount(remaining),
        currentAwb: remaining > 0n ? formatAwb(next, row.next_awb.length) : null,
    };
};
const buildSummary = async (row) => {
    if (!row) {
        return {
            configured: false,
            active: false,
            range: null,
            recentAllocations: [],
        };
    }
    const countsResult = await client_1.pool.query(`
      select status, count(*)::text as count
      from xpressbees_awb_allocations
      where range_id = $1
      group by status
    `, [row.id]);
    const counts = countsResult.rows.reduce((acc, item) => {
        acc[item.status] = Number(item.count || 0);
        return acc;
    }, {});
    const recentResult = await client_1.pool.query(`
      select awb_number, status, order_number, failure_reason, created_at, updated_at, used_at, failed_at
      from xpressbees_awb_allocations
      where range_id = $1
      order by created_at desc
      limit 8
    `, [row.id]);
    const math = calculateRangeMath(row);
    const allocatedCount = (counts.reserved || 0) + (counts.used || 0) + (counts.failed || 0) + (counts.skipped || 0);
    return {
        configured: true,
        active: row.is_active && row.status === 'active' && Boolean(math.currentAwb),
        range: {
            id: row.id,
            startAwb: row.start_awb,
            endAwb: row.end_awb,
            nextAwb: math.currentAwb,
            currentAwb: math.currentAwb,
            lastAllocatedAwb: row.last_allocated_awb,
            status: row.status,
            isActive: row.is_active,
            totalCount: math.totalCount,
            remainingCount: math.remainingCount,
            allocatedCount,
            reservedCount: counts.reserved || 0,
            usedCount: counts.used || 0,
            failedCount: counts.failed || 0,
            skippedCount: counts.skipped || 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            exhaustedAt: row.exhausted_at,
        },
        recentAllocations: recentResult.rows.map((item) => ({
            awbNumber: item.awb_number,
            status: item.status,
            orderNumber: item.order_number,
            failureReason: item.failure_reason,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            usedAt: item.used_at,
            failedAt: item.failed_at,
        })),
    };
};
const getXpressbeesManualAwbSummary = async () => {
    const result = await client_1.pool.query(`
    select id, start_awb, end_awb, next_awb, last_allocated_awb, status, is_active,
           created_at, updated_at, exhausted_at
    from xpressbees_awb_ranges
    order by
      case when is_active = true and status = 'active' then 0 else 1 end,
      created_at desc
    limit 1
  `);
    return buildSummary(result.rows[0] || null);
};
exports.getXpressbeesManualAwbSummary = getXpressbeesManualAwbSummary;
const createXpressbeesManualAwbRange = async ({ startAwb, endAwb, createdBy, }) => {
    const normalizedStart = normalizeAwb(startAwb);
    const normalizedEnd = normalizeAwb(endAwb);
    if (!normalizedStart || !normalizedEnd) {
        throw new classes_1.HttpError(400, 'AWB starting number and ending number are required');
    }
    const start = toAwbBigInt(normalizedStart, 'AWB starting number');
    const end = toAwbBigInt(normalizedEnd, 'AWB ending number');
    if (end < start) {
        throw new classes_1.HttpError(400, 'AWB ending number must be greater than or equal to starting number');
    }
    const client = await client_1.pool.connect();
    try {
        await client.query('BEGIN');
        const activeResult = await client.query(`
        select id, start_awb, end_awb, next_awb, last_allocated_awb, status, is_active,
               created_at, updated_at, exhausted_at
        from xpressbees_awb_ranges
        where is_active = true and status = 'active'
        order by created_at desc
        limit 1
        for update
      `);
        const activeRange = activeResult.rows[0] || null;
        if (activeRange) {
            const activeMath = calculateRangeMath(activeRange);
            const allocationCountResult = await client.query('select count(*)::text as count from xpressbees_awb_allocations where range_id = $1', [activeRange.id]);
            const allocationCount = Number(allocationCountResult.rows[0]?.count || 0);
            if (activeMath.remainingCount > 0 && allocationCount > 0) {
                throw new classes_1.HttpError(400, `Xpressbees AWB range already has ${activeMath.remainingCount} AWB(s) remaining. Add the next range only after the active range is exhausted.`);
            }
        }
        const overlapResult = await client.query(`
        select id, start_awb, end_awb
        from xpressbees_awb_ranges
        where start_awb ~ '^[0-9]+$'
          and end_awb ~ '^[0-9]+$'
          and $1::numeric <= end_awb::numeric
          and $2::numeric >= start_awb::numeric
        limit 1
      `, [normalizedStart, normalizedEnd]);
        if (overlapResult.rows.length) {
            const overlap = overlapResult.rows[0];
            throw new classes_1.HttpError(400, `This AWB range overlaps an existing range (${overlap.start_awb} - ${overlap.end_awb}).`);
        }
        await client.query(`
        update xpressbees_awb_ranges
        set is_active = false, status = 'retired', updated_at = now()
        where is_active = true and status = 'active'
      `);
        await client.query(`
        insert into xpressbees_awb_ranges
          (start_awb, end_awb, next_awb, status, is_active, created_by, created_at, updated_at)
        values ($1, $2, $1, 'active', true, $3, now(), now())
      `, [normalizedStart, normalizedEnd, createdBy || null]);
        await client.query('COMMIT');
        return (0, exports.getXpressbeesManualAwbSummary)();
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
    finally {
        client.release();
    }
};
exports.createXpressbeesManualAwbRange = createXpressbeesManualAwbRange;
const reserveNextXpressbeesManualAwb = async ({ orderNumber, userId, }) => {
    const client = await client_1.pool.connect();
    let committed = false;
    try {
        await client.query('BEGIN');
        const rangeResult = await client.query(`
        select id, start_awb, end_awb, next_awb, last_allocated_awb, status, is_active,
               created_at, updated_at, exhausted_at
        from xpressbees_awb_ranges
        where is_active = true and status = 'active'
        order by created_at desc
        limit 1
        for update
      `);
        const range = rangeResult.rows[0] || null;
        if (!range) {
            throw new classes_1.HttpError(400, 'Xpressbees manual AWB range is not configured. Add an AWB starting and ending number in Admin > Couriers > Credentials before booking Xpressbees shipments.');
        }
        const start = toAwbBigInt(range.start_awb, 'AWB starting number');
        const end = toAwbBigInt(range.end_awb, 'AWB ending number');
        let next = toAwbBigInt(range.next_awb, 'Current AWB number');
        const width = Math.max(range.start_awb.length, range.end_awb.length, range.next_awb.length);
        if (next < start)
            next = start;
        while (next <= end) {
            const awb = formatAwb(next, width);
            const existing = await client.query('select id from xpressbees_awb_allocations where awb_number = $1 limit 1', [awb]);
            if (existing.rows.length) {
                next += 1n;
                continue;
            }
            const newNext = next + 1n;
            const remainingAfter = newNext <= end ? end - newNext + 1n : 0n;
            const nextAwb = formatAwb(newNext, width);
            const exhausted = newNext > end;
            const allocationResult = await client.query(`
          insert into xpressbees_awb_allocations
            (range_id, awb_number, status, order_number, user_id, created_at, updated_at)
          values ($1, $2, 'reserved', $3, $4, now(), now())
          returning id
        `, [range.id, awb, orderNumber || null, userId || null]);
            await client.query(`
          update xpressbees_awb_ranges
          set next_awb = $2,
              last_allocated_awb = $3,
              status = $4::varchar,
              is_active = $5::boolean,
              exhausted_at = case when $4::varchar = 'exhausted' then now() else exhausted_at end,
              updated_at = now()
          where id = $1
        `, [range.id, nextAwb, awb, exhausted ? 'exhausted' : 'active', !exhausted]);
            await client.query('COMMIT');
            committed = true;
            return {
                allocationId: allocationResult.rows[0].id,
                rangeId: range.id,
                awb,
                remainingAfter: safeCount(remainingAfter),
            };
        }
        await client.query(`
        update xpressbees_awb_ranges
        set status = 'exhausted', is_active = false, exhausted_at = coalesce(exhausted_at, now()), updated_at = now()
        where id = $1
      `, [range.id]);
        await client.query('COMMIT');
        committed = true;
        throw new classes_1.HttpError(400, 'Xpressbees manual AWB range is exhausted. Add the next AWB range before booking more Xpressbees shipments.');
    }
    catch (error) {
        if (!committed) {
            await client.query('ROLLBACK').catch(() => undefined);
        }
        throw error;
    }
    finally {
        client.release();
    }
};
exports.reserveNextXpressbeesManualAwb = reserveNextXpressbeesManualAwb;
const markXpressbeesManualAwbUsed = async ({ allocationId, localOrderId, providerReference, providerResponse, }) => {
    if (!allocationId)
        return;
    await client_1.pool.query(`
      update xpressbees_awb_allocations
      set status = 'used',
          local_order_id = coalesce($2::uuid, local_order_id),
          provider_reference = coalesce($3, provider_reference),
          provider_response = coalesce($4::jsonb, provider_response),
          used_at = coalesce(used_at, now()),
          updated_at = now()
      where id = $1 and status in ('reserved', 'used')
    `, [
        allocationId,
        localOrderId || null,
        providerReference || null,
        providerResponse === undefined ? null : JSON.stringify(providerResponse),
    ]);
};
exports.markXpressbeesManualAwbUsed = markXpressbeesManualAwbUsed;
const markXpressbeesManualAwbFailed = async ({ allocationId, failureReason, providerResponse, }) => {
    if (!allocationId)
        return;
    await client_1.pool.query(`
      update xpressbees_awb_allocations
      set status = 'failed',
          failure_reason = left(coalesce($2, failure_reason, 'Xpressbees shipment creation failed'), 2000),
          provider_response = coalesce($3::jsonb, provider_response),
          failed_at = coalesce(failed_at, now()),
          updated_at = now()
      where id = $1 and status = 'reserved'
    `, [
        allocationId,
        failureReason || null,
        providerResponse === undefined ? null : JSON.stringify(providerResponse),
    ]);
};
exports.markXpressbeesManualAwbFailed = markXpressbeesManualAwbFailed;
