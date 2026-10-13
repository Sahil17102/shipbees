import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { Request, Response } from 'express'
import { db } from '../../models/client'
import {
  franchiseAgreements,
  franchiseApplications,
  franchiseAuditLogs,
  franchiseCommissionRules,
  franchiseDisputes,
  franchiseExceptions,
  franchiseGeoUnits,
  franchiseLedgerEntries,
  franchiseMembers,
  franchiseOrganizations,
  franchisePayouts,
  franchiseProducts,
  franchiseSettlements,
  franchiseShipmentAttributions,
  franchiseTerritoryReservations,
} from '../../models/schema/franchise'
import {
  getFranchiseTerritoryCatalog,
  summarizeTerritoryCatalog,
} from '../../models/services/franchiseTerritory.service'
import { users } from '../../models/schema/users'
import { sendFranchiseInvitationEmail } from '../../utils/emailSender'

const rupeesToPaise = (value: unknown) => Math.round(Number(value || 0) * 100)
const now = () => new Date()

const addMonths = (date: Date, months: number) => {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

const createNumber = (prefix: string) => {
  const date = new Date()
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  return `${prefix}-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`
}

const recordAudit = async (
  actorUserId: string | undefined,
  req: any,
  action: string,
  entityType: string,
  entityId: string | null,
  reason: string | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) => {
  await db.insert(franchiseAuditLogs).values({
    actorUserId: actorUserId || null,
    actorRole: 'admin',
    action,
    entityType,
    entityId,
    reason,
    before,
    after,
    requestId: req.requestId || null,
    ipAddress: req.ip || null,
  })
}

const applicationSelection = {
  id: franchiseApplications.id,
  applicationNumber: franchiseApplications.applicationNumber,
  applicantName: franchiseApplications.applicantName,
  applicantEmail: franchiseApplications.applicantEmail,
  applicantPhone: franchiseApplications.applicantPhone,
  legalName: franchiseApplications.legalName,
  tradeName: franchiseApplications.tradeName,
  pan: franchiseApplications.pan,
  gstin: franchiseApplications.gstin,
  status: franchiseApplications.status,
  kycStatus: franchiseApplications.kycStatus,
  paymentStatus: franchiseApplications.paymentStatus,
  agreementStatus: franchiseApplications.agreementStatus,
  commercialAmountPaise: franchiseApplications.commercialAmountPaise,
  depositAmountPaise: franchiseApplications.depositAmountPaise,
  paymentReference: franchiseApplications.paymentReference,
  adminNotes: franchiseApplications.adminNotes,
  applicantNotes: franchiseApplications.applicantNotes,
  source: franchiseApplications.source,
  applicationData: franchiseApplications.applicationData,
  decisionReason: franchiseApplications.decisionReason,
  submittedAt: franchiseApplications.submittedAt,
  reviewedAt: franchiseApplications.reviewedAt,
  activatedAt: franchiseApplications.activatedAt,
  productId: franchiseProducts.id,
  productName: franchiseProducts.name,
  tier: franchiseProducts.tier,
  productPricePaise: franchiseProducts.pricePaise,
  defaultShareBps: franchiseProducts.defaultShareBps,
  productDurationMonths: franchiseProducts.durationMonths,
  productAgreementVersion: franchiseProducts.agreementVersion,
  geoUnitId: franchiseGeoUnits.id,
  territoryCode: franchiseGeoUnits.code,
  territoryName: franchiseGeoUnits.name,
  territoryType: franchiseGeoUnits.type,
  territoryState: franchiseGeoUnits.state,
}

export const getFranchiseAdminOverview = async (_req: Request, res: Response) => {
  const [applications, territories, organizations, ledger, settlements, exceptions] =
    await Promise.all([
      db.select().from(franchiseApplications),
      db.select().from(franchiseGeoUnits),
      db.select().from(franchiseOrganizations),
      db.select().from(franchiseLedgerEntries),
      db.select().from(franchiseSettlements),
      db.select().from(franchiseExceptions),
    ])

  return res.json({
    success: true,
    data: {
      metrics: {
        applicationsPending: applications.filter((item) =>
          ['submitted', 'under_review', 'info_requested'].includes(item.status),
        ).length,
        activeFranchises: organizations.filter((item) => item.status === 'active').length,
        activeTerritories: territories.filter((item) => item.status === 'active').length,
        availableTerritories: territories.filter((item) => item.status === 'available').length,
        provisionalLiabilityPaise: ledger
          .filter((item) => item.state === 'provisional')
          .reduce((total, item) => total + Number(item.amountPaise || 0), 0),
        approvedLiabilityPaise: ledger
          .filter((item) => ['approved', 'settled'].includes(item.state))
          .reduce((total, item) => total + Number(item.amountPaise || 0), 0),
        draftSettlementPaise: settlements
          .filter((item) => ['draft', 'review'].includes(item.status))
          .reduce((total, item) => total + Number(item.netPaise || 0), 0),
        openExceptions: exceptions.filter((item) => item.status === 'open').length,
      },
      recentApplications: applications
        .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())
        .slice(0, 6),
      rollout: {
        stage: 'active',
        automatedPayouts: false,
        manualSettlementReview: true,
      },
    },
  })
}

