import { randomBytes } from 'crypto'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { Request, Response } from 'express'
import { db } from '../models/client'
import {
  franchiseAgreements,
  franchiseApplications,
  franchiseAuditLogs,
  franchiseDisputes,
  franchiseGeoUnits,
  franchiseLedgerEntries,
  franchiseMembers,
  franchiseOrganizations,
  franchisePayouts,
  franchiseProducts,
  franchiseSettlements,
  franchiseShipmentAttributions,
} from '../models/schema/franchise'
import { users } from '../models/schema/users'
import { loginFranchiseMember } from '../models/services/franchiseAuth.service'
import {
  getFranchiseTerritoryCatalog,
  summarizeTerritoryCatalog,
} from '../models/services/franchiseTerritory.service'
import { getFranchiseOperationalShipments } from '../models/services/franchiseOperations.service'
import { FranchiseRequest } from '../middlewares/requireFranchiseMembership'

const organizationIdFrom = (req: FranchiseRequest) => req.franchise!.organizationId

const publicApplicationStatuses = [
  'submitted',
  'under_review',
  'info_requested',
  'approved_for_payment',
  'payment_pending',
  'payment_verified',
  'agreement_pending',
  'active',
]

const asText = (value: unknown, maxLength: number) =>
  String(value || '')
    .trim()
    .slice(0, maxLength)

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )

const createApplicationNumber = () => {
  const date = new Date()
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return `FRQ-${stamp}-${randomBytes(4).toString('hex').toUpperCase()}`
}

export const getPublicFranchiseOpportunities = async (_req: Request, res: Response) => {
  const [products, territories] = await Promise.all([
    db
      .select({
        id: franchiseProducts.id,
        code: franchiseProducts.code,
        name: franchiseProducts.name,
        tier: franchiseProducts.tier,
        description: franchiseProducts.description,
        durationMonths: franchiseProducts.durationMonths,
      })
      .from(franchiseProducts)
      .where(eq(franchiseProducts.status, 'active'))
      .orderBy(asc(franchiseProducts.name)),
    db
      .select({
        id: franchiseGeoUnits.id,
        type: franchiseGeoUnits.type,
        code: franchiseGeoUnits.code,
        name: franchiseGeoUnits.name,
        state: franchiseGeoUnits.state,
        district: franchiseGeoUnits.district,
        city: franchiseGeoUnits.city,
        pincode: franchiseGeoUnits.pincode,
      })
      .from(franchiseGeoUnits)
      .where(eq(franchiseGeoUnits.status, 'available'))
      .orderBy(asc(franchiseGeoUnits.state), asc(franchiseGeoUnits.name)),
  ])

  return res.json({
    success: true,
    data: {
      products,
      territories,
      quoteEmail: 'info@shipraylogistics.com',
      quotePhone: '+91 84878 81121',
    },
  })
}

