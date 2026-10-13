"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalSearch = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const invoices_1 = require("../schema/invoices");
const ndr_1 = require("../schema/ndr");
const rto_1 = require("../schema/rto");
const weightDiscrepancies_1 = require("../schema/weightDiscrepancies");
const normalizeQuery = (value) => value.trim();
const normalizeCompact = (value) => normalizeQuery(value).replace(/[\s-]+/g, '');
const textLike = (column, value) => (0, drizzle_orm_1.sql) `COALESCE(CAST(${column} AS TEXT), '') ILIKE ${`%${value}%`}`;
const compactLike = (column, value) => (0, drizzle_orm_1.sql) `REPLACE(REPLACE(COALESCE(CAST(${column} AS TEXT), ''), '-', ''), ' ', '') ILIKE ${`%${value}%`}`;
const joinSubtitle = (parts) => parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' | ');
const scoreResult = (result, rawQuery) => {
    const query = normalizeQuery(rawQuery).toLowerCase();
    const compactQuery = normalizeCompact(rawQuery).toLowerCase();
    const searchable = [
        result.title,
        result.subtitle,
        result.metadata?.awb,
        result.metadata?.orderId,
        result.metadata?.shipmentId,
        result.metadata?.buyerPhone,
        result.metadata?.buyerEmail,
    ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
    const compactSearchable = searchable.replace(/[\s-]+/g, '');
    if (compactSearchable === compactQuery || searchable === query)
        return 100;
    if (compactSearchable.startsWith(compactQuery))
        return 80;
    if (searchable.includes(query) || compactSearchable.includes(compactQuery))
        return 50;
    return 0;
};
const globalSearch = async (userId, query, limit = 10) => {
    const normalizedQuery = normalizeQuery(query);
    const compactQuery = normalizeCompact(query);
    const searchLimit = Math.max(1, Math.min(Number(limit) || 10, 25));
    const results = [];
    const b2cOrders = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        order_id: b2cOrders_1.b2c_orders.order_id,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        shipment_id: b2cOrders_1.b2c_orders.shipment_id,
        buyer_name: b2cOrders_1.b2c_orders.buyer_name,
        buyer_phone: b2cOrders_1.b2c_orders.buyer_phone,
        buyer_email: b2cOrders_1.b2c_orders.buyer_email,
        city: b2cOrders_1.b2c_orders.city,
        state: b2cOrders_1.b2c_orders.state,
        order_status: b2cOrders_1.b2c_orders.order_status,
        order_type: b2cOrders_1.b2c_orders.order_type,
        courier_partner: b2cOrders_1.b2c_orders.courier_partner,
        invoice_number: b2cOrders_1.b2c_orders.invoice_number,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.order_number, `%${normalizedQuery}%`), textLike(b2cOrders_1.b2c_orders.order_id, normalizedQuery), textLike(b2cOrders_1.b2c_orders.awb_number, normalizedQuery), textLike(b2cOrders_1.b2c_orders.shipment_id, normalizedQuery), textLike(b2cOrders_1.b2c_orders.provider_reference, normalizedQuery), textLike(b2cOrders_1.b2c_orders.provider_request_id, normalizedQuery), textLike(b2cOrders_1.b2c_orders.invoice_number, normalizedQuery), textLike(b2cOrders_1.b2c_orders.courier_partner, normalizedQuery), (0, drizzle_orm_1.ilike)(b2cOrders_1.b2c_orders.buyer_name, `%${normalizedQuery}%`), textLike(b2cOrders_1.b2c_orders.buyer_phone, normalizedQuery), textLike(b2cOrders_1.b2c_orders.buyer_email, normalizedQuery), compactQuery ? compactLike(b2cOrders_1.b2c_orders.order_number, compactQuery) : undefined, compactQuery ? compactLike(b2cOrders_1.b2c_orders.order_id, compactQuery) : undefined, compactQuery ? compactLike(b2cOrders_1.b2c_orders.awb_number, compactQuery) : undefined, compactQuery ? compactLike(b2cOrders_1.b2c_orders.shipment_id, compactQuery) : undefined, compactQuery ? compactLike(b2cOrders_1.b2c_orders.buyer_phone, compactQuery) : undefined)))
        .limit(searchLimit);
    for (const order of b2cOrders) {
        results.push({
            type: 'order',
            id: order.id,
            title: order.order_number,
            subtitle: joinSubtitle([
                'B2C',
                order.order_status,
                order.buyer_name,
                order.buyer_phone,
                order.city && order.state ? `${order.city}, ${order.state}` : order.city || order.state,
                order.awb_number ? `AWB ${order.awb_number}` : null,
                order.courier_partner,
            ]),
            link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
            metadata: {
                awb: order.awb_number,
                status: order.order_status,
                type: 'b2c',
                orderId: order.order_id,
                shipmentId: order.shipment_id,
                buyerPhone: order.buyer_phone,
                buyerEmail: order.buyer_email,
                paymentMode: order.order_type,
            },
        });
    }
    const b2bOrders = await client_1.db
        .select({
        id: b2bOrders_1.b2b_orders.id,
        order_number: b2bOrders_1.b2b_orders.order_number,
        order_id: b2bOrders_1.b2b_orders.order_id,
        awb_number: b2bOrders_1.b2b_orders.awb_number,
        shipment_id: b2bOrders_1.b2b_orders.shipment_id,
        buyer_name: b2bOrders_1.b2b_orders.buyer_name,
        buyer_phone: b2bOrders_1.b2b_orders.buyer_phone,
        buyer_email: b2bOrders_1.b2b_orders.buyer_email,
        city: b2bOrders_1.b2b_orders.city,
        state: b2bOrders_1.b2b_orders.state,
        order_status: b2bOrders_1.b2b_orders.order_status,
        order_type: b2bOrders_1.b2b_orders.order_type,
        courier_partner: b2bOrders_1.b2b_orders.courier_partner,
        invoice_number: b2bOrders_1.b2b_orders.invoice_number,
        company_name: b2bOrders_1.b2b_orders.company_name,
    })
        .from(b2bOrders_1.b2b_orders)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(b2bOrders_1.b2b_orders.order_number, `%${normalizedQuery}%`), textLike(b2bOrders_1.b2b_orders.order_id, normalizedQuery), textLike(b2bOrders_1.b2b_orders.awb_number, normalizedQuery), textLike(b2bOrders_1.b2b_orders.shipment_id, normalizedQuery), textLike(b2bOrders_1.b2b_orders.provider_reference, normalizedQuery), textLike(b2bOrders_1.b2b_orders.provider_request_id, normalizedQuery), textLike(b2bOrders_1.b2b_orders.invoice_number, normalizedQuery), textLike(b2bOrders_1.b2b_orders.courier_partner, normalizedQuery), textLike(b2bOrders_1.b2b_orders.company_name, normalizedQuery), (0, drizzle_orm_1.ilike)(b2bOrders_1.b2b_orders.buyer_name, `%${normalizedQuery}%`), textLike(b2bOrders_1.b2b_orders.buyer_phone, normalizedQuery), textLike(b2bOrders_1.b2b_orders.buyer_email, normalizedQuery), compactQuery ? compactLike(b2bOrders_1.b2b_orders.order_number, compactQuery) : undefined, compactQuery ? compactLike(b2bOrders_1.b2b_orders.order_id, compactQuery) : undefined, compactQuery ? compactLike(b2bOrders_1.b2b_orders.awb_number, compactQuery) : undefined, compactQuery ? compactLike(b2bOrders_1.b2b_orders.shipment_id, compactQuery) : undefined, compactQuery ? compactLike(b2bOrders_1.b2b_orders.buyer_phone, compactQuery) : undefined)))
        .limit(searchLimit);
    for (const order of b2bOrders) {
        results.push({
            type: 'order',
            id: order.id,
            title: order.order_number,
            subtitle: joinSubtitle([
                'B2B',
                order.order_status,
                order.company_name,
                order.buyer_name,
                order.buyer_phone,
                order.city && order.state ? `${order.city}, ${order.state}` : order.city || order.state,
                order.awb_number ? `AWB ${order.awb_number}` : null,
                order.courier_partner,
            ]),
            link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
            metadata: {
                awb: order.awb_number,
                status: order.order_status,
                type: 'b2b',
                orderId: order.order_id,
                shipmentId: order.shipment_id,
                buyerPhone: order.buyer_phone,
                buyerEmail: order.buyer_email,
                paymentMode: order.order_type,
            },
        });
    }
    const invoiceResults = await client_1.db
        .select({
        id: invoices_1.invoices.id,
        invoice_number: invoices_1.invoices.invoiceNumber,
        status: invoices_1.invoices.status,
        net_payable_amount: invoices_1.invoices.netPayableAmount,
    })
        .from(invoices_1.invoices)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(invoices_1.invoices.userId, userId), (0, drizzle_orm_1.ilike)(invoices_1.invoices.invoiceNumber, `%${normalizedQuery}%`)))
        .limit(5);
    for (const invoice of invoiceResults) {
        results.push({
            type: 'invoice',
            id: String(invoice.id),
            title: invoice.invoice_number,
            subtitle: `Status: ${invoice.status} | Amount: INR ${Number(invoice.net_payable_amount).toLocaleString('en-IN')}`,
            link: `/billing/invoice_management?search=${encodeURIComponent(invoice.invoice_number)}`,
            metadata: {
                status: invoice.status,
                amount: invoice.net_payable_amount,
            },
        });
    }
    const ndrResults = await client_1.db
        .select({
        id: ndr_1.ndr_events.id,
        order_id: ndr_1.ndr_events.order_id,
        awb_number: ndr_1.ndr_events.awb_number,
        status: ndr_1.ndr_events.status,
        reason: ndr_1.ndr_events.reason,
    })
        .from(ndr_1.ndr_events)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(ndr_1.ndr_events.user_id, userId), (0, drizzle_orm_1.or)(textLike(ndr_1.ndr_events.awb_number, normalizedQuery), textLike(ndr_1.ndr_events.order_id, normalizedQuery))))
        .limit(5);
    for (const ndr of ndrResults) {
        results.push({
            type: 'ndr',
            id: ndr.id,
            title: ndr.awb_number || `NDR-${ndr.id.slice(0, 8)}`,
            subtitle: `NDR | ${ndr.status} | ${ndr.reason || 'No reason'}`,
            link: `/ops/ndr?search=${encodeURIComponent(ndr.awb_number || ndr.order_id)}`,
            metadata: {
                status: ndr.status,
                reason: ndr.reason,
                awb: ndr.awb_number,
                orderId: ndr.order_id,
            },
        });
    }
    const rtoResults = await client_1.db
        .select({
        id: rto_1.rto_events.id,
        order_id: rto_1.rto_events.order_id,
        awb_number: rto_1.rto_events.awb_number,
        status: rto_1.rto_events.status,
        reason: rto_1.rto_events.reason,
    })
        .from(rto_1.rto_events)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rto_1.rto_events.user_id, userId), (0, drizzle_orm_1.or)(textLike(rto_1.rto_events.awb_number, normalizedQuery), textLike(rto_1.rto_events.order_id, normalizedQuery))))
        .limit(5);
    for (const rto of rtoResults) {
        results.push({
            type: 'rto',
            id: rto.id,
            title: rto.awb_number || `RTO-${rto.id.slice(0, 8)}`,
            subtitle: `RTO | ${rto.status} | ${rto.reason || 'No reason'}`,
            link: `/ops/rto?search=${encodeURIComponent(rto.awb_number || rto.order_id)}`,
            metadata: {
                status: rto.status,
                reason: rto.reason,
                awb: rto.awb_number,
                orderId: rto.order_id,
            },
        });
    }
    const weightResults = await client_1.db
        .select({
        id: weightDiscrepancies_1.weight_discrepancies.id,
        order_number: weightDiscrepancies_1.weight_discrepancies.order_number,
        awb_number: weightDiscrepancies_1.weight_discrepancies.awb_number,
        status: weightDiscrepancies_1.weight_discrepancies.status,
    })
        .from(weightDiscrepancies_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(weightDiscrepancies_1.weight_discrepancies.user_id, userId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(weightDiscrepancies_1.weight_discrepancies.order_number, `%${normalizedQuery}%`), textLike(weightDiscrepancies_1.weight_discrepancies.awb_number, normalizedQuery))))
        .limit(5);
    for (const weight of weightResults) {
        results.push({
            type: 'weight_discrepancy',
            id: weight.id,
            title: weight.order_number,
            subtitle: weight.awb_number
                ? `Weight Discrepancy | ${weight.status} | AWB: ${weight.awb_number}`
                : `Weight Discrepancy | ${weight.status}`,
            link: `/reconciliation/weight?search=${encodeURIComponent(weight.order_number)}`,
            metadata: {
                status: weight.status,
                awb: weight.awb_number,
                orderId: weight.order_number,
            },
        });
    }
    return results
        .sort((a, b) => {
        const aScore = scoreResult(a, normalizedQuery);
        const bScore = scoreResult(b, normalizedQuery);
        if (aScore !== bScore)
            return bScore - aScore;
        return a.title.localeCompare(b.title);
    })
        .slice(0, searchLimit);
};
exports.globalSearch = globalSearch;