export const listFranchiseApplications = async (req: Request, res: Response) => {
  const status = String(req.query.status || '').trim()
  let query = db
    .select(applicationSelection)
    .from(franchiseApplications)
    .innerJoin(franchiseProducts, eq(franchiseProducts.id, franchiseApplications.productId))
    .innerJoin(franchiseGeoUnits, eq(franchiseGeoUnits.id, franchiseApplications.geoUnitId))
    .$dynamic()

  if (status && status !== 'all') {
    query = query.where(eq(franchiseApplications.status, status))
  }

  const data = await query.orderBy(desc(franchiseApplications.submittedAt))
  return res.json({ success: true, data })
}

export const updateFranchiseApplication = async (req: any, res: Response) => {
  const id = req.params.id
  const action = String(req.body?.action || '').trim()
  const reason = String(req.body?.reason || '').trim() || null
  const actorUserId = req.user?.sub as string | undefined

  const [application] = await db
    .select(applicationSelection)
    .from(franchiseApplications)
    .innerJoin(franchiseProducts, eq(franchiseProducts.id, franchiseApplications.productId))
    .innerJoin(franchiseGeoUnits, eq(franchiseGeoUnits.id, franchiseApplications.geoUnitId))
    .where(eq(franchiseApplications.id, id))
    .limit(1)

  if (!application) {
    return res.status(404).json({ success: false, message: 'Franchise request not found' })
  }

  if (['reject', 'request_info'].includes(action) && !reason) {
    return res.status(400).json({ success: false, message: 'A reason is required for this action' })
  }

  const allowedActions = [
    'start_review',
    'verify_kyc',
    'request_info',
    'approve_for_payment',
    'verify_payment',
    'generate_agreement',
    'accept_agreement',
    'activate',
    'reject',
  ]
  if (!allowedActions.includes(action)) {
    return res.status(400).json({ success: false, message: 'Unsupported application action' })
  }

  let temporaryPassword: string | null = null
  let invitation:
    | {
        to: string
        name: string
        organizationName: string
        territoryName: string
        temporaryPassword?: string | null
      }
    | undefined

  try {
    if (action === 'approve_for_payment') {
      if (application.status !== 'under_review' || application.kycStatus !== 'verified') {
        return res.status(409).json({
          success: false,
          message: 'Complete review and KYC verification before commercial approval',
        })
      }
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
      await db.transaction(async (tx) => {
        const [reservation] = await tx
          .insert(franchiseTerritoryReservations)
          .values({
            applicationId: application.id,
            geoUnitId: application.geoUnitId,
            status: 'payment_pending',
            expiresAt,
          })
          .onConflictDoNothing()
          .returning()

        if (!reservation) {
          const conflictError: any = new Error('Territory reservation conflict')
          conflictError.code = '23505'
          throw conflictError
        }

        const [reservedTerritory] = await tx
          .update(franchiseGeoUnits)
          .set({ status: 'reserved', updatedAt: now() })
          .where(
            and(
              eq(franchiseGeoUnits.id, application.geoUnitId),
              eq(franchiseGeoUnits.status, 'available'),
            ),
          )
          .returning()

        if (!reservedTerritory) {
          const conflictError: any = new Error('Territory is not available')
          conflictError.code = '23505'
          throw conflictError
        }

        await tx
          .update(franchiseApplications)
          .set({
            status: 'approved_for_payment',
            paymentStatus: 'pending',
            commercialAmountPaise:
              req.body?.commercialAmountRupees !== undefined
                ? rupeesToPaise(req.body.commercialAmountRupees)
                : application.productPricePaise,
            depositAmountPaise:
              req.body?.depositAmountRupees !== undefined
                ? rupeesToPaise(req.body.depositAmountRupees)
                : application.depositAmountPaise,
            adminNotes: reason,
            reviewedBy: actorUserId,
            reviewedAt: now(),
            updatedAt: now(),
          })
          .where(eq(franchiseApplications.id, id))
      })
    } else if (action === 'verify_payment') {
      if (!['approved_for_payment', 'payment_pending'].includes(application.status)) {
        return res.status(409).json({
          success: false,
          message: 'Payment can only be verified after commercial approval',
        })
      }
      await db
        .update(franchiseApplications)
        .set({
          status: 'payment_verified',
          paymentStatus: 'verified',
          paymentReference: String(req.body?.paymentReference || '').trim() || null,
          paymentVerifiedAt: now(),
          reviewedBy: actorUserId,
          updatedAt: now(),
        })
        .where(eq(franchiseApplications.id, id))
    } else if (action === 'generate_agreement') {
      if (application.status !== 'payment_verified' || application.paymentStatus !== 'verified') {
        return res.status(409).json({
          success: false,
          message: 'Verify payment before generating the final agreement',
        })
      }
      await db
        .update(franchiseApplications)
        .set({
          status: 'agreement_pending',
          agreementStatus: 'ready',
          reviewedBy: actorUserId,
          updatedAt: now(),
        })
        .where(eq(franchiseApplications.id, id))
    } else if (action === 'accept_agreement') {
      if (application.status !== 'agreement_pending' || application.agreementStatus !== 'ready') {
        return res.status(409).json({
          success: false,
          message: 'Generate the current agreement before marking it accepted',
        })
      }
      await db
        .update(franchiseApplications)
        .set({
          status: 'agreement_pending',
          agreementStatus: 'accepted',
          reviewedBy: actorUserId,
          updatedAt: now(),
        })
        .where(eq(franchiseApplications.id, id))
    } else if (action === 'activate') {
      if (
        application.status !== 'agreement_pending' ||
        application.kycStatus !== 'verified' ||
        application.paymentStatus !== 'verified' ||
        application.agreementStatus !== 'accepted'
      ) {
        return res.status(409).json({
          success: false,
          message: 'Verified KYC, verified payment, and an accepted agreement are required',
        })
      }

      const generatedPassword = `Shipray!${randomBytes(5).toString('hex')}`
      const passwordHash = await bcrypt.hash(generatedPassword, 10)
      const startsAt = now()
      const endsAt = addMonths(startsAt, application.productDurationMonths)

      const activationResult = await db.transaction(async (tx) => {
        let [account] = await tx
          .select()
          .from(users)
          .where(eq(users.email, application.applicantEmail.toLowerCase()))
          .limit(1)

        if (!account) {
          temporaryPassword = generatedPassword
          ;[account] = await tx
            .insert(users)
            .values({
              email: application.applicantEmail.toLowerCase(),
              passwordHash,
              emailVerified: true,
              accountVerified: true,
              role: 'franchise',
            })
            .returning()
        } else if (!account.passwordHash) {
          temporaryPassword = generatedPassword
          await tx
            .update(users)
            .set({
              passwordHash,
              emailVerified: true,
              accountVerified: true,
              updatedAt: now(),
            })
            .where(eq(users.id, account.id))
        } else {
          await tx
            .update(users)
            .set({
              emailVerified: true,
              accountVerified: true,
              updatedAt: now(),
            })
            .where(eq(users.id, account.id))
        }

        const [organization] = await tx
          .insert(franchiseOrganizations)
          .values({
            legalName: application.legalName,
            tradeName: application.tradeName,
            pan: application.pan,
            gstin: application.gstin,
            email: application.applicantEmail,
            phone: application.applicantPhone,
            kycStatus: application.kycStatus === 'verified' ? 'verified' : 'pending',
            status: 'active',
          })
          .returning()

        await tx.insert(franchiseMembers).values({
          organizationId: organization.id,
          userId: account.id,
          role: 'owner',
          permissions: ['portal:*'],
          isActive: true,
          invitedAt: startsAt,
          joinedAt: startsAt,
        })

        const [agreement] = await tx
          .insert(franchiseAgreements)
          .values({
            agreementNumber: createNumber('AGR'),
            applicationId: application.id,
            organizationId: organization.id,
            productId: application.productId,
            geoUnitId: application.geoUnitId,
            version: application.productAgreementVersion,
            status: 'active',
            pricePaise: application.commercialAmountPaise,
            securityDepositPaise: application.depositAmountPaise,
            shareBps: application.defaultShareBps,
            startsAt,
            endsAt,
            acceptedAt: startsAt,
            acceptedBy: account.id,
            termsSnapshot: {
              source: 'admin_activation',
              applicationNumber: application.applicationNumber,
              noAutomaticPayout: true,
            },
          })
          .returning()

        await tx
          .update(franchiseApplications)
          .set({
            organizationId: organization.id,
            status: 'active',
            agreementStatus: 'accepted',
            activatedAt: startsAt,
            reviewedBy: actorUserId,
            updatedAt: startsAt,
          })
          .where(eq(franchiseApplications.id, id))

        await tx
          .update(franchiseGeoUnits)
          .set({ status: 'active', updatedAt: startsAt })
          .where(eq(franchiseGeoUnits.id, application.geoUnitId))

        await tx
          .update(franchiseTerritoryReservations)
          .set({ status: 'converted', releasedAt: startsAt, updatedAt: startsAt })
          .where(eq(franchiseTerritoryReservations.applicationId, application.id))

        return { organization, agreement }
      })

      invitation = {
        to: application.applicantEmail,
        name: application.applicantName,
        organizationName: activationResult.organization.tradeName,
        territoryName: application.territoryName,
        temporaryPassword,
      }
    } else {
      const transitionAllowed =
        (action === 'start_review' &&
          ['submitted', 'info_requested'].includes(application.status)) ||
        (action === 'verify_kyc' && application.status === 'under_review') ||
        (action === 'request_info' &&
          ['submitted', 'under_review'].includes(application.status)) ||
        (action === 'reject' &&
          ['submitted', 'under_review', 'info_requested'].includes(application.status))

      if (!transitionAllowed) {
        return res.status(409).json({
          success: false,
          message: "This action is not valid for the request's current state",
        })
      }

      const changes: Record<string, any> = {
        reviewedBy: actorUserId,
        reviewedAt: now(),
        updatedAt: now(),
      }
      if (action === 'start_review') changes.status = 'under_review'
      if (action === 'verify_kyc') changes.kycStatus = 'verified'
      if (action === 'request_info') {
        changes.status = 'info_requested'
        changes.adminNotes = reason
      }
      if (action === 'reject') {
        changes.status = 'rejected'
        changes.decisionReason = reason
      }

      await db
        .update(franchiseApplications)
        .set(changes)
        .where(eq(franchiseApplications.id, id))
    }

    const [updated] = await db
      .select()
      .from(franchiseApplications)
      .where(eq(franchiseApplications.id, id))
      .limit(1)

    await recordAudit(
      actorUserId,
      req,
      `application.${action}`,
      'franchise_application',
      id,
      reason,
      application as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
    )

    if (invitation) {
      sendFranchiseInvitationEmail(invitation).catch((error) =>
        console.error('[Franchise] Invitation email failed:', error),
      )
    }

    return res.json({
      success: true,
      data: updated,
      ...(temporaryPassword ? { temporaryPassword } : {}),
    })
  } catch (error: any) {
    console.error('[Franchise] Application action failed:', error)
    const conflict = error?.code === '23505'
    return res.status(conflict ? 409 : 500).json({
      success: false,
      message: conflict
        ? 'This territory is already reserved or active'
        : 'Unable to update the franchise request',
    })
  }
}

