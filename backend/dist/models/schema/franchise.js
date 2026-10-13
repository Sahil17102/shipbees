"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.franchiseAuditLogs = exports.franchiseExceptions = exports.franchiseDisputes = exports.franchisePayouts = exports.franchiseSettlementItems = exports.franchiseSettlements = exports.franchiseLedgerEntries = exports.franchiseShipmentAttributions = exports.franchiseCommissionRules = exports.franchiseAgreements = exports.franchiseTerritoryReservations = exports.franchiseApplications = exports.franchiseMembers = exports.franchiseOrganizations = exports.franchiseGeoUnits = exports.franchiseProducts = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
const createTable = (0, pg_core_1.pgTableCreator)((name) => `shipray_franchise_${name}`);
const timestamps = {
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
exports.franchiseProducts = createTable('products', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    code: (0, pg_core_1.varchar)('code', { length: 40 }).notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 120 }).notNull(),
    tier: (0, pg_core_1.varchar)('tier', { length: 24 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    pricePaise: (0, pg_core_1.bigint)('price_paise', { mode: 'number' }).default(0).notNull(),
    securityDepositPaise: (0, pg_core_1.bigint)('security_deposit_paise', { mode: 'number' })
        .default(0)
        .notNull(),
    durationMonths: (0, pg_core_1.integer)('duration_months').default(12).notNull(),
    defaultShareBps: (0, pg_core_1.integer)('default_share_bps').default(0).notNull(),
    agreementVersion: (0, pg_core_1.varchar)('agreement_version', { length: 40 }).default('v1').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('active').notNull(),
    effectiveFrom: (0, pg_core_1.timestamp)('effective_from', { withTimezone: true }).defaultNow().notNull(),
    effectiveTo: (0, pg_core_1.timestamp)('effective_to', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    codeUnique: (0, pg_core_1.uniqueIndex)('franchise_products_code_unique').on(table.code),
    tierStatusIdx: (0, pg_core_1.index)('franchise_products_tier_status_idx').on(table.tier, table.status),
}));
exports.franchiseGeoUnits = createTable('geo_units', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    type: (0, pg_core_1.varchar)('type', { length: 24 }).notNull(),
    code: (0, pg_core_1.varchar)('code', { length: 80 }).notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 160 }).notNull(),
    parentId: (0, pg_core_1.uuid)('parent_id'),
    pincode: (0, pg_core_1.varchar)('pincode', { length: 12 }),
    state: (0, pg_core_1.varchar)('state', { length: 120 }).notNull(),
    district: (0, pg_core_1.varchar)('district', { length: 120 }),
    city: (0, pg_core_1.varchar)('city', { length: 120 }),
    mappingVersion: (0, pg_core_1.integer)('mapping_version').default(1).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('available').notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata').$type().default((0, drizzle_orm_1.sql) `'{}'::jsonb`),
    effectiveFrom: (0, pg_core_1.timestamp)('effective_from', { withTimezone: true }).defaultNow().notNull(),
    effectiveTo: (0, pg_core_1.timestamp)('effective_to', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    codeUnique: (0, pg_core_1.uniqueIndex)('franchise_geo_units_code_unique').on(table.code),
    lookupIdx: (0, pg_core_1.index)('franchise_geo_units_lookup_idx').on(table.type, table.state, table.district, table.pincode),
    statusIdx: (0, pg_core_1.index)('franchise_geo_units_status_idx').on(table.status),
}));
exports.franchiseOrganizations = createTable('organizations', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    legalName: (0, pg_core_1.varchar)('legal_name', { length: 180 }).notNull(),
    tradeName: (0, pg_core_1.varchar)('trade_name', { length: 180 }).notNull(),
    pan: (0, pg_core_1.varchar)('pan', { length: 20 }),
    gstin: (0, pg_core_1.varchar)('gstin', { length: 24 }),
    email: (0, pg_core_1.varchar)('email', { length: 160 }).notNull(),
    phone: (0, pg_core_1.varchar)('phone', { length: 24 }),
    kycStatus: (0, pg_core_1.varchar)('kyc_status', { length: 32 }).default('pending').notNull(),
    bankStatus: (0, pg_core_1.varchar)('bank_status', { length: 32 }).default('pending').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('pending').notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata').$type().default((0, drizzle_orm_1.sql) `'{}'::jsonb`),
    ...timestamps,
}, (table) => ({
    emailIdx: (0, pg_core_1.index)('franchise_organizations_email_idx').on(table.email),
    statusIdx: (0, pg_core_1.index)('franchise_organizations_status_idx').on(table.status),
}));
exports.franchiseMembers = createTable('members', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .references(() => exports.franchiseOrganizations.id, { onDelete: 'cascade' })
        .notNull(),
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    role: (0, pg_core_1.varchar)('role', { length: 32 }).default('owner').notNull(),
    permissions: (0, pg_core_1.jsonb)('permissions')
        .$type()
        .default((0, drizzle_orm_1.sql) `'["portal:*"]'::jsonb`)
        .notNull(),
    isActive: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    mfaStatus: (0, pg_core_1.varchar)('mfa_status', { length: 24 }).default('not_enrolled').notNull(),
    invitedAt: (0, pg_core_1.timestamp)('invited_at', { withTimezone: true }),
    joinedAt: (0, pg_core_1.timestamp)('joined_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    memberUnique: (0, pg_core_1.uniqueIndex)('franchise_members_org_user_unique').on(table.organizationId, table.userId),
    userIdx: (0, pg_core_1.index)('franchise_members_user_idx').on(table.userId, table.isActive),
}));
exports.franchiseApplications = createTable('applications', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    applicationNumber: (0, pg_core_1.varchar)('application_number', { length: 40 }).notNull(),
    applicantName: (0, pg_core_1.varchar)('applicant_name', { length: 160 }).notNull(),
    applicantEmail: (0, pg_core_1.varchar)('applicant_email', { length: 160 }).notNull(),
    applicantPhone: (0, pg_core_1.varchar)('applicant_phone', { length: 24 }),
    legalName: (0, pg_core_1.varchar)('legal_name', { length: 180 }).notNull(),
    tradeName: (0, pg_core_1.varchar)('trade_name', { length: 180 }).notNull(),
    pan: (0, pg_core_1.varchar)('pan', { length: 20 }),
    gstin: (0, pg_core_1.varchar)('gstin', { length: 24 }),
    productId: (0, pg_core_1.uuid)('product_id')
        .references(() => exports.franchiseProducts.id)
        .notNull(),
    geoUnitId: (0, pg_core_1.uuid)('geo_unit_id')
        .references(() => exports.franchiseGeoUnits.id)
        .notNull(),
    organizationId: (0, pg_core_1.uuid)('organization_id').references(() => exports.franchiseOrganizations.id),
    status: (0, pg_core_1.varchar)('status', { length: 32 }).default('submitted').notNull(),
    kycStatus: (0, pg_core_1.varchar)('kyc_status', { length: 32 }).default('pending').notNull(),
    paymentStatus: (0, pg_core_1.varchar)('payment_status', { length: 32 }).default('not_requested').notNull(),
    agreementStatus: (0, pg_core_1.varchar)('agreement_status', { length: 32 }).default('not_generated').notNull(),
    commercialAmountPaise: (0, pg_core_1.bigint)('commercial_amount_paise', { mode: 'number' })
        .default(0)
        .notNull(),
    depositAmountPaise: (0, pg_core_1.bigint)('deposit_amount_paise', { mode: 'number' }).default(0).notNull(),
    paymentReference: (0, pg_core_1.varchar)('payment_reference', { length: 120 }),
    adminNotes: (0, pg_core_1.text)('admin_notes'),
    applicantNotes: (0, pg_core_1.text)('applicant_notes'),
    source: (0, pg_core_1.varchar)('source', { length: 40 }).default('admin').notNull(),
    applicationData: (0, pg_core_1.jsonb)('application_data')
        .$type()
        .default((0, drizzle_orm_1.sql) `'{}'::jsonb`)
        .notNull(),
    decisionReason: (0, pg_core_1.text)('decision_reason'),
    reviewedBy: (0, pg_core_1.uuid)('reviewed_by').references(() => users_1.users.id),
    submittedAt: (0, pg_core_1.timestamp)('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: (0, pg_core_1.timestamp)('reviewed_at', { withTimezone: true }),
    paymentVerifiedAt: (0, pg_core_1.timestamp)('payment_verified_at', { withTimezone: true }),
    activatedAt: (0, pg_core_1.timestamp)('activated_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    numberUnique: (0, pg_core_1.uniqueIndex)('franchise_applications_number_unique').on(table.applicationNumber),
    queueIdx: (0, pg_core_1.index)('franchise_applications_queue_idx').on(table.status, table.submittedAt),
    emailIdx: (0, pg_core_1.index)('franchise_applications_email_idx').on(table.applicantEmail),
}));
exports.franchiseTerritoryReservations = createTable('territory_reservations', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    applicationId: (0, pg_core_1.uuid)('application_id')
        .references(() => exports.franchiseApplications.id, { onDelete: 'cascade' })
        .notNull(),
    geoUnitId: (0, pg_core_1.uuid)('geo_unit_id')
        .references(() => exports.franchiseGeoUnits.id)
        .notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('reserved').notNull(),
    paymentAttemptReference: (0, pg_core_1.varchar)('payment_attempt_reference', { length: 120 }),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    releasedAt: (0, pg_core_1.timestamp)('released_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    liveTerritoryUnique: (0, pg_core_1.uniqueIndex)('franchise_reservations_live_territory_unique')
        .on(table.geoUnitId)
        .where((0, drizzle_orm_1.sql) `${table.status} in ('reserved', 'payment_pending')`),
    expiryIdx: (0, pg_core_1.index)('franchise_reservations_expiry_idx').on(table.status, table.expiresAt),
}));
exports.franchiseAgreements = createTable('agreements', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    agreementNumber: (0, pg_core_1.varchar)('agreement_number', { length: 50 }).notNull(),
    applicationId: (0, pg_core_1.uuid)('application_id').references(() => exports.franchiseApplications.id),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .references(() => exports.franchiseOrganizations.id)
        .notNull(),
    productId: (0, pg_core_1.uuid)('product_id')
        .references(() => exports.franchiseProducts.id)
        .notNull(),
    geoUnitId: (0, pg_core_1.uuid)('geo_unit_id')
        .references(() => exports.franchiseGeoUnits.id)
        .notNull(),
    version: (0, pg_core_1.varchar)('version', { length: 40 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('draft').notNull(),
    pricePaise: (0, pg_core_1.bigint)('price_paise', { mode: 'number' }).default(0).notNull(),
    securityDepositPaise: (0, pg_core_1.bigint)('security_deposit_paise', { mode: 'number' })
        .default(0)
        .notNull(),
    shareBps: (0, pg_core_1.integer)('share_bps').default(0).notNull(),
    startsAt: (0, pg_core_1.timestamp)('starts_at', { withTimezone: true }).notNull(),
    endsAt: (0, pg_core_1.timestamp)('ends_at', { withTimezone: true }).notNull(),
    acceptedAt: (0, pg_core_1.timestamp)('accepted_at', { withTimezone: true }),
    acceptedBy: (0, pg_core_1.uuid)('accepted_by').references(() => users_1.users.id),
    suspendedAt: (0, pg_core_1.timestamp)('suspended_at', { withTimezone: true }),
    terminatedAt: (0, pg_core_1.timestamp)('terminated_at', { withTimezone: true }),
    termsSnapshot: (0, pg_core_1.jsonb)('terms_snapshot')
        .$type()
        .default((0, drizzle_orm_1.sql) `'{}'::jsonb`)
        .notNull(),
    ...timestamps,
}, (table) => ({
    numberUnique: (0, pg_core_1.uniqueIndex)('franchise_agreements_number_unique').on(table.agreementNumber),
    activeTerritoryUnique: (0, pg_core_1.uniqueIndex)('franchise_agreements_active_territory_unique')
        .on(table.geoUnitId)
        .where((0, drizzle_orm_1.sql) `${table.status} = 'active'`),
    organizationIdx: (0, pg_core_1.index)('franchise_agreements_organization_idx').on(table.organizationId, table.status),
}));
exports.franchiseCommissionRules = createTable('commission_rules', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    code: (0, pg_core_1.varchar)('code', { length: 60 }).notNull(),
    label: (0, pg_core_1.varchar)('label', { length: 160 }).notNull(),
    version: (0, pg_core_1.integer)('version').default(1).notNull(),
    tier: (0, pg_core_1.varchar)('tier', { length: 24 }).notNull(),
    businessType: (0, pg_core_1.varchar)('business_type', { length: 16 }).default('all').notNull(),
    courierProvider: (0, pg_core_1.varchar)('courier_provider', { length: 80 }).default('all').notNull(),
    mode: (0, pg_core_1.varchar)('mode', { length: 24 }).default('all').notNull(),
    calculationType: (0, pg_core_1.varchar)('calculation_type', { length: 24 }).default('percentage').notNull(),
    valueBps: (0, pg_core_1.integer)('value_bps').default(0).notNull(),
    capBps: (0, pg_core_1.integer)('cap_bps').default(3000).notNull(),
    priority: (0, pg_core_1.integer)('priority').default(100).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('draft').notNull(),
    effectiveFrom: (0, pg_core_1.timestamp)('effective_from', { withTimezone: true }).defaultNow().notNull(),
    effectiveTo: (0, pg_core_1.timestamp)('effective_to', { withTimezone: true }),
    approvedBy: (0, pg_core_1.uuid)('approved_by').references(() => users_1.users.id),
    publishedAt: (0, pg_core_1.timestamp)('published_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    codeVersionUnique: (0, pg_core_1.uniqueIndex)('franchise_rules_code_version_unique').on(table.code, table.version),
    resolutionIdx: (0, pg_core_1.index)('franchise_rules_resolution_idx').on(table.status, table.tier, table.businessType, table.courierProvider),
}));
exports.franchiseShipmentAttributions = createTable('shipment_attributions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .references(() => exports.franchiseOrganizations.id)
        .notNull(),
    agreementId: (0, pg_core_1.uuid)('agreement_id')
        .references(() => exports.franchiseAgreements.id)
        .notNull(),
    geoUnitId: (0, pg_core_1.uuid)('geo_unit_id')
        .references(() => exports.franchiseGeoUnits.id)
        .notNull(),
    shipmentType: (0, pg_core_1.varchar)('shipment_type', { length: 16 }).notNull(),
    shipmentId: (0, pg_core_1.uuid)('shipment_id').notNull(),
    awbMasked: (0, pg_core_1.varchar)('awb_masked', { length: 40 }).notNull(),
    courierProvider: (0, pg_core_1.varchar)('courier_provider', { length: 80 }).notNull(),
    originPincode: (0, pg_core_1.varchar)('origin_pincode', { length: 12 }).notNull(),
    originCity: (0, pg_core_1.varchar)('origin_city', { length: 120 }),
    originState: (0, pg_core_1.varchar)('origin_state', { length: 120 }).notNull(),
    tier: (0, pg_core_1.varchar)('tier', { length: 24 }).notNull(),
    orderStatus: (0, pg_core_1.varchar)('order_status', { length: 40 }).notNull(),
    attributionStatus: (0, pg_core_1.varchar)('attribution_status', { length: 32 }).default('provisional').notNull(),
    geographyVersion: (0, pg_core_1.integer)('geography_version').default(1).notNull(),
    ruleVersion: (0, pg_core_1.integer)('rule_version').default(1).notNull(),
    bookedAt: (0, pg_core_1.timestamp)('booked_at', { withTimezone: true }).notNull(),
    ...timestamps,
}, (table) => ({
    shipmentTierUnique: (0, pg_core_1.uniqueIndex)('franchise_attribution_shipment_tier_unique').on(table.shipmentType, table.shipmentId, table.tier),
    organizationIdx: (0, pg_core_1.index)('franchise_attribution_organization_idx').on(table.organizationId, table.bookedAt),
}));
exports.franchiseLedgerEntries = createTable('ledger_entries', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .references(() => exports.franchiseOrganizations.id)
        .notNull(),
    attributionId: (0, pg_core_1.uuid)('attribution_id').references(() => exports.franchiseShipmentAttributions.id),
    settlementId: (0, pg_core_1.uuid)('settlement_id'),
    entryType: (0, pg_core_1.varchar)('entry_type', { length: 32 }).notNull(),
    state: (0, pg_core_1.varchar)('state', { length: 24 }).notNull(),
    amountPaise: (0, pg_core_1.bigint)('amount_paise', { mode: 'number' }).notNull(),
    sourceEventId: (0, pg_core_1.varchar)('source_event_id', { length: 120 }).notNull(),
    reversalOfId: (0, pg_core_1.uuid)('reversal_of_id'),
    calculationSnapshot: (0, pg_core_1.jsonb)('calculation_snapshot')
        .$type()
        .default((0, drizzle_orm_1.sql) `'{}'::jsonb`)
        .notNull(),
    occurredAt: (0, pg_core_1.timestamp)('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
}, (table) => ({
    sourceEventUnique: (0, pg_core_1.uniqueIndex)('franchise_ledger_source_event_unique').on(table.sourceEventId),
    organizationStateIdx: (0, pg_core_1.index)('franchise_ledger_organization_state_idx').on(table.organizationId, table.state, table.occurredAt),
}));
exports.franchiseSettlements = createTable('settlements', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    settlementNumber: (0, pg_core_1.varchar)('settlement_number', { length: 50 }).notNull(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .references(() => exports.franchiseOrganizations.id)
        .notNull(),
    periodStart: (0, pg_core_1.timestamp)('period_start', { withTimezone: true }).notNull(),
    periodEnd: (0, pg_core_1.timestamp)('period_end', { withTimezone: true }).notNull(),
    grossPaise: (0, pg_core_1.bigint)('gross_paise', { mode: 'number' }).default(0).notNull(),
    adjustmentsPaise: (0, pg_core_1.bigint)('adjustments_paise', { mode: 'number' }).default(0).notNull(),
    holdPaise: (0, pg_core_1.bigint)('hold_paise', { mode: 'number' }).default(0).notNull(),
    withholdingPaise: (0, pg_core_1.bigint)('withholding_paise', { mode: 'number' }).default(0).notNull(),
    netPaise: (0, pg_core_1.bigint)('net_paise', { mode: 'number' }).default(0).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('draft').notNull(),
    approvedBy: (0, pg_core_1.uuid)('approved_by').references(() => users_1.users.id),
    approvedAt: (0, pg_core_1.timestamp)('approved_at', { withTimezone: true }),
    closedAt: (0, pg_core_1.timestamp)('closed_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    numberUnique: (0, pg_core_1.uniqueIndex)('franchise_settlements_number_unique').on(table.settlementNumber),
    organizationPeriodUnique: (0, pg_core_1.uniqueIndex)('franchise_settlements_org_period_unique').on(table.organizationId, table.periodStart, table.periodEnd),
}));
exports.franchiseSettlementItems = createTable('settlement_items', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    settlementId: (0, pg_core_1.uuid)('settlement_id')
        .references(() => exports.franchiseSettlements.id, { onDelete: 'cascade' })
        .notNull(),
    ledgerEntryId: (0, pg_core_1.uuid)('ledger_entry_id')
        .references(() => exports.franchiseLedgerEntries.id)
        .notNull(),
    amountPaise: (0, pg_core_1.bigint)('amount_paise', { mode: 'number' }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('included').notNull(),
    holdReason: (0, pg_core_1.text)('hold_reason'),
    ...timestamps,
}, (table) => ({
    ledgerMembershipUnique: (0, pg_core_1.uniqueIndex)('franchise_settlement_items_ledger_unique').on(table.ledgerEntryId),
    settlementIdx: (0, pg_core_1.index)('franchise_settlement_items_settlement_idx').on(table.settlementId),
}));
exports.franchisePayouts = createTable('payouts', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    settlementId: (0, pg_core_1.uuid)('settlement_id')
        .references(() => exports.franchiseSettlements.id)
        .notNull(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .references(() => exports.franchiseOrganizations.id)
        .notNull(),
    amountPaise: (0, pg_core_1.bigint)('amount_paise', { mode: 'number' }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('created').notNull(),
    providerReference: (0, pg_core_1.varchar)('provider_reference', { length: 120 }),
    idempotencyKey: (0, pg_core_1.varchar)('idempotency_key', { length: 160 }).notNull(),
    failureReason: (0, pg_core_1.text)('failure_reason'),
    processedAt: (0, pg_core_1.timestamp)('processed_at', { withTimezone: true }),
    reconciledAt: (0, pg_core_1.timestamp)('reconciled_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    idempotencyUnique: (0, pg_core_1.uniqueIndex)('franchise_payouts_idempotency_unique').on(table.idempotencyKey),
    settlementIdx: (0, pg_core_1.index)('franchise_payouts_settlement_idx').on(table.settlementId),
}));
exports.franchiseDisputes = createTable('disputes', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .references(() => exports.franchiseOrganizations.id)
        .notNull(),
    type: (0, pg_core_1.varchar)('type', { length: 40 }).notNull(),
    subject: (0, pg_core_1.varchar)('subject', { length: 180 }).notNull(),
    description: (0, pg_core_1.text)('description').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('open').notNull(),
    priority: (0, pg_core_1.varchar)('priority', { length: 16 }).default('normal').notNull(),
    linkedType: (0, pg_core_1.varchar)('linked_type', { length: 32 }),
    linkedId: (0, pg_core_1.uuid)('linked_id'),
    resolution: (0, pg_core_1.text)('resolution'),
    resolvedBy: (0, pg_core_1.uuid)('resolved_by').references(() => users_1.users.id),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    queueIdx: (0, pg_core_1.index)('franchise_disputes_queue_idx').on(table.status, table.priority),
    organizationIdx: (0, pg_core_1.index)('franchise_disputes_organization_idx').on(table.organizationId),
}));
exports.franchiseExceptions = createTable('exceptions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    type: (0, pg_core_1.varchar)('type', { length: 48 }).notNull(),
    title: (0, pg_core_1.varchar)('title', { length: 180 }).notNull(),
    description: (0, pg_core_1.text)('description').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 24 }).default('open').notNull(),
    severity: (0, pg_core_1.varchar)('severity', { length: 16 }).default('medium').notNull(),
    owner: (0, pg_core_1.varchar)('owner', { length: 120 }),
    linkedType: (0, pg_core_1.varchar)('linked_type', { length: 32 }),
    linkedId: (0, pg_core_1.uuid)('linked_id'),
    financialValuePaise: (0, pg_core_1.bigint)('financial_value_paise', { mode: 'number' }).default(0).notNull(),
    resolvedAt: (0, pg_core_1.timestamp)('resolved_at', { withTimezone: true }),
    ...timestamps,
}, (table) => ({
    queueIdx: (0, pg_core_1.index)('franchise_exceptions_queue_idx').on(table.status, table.severity, table.createdAt),
}));
exports.franchiseAuditLogs = createTable('audit_logs', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    actorUserId: (0, pg_core_1.uuid)('actor_user_id').references(() => users_1.users.id),
    actorRole: (0, pg_core_1.varchar)('actor_role', { length: 32 }).notNull(),
    action: (0, pg_core_1.varchar)('action', { length: 80 }).notNull(),
    entityType: (0, pg_core_1.varchar)('entity_type', { length: 48 }).notNull(),
    entityId: (0, pg_core_1.uuid)('entity_id'),
    reason: (0, pg_core_1.text)('reason'),
    before: (0, pg_core_1.jsonb)('before').$type(),
    after: (0, pg_core_1.jsonb)('after').$type(),
    requestId: (0, pg_core_1.varchar)('request_id', { length: 80 }),
    ipAddress: (0, pg_core_1.varchar)('ip_address', { length: 80 }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    entityIdx: (0, pg_core_1.index)('franchise_audit_entity_idx').on(table.entityType, table.entityId, table.createdAt),
}));