export const submitPublicFranchiseApplication = async (req: Request, res: Response) => {
  if (asText(req.body?.website, 200)) {
    return res.status(400).json({ success: false, message: 'Unable to submit this request' })
  }

  const applicantName = asText(req.body?.applicantName, 160)
  const applicantEmail = asText(req.body?.applicantEmail, 160).toLowerCase()
  const applicantPhone = asText(req.body?.applicantPhone, 24).replace(/[\s()-]/g, '')
  const businessName = asText(req.body?.businessName, 180)
  const registeredBusinessName = asText(req.body?.registeredBusinessName, 180)
  const productId = asText(req.body?.productId, 50)
  const geoUnitId = asText(req.body?.geoUnitId, 50)

  if (
    !applicantName ||
    !applicantEmail ||
    !applicantPhone ||
    !businessName ||
    !productId ||
    !geoUnitId
  ) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, phone, business, franchise plan, and territory are required',
    })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address' })
  }
  if (!/^\+?[0-9]{10,15}$/.test(applicantPhone)) {
    return res.status(400).json({ success: false, message: 'Enter a valid phone number' })
  }
  if (!isUuid(productId) || !isUuid(geoUnitId)) {
    return res.status(400).json({ success: false, message: 'Select a valid plan and territory' })
  }
  if (req.body?.consent !== true) {
    return res.status(400).json({
      success: false,
      message: 'Consent is required before submitting the application',
    })
  }

  const [[product], [territory]] = await Promise.all([
    db
      .select({ id: franchiseProducts.id, tier: franchiseProducts.tier })
      .from(franchiseProducts)
      .where(and(eq(franchiseProducts.id, productId), eq(franchiseProducts.status, 'active')))
      .limit(1),
    db
      .select({ id: franchiseGeoUnits.id, type: franchiseGeoUnits.type })
      .from(franchiseGeoUnits)
      .where(and(eq(franchiseGeoUnits.id, geoUnitId), eq(franchiseGeoUnits.status, 'available')))
      .limit(1),
  ])

  if (!product || !territory || product.tier !== territory.type) {
    return res.status(409).json({
      success: false,
      message: 'That franchise plan or territory is no longer available. Refresh and choose again.',
    })
  }

  const [existing] = await db
    .select({ applicationNumber: franchiseApplications.applicationNumber })
    .from(franchiseApplications)
    .where(
      and(
        eq(franchiseApplications.applicantEmail, applicantEmail),
        eq(franchiseApplications.geoUnitId, geoUnitId),
        inArray(franchiseApplications.status, publicApplicationStatuses),
      ),
    )
    .limit(1)

  if (existing) {
    return res.status(409).json({
      success: false,
      message: `You already have an active request for this territory (${existing.applicationNumber}).`,
      applicationNumber: existing.applicationNumber,
    })
  }

  const applicationData = {
    businessType: asText(req.body?.businessType, 80),
    currentCity: asText(req.body?.currentCity, 120),
    currentState: asText(req.body?.currentState, 120),
    experience: asText(req.body?.experience, 1000),
    expectedMonthlyShipments: asText(req.body?.expectedMonthlyShipments, 40),
    preferredContactMethod: asText(req.body?.preferredContactMethod, 24) || 'phone',
  }
  const applicationNumber = createApplicationNumber()

  const application = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(franchiseApplications)
      .values({
        applicationNumber,
        applicantName,
        applicantEmail,
        applicantPhone,
        legalName: registeredBusinessName || businessName,
        tradeName: businessName,
        productId,
        geoUnitId,
        applicantNotes: asText(req.body?.message, 2000) || null,
        source: 'landing_page',
        applicationData,
      })
      .returning({ id: franchiseApplications.id, applicationNumber: franchiseApplications.applicationNumber })

    await tx.insert(franchiseAuditLogs).values({
      actorRole: 'public',
      action: 'application_submitted',
      entityType: 'application',
      entityId: created.id,
      after: { applicationNumber: created.applicationNumber, source: 'landing_page', productId, geoUnitId },
      requestId: (req as any).requestId || null,
      ipAddress: req.ip || null,
    })

    return created
  })

  return res.status(201).json({
    success: true,
    message: 'Your franchise request has been sent to the Shipray team',
    data: { applicationNumber: application.applicationNumber },
  })
}

const sumAmounts = (
  entries: Array<{ state: string; amountPaise: number }>,
  states: string[],
) =>
  entries
    .filter((entry) => states.includes(entry.state))
    .reduce((total, entry) => total + Number(entry.amountPaise || 0), 0)

export const franchiseLogin = async (req: Request, res: Response) => {
  const email = String(req.body?.email || '').trim()
  const password = String(req.body?.password || '')
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' })
  }

  try {
    const result = await loginFranchiseMember(email, password)
    return res.json({ success: true, ...result })
  } catch (error: any) {
    return res.status(401).json({
      success: false,
      message: error?.message || 'Unable to sign in',
    })
  }
}

export const getFranchiseMe = async (req: FranchiseRequest, res: Response) => {
  const [organization] = await db
    .select()
    .from(franchiseOrganizations)
    .where(eq(franchiseOrganizations.id, organizationIdFrom(req)))
    .limit(1)

  return res.json({
    success: true,
    data: {
      organization,
      membership: req.franchise,
    },
  })
}