export const listFranchiseProducts = async (_req: Request, res: Response) => {
  const data = await db.select().from(franchiseProducts).orderBy(asc(franchiseProducts.tier))
  return res.json({ success: true, data })
}

export const createFranchiseProduct = async (req: any, res: Response) => {
  const { code, name, tier } = req.body || {}
  if (!code || !name || !['state', 'district_city', 'pincode'].includes(tier)) {
    return res.status(400).json({ success: false, message: 'Code, name, and a valid tier are required' })
  }

  try {
    const [product] = await db
      .insert(franchiseProducts)
      .values({
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        tier,
        description: String(req.body.description || '').trim() || null,
        pricePaise: rupeesToPaise(req.body.priceRupees),
        securityDepositPaise: rupeesToPaise(req.body.securityDepositRupees),
        durationMonths: Number(req.body.durationMonths || 12),
        defaultShareBps: Math.round(Number(req.body.defaultSharePercent || 0) * 100),
        agreementVersion: String(req.body.agreementVersion || 'v1'),
      })
      .returning()

    await recordAudit(
      req.user?.sub,
      req,
      'product.create',
      'franchise_product',
      product.id,
      null,
      null,
      product,
    )
    return res.status(201).json({ success: true, data: product })
  } catch (error: any) {
    return res.status(error?.code === '23505' ? 409 : 500).json({
      success: false,
      message: error?.code === '23505' ? 'Product code already exists' : 'Unable to create product',
    })
  }
}

