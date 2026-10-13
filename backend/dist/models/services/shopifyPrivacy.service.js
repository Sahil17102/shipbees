"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactShopifyComplianceRequestPayloads = exports.processPendingShopifyDataRequests = exports.queueShopifyCustomerDataRequest = void 0;
const crypto_1 = __importDefault(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const ndr_1 = require("../schema/ndr");
const rto_1 = require("../schema/rto");
const shopifyComplianceRequests_1 = require("../schema/shopifyComplianceRequests");
const stores_1 = require("../schema/stores");
const supportTickets_1 = require("../schema/supportTickets");
const trackingEvents_1 = require("../schema/trackingEvents");
const users_1 = require("../schema/users");
const weightDiscrepancies_1 = require("../schema/weightDiscrepancies");
const secretEncryption_1 = require("../../utils/secretEncryption");
const emailSender_1 = require("../../utils/emailSender");
const notifications_service_1 = require("./notifications.service");
const DAY_MS = 24 * 60 * 60 * 1000;
const hashValue = (value) => crypto_1.default.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');
const sanitizeAuditError = (error) => String(error?.message || error || 'Unknown Shopify privacy delivery error')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted-email]')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, '[redacted-phone]')
    .slice(0, 1000);
const buildShopifyOrderIdsForPayload = (store, orderIds = []) => orderIds
    .map((orderId) => String(orderId || '').trim())
    .filter(Boolean)
    .flatMap((orderId) => [`shopify_${store.id}_${orderId}`, `shopify_${orderId}`]);