export const getFranchiseDashboard = async (req: FranchiseRequest, res: Response) => {
  const organizationId = organizationIdFrom(req)
  const [entries, attributions, agreements, settlements, disputes] = await Promise.all([
    db
      .select({
        state: franchiseLedgerEntries.state,
        amountPaise: franchiseLedgerEntries.amountPaise,
      })
      .from(franchiseLedgerEntries)
      .where(eq(franchiseLedgerEntries.organizationId, organizationId)),
    db
      .select()
      .from(franchiseShipmentAttributions)
      .where(eq(franchiseShipmentAttributions.organizationId, organizationId))
      .orderBy(desc(franchiseShipmentAttributions.bookedAt)),
    db
      .select({
        agreementId: franchiseAgreements.id,
        status: franchiseAgreements.status,
        startsAt: franchiseAgreements.startsAt,
        endsAt: franchiseAgreements.endsAt,
        tier: franchiseProducts.tier,
        territoryName: franchiseGeoUnits.name,
        territoryState: franchiseGeoUnits.state,
      })
      .from(franchiseAgreements)
      .innerJoin(franchiseProducts, eq(franchiseProducts.id, franchiseAgreements.productId))
      .innerJoin(franchiseGeoUnits, eq(franchiseGeoUnits.id, franchiseAgreements.geoUnitId))
      .where(eq(franchiseAgreements.organizationId, organizationId)),
    db
      .select()
      .from(franchiseSettlements)
      .where(eq(franchiseSettlements.organizationId, organizationId))
      .orderBy(desc(franchiseSettlements.periodEnd))
      .limit(4),
    db
      .select()
      .from(franchiseDisputes)
      .where(
        and(
          eq(franchiseDisputes.organizationId, organizationId),
          inArray(franchiseDisputes.status, ['open', 'in_review']),
        ),
      ),
  ])

  return res.json({
    success: true,
    data: {
      metrics: {
        eligibleOrders: attributions.length,
        provisionalPaise: sumAmounts(entries, ['provisional']),
        approvedPaise: sumAmounts(entries, ['approved', 'settled', 'paid']),
        paidPaise: sumAmounts(entries, ['paid']),
        activeTerritories: agreements.filter((agreement) => agreement.status === 'active').length,
        openDisputes: disputes.length,
      },
      agreements,
      nextSettlement: settlements.find((settlement) =>
        ['draft', 'review', 'approved'].includes(settlement.status),
      ),
      recentOrders: attributions.slice(0, 6),
    },
  })
}

export const getFranchiseOrders = async (req: FranchiseRequest, res: Response) => {
  const organizationId = organizationIdFrom(req)
  const [orders, ledger] = await Promise.all([
    db
      .select()
      .from(franchiseShipmentAttributions)
      .where(eq(franchiseShipmentAttributions.organizationId, organizationId))
      .orderBy(desc(franchiseShipmentAttributions.bookedAt)),
    db
      .select({
        attributionId: franchiseLedgerEntries.attributionId,
        amountPaise: franchiseLedgerEntries.amountPaise,
        state: franchiseLedgerEntries.state,
        entryType: franchiseLedgerEntries.entryType,
        snapshot: franchiseLedgerEntries.calculationSnapshot,
      })
      .from(franchiseLedgerEntries)
      .where(eq(franchiseLedgerEntries.organizationId, organizationId)),
  ])

  const ledgerByAttribution = new Map(
    ledger
      .filter((entry) => entry.attributionId)
      .map((entry) => [entry.attributionId as string, entry]),
  )

  return res.json({
    success: true,
    data: orders.map((order) => ({
      ...order,
      earning: ledgerByAttribution.get(order.id) || null,
    })),
  })
}

const normalizedStatus = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()

export const getFranchiseTracking = async (req: FranchiseRequest, res: Response) => {
  const shipments = await getFranchiseOperationalShipments(organizationIdFrom(req))
  const isDelivered = (status: string) => {
    const normalized = normalizedStatus(status)
    return normalized.includes('delivered') && !normalized.includes('rto')
  }
  const isException = (shipment: (typeof shipments)[number]) =>
    shipment.ndrTimeline.length > 0 ||
    shipment.rtoTimeline.length > 0 ||
    /failed|exception|undelivered|lost|cancelled|ndr|rto/.test(
      normalizedStatus(shipment.currentStatus),
    )

  return res.json({
    success: true,
    data: {
      summary: {
        total: shipments.length,
        inTransit: shipments.filter((shipment) =>
          /picked|transit|manifest|out_for_delivery|shipped/.test(
            normalizedStatus(shipment.currentStatus),
          ),
        ).length,
        delivered: shipments.filter((shipment) => isDelivered(shipment.currentStatus)).length,
        exceptions: shipments.filter(isException).length,
      },
      shipments,
    },
  })
}