export const listFranchiseTerritories = async (req: Request, res: Response) => {
  const catalog = await getFranchiseTerritoryCatalog()
  const states = catalog.filter((entry) => entry.type === 'state')
  const requestedStateId = String(req.query.stateId || '').trim()
  const selectedStateId = states.some((entry) => entry.id === requestedStateId)
    ? requestedStateId
    : states[0]?.id || null
  const districts = selectedStateId
    ? catalog.filter(
        (entry) => entry.type === 'district_city' && entry.parentId === selectedStateId,
      )
    : []
  const requestedDistrictId = String(req.query.districtId || '').trim()
  const selectedDistrictId = districts.some((entry) => entry.id === requestedDistrictId)
    ? requestedDistrictId
    : districts[0]?.id || null
  const pincodes = selectedDistrictId
    ? catalog.filter((entry) => entry.type === 'pincode' && entry.parentId === selectedDistrictId)
    : []

  const serialize = (entry: (typeof catalog)[number]) => ({
    ...entry,
    ownerName: entry.owner?.tradeName || null,
    agreementNumber: entry.agreement?.agreementNumber || null,
    agreementStatus: entry.agreement?.status || null,
    agreementEndsAt: entry.agreement?.endsAt || null,
  })

  const stateRows = states.map((state) => {
    const stateDistricts = catalog.filter(
      (entry) => entry.type === 'district_city' && entry.parentId === state.id,
    )
    const districtIds = new Set(stateDistricts.map((entry) => entry.id))
    const statePincodes = catalog.filter(
      (entry) => entry.type === 'pincode' && entry.parentId && districtIds.has(entry.parentId),
    )
    return {
      ...serialize(state),
      districtCount: stateDistricts.length,
      pincodeCount: statePincodes.length,
      bookedDistricts: stateDistricts.filter((entry) => entry.status === 'booked').length,
      bookedPincodes: statePincodes.filter((entry) => entry.status === 'booked').length,
    }
  })

  const districtRows = districts.map((district) => {
    const districtPincodes = catalog.filter(
      (entry) => entry.type === 'pincode' && entry.parentId === district.id,
    )
    return {
      ...serialize(district),
      pincodeCount: districtPincodes.length,
      bookedPincodes: districtPincodes.filter((entry) => entry.status === 'booked').length,
      reservedPincodes: districtPincodes.filter((entry) => entry.status === 'reserved').length,
    }
  })

  return res.json({
    success: true,
    data: {
      summary: summarizeTerritoryCatalog(catalog),
      states: stateRows,
      districts: districtRows,
      pincodes: pincodes.map(serialize),
      selection: {
        stateId: selectedStateId,
        districtId: selectedDistrictId,
      },
    },
  })
}

