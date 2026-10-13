import assert from 'assert'
import { and, eq, sql } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { ndr_events } from '../models/schema/ndr'
import { pending_webhooks } from '../models/schema/pendingWebhooks'
import { rto_events } from '../models/schema/rto'
import { stores } from '../models/schema/stores'
import { supportTickets } from '../models/schema/supportTickets'
import { tracking_events } from '../models/schema/trackingEvents'
import { processShopifyComplianceWebhook, SHOPIFY_PLATFORM_ID } from '../models/services/shopify.service'

const ROLLBACK_SENTINEL = 'SHOPIFY_PRIVACY_ROLLBACK_OK'

const run = async () => {
  const [store] = await db
    .select()
    .from(stores)
    .where(
      and(
        eq(stores.platformId, SHOPIFY_PLATFORM_ID),
        sql`coalesce((${stores.metadata}->'storeInfo'->'plan'->>'partnerDevelopment')::boolean, false) = true`,
        sql`coalesce(${stores.metadata}->'oauth'->>'active', 'true') <> 'false'`,
      ),
    )
    .limit(1)
  assert(store, 'An active Shopify Partner development store is required for this rollback-only check')

  const suffix = Date.now().toString(36).toUpperCase()
  const shopifyOrderId = `9988${Date.now()}`
  const orderNumber = `PRIVACY-${suffix}`.slice(0, 50)
  const internalOrderId = `shopify_${store.id}_${shopifyOrderId}`.slice(0, 100)
  const awbNumber = `PRIVACYTEST${suffix}`.slice(0, 100)
  let insertedOrderId = ''
  let pendingWebhookId = ''
  let ticketId = ''

  try {
    await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(b2c_orders)
        .values({
          user_id: store.userId,
          order_number: orderNumber,
          order_date: new Date().toISOString(),
          order_amount: 100,
          order_id: internalOrderId,
          invoice_number: `INV-${suffix}`,
          buyer_name: 'Shopify Privacy Test Customer',
          buyer_phone: '9999999999',
          buyer_email: 'shopify-privacy-redaction@example.invalid',
          address: 'Privacy test address',
          address_line_1: 'Privacy test address line 1',
          address_line_2: 'Privacy test address line 2',
          address_landmark: 'Privacy landmark',
          address_locality: 'Privacy locality',
          city: 'Test City',
          state: 'Test State',
          country: 'India',
          pincode: '110001',
          products: [{ productName: 'Privacy test product', quantity: 1, price: 100 }],
          weight: 0.5,
          length: 10,
          breadth: 10,
          height: 10,
          order_type: 'prepaid',
          awb_number: awbNumber,
          delivery_location: 'Customer doorstep',
          delivery_message: 'Contains customer details',
          provider_meta: {
            shopify_store_id: String(store.id),
            customer_name: 'Shopify Privacy Test Customer',
          },
          integration_type: 'shopify',
          tags: `shopify_store:${store.id}`,
        })
        .returning({ id: b2c_orders.id })
      insertedOrderId = order.id

      await tx.insert(ndr_events).values({
        order_id: order.id,
        user_id: store.userId,
        awb_number: awbNumber,
        status: 'ndr',
        reason: 'Customer address detail',
        remarks: 'Customer phone detail',
        payload: { customer: 'Shopify Privacy Test Customer' },
      })
      await tx.insert(rto_events).values({
        order_id: order.id,
        user_id: store.userId,
        awb_number: awbNumber,
        status: 'rto',
        reason: 'Customer address detail',
        remarks: 'Customer phone detail',
        payload: { customer: 'Shopify Privacy Test Customer' },
      })
      await tx.insert(tracking_events).values({
        order_id: order.id,
        user_id: store.userId,
        awb_number: awbNumber,
        courier: 'privacy-test',
        status_code: 'TEST',
        status_text: 'Customer shipment update',
        location: 'Customer locality',
        raw: { customer: 'Shopify Privacy Test Customer' },
      })
      const [pendingWebhook] = await tx
        .insert(pending_webhooks)
        .values({
          awb_number: awbNumber,
          status: 'test',
          payload: { customer: 'Shopify Privacy Test Customer' },
        })
        .returning({ id: pending_webhooks.id })
      pendingWebhookId = pendingWebhook.id
      const [ticketRow] = await tx
        .insert(supportTickets)
        .values({
          userId: store.userId,
          subject: `Shopify order ${orderNumber}`,
          category: 'shipping',
          subcategory: 'privacy_test',
          awbNumber,
          description: 'Customer phone and address details',
          attachments: [],
        })
        .returning({ id: supportTickets.id })
      ticketId = ticketRow.id

      const result = await processShopifyComplianceWebhook(
        store.domain,
        'customers/redact',
        {
          customer: {
            id: 'privacy-test-customer',
            email: 'shopify-privacy-redaction@example.invalid',
            phone: '9999999999',
          },
          orders_to_redact: [shopifyOrderId],
        },
        tx,
      )
      assert.equal(result.action, 'customer_data_redacted')

      const [redactedOrder] = await tx.select().from(b2c_orders).where(eq(b2c_orders.id, order.id))
      assert.equal(redactedOrder.buyer_name, 'Redacted Shopify customer')
      assert.equal(redactedOrder.buyer_email, null)
      assert.equal(redactedOrder.buyer_phone, '')
      assert.equal(redactedOrder.address_line_1, null)
      assert.deepEqual(redactedOrder.products, [])
      assert.equal((redactedOrder.provider_meta as any)?.shopify_privacy_redacted, true)
      assert.equal(redactedOrder.awb_number, null)

      const [ndr] = await tx.select().from(ndr_events).where(eq(ndr_events.order_id, order.id))
      const [rto] = await tx.select().from(rto_events).where(eq(rto_events.order_id, order.id))
      const [tracking] = await tx
        .select()
        .from(tracking_events)
        .where(eq(tracking_events.order_id, order.id))
      const [pending] = await tx
        .select()
        .from(pending_webhooks)
        .where(eq(pending_webhooks.id, pendingWebhookId))
      const [ticket] = await tx
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, ticketId))

      assert.equal(ndr.payload, null)
      assert.equal(rto.payload, null)
      assert.equal(tracking.raw, null)
      assert.equal((pending.payload as any)?.shopify_privacy_redacted, true)
      assert.match(pending.awb_number || '', /^privacy-redacted-[0-9a-f-]+$/)
      assert.equal(ticket.awbNumber, null)
      assert.equal(ticket.attachments?.length, 0)

      throw new Error(ROLLBACK_SENTINEL)
    })
  } catch (error: any) {
    if (error?.message !== ROLLBACK_SENTINEL) throw error
  }

  const [persisted] = await db
    .select({ id: b2c_orders.id })
    .from(b2c_orders)
    .where(eq(b2c_orders.id, insertedOrderId))
  assert.equal(persisted, undefined, 'Rollback-only privacy test data must never persist')
  console.log('Shopify privacy redaction rollback check passed')
}

run()
  .catch((error) => {
    console.error('Shopify privacy redaction rollback check failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
  })
