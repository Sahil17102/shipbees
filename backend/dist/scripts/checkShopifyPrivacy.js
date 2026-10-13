"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const ndr_1 = require("../models/schema/ndr");
const pendingWebhooks_1 = require("../models/schema/pendingWebhooks");
const rto_1 = require("../models/schema/rto");
const stores_1 = require("../models/schema/stores");
const supportTickets_1 = require("../models/schema/supportTickets");
const trackingEvents_1 = require("../models/schema/trackingEvents");
const shopify_service_1 = require("../models/services/shopify.service");
const ROLLBACK_SENTINEL = 'SHOPIFY_PRIVACY_ROLLBACK_OK';
const run = async () => {
    const [store] = await client_1.db
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.platformId, shopify_service_1.SHOPIFY_PLATFORM_ID), (0, drizzle_orm_1.sql) `coalesce((${stores_1.stores.metadata}->'storeInfo'->'plan'->>'partnerDevelopment')::boolean, false) = true`, (0, drizzle_orm_1.sql) `coalesce(${stores_1.stores.metadata}->'oauth'->>'active', 'true') <> 'false'`))
        .limit(1);
    (0, assert_1.default)(store, 'An active Shopify Partner development store is required for this rollback-only check');
    const suffix = Date.now().toString(36).toUpperCase();
    const shopifyOrderId = `9988${Date.now()}`;
    const orderNumber = `PRIVACY-${suffix}`.slice(0, 50);
    const internalOrderId = `shopify_${store.id}_${shopifyOrderId}`.slice(0, 100);
    const awbNumber = `PRIVACYTEST${suffix}`.slice(0, 100);
    let insertedOrderId = '';
    let pendingWebhookId = '';
    let ticketId = '';
    try {
        await client_1.db.transaction(async (tx) => {
            const [order] = await tx
                .insert(b2cOrders_1.b2c_orders)
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
                .returning({ id: b2cOrders_1.b2c_orders.id });
            insertedOrderId = order.id;
            await tx.insert(ndr_1.ndr_events).values({
                order_id: order.id,
                user_id: store.userId,
                awb_number: awbNumber,
                status: 'ndr',
                reason: 'Customer address detail',
                remarks: 'Customer phone detail',
                payload: { customer: 'Shopify Privacy Test Customer' },
            });
            await tx.insert(rto_1.rto_events).values({
                order_id: order.id,
                user_id: store.userId,
                awb_number: awbNumber,
                status: 'rto',
                reason: 'Customer address detail',
                remarks: 'Customer phone detail',
                payload: { customer: 'Shopify Privacy Test Customer' },
            });
            await tx.insert(trackingEvents_1.tracking_events).values({
                order_id: order.id,
                user_id: store.userId,
                awb_number: awbNumber,
                courier: 'privacy-test',
                status_code: 'TEST',
                status_text: 'Customer shipment update',
                location: 'Customer locality',
                raw: { customer: 'Shopify Privacy Test Customer' },
            });
            const [pendingWebhook] = await tx
                .insert(pendingWebhooks_1.pending_webhooks)
                .values({
                awb_number: awbNumber,
                status: 'test',
                payload: { customer: 'Shopify Privacy Test Customer' },
            })
                .returning({ id: pendingWebhooks_1.pending_webhooks.id });
            pendingWebhookId = pendingWebhook.id;
            const [ticketRow] = await tx
                .insert(supportTickets_1.supportTickets)
                .values({
                userId: store.userId,
                subject: `Shopify order ${orderNumber}`,
                category: 'shipping',
                subcategory: 'privacy_test',
                awbNumber,
                description: 'Customer phone and address details',
                attachments: [],
            })
                .returning({ id: supportTickets_1.supportTickets.id });
            ticketId = ticketRow.id;
            const result = await (0, shopify_service_1.processShopifyComplianceWebhook)(store.domain, 'customers/redact', {
                customer: {
                    id: 'privacy-test-customer',
                    email: 'shopify-privacy-redaction@example.invalid',
                    phone: '9999999999',
                },
                orders_to_redact: [shopifyOrderId],
            }, tx);
            assert_1.default.equal(result.action, 'customer_data_redacted');
            const [redactedOrder] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            assert_1.default.equal(redactedOrder.buyer_name, 'Redacted Shopify customer');
            assert_1.default.equal(redactedOrder.buyer_email, null);
            assert_1.default.equal(redactedOrder.buyer_phone, '');
            assert_1.default.equal(redactedOrder.address_line_1, null);
            assert_1.default.deepEqual(redactedOrder.products, []);
            assert_1.default.equal(redactedOrder.provider_meta?.shopify_privacy_redacted, true);
            assert_1.default.equal(redactedOrder.awb_number, null);
            const [ndr] = await tx.select().from(ndr_1.ndr_events).where((0, drizzle_orm_1.eq)(ndr_1.ndr_events.order_id, order.id));
            const [rto] = await tx.select().from(rto_1.rto_events).where((0, drizzle_orm_1.eq)(rto_1.rto_events.order_id, order.id));
            const [tracking] = await tx
                .select()
                .from(trackingEvents_1.tracking_events)
                .where((0, drizzle_orm_1.eq)(trackingEvents_1.tracking_events.order_id, order.id));
            const [pending] = await tx
                .select()
                .from(pendingWebhooks_1.pending_webhooks)
                .where((0, drizzle_orm_1.eq)(pendingWebhooks_1.pending_webhooks.id, pendingWebhookId));
            const [ticket] = await tx
                .select()
                .from(supportTickets_1.supportTickets)
                .where((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.id, ticketId));
            assert_1.default.equal(ndr.payload, null);
            assert_1.default.equal(rto.payload, null);
            assert_1.default.equal(tracking.raw, null);
            assert_1.default.equal(pending.payload?.shopify_privacy_redacted, true);
            assert_1.default.match(pending.awb_number || '', /^privacy-redacted-[0-9a-f-]+$/);
            assert_1.default.equal(ticket.awbNumber, null);
            assert_1.default.equal(ticket.attachments?.length, 0);
            throw new Error(ROLLBACK_SENTINEL);
        });
    }
    catch (error) {
        if (error?.message !== ROLLBACK_SENTINEL)
            throw error;
    }
    const [persisted] = await client_1.db
        .select({ id: b2cOrders_1.b2c_orders.id })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, insertedOrderId));
    assert_1.default.equal(persisted, undefined, 'Rollback-only privacy test data must never persist');
    console.log('Shopify privacy redaction rollback check passed');
};
run()
    .catch((error) => {
    console.error('Shopify privacy redaction rollback check failed:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end().catch(() => undefined);
});
