import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTableCreator,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

const createTable = pgTableCreator((name) => `shipray_franchise_${name}`)

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}

export const franchiseProducts = createTable(
  'products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 40 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    tier: varchar('tier', { length: 24 }).notNull(),
    description: text('description'),
    pricePaise: bigint('price_paise', { mode: 'number' }).default(0).notNull(),
    securityDepositPaise: bigint('security_deposit_paise', { mode: 'number' })
      .default(0)
      .notNull(),
    durationMonths: integer('duration_months').default(12).notNull(),
    defaultShareBps: integer('default_share_bps').default(0).notNull(),
    agreementVersion: varchar('agreement_version', { length: 40 }).default('v1').notNull(),
    status: varchar('status', { length: 24 }).default('active').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).defaultNow().notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    codeUnique: uniqueIndex('franchise_products_code_unique').on(table.code),
    tierStatusIdx: index('franchise_products_tier_status_idx').on(table.tier, table.status),
  }),
)

export const franchiseGeoUnits = createTable(
  'geo_units',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 24 }).notNull(),
    code: varchar('code', { length: 80 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    parentId: uuid('parent_id'),
    pincode: varchar('pincode', { length: 12 }),
    state: varchar('state', { length: 120 }).notNull(),
    district: varchar('district', { length: 120 }),
    city: varchar('city', { length: 120 }),
    mappingVersion: integer('mapping_version').default(1).notNull(),
    status: varchar('status', { length: 24 }).default('available').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).defaultNow().notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    codeUnique: uniqueIndex('franchise_geo_units_code_unique').on(table.code),
    lookupIdx: index('franchise_geo_units_lookup_idx').on(
      table.type,
      table.state,
      table.district,
      table.pincode,
    ),
    statusIdx: index('franchise_geo_units_status_idx').on(table.status),
  }),
)

export const franchiseOrganizations = createTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    legalName: varchar('legal_name', { length: 180 }).notNull(),
    tradeName: varchar('trade_name', { length: 180 }).notNull(),
    pan: varchar('pan', { length: 20 }),
    gstin: varchar('gstin', { length: 24 }),
    email: varchar('email', { length: 160 }).notNull(),
    phone: varchar('phone', { length: 24 }),
    kycStatus: varchar('kyc_status', { length: 32 }).default('pending').notNull(),
    bankStatus: varchar('bank_status', { length: 32 }).default('pending').notNull(),
    status: varchar('status', { length: 24 }).default('pending').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => ({
    emailIdx: index('franchise_organizations_email_idx').on(table.email),
    statusIdx: index('franchise_organizations_status_idx').on(table.status),
  }),
)

export const franchiseMembers = createTable(
  'members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .references(() => franchiseOrganizations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: varchar('role', { length: 32 }).default('owner').notNull(),
    permissions: jsonb('permissions')
      .$type<string[]>()
      .default(sql`'["portal:*"]'::jsonb`)
      .notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    mfaStatus: varchar('mfa_status', { length: 24 }).default('not_enrolled').notNull(),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    memberUnique: uniqueIndex('franchise_members_org_user_unique').on(
      table.organizationId,
      table.userId,
    ),
    userIdx: index('franchise_members_user_idx').on(table.userId, table.isActive),
  }),
)