export const getFranchiseNdr = async (req: FranchiseRequest, res: Response) => {
  const shipments = await getFranchiseOperationalShipments(organizationIdFrom(req))
  const ndrShipments = shipments
    .filter(
      (shipment) =>
        shipment.ndrTimeline.length > 0 ||
        /ndr|undelivered|delivery_failed|address_issue|consignee_unavailable/.test(
          normalizedStatus(shipment.currentStatus),
        ),
    )
    .map((shipment) => ({
      ...shipment,
      latestNdr:
        shipment.latestNdr ||
        {
          id: `status-${shipment.id}`,
          status: shipment.currentStatus,
          description: 'NDR state reported by the shipment provider',
          location: null,
          attempt: null,
          chargesPaise: 0,
          createdAt: shipment.updatedAt,
        },
    }))
  const isResolved = (status: string) =>
    /resolved|actioned|reattempt_success|delivered|closed/.test(normalizedStatus(status))

  return res.json({
    success: true,
    data: {
      summary: {
        total: ndrShipments.length,
        open: ndrShipments.filter(
          (shipment) => !isResolved(shipment.latestNdr?.status || shipment.currentStatus),
        ).length,
        resolved: ndrShipments.filter((shipment) =>
          isResolved(shipment.latestNdr?.status || shipment.currentStatus),
        ).length,
        attempts: ndrShipments.reduce(
          (total, shipment) => total + shipment.ndrTimeline.length,
          0,
        ),
      },
      shipments: ndrShipments,
    },
  })
}

export const getFranchiseRto = async (req: FranchiseRequest, res: Response) => {
  const shipments = await getFranchiseOperationalShipments(organizationIdFrom(req))
  const rtoShipments = shipments
    .filter(
      (shipment) =>
        shipment.rtoTimeline.length > 0 || /rto/.test(normalizedStatus(shipment.currentStatus)),
    )
    .map((shipment) => ({
      ...shipment,
      latestRto:
        shipment.latestRto ||
        {
          id: `status-${shipment.id}`,
          status: shipment.currentStatus,
          description: 'RTO state reported by the shipment provider',
          location: null,
          attempt: null,
          chargesPaise: 0,
          createdAt: shipment.updatedAt,
        },
    }))

  return res.json({
    success: true,
    data: {
      summary: {
        total: rtoShipments.length,
        inTransit: rtoShipments.filter((shipment) =>
          /in_transit|initiated|moving/.test(
            normalizedStatus(shipment.latestRto?.status || shipment.currentStatus),
          ),
        ).length,
        delivered: rtoShipments.filter((shipment) =>
          /rto_delivered|returned|closed/.test(
            normalizedStatus(shipment.latestRto?.status || shipment.currentStatus),
          ),
        ).length,
        chargesPaise: rtoShipments.reduce(
          (total, shipment) => total + shipment.totalRtoChargesPaise,
          0,
        ),
      },
      shipments: rtoShipments,
    },
  })
}

