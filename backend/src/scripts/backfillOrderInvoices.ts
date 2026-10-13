import { desc, sql } from 'drizzle-orm'
import { db } from '../models/client'
import { b2b_orders } from '../models/schema/b2bOrders'
import { b2c_orders } from '../models/schema/b2cOrders'
import { regenerateOrderDocumentsServiceAdmin } from '../models/services/adminOrders.service'

const toPositiveInt = (value: unknown, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

const LIMIT = toPositiveInt(process.env.LIMIT, 100)
const BATCH_SIZE = Math.min(toPositiveInt(process.env.BATCH_SIZE, 25), 100)
const ORDER_TYPE = String(process.env.ORDER_TYPE || 'all').trim().toLowerCase()
const DRY_RUN = String(process.env.DRY_RUN || '').trim() === '1'

type BackfillOrderRef = {
  id: string
  orderNumber: string | null
  orderType: 'b2c' | 'b2b'
}

async function fetchOrderRefs(table: typeof b2c_orders | typeof b2b_orders, orderType: 'b2c' | 'b2b', limit: number) {
  const rows = await db
    .select({
      id: table.id,
      orderNumber: table.order_number,
      createdAt: table.created_at,
    })
    .from(table as any)
    .where(sql`coalesce(${table.invoice_link}, '') <> ''`)
    .orderBy(desc(table.created_at))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    orderNumber: row.orderNumber || null,
    orderType,
  }))
}

export async function backfillOrderInvoices() {
  console.log('Starting order invoice backfill...', {
    limit: LIMIT,
    batchSize: BATCH_SIZE,
    orderType: ORDER_TYPE,
    dryRun: DRY_RUN,
  })

  const scopes: Array<'b2c' | 'b2b'> =
    ORDER_TYPE === 'b2c' ? ['b2c'] : ORDER_TYPE === 'b2b' ? ['b2b'] : ['b2c', 'b2b']
  const perScopeLimit = Math.max(1, Math.ceil(LIMIT / scopes.length))
  const refs: BackfillOrderRef[] = []

  if (scopes.includes('b2c')) {
    refs.push(...(await fetchOrderRefs(b2c_orders, 'b2c', perScopeLimit)))
  }
  if (scopes.includes('b2b')) {
    refs.push(...(await fetchOrderRefs(b2b_orders, 'b2b', perScopeLimit)))
  }

  refs.sort((a, b) => a.orderType.localeCompare(b.orderType)).splice(LIMIT)

  let regenerated = 0
  let failed = 0
  let skipped = 0

  for (let index = 0; index < refs.length; index += BATCH_SIZE) {
    const batch = refs.slice(index, index + BATCH_SIZE)

    for (const order of batch) {
      if (DRY_RUN) {
        skipped += 1
        console.log('[dry-run] would regenerate invoice', order)
        continue
      }

      try {
        await regenerateOrderDocumentsServiceAdmin({
          orderId: order.id,
          regenerateLabel: false,
          regenerateInvoice: true,
        })
        regenerated += 1
        console.log('Regenerated invoice', order)
      } catch (error: any) {
        failed += 1
        console.error('Failed to regenerate invoice', order, error?.message || error)
      }
    }
  }

  console.log('Order invoice backfill complete', {
    scanned: refs.length,
    regenerated,
    skipped,
    failed,
  })
}

if (require.main === module) {
  backfillOrderInvoices()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Order invoice backfill failed:', error)
      process.exit(1)
    })
}