export const franchiseApplications = createTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationNumber: varchar('application_number', { length: 40 }).notNull(),
    applicantName: varchar('applicant_name', { length: 160 }).notNull(),
    applicantEmail: varchar('applicant_email', { length: 160 }).notNull(),
    applicantPhone: varchar('applicant_phone', { length: 24 }),
    legalName: varchar('legal_name', { length: 180 }).notNull(),
    tradeName: varchar('trade_name', { length: 180 }).notNull(),
    pan: varchar('pan', { length: 20 }),
    gstin: varchar('gstin', { length: 24 }),
    productId: uuid('product_id')
      .references(() => franchiseProducts.id)
      .notNull(),
    geoUnitId: uuid('geo_unit_id')
      .references(() => franchiseGeoUnits.id)
      .notNull(),
    organizationId: uuid('organization_id').references(() => franchiseOrganizations.id),
    status: varchar('status', { length: 32 }).default('submitted').notNull(),
    kycStatus: varchar('kyc_status', { length: 32 }).default('pending').notNull(),
    paymentStatus: varchar('payment_status', { length: 32 }).default('not_requested').notNull(),
    agreementStatus: varchar('agreement_status', { length: 32 }).default('not_generated').notNull(),
    commercialAmountPaise: bigint('commercial_amount_paise', { mode: 'number' })
      .default(0)
      .notNull(),
    depositAmountPaise: bigint('deposit_amount_paise', { mode: 'number' }).default(0).notNull(),
    paymentReference: varchar('payment_reference', { length: 120 }),
    adminNotes: text('admin_notes'),
    applicantNotes: text('applicant_notes'),
    source: varchar('source', { length: 40 }).default('admin').notNull(),
    applicationData: jsonb('application_data')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    decisionReason: text('decision_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    paymentVerifiedAt: timestamp('payment_verified_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    numberUnique: uniqueIndex('franchise_applications_number_unique').on(
      table.applicationNumber,
    ),
    queueIdx: index('franchise_applications_queue_idx').on(table.status, table.submittedAt),
    emailIdx: index('franchise_applications_email_idx').on(table.applicantEmail),
  }),
)

export const franchiseTerritoryReservations = createTable(
  'territory_reservations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id')
      .references(() => franchiseApplications.id, { onDelete: 'cascade' })
      .notNull(),
    geoUnitId: uuid('geo_unit_id')
      .references(() => franchiseGeoUnits.id)
      .notNull(),
    status: varchar('status', { length: 24 }).default('reserved').notNull(),
    paymentAttemptReference: varchar('payment_attempt_reference', { length: 120 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    liveTerritoryUnique: uniqueIndex('franchise_reservations_live_territory_unique')
      .on(table.geoUnitId)
      .where(sql`${table.status} in ('reserved', 'payment_pending')`),
    expiryIdx: index('franchise_reservations_expiry_idx').on(table.status, table.expiresAt),
  }),
)

export const franchiseAgreements = createTable(
  'agreements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    agreementNumber: varchar('agreement_number', { length: 50 }).notNull(),
    applicationId: uuid('application_id').references(() => franchiseApplications.id),
    organizationId: uuid('organization_id')
      .references(() => franchiseOrganizations.id)
      .notNull(),
    productId: uuid('product_id')
      .references(() => franchiseProducts.id)
      .notNull(),
    geoUnitId: uuid('geo_unit_id')
      .references(() => franchiseGeoUnits.id)
      .notNull(),
    version: varchar('version', { length: 40 }).notNull(),
    status: varchar('status', { length: 24 }).default('draft').notNull(),
    pricePaise: bigint('price_paise', { mode: 'number' }).default(0).notNull(),
    securityDepositPaise: bigint('security_deposit_paise', { mode: 'number' })
      .default(0)
      .notNull(),
    shareBps: integer('share_bps').default(0).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    terminatedAt: timestamp('terminated_at', { withTimezone: true }),
    termsSnapshot: jsonb('terms_snapshot')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => ({
    numberUnique: uniqueIndex('franchise_agreements_number_unique').on(table.agreementNumber),
    activeTerritoryUnique: uniqueIndex('franchise_agreements_active_territory_unique')
      .on(table.geoUnitId)
      .where(sql`${table.status} = 'active'`),
    organizationIdx: index('franchise_agreements_organization_idx').on(
      table.organizationId,
      table.status,
    ),
  }),
)