export const getFranchiseTerritories = async (req: FranchiseRequest, res: Response) => {
  const organizationId = organizationIdFrom(req)
  const owned = await db
    .select({
      agreementId: franchiseAgreements.id,
      agreementNumber: franchiseAgreements.agreementNumber,
      agreementStatus: franchiseAgreements.status,
      startsAt: franchiseAgreements.startsAt,
      endsAt: franchiseAgreements.endsAt,
      shareBps: franchiseAgreements.shareBps,
      geoUnitId: franchiseGeoUnits.id,
      type: franchiseGeoUnits.type,
      code: franchiseGeoUnits.code,
      name: franchiseGeoUnits.name,
      state: franchiseGeoUnits.state,
      district: franchiseGeoUnits.district,
      city: franchiseGeoUnits.city,
      pincode: franchiseGeoUnits.pincode,
      tier: franchiseProducts.tier,
      productName: franchiseProducts.name,
    })
    .from(franchiseAgreements)
    .innerJoin(franchiseGeoUnits, eq(franchiseGeoUnits.id, franchiseAgreements.geoUnitId))
    .innerJoin(franchiseProducts, eq(franchiseProducts.id, franchiseAgreements.productId))
    .where(
      and(
        eq(franchiseAgreements.organizationId, organizationId),
        inArray(franchiseAgreements.status, ['active', 'suspended']),
      ),
    )

  const catalog = await getFranchiseTerritoryCatalog()
  const byId = new Map(catalog.map((entry) => [entry.id, entry]))
  const catalogIdByGeoUnit = new Map(
    catalog
      .filter((entry) => entry.geoUnitId)
      .map((entry) => [entry.geoUnitId as string, entry.id]),
  )
  const included = new Map<string, (typeof catalog)[number]>()
  const coverage = owned.map((territory) => {
    const rootId = catalogIdByGeoUnit.get(territory.geoUnitId)
    const root = rootId ? byId.get(rootId) : null
    const entries = root
      ? catalog.filter((entry) => {
          if (root.type === 'state') return entry.state === root.state
          if (root.type === 'district_city') {
            return entry.id === root.id || entry.parentId === root.id
          }
          return entry.id === root.id
        })
      : []

    entries.forEach((entry) => included.set(entry.id, entry))
    const descendants = entries.filter((entry) => entry.id !== root?.id)
    return {
      ...territory,
      rootId: root?.id || null,
      path: root
        ? [byId.get(root.parentId || ''), root]
            .filter(Boolean)
            .flatMap((entry) => {
              if (entry?.type !== 'district_city' || !entry.parentId) return [entry?.name]
              const state = byId.get(entry.parentId)
              return [state?.name, entry.name]
            })
            .filter((value, index, values) => value && values.indexOf(value) === index)
        : [territory.state, territory.district, territory.pincode].filter(Boolean),
      descendantCounts: {
        districtCities: descendants.filter((entry) => entry.type === 'district_city').length,
        pincodes: descendants.filter((entry) => entry.type === 'pincode').length,
        booked: descendants.filter((entry) => entry.status === 'booked').length,
        reserved: descendants.filter((entry) => entry.status === 'reserved').length,
        available: descendants.filter((entry) => entry.status === 'available').length,
      },
    }
  })

  const network = Array.from(included.values()).map((entry) => ({
    id: entry.id,
    parentId: entry.parentId,
    geoUnitId: entry.geoUnitId,
    type: entry.type,
    code: entry.code,
    name: entry.name,
    pincode: entry.pincode,
    state: entry.state,
    district: entry.district,
    city: entry.city,
    status: entry.status,
    sourceStatus: entry.sourceStatus,
    isOwned: owned.some((territory) => territory.geoUnitId === entry.geoUnitId),
  }))

  return res.json({
    success: true,
    data: {
      owned: coverage,
      network,
      summary: summarizeTerritoryCatalog(Array.from(included.values())),
    },
  })
}

export const getFranchiseEarnings = async (req: FranchiseRequest, res: Response) => {
  const entries = await db
    .select({
      id: franchiseLedgerEntries.id,
      entryType: franchiseLedgerEntries.entryType,
      state: franchiseLedgerEntries.state,
      amountPaise: franchiseLedgerEntries.amountPaise,
      occurredAt: franchiseLedgerEntries.occurredAt,
      calculationSnapshot: franchiseLedgerEntries.calculationSnapshot,
      awbMasked: franchiseShipmentAttributions.awbMasked,
      originPincode: franchiseShipmentAttributions.originPincode,
      courierProvider: franchiseShipmentAttributions.courierProvider,
      tier: franchiseShipmentAttributions.tier,
    })
    .from(franchiseLedgerEntries)
    .leftJoin(
      franchiseShipmentAttributions,
      eq(franchiseShipmentAttributions.id, franchiseLedgerEntries.attributionId),
    )
    .where(eq(franchiseLedgerEntries.organizationId, organizationIdFrom(req)))
    .orderBy(desc(franchiseLedgerEntries.occurredAt))

  return res.json({
    success: true,
    data: {
      totals: {
        provisionalPaise: sumAmounts(entries, ['provisional']),
        earnedPaise: sumAmounts(entries, ['earned']),
        approvedPaise: sumAmounts(entries, ['approved']),
        settledPaise: sumAmounts(entries, ['settled']),
        paidPaise: sumAmounts(entries, ['paid']),
        reversedPaise: Math.abs(sumAmounts(entries, ['reversed'])),
      },
      entries,
    },
  })
}

export const getFranchiseSettlements = async (req: FranchiseRequest, res: Response) => {
  const organizationId = organizationIdFrom(req)
  const [settlements, payouts] = await Promise.all([
    db
      .select()
      .from(franchiseSettlements)
      .where(eq(franchiseSettlements.organizationId, organizationId))
      .orderBy(desc(franchiseSettlements.periodEnd)),
    db
      .select()
      .from(franchisePayouts)
      .where(eq(franchisePayouts.organizationId, organizationId))
      .orderBy(desc(franchisePayouts.createdAt)),
  ])

  return res.json({ success: true, data: { settlements, payouts } })
}