export const getFranchiseTerritoryDetails = async (req: Request, res: Response) => {
  const geoUnitId = String(req.params.id || '').trim()
  const [territory] = await db
    .select({
      id: franchiseGeoUnits.id,
      type: franchiseGeoUnits.type,
      code: franchiseGeoUnits.code,
      name: franchiseGeoUnits.name,
      pincode: franchiseGeoUnits.pincode,
      state: franchiseGeoUnits.state,
      district: franchiseGeoUnits.district,
      city: franchiseGeoUnits.city,
      status: franchiseGeoUnits.status,
      organizationId: franchiseOrganizations.id,
      legalName: franchiseOrganizations.legalName,
      tradeName: franchiseOrganizations.tradeName,
      email: franchiseOrganizations.email,
      phone: franchiseOrganizations.phone,
      kycStatus: franchiseOrganizations.kycStatus,
      bankStatus: franchiseOrganizations.bankStatus,
      organizationStatus: franchiseOrganizations.status,
      agreementId: franchiseAgreements.id,
      agreementNumber: franchiseAgreements.agreementNumber,
      agreementStatus: franchiseAgreements.status,
      agreementVersion: franchiseAgreements.version,
      agreementStartsAt: franchiseAgreements.startsAt,
      agreementEndsAt: franchiseAgreements.endsAt,
      shareBps: franchiseAgreements.shareBps,
      pricePaise: franchiseAgreements.pricePaise,
      securityDepositPaise: franchiseAgreements.securityDepositPaise,
      productName: franchiseProducts.name,
    })
    .from(franchiseGeoUnits)
    .innerJoin(
      franchiseAgreements,
      and(
        eq(franchiseAgreements.geoUnitId, franchiseGeoUnits.id),
        inArray(franchiseAgreements.status, ['active', 'suspended']),
      ),
    )
    .innerJoin(
      franchiseOrganizations,
      eq(franchiseOrganizations.id, franchiseAgreements.organizationId),
    )
    .innerJoin(franchiseProducts, eq(franchiseProducts.id, franchiseAgreements.productId))
    .where(eq(franchiseGeoUnits.id, geoUnitId))
    .limit(1)

  if (!territory?.organizationId || !territory.agreementId) {
    return res.status(404).json({
      success: false,
      message: 'No active franchise owner was found for this territory',
    })
  }

  const organizationId = territory.organizationId
  const [orders, ledger, settlements, payouts, disputes] = await Promise.all([
    db
      .select({
        id: franchiseShipmentAttributions.id,
        awbMasked: franchiseShipmentAttributions.awbMasked,
        courierProvider: franchiseShipmentAttributions.courierProvider,
        shipmentType: franchiseShipmentAttributions.shipmentType,
        originPincode: franchiseShipmentAttributions.originPincode,
        originCity: franchiseShipmentAttributions.originCity,
        originState: franchiseShipmentAttributions.originState,
        orderStatus: franchiseShipmentAttributions.orderStatus,
        attributionStatus: franchiseShipmentAttributions.attributionStatus,
        bookedAt: franchiseShipmentAttributions.bookedAt,
        createdAt: franchiseShipmentAttributions.createdAt,
      })
      .from(franchiseShipmentAttributions)
      .where(eq(franchiseShipmentAttributions.geoUnitId, geoUnitId))
      .orderBy(desc(franchiseShipmentAttributions.bookedAt)),
    db
      .select({
        id: franchiseLedgerEntries.id,
        attributionId: franchiseLedgerEntries.attributionId,
        entryType: franchiseLedgerEntries.entryType,
        state: franchiseLedgerEntries.state,
        amountPaise: franchiseLedgerEntries.amountPaise,
        sourceEventId: franchiseLedgerEntries.sourceEventId,
        reversalOfId: franchiseLedgerEntries.reversalOfId,
        calculationSnapshot: franchiseLedgerEntries.calculationSnapshot,
        occurredAt: franchiseLedgerEntries.occurredAt,
        awbMasked: franchiseShipmentAttributions.awbMasked,
        courierProvider: franchiseShipmentAttributions.courierProvider,
        orderStatus: franchiseShipmentAttributions.orderStatus,
      })
      .from(franchiseLedgerEntries)
      .innerJoin(
        franchiseShipmentAttributions,
        eq(franchiseShipmentAttributions.id, franchiseLedgerEntries.attributionId),
      )
      .where(eq(franchiseShipmentAttributions.geoUnitId, geoUnitId))
      .orderBy(desc(franchiseLedgerEntries.occurredAt)),
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
    db
      .select()
      .from(franchiseDisputes)
      .where(eq(franchiseDisputes.organizationId, organizationId))
      .orderBy(desc(franchiseDisputes.createdAt)),
  ])

  const amountFor = (states: string[]) =>
    ledger
      .filter((entry) => states.includes(entry.state))
      .reduce((total, entry) => total + Number(entry.amountPaise || 0), 0)
  const orderStatusCounts = orders.reduce<Record<string, number>>((counts, order) => {
    counts[order.orderStatus] = (counts[order.orderStatus] || 0) + 1
    return counts
  }, {})

  return res.json({
    success: true,
    data: {
      territory: {
        id: territory.id,
        type: territory.type,
        code: territory.code,
        name: territory.name,
        pincode: territory.pincode,
        state: territory.state,
        district: territory.district,
        city: territory.city,
        status: territory.status,
      },
      owner: {
        id: organizationId,
        legalName: territory.legalName,
        tradeName: territory.tradeName,
        email: territory.email,
        phone: territory.phone,
        kycStatus: territory.kycStatus,
        bankStatus: territory.bankStatus,
        status: territory.organizationStatus,
      },
      agreement: {
        id: territory.agreementId,
        agreementNumber: territory.agreementNumber,
        status: territory.agreementStatus,
        version: territory.agreementVersion,
        startsAt: territory.agreementStartsAt,
        endsAt: territory.agreementEndsAt,
        shareBps: territory.shareBps,
        pricePaise: territory.pricePaise,
        securityDepositPaise: territory.securityDepositPaise,
        productName: territory.productName,
      },
      summary: {
        totalOrders: orders.length,
        activeOrders: orders.filter((order) =>
          ['booked', 'picked_up', 'in_transit', 'out_for_delivery'].includes(order.orderStatus),
        ).length,
        deliveredOrders: orders.filter((order) => order.orderStatus === 'delivered').length,
        reversedOrders: orders.filter((order) => order.attributionStatus === 'reversed').length,
        provisionalPaise: amountFor(['provisional']),
        approvedPaise: amountFor(['approved', 'earned']),
        paidPaise: amountFor(['paid', 'settled']),
        totalLedgerPaise: ledger.reduce(
          (total, entry) => total + Number(entry.amountPaise || 0),
          0,
        ),
        orderStatusCounts,
      },
      orders,
      ledger,
      settlements,
      payouts,
      disputes,
    },
  })
}