export const franchiseCommissionRules = createTable(
  'commission_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 60 }).notNull(),
    label: varchar('label', { length: 160 }).notNull(),
    version: integer('version').default(1).notNull(),
    tier: varchar('tier', { length: 24 }).notNull(),
    businessType: varchar('business_type', { length: 16 }).default('all').notNull(),
    courierProvider: varchar('courier_provider', { length: 80 }).default('all').notNull(),
    mode: varchar('mode', { length: 24 }).default('all').notNull(),
    calculationType: varchar('calculation_type', { length: 24 }).default('percentage').notNull(),
    valueBps: integer('value_bps').default(0).notNull(),
    capBps: integer('cap_bps').default(3000).notNull(),
    priority: integer('priority').default(100).notNull(),
    status: varchar('status', { length: 24 }).default('draft').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).defaultNow().notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    approvedBy: uuid('approved_by').references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    codeVersionUnique: uniqueIndex('franchise_rules_code_version_unique').on(
      table.code,
      table.version,
    ),
    resolutionIdx: index('franchise_rules_resolution_idx').on(
      table.status,
      table.tier,
      table.businessType,
      table.courierProvider,
    ),
  }),
)

export const franchiseShipmentAttributions = createTable(
  'shipment_attributions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .references(() => franchiseOrganizations.id)
      .notNull(),
    agreementId: uuid('agreement_id')
      .references(() => franchiseAgreements.id)
      .notNull(),
    geoUnitId: uuid('geo_unit_id')
      .references(() => franchiseGeoUnits.id)
      .notNull(),
    shipmentType: varchar('shipment_type', { length: 16 }).notNull(),
    shipmentId: uuid('shipment_id').notNull(),
    awbMasked: varchar('awb_masked', { length: 40 }).notNull(),
    courierProvider: varchar('courier_provider', { length: 80 }).notNull(),
    originPincode: varchar('origin_pincode', { length: 12 }).notNull(),
    originCity: varchar('origin_city', { length: 120 }),
    originState: varchar('origin_state', { length: 120 }).notNull(),
    tier: varchar('tier', { length: 24 }).notNull(),
    orderStatus: varchar('order_status', { length: 40 }).notNull(),
    attributionStatus: varchar('attribution_status', { length: 32 }).default('provisional').notNull(),
    geographyVersion: integer('geography_version').default(1).notNull(),
    ruleVersion: integer('rule_version').default(1).notNull(),
    bookedAt: timestamp('booked_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => ({
    shipmentTierUnique: uniqueIndex('franchise_attribution_shipment_tier_unique').on(
      table.shipmentType,
      table.shipmentId,
      table.tier,
    ),
    organizationIdx: index('franchise_attribution_organization_idx').on(
      table.organizationId,
      table.bookedAt,
    ),
  }),
)

export const franchiseLedgerEntries = createTable(
  'ledger_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .references(() => franchiseOrganizations.id)
      .notNull(),
    attributionId: uuid('attribution_id').references(() => franchiseShipmentAttributions.id),
    settlementId: uuid('settlement_id'),
    entryType: varchar('entry_type', { length: 32 }).notNull(),
    state: varchar('state', { length: 24 }).notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    sourceEventId: varchar('source_event_id', { length: 120 }).notNull(),
    reversalOfId: uuid('reversal_of_id'),
    calculationSnapshot: jsonb('calculation_snapshot')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => ({
    sourceEventUnique: uniqueIndex('franchise_ledger_source_event_unique').on(table.sourceEventId),
    organizationStateIdx: index('franchise_ledger_organization_state_idx').on(
      table.organizationId,
      table.state,
      table.occurredAt,
    ),
  }),
)