const findRequestedOrders = async (store, payload, executor = client_1.db) => {
    const requestedOrderIds = Array.isArray(payload?.orders_requested) ? payload.orders_requested : [];
    const orderIds = buildShopifyOrderIdsForPayload(store, requestedOrderIds);
    const customerEmail = String(payload?.customer?.email || '').trim().toLowerCase();
    const customerPhone = String(payload?.customer?.phone || '').trim();
    if (!orderIds.length && !customerEmail && !customerPhone)
        return [];
    return executor
        .select()
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.sql) `
      ${b2cOrders_1.b2c_orders.order_id} LIKE ${`shopify_${store.id}_%`}
      AND (
        ${orderIds.length ? (0, drizzle_orm_1.sql) `${b2cOrders_1.b2c_orders.order_id} IN (${drizzle_orm_1.sql.join(orderIds.map((id) => (0, drizzle_orm_1.sql) `${id}`), (0, drizzle_orm_1.sql) `, `)})` : (0, drizzle_orm_1.sql) `false`}
        OR ${customerEmail ? (0, drizzle_orm_1.sql) `lower(coalesce(${b2cOrders_1.b2c_orders.buyer_email}, '')) = ${customerEmail}` : (0, drizzle_orm_1.sql) `false`}
        OR ${customerPhone ? (0, drizzle_orm_1.sql) `coalesce(${b2cOrders_1.b2c_orders.buyer_phone}, '') = ${customerPhone}` : (0, drizzle_orm_1.sql) `false`}
      )
    `);
};
const buildCustomerDataExport = async (store, payload) => {
    const orders = await findRequestedOrders(store, payload);
    const orderIds = orders.map((order) => order.id);
    const awbNumbers = orders.map((order) => String(order.awb_number || '').trim()).filter(Boolean);
    const [ndrRows, rtoRows, trackingRows, discrepancyRows, ticketRows] = orderIds.length
        ? await Promise.all([
            client_1.db.select().from(ndr_1.ndr_events).where((0, drizzle_orm_1.inArray)(ndr_1.ndr_events.order_id, orderIds)),
            client_1.db.select().from(rto_1.rto_events).where((0, drizzle_orm_1.inArray)(rto_1.rto_events.order_id, orderIds)),
            client_1.db.select().from(trackingEvents_1.tracking_events).where((0, drizzle_orm_1.inArray)(trackingEvents_1.tracking_events.order_id, orderIds)),
            client_1.db.select().from(weightDiscrepancies_1.weight_discrepancies).where((0, drizzle_orm_1.inArray)(weightDiscrepancies_1.weight_discrepancies.b2c_order_id, orderIds)),
            awbNumbers.length
                ? client_1.db
                    .select()
                    .from(supportTickets_1.supportTickets)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, store.userId), (0, drizzle_orm_1.inArray)(supportTickets_1.supportTickets.awbNumber, awbNumbers)))
                : Promise.resolve([]),
        ])
        : [[], [], [], [], []];
    const discrepancyIds = discrepancyRows.map((row) => row.id);
    const disputeRows = discrepancyIds.length
        ? await client_1.db.select().from(weightDiscrepancies_1.weight_disputes).where((0, drizzle_orm_1.inArray)(weightDiscrepancies_1.weight_disputes.discrepancy_id, discrepancyIds))
        : [];
    const eventRowsByOrder = (rows) => {
        const grouped = new Map();
        rows.forEach((row) => grouped.set(row.order_id, [...(grouped.get(row.order_id) || []), row]));
        return grouped;
    };
    const ndrByOrder = eventRowsByOrder(ndrRows);
    const rtoByOrder = eventRowsByOrder(rtoRows);
    const trackingByOrder = eventRowsByOrder(trackingRows);
    return {
        generatedAt: new Date().toISOString(),
        source: 'Shipray Shopify application',
        shop: store.domain,
        request: {
            id: String(payload?.data_request?.id || ''),
            customer: {
                id: payload?.customer?.id ?? null,
                email: payload?.customer?.email ?? null,
                phone: payload?.customer?.phone ?? null,
            },
            ordersRequested: Array.isArray(payload?.orders_requested) ? payload.orders_requested : [],
        },
        relatedRecords: {
            weightDiscrepancies: discrepancyRows,
            weightDisputes: disputeRows,
            supportTickets: ticketRows.map((ticket) => ({
                id: ticket.id,
                subject: ticket.subject,
                category: ticket.category,
                subcategory: ticket.subcategory,
                awbNumber: ticket.awbNumber,
                description: ticket.description,
                attachmentsHeld: Array.isArray(ticket.attachments) ? ticket.attachments.length : 0,
                status: ticket.status,
                createdAt: ticket.createdAt,
                updatedAt: ticket.updatedAt,
            })),
        },
        records: orders.map((order) => ({
            shopifyReference: order.order_id,
            orderNumber: order.order_number,
            orderDate: order.order_date,
            invoiceNumber: order.invoice_number,
            invoiceDate: order.invoice_date,
            invoiceAmount: order.invoice_amount,
            orderAmount: order.order_amount,
            paymentType: order.order_type,
            customer: {
                name: order.buyer_name,
                email: order.buyer_email,
                phone: order.buyer_phone,
                address: order.address,
                addressLine1: order.address_line_1,
                addressLine2: order.address_line_2,
                landmark: order.address_landmark,
                locality: order.address_locality,
                city: order.city,
                state: order.state,
                country: order.country,
                postalCode: order.pincode,
            },
            purchases: order.products,
            shipment: {
                status: order.order_status,
                pickupStatus: order.pickup_status,
                courier: order.courier_partner,
                awbNumber: order.awb_number,
                deliveryLocation: order.delivery_location,
                deliveryMessage: order.delivery_message,
                providerMetadata: order.provider_meta,
                returnDetails: order.rto_details,
            },
            documentsHeld: {
                label: Boolean(order.label),
                invoice: Boolean(order.invoice_link),
                manifest: Boolean(order.manifest),
            },
            events: {
                ndr: ndrByOrder.get(order.id) || [],
                rto: rtoByOrder.get(order.id) || [],
                tracking: trackingByOrder.get(order.id) || [],
            },
            createdAt: order.created_at,
            updatedAt: order.updated_at,
        })),
    };
};
const queueShopifyCustomerDataRequest = async ({ store, payload, tx = client_1.db, }) => {
    const shopDomainHash = hashValue(store.domain);
    const requestExternalId = String(payload?.data_request?.id || '').trim() ||
        hashValue(JSON.stringify({ customer: payload?.customer || {}, orders: payload?.orders_requested || [] }));
    const requestedAt = new Date();
    const dueAt = new Date(requestedAt.getTime() + 30 * DAY_MS);
    const [created] = await tx
        .insert(shopifyComplianceRequests_1.shopifyComplianceRequests)
        .values({
        storeId: String(store.id),
        shopDomainHash,
        requestExternalId,
        topic: 'customers/data_request',
        status: 'pending',
        encryptedPayload: (0, secretEncryption_1.encryptSecret)(JSON.stringify(payload || {})),
        requestedAt,
        dueAt,
        nextAttemptAt: requestedAt,
        updatedAt: requestedAt,
    })
        .onConflictDoNothing({
        target: [shopifyComplianceRequests_1.shopifyComplianceRequests.shopDomainHash, shopifyComplianceRequests_1.shopifyComplianceRequests.requestExternalId],
    })
        .returning({ id: shopifyComplianceRequests_1.shopifyComplianceRequests.id });
    if (created?.id) {
        await (0, notifications_service_1.createNotificationService)({
            targetRole: 'admin',
            title: 'Shopify customer data request received',
            message: `A Shopify privacy export request was queued for ${store.domain}. Request ${requestExternalId} is due within 30 days.`,
        }).catch((error) => {
            console.warn('Shopify privacy admin notification failed:', sanitizeAuditError(error));
        });
    }
    const [existingRequest] = created?.id
        ? []
        : await tx
            .select({ dueAt: shopifyComplianceRequests_1.shopifyComplianceRequests.dueAt })
            .from(shopifyComplianceRequests_1.shopifyComplianceRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.shopDomainHash, shopDomainHash), (0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.requestExternalId, requestExternalId)))
            .limit(1);
    setImmediate(() => {
        (0, exports.processPendingShopifyDataRequests)({ limit: 1 }).catch((error) => {
            console.warn('Immediate Shopify privacy export processing failed:', sanitizeAuditError(error));
        });
    });
    return {
        queued: Boolean(created?.id),
        duplicate: !created?.id,
        requestId: requestExternalId,
        dueAt: (existingRequest?.dueAt || dueAt).toISOString(),
    };
};
exports.queueShopifyCustomerDataRequest = queueShopifyCustomerDataRequest;
const processShopifyDataRequest = async (request) => {
    const [store] = await client_1.db.select().from(stores_1.stores).where((0, drizzle_orm_1.eq)(stores_1.stores.id, String(request.storeId || ''))).limit(1);
    if (!store)
        throw new Error('Shopify store connection is unavailable for the privacy export');
    const [merchant] = await client_1.db
        .select({ email: users_1.users.email })
        .from(users_1.users)
        .where((0, drizzle_orm_1.eq)(users_1.users.id, store.userId))
        .limit(1);
    const storeMetadata = (store.metadata && typeof store.metadata === 'object' ? store.metadata : {});
    const storeInfo = storeMetadata.storeInfo && typeof storeMetadata.storeInfo === 'object'
        ? storeMetadata.storeInfo
        : {};
    const merchantEmail = String(merchant?.email || storeMetadata.email || storeInfo.email || storeInfo.contactEmail || '').trim();
    if (!merchantEmail)
        throw new Error('Shopify store owner email is unavailable for privacy delivery');
    if (!request.encryptedPayload)
        throw new Error('Encrypted Shopify privacy request payload is unavailable');
    const payload = JSON.parse((0, secretEncryption_1.decryptSecret)(request.encryptedPayload) || '{}');
    const customerDataExport = await buildCustomerDataExport(store, payload);
    const exportBuffer = Buffer.from(`${JSON.stringify(customerDataExport, null, 2)}\n`, 'utf8');
    const exportSha256 = crypto_1.default.createHash('sha256').update(exportBuffer).digest('hex');
    await (0, emailSender_1.sendShopifyCustomerDataExportEmail)({
        to: merchantEmail,
        shopDomain: store.domain,
        requestId: request.requestExternalId,
        exportBuffer,
    });
    const deliveredAt = new Date();
    await client_1.db
        .update(shopifyComplianceRequests_1.shopifyComplianceRequests)
        .set({
        status: 'delivered',
        encryptedPayload: null,
        exportSha256,
        deliveryEmailHash: hashValue(merchantEmail),
        deliveredAt,
        processingStartedAt: null,
        lastError: null,
        updatedAt: deliveredAt,
    })
        .where((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.id, request.id));
    await (0, notifications_service_1.createNotificationService)({
        targetRole: 'admin',
        title: 'Shopify customer data request delivered',
        message: `Privacy export ${request.requestExternalId} was delivered to the store owner.`,
    }).catch((error) => {
        console.warn('Shopify privacy delivery notification failed:', sanitizeAuditError(error));
    });
};
const processPendingShopifyDataRequests = async ({ limit = 10 } = {}) => {
    const now = new Date();
    await client_1.db
        .update(shopifyComplianceRequests_1.shopifyComplianceRequests)
        .set({
        status: 'failed',
        lastError: 'Previous delivery attempt was interrupted and has been queued for retry',
        nextAttemptAt: now,
        processingStartedAt: null,
        updatedAt: now,
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'processing'), (0, drizzle_orm_1.lte)(shopifyComplianceRequests_1.shopifyComplianceRequests.processingStartedAt, new Date(now.getTime() - 15 * 60 * 1000))));
    const candidates = await client_1.db
        .select()
        .from(shopifyComplianceRequests_1.shopifyComplianceRequests)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'pending'), (0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'failed')), (0, drizzle_orm_1.lte)(shopifyComplianceRequests_1.shopifyComplianceRequests.nextAttemptAt, now)))
        .limit(Math.min(Math.max(Number(limit) || 1, 1), 25));
    let delivered = 0;
    let failed = 0;
    for (const candidate of candidates) {
        const [claimed] = await client_1.db
            .update(shopifyComplianceRequests_1.shopifyComplianceRequests)
            .set({
            status: 'processing',
            attemptCount: candidate.attemptCount + 1,
            processingStartedAt: now,
            updatedAt: now,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.id, candidate.id), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'pending'), (0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'failed'))))
            .returning();
        if (!claimed)
            continue;
        try {
            await processShopifyDataRequest(claimed);
            delivered += 1;
        }
        catch (error) {
            failed += 1;
            const retryDelayMs = Math.min(24 * 60 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.min(claimed.attemptCount, 8));
            await client_1.db
                .update(shopifyComplianceRequests_1.shopifyComplianceRequests)
                .set({
                status: 'failed',
                lastError: sanitizeAuditError(error),
                nextAttemptAt: new Date(Date.now() + retryDelayMs),
                processingStartedAt: null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.id, claimed.id));
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: 'Shopify customer data export needs attention',
                message: `Privacy export ${claimed.requestExternalId} failed on attempt ${claimed.attemptCount} and is queued for retry. Deadline: ${claimed.dueAt.toISOString()}.`,
            }).catch((notificationError) => {
                console.warn('Shopify privacy failure notification failed:', sanitizeAuditError(notificationError));
            });
            console.warn('Shopify customer data export delivery failed:', {
                requestId: claimed.requestExternalId,
                attempt: claimed.attemptCount,
                error: sanitizeAuditError(error),
            });
        }
    }
    return { attempted: delivered + failed, delivered, failed };
};
exports.processPendingShopifyDataRequests = processPendingShopifyDataRequests;
const redactShopifyComplianceRequestPayloads = async ({ store, tx = client_1.db, }) => {
    const redactedAt = new Date();
    await tx
        .update(shopifyComplianceRequests_1.shopifyComplianceRequests)
        .set({
        storeId: null,
        encryptedPayload: null,
        status: 'redacted',
        lastError: null,
        processingStartedAt: null,
        redactedAt,
        updatedAt: redactedAt,
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.shopDomainHash, hashValue(store.domain)), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'pending'), (0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'failed'), (0, drizzle_orm_1.eq)(shopifyComplianceRequests_1.shopifyComplianceRequests.status, 'processing'))));
};
exports.redactShopifyComplianceRequestPayloads = redactShopifyComplianceRequestPayloads;