export const listFranchiseOrganizations = async (_req: Request, res: Response) => {
  const data = await db
    .select({
      id: franchiseOrganizations.id,
      legalName: franchiseOrganizations.legalName,
      tradeName: franchiseOrganizations.tradeName,
      email: franchiseOrganizations.email,
      phone: franchiseOrganizations.phone,
      kycStatus: franchiseOrganizations.kycStatus,
      bankStatus: franchiseOrganizations.bankStatus,
      status: franchiseOrganizations.status,
      createdAt: franchiseOrganizations.createdAt,
      agreementNumber: franchiseAgreements.agreementNumber,
      agreementStatus: franchiseAgreements.status,
      agreementEndsAt: franchiseAgreements.endsAt,
      geoUnitId: franchiseGeoUnits.id,
      territory: franchiseGeoUnits.name,
      territoryType: franchiseGeoUnits.type,
      tier: franchiseProducts.tier,
    })
    .from(franchiseOrganizations)
    .leftJoin(
      franchiseAgreements,
      and(
        eq(franchiseAgreements.organizationId, franchiseOrganizations.id),
        inArray(franchiseAgreements.status, ['active', 'suspended']),
      ),
    )
    .leftJoin(franchiseGeoUnits, eq(franchiseGeoUnits.id, franchiseAgreements.geoUnitId))
    .leftJoin(franchiseProducts, eq(franchiseProducts.id, franchiseAgreements.productId))
    .orderBy(desc(franchiseOrganizations.createdAt))

  return res.json({ success: true, data })
}