export const getFranchiseReports = async (req: FranchiseRequest, res: Response) => {
  const organizationId = organizationIdFrom(req)
  const [orders, entries, settlements] = await Promise.all([
    db
      .select()
      .from(franchiseShipmentAttributions)
      .where(eq(franchiseShipmentAttributions.organizationId, organizationId)),
    db
      .select()
      .from(franchiseLedgerEntries)
      .where(eq(franchiseLedgerEntries.organizationId, organizationId)),
    db
      .select()
      .from(franchiseSettlements)
      .where(eq(franchiseSettlements.organizationId, organizationId)),
  ])

  return res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      summary: {
        orderCount: orders.length,
        totalEarningsPaise: entries.reduce(
          (total, entry) => total + Number(entry.amountPaise || 0),
          0,
        ),
        settlementCount: settlements.length,
      },
      reports: [],
    },
  })
}

export const getFranchiseDocuments = async (req: FranchiseRequest, res: Response) => {
  const organizationId = organizationIdFrom(req)
  const [organization, agreements] = await Promise.all([
    db
      .select()
      .from(franchiseOrganizations)
      .where(eq(franchiseOrganizations.id, organizationId))
      .limit(1),
    db
      .select({
        id: franchiseAgreements.id,
        agreementNumber: franchiseAgreements.agreementNumber,
        version: franchiseAgreements.version,
        status: franchiseAgreements.status,
        startsAt: franchiseAgreements.startsAt,
        endsAt: franchiseAgreements.endsAt,
        territory: franchiseGeoUnits.name,
      })
      .from(franchiseAgreements)
      .innerJoin(franchiseGeoUnits, eq(franchiseGeoUnits.id, franchiseAgreements.geoUnitId))
      .where(eq(franchiseAgreements.organizationId, organizationId)),
  ])

  return res.json({
    success: true,
    data: {
      organization: organization[0],
      agreements,
      compliance: [
        { type: 'PAN', status: organization[0]?.pan ? 'verified' : 'required' },
        { type: 'GST', status: organization[0]?.gstin ? 'verified' : 'required' },
        { type: 'Bank account', status: organization[0]?.bankStatus || 'pending' },
        { type: 'KYC', status: organization[0]?.kycStatus || 'pending' },
      ],
    },
  })
}

export const getFranchiseTeam = async (req: FranchiseRequest, res: Response) => {
  const team = await db
    .select({
      id: franchiseMembers.id,
      userId: franchiseMembers.userId,
      email: users.email,
      role: franchiseMembers.role,
      permissions: franchiseMembers.permissions,
      mfaStatus: franchiseMembers.mfaStatus,
      isActive: franchiseMembers.isActive,
      joinedAt: franchiseMembers.joinedAt,
    })
    .from(franchiseMembers)
    .innerJoin(users, eq(users.id, franchiseMembers.userId))
    .where(eq(franchiseMembers.organizationId, organizationIdFrom(req)))
    .orderBy(asc(users.email))

  return res.json({ success: true, data: team })
}

export const getFranchiseDisputes = async (req: FranchiseRequest, res: Response) => {
  const disputes = await db
    .select()
    .from(franchiseDisputes)
    .where(eq(franchiseDisputes.organizationId, organizationIdFrom(req)))
    .orderBy(desc(franchiseDisputes.createdAt))

  return res.json({ success: true, data: disputes })
}

export const createFranchiseDispute = async (req: FranchiseRequest, res: Response) => {
  const subject = String(req.body?.subject || '').trim()
  const description = String(req.body?.description || '').trim()
  const type = String(req.body?.type || 'general').trim()
  if (!subject || !description) {
    return res.status(400).json({ success: false, message: 'Subject and description are required' })
  }

  const [dispute] = await db
    .insert(franchiseDisputes)
    .values({
      organizationId: organizationIdFrom(req),
      type,
      subject,
      description,
      linkedType: req.body?.linkedType || null,
      linkedId: req.body?.linkedId || null,
    })
    .returning()

  return res.status(201).json({ success: true, data: dispute })
}
