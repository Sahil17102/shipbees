import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { generateLabelForOrder } from '../models/services/generateCustomLabelService'
import { resolveOrderAwbNumber } from '../models/services/pickupDetails.service'

const trimText = (value: unknown) => String(value ?? '').trim()

async function backfillVelocityLabels() {
  const orders = await db.select().from(b2c_orders).where(eq(b2c_orders.integration_type, 'velocity'))
  let updated = 0
  let skipped = 0
  let failed = 0

  for (const order of orders) {
    if (!resolveOrderAwbNumber(order)) {
      skipped += 1
      continue
    }

    try {
      const labelKey = trimText(await generateLabelForOrder(order, order.user_id, db))
      if (!labelKey) {
        skipped += 1
        continue
      }

      await db
        .update(b2c_orders)
        .set({ label: labelKey, updated_at: new Date() })
        .where(eq(b2c_orders.id, order.id))
      updated += 1
    } catch (error: any) {
      failed += 1
      console.error(`Failed to regenerate Velocity label for ${order.order_number}:`, error?.message || error)
    }
  }

  console.log('Velocity label backfill complete', {
    scanned: orders.length,
    updated,
    skipped,
    failed,
  })

  if (failed > 0) process.exitCode = 1
}

if (require.main === module) {
  backfillVelocityLabels()
    .then(() => process.exit(process.exitCode || 0))
    .catch((error) => {
      console.error('Velocity label backfill failed:', error)
      process.exit(1)
    })
}