export const listFranchiseAgreements = async (_req: Request, res: Response) => {
  const data = await db
    .select({
      id: franchiseAgreements.id,
      agreementNumber: franchiseAgreements.agreementNumber,
      organization: franchiseOrganizations.tradeName,
      product: franchiseProducts.name,
      tier: franchiseProducts.tier,
      territory: franchiseGeoUnits.name,
      status: franchiseAgreements.status,
      version: franchiseAgreements.version,
      pricePaise: franchiseAgreements.pricePaise,
      shareBps: franchiseAgreements.shareBps,
      startsAt: franchiseAgreements.startsAt,
      endsAt: franchiseAgreements.endsAt,
      acceptedAt: franchiseAgreements.acceptedAt,
    })
    .from(franchiseAgreements)
    .innerJoin(
      franchiseOrganizations,
      eq(franchiseOrganizations.id, franchiseAgreements.organizationId),
    )
    .innerJoin(franchiseProducts, eq(franchiseProducts.id, franchiseAgreements.productId))
    .innerJoin(franchiseGeoUnits, eq(franchiseGeoUnits.id, franchiseAgreements.geoUnitId))
    .orderBy(desc(franchiseAgreements.createdAt))

  return res.json({ success: true, data })
}

export const listFranchiseRules = async (_req: Request, res: Response) => {
  const data = await db
    .select()
    .from(franchiseCommissionRules)
    .orderBy(asc(franchiseCommissionRules.tier), desc(franchiseCommissionRules.version))
  return res.json({ success: true, data })
}

export const createFranchiseRule = async (req: any, res: Response) => {
  const { code, label, tier } = req.body || {}
  if (!code || !label || !['state', 'district_city', 'pincode'].includes(tier)) {
    return res.status(400).json({ success: false, message: 'Code, label, and a valid tier are required' })
  }

  const valueBps = Math.round(Number(req.body.sharePercent || 0) * 100)
  const capBps = Math.round(Number(req.body.capPercent || 30) * 100)
  if (valueBps < 0 || valueBps > capBps || capBps > 10000) {
    return res.status(400).json({ success: false, message: 'The share must be within the configured cap' })
  }

  const existing = await db
    .select()
    .from(franchiseCommissionRules)
    .where(eq(franchiseCommissionRules.code, String(code).trim().toUpperCase()))
  const version = existing.reduce((highest, rule) => Math.max(highest, rule.version), 0) + 1

  const [rule] = await db
    .insert(franchiseCommissionRules)
    .values({
      code: String(code).trim().toUpperCase(),
      label: String(label).trim(),
      version,
      tier,
      businessType: String(req.body.businessType || 'all'),
      courierProvider: String(req.body.courierProvider || 'all'),
      mode: String(req.body.mode || 'all'),
      valueBps,
      capBps,
      priority: Number(req.body.priority || 100),
      status: 'draft',
      effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : now(),
    })
    .returning()

  await recordAudit(req.user?.sub, req, 'rule.create', 'commission_rule', rule.id, null, null, rule)
  return res.status(201).json({ success: true, data: rule })
}

export const publishFranchiseRule = async (req: any, res: Response) => {
  const reason = String(req.body?.reason || '').trim()
  if (!reason) {
    return res.status(400).json({ success: false, message: 'A publication reason is required' })
  }

  const [before] = await db
    .select()
    .from(franchiseCommissionRules)
    .where(eq(franchiseCommissionRules.id, req.params.id))
    .limit(1)
  if (!before) {
    return res.status(404).json({ success: false, message: 'Commission rule not found' })
  }

  const [updated] = await db
    .update(franchiseCommissionRules)
    .set({
      status: 'published',
      approvedBy: req.user?.sub,
      publishedAt: now(),
      updatedAt: now(),
    })
    .where(eq(franchiseCommissionRules.id, req.params.id))
    .returning()

  await recordAudit(
    req.user?.sub,
    req,
    'rule.publish',
    'commission_rule',
    updated.id,
    reason,
    before,
    updated,
  )
  return res.json({ success: true, data: updated })
}