export const franchiseSettlements = createTable(
  'settlements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    settlementNumber: varchar('settlement_number', { length: 50 }).notNull(),
    organizationId: uuid('organization_id')
      .references(() => franchiseOrganizations.id)
      .notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    grossPaise: bigint('gross_paise', { mode: 'number' }).default(0).notNull(),
    adjustmentsPaise: bigint('adjustments_paise', { mode: 'number' }).default(0).notNull(),
    holdPaise: bigint('hold_paise', { mode: 'number' }).default(0).notNull(),
    withholdingPaise: bigint('withholding_paise', { mode: 'number' }).default(0).notNull(),
    netPaise: bigint('net_paise', { mode: 'number' }).default(0).notNull(),
    status: varchar('status', { length: 24 }).default('draft').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    numberUnique: uniqueIndex('franchise_settlements_number_unique').on(table.settlementNumber),
    organizationPeriodUnique: uniqueIndex('franchise_settlements_org_period_unique').on(
      table.organizationId,
      table.periodStart,
      table.periodEnd,
    ),
  }),
)

export const franchiseSettlementItems = createTable(
  'settlement_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    settlementId: uuid('settlement_id')
      .references(() => franchiseSettlements.id, { onDelete: 'cascade' })
      .notNull(),
    ledgerEntryId: uuid('ledger_entry_id')
      .references(() => franchiseLedgerEntries.id)
      .notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 24 }).default('included').notNull(),
    holdReason: text('hold_reason'),
    ...timestamps,
  },
  (table) => ({
    ledgerMembershipUnique: uniqueIndex('franchise_settlement_items_ledger_unique').on(
      table.ledgerEntryId,
    ),
    settlementIdx: index('franchise_settlement_items_settlement_idx').on(table.settlementId),
  }),
)

export const franchisePayouts = createTable(
  'payouts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    settlementId: uuid('settlement_id')
      .references(() => franchiseSettlements.id)
      .notNull(),
    organizationId: uuid('organization_id')
      .references(() => franchiseOrganizations.id)
      .notNull(),
    amountPaise: bigint('amount_paise', { mode: 'number' }).notNull(),
    status: varchar('status', { length: 24 }).default('created').notNull(),
    providerReference: varchar('provider_reference', { length: 120 }),
    idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
    failureReason: text('failure_reason'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    idempotencyUnique: uniqueIndex('franchise_payouts_idempotency_unique').on(
      table.idempotencyKey,
    ),
    settlementIdx: index('franchise_payouts_settlement_idx').on(table.settlementId),
  }),
)

export const franchiseDisputes = createTable(
  'disputes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id')
      .references(() => franchiseOrganizations.id)
      .notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    subject: varchar('subject', { length: 180 }).notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 24 }).default('open').notNull(),
    priority: varchar('priority', { length: 16 }).default('normal').notNull(),
    linkedType: varchar('linked_type', { length: 32 }),
    linkedId: uuid('linked_id'),
    resolution: text('resolution'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    queueIdx: index('franchise_disputes_queue_idx').on(table.status, table.priority),
    organizationIdx: index('franchise_disputes_organization_idx').on(table.organizationId),
  }),
)

export const franchiseExceptions = createTable(
  'exceptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 48 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description').notNull(),
    status: varchar('status', { length: 24 }).default('open').notNull(),
    severity: varchar('severity', { length: 16 }).default('medium').notNull(),
    owner: varchar('owner', { length: 120 }),
    linkedType: varchar('linked_type', { length: 32 }),
    linkedId: uuid('linked_id'),
    financialValuePaise: bigint('financial_value_paise', { mode: 'number' }).default(0).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    queueIdx: index('franchise_exceptions_queue_idx').on(
      table.status,
      table.severity,
      table.createdAt,
    ),
  }),
)

export const franchiseAuditLogs = createTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorRole: varchar('actor_role', { length: 32 }).notNull(),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 48 }).notNull(),
    entityId: uuid('entity_id'),
    reason: text('reason'),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    requestId: varchar('request_id', { length: 80 }),
    ipAddress: varchar('ip_address', { length: 80 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    entityIdx: index('franchise_audit_entity_idx').on(
      table.entityType,
      table.entityId,
      table.createdAt,
    ),
  }),
)
