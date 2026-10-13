"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shopifyComplianceRequests = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
/**
 * Durable, Shopify-only privacy request queue and delivery audit.
 *
 * Customer identifiers are kept only inside encryptedPayload while a request
 * is pending. The payload is erased after delivery or shop redaction; the
 * remaining hashes and timestamps are non-reversible audit evidence.
 */
exports.shopifyComplianceRequests = (0, pg_core_1.pgTable)('shopify_compliance_requests', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    storeId: (0, pg_core_1.varchar)('store_id', { length: 50 }),
    shopDomainHash: (0, pg_core_1.varchar)('shop_domain_hash', { length: 64 }).notNull(),
    requestExternalId: (0, pg_core_1.varchar)('request_external_id', { length: 120 }).notNull(),
    topic: (0, pg_core_1.varchar)('topic', { length: 80 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).notNull().default('pending'),
    encryptedPayload: (0, pg_core_1.text)('encrypted_payload'),
    exportSha256: (0, pg_core_1.varchar)('export_sha256', { length: 64 }),
    deliveryEmailHash: (0, pg_core_1.varchar)('delivery_email_hash', { length: 64 }),
    attemptCount: (0, pg_core_1.integer)('attempt_count').notNull().default(0),
    lastError: (0, pg_core_1.text)('last_error'),
    requestedAt: (0, pg_core_1.timestamp)('requested_at', { withTimezone: true }).notNull().defaultNow(),
    dueAt: (0, pg_core_1.timestamp)('due_at', { withTimezone: true }).notNull(),
    nextAttemptAt: (0, pg_core_1.timestamp)('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: (0, pg_core_1.timestamp)('processing_started_at', { withTimezone: true }),
    deliveredAt: (0, pg_core_1.timestamp)('delivered_at', { withTimezone: true }),
    redactedAt: (0, pg_core_1.timestamp)('redacted_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    shopRequestUnique: (0, pg_core_1.uniqueIndex)('shopify_compliance_requests_shop_request_unique').on(table.shopDomainHash, table.requestExternalId),
}));