export const listFranchiseSettlements = async (_req: Request, res: Response) => {
  const data = await db
    .select({
      id: franchiseSettlements.id,
      settlementNumber: franchiseSettlements.settlementNumber,
      organization: franchiseOrganizations.tradeName,
      periodStart: franchiseSettlements.periodStart,
      periodEnd: franchiseSettlements.periodEnd,
      grossPaise: franchiseSettlements.grossPaise,
      adjustmentsPaise: franchiseSettlements.adjustmentsPaise,
      holdPaise: franchiseSettlements.holdPaise,
      withholdingPaise: franchiseSettlements.withholdingPaise,
      netPaise: franchiseSettlements.netPaise,
      status: franchiseSettlements.status,
      payoutStatus: franchisePayouts.status,
      payoutReference: franchisePayouts.providerReference,
    })
    .from(franchiseSettlements)
    .innerJoin(
      franchiseOrganizations,
      eq(franchiseOrganizations.id, franchiseSettlements.organizationId),
    )
    .leftJoin(franchisePayouts, eq(franchisePayouts.settlementId, franchiseSettlements.id))
    .orderBy(desc(franchiseSettlements.periodEnd))

  return res.json({ success: true, data, automatedPayouts: false })
}

export const listFranchiseExceptions = async (_req: Request, res: Response) => {
  const [exceptions, disputes] = await Promise.all([
    db
      .select()
      .from(franchiseExceptions)
      .orderBy(desc(franchiseExceptions.createdAt)),
    db
      .select({
        id: franchiseDisputes.id,
        type: franchiseDisputes.type,
        title: franchiseDisputes.subject,
        description: franchiseDisputes.description,
        status: franchiseDisputes.status,
        severity: franchiseDisputes.priority,
        owner: franchiseOrganizations.tradeName,
        financialValuePaise: franchiseLedgerEntries.amountPaise,
        createdAt: franchiseDisputes.createdAt,
      })
      .from(franchiseDisputes)
      .innerJoin(
        franchiseOrganizations,
        eq(franchiseOrganizations.id, franchiseDisputes.organizationId),
      )
      .leftJoin(
        franchiseLedgerEntries,
        and(
          eq(franchiseDisputes.linkedType, 'ledger_entry'),
          eq(franchiseDisputes.linkedId, franchiseLedgerEntries.id),
        ),
      )
      .orderBy(desc(franchiseDisputes.createdAt)),
  ])
  return res.json({ success: true, data: [...exceptions, ...disputes] })
}

export const listFranchiseAudit = async (_req: Request, res: Response) => {
  const data = await db
    .select({
      id: franchiseAuditLogs.id,
      actorEmail: users.email,
      actorRole: franchiseAuditLogs.actorRole,
      action: franchiseAuditLogs.action,
      entityType: franchiseAuditLogs.entityType,
      entityId: franchiseAuditLogs.entityId,
      reason: franchiseAuditLogs.reason,
      requestId: franchiseAuditLogs.requestId,
      createdAt: franchiseAuditLogs.createdAt,
    })
    .from(franchiseAuditLogs)
    .leftJoin(users, eq(users.id, franchiseAuditLogs.actorUserId))
    .orderBy(desc(franchiseAuditLogs.createdAt))
    .limit(500)
  return res.json({ success: true, data })
}

export const getFranchiseReportsAdmin = async (_req: Request, res: Response) => {
  const [organizations, territories, attributions, ledger, settlements, payouts] =
    await Promise.all([
      db.select().from(franchiseOrganizations),
      db.select().from(franchiseGeoUnits),
      db.select().from(franchiseShipmentAttributions),
      db.select().from(franchiseLedgerEntries),
      db.select().from(franchiseSettlements),
      db.select().from(franchisePayouts),
    ])

  return res.json({
    success: true,
    data: {
      generatedAt: new Date().toISOString(),
      network: {
        activeFranchises: organizations.filter((item) => item.status === 'active').length,
        activeTerritories: territories.filter((item) => item.status === 'active').length,
        attributedOrders: attributions.length,
      },
      finance: {
        provisionalPaise: ledger
          .filter((item) => item.state === 'provisional')
          .reduce((sum, item) => sum + Number(item.amountPaise || 0), 0),
        approvedPaise: ledger
          .filter((item) => item.state === 'approved')
          .reduce((sum, item) => sum + Number(item.amountPaise || 0), 0),
        settledPaise: settlements.reduce((sum, item) => sum + Number(item.netPaise || 0), 0),
        paidPaise: payouts
          .filter((item) => item.status === 'paid')
          .reduce((sum, item) => sum + Number(item.amountPaise || 0), 0),
      },
    },
  })
}
