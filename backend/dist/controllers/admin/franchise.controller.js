"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFranchiseReportsAdmin = exports.listFranchiseAudit = exports.listFranchiseExceptions = exports.listFranchiseSettlements = exports.publishFranchiseRule = exports.createFranchiseRule = exports.listFranchiseRules = exports.listFranchiseAgreements = exports.listFranchiseOrganizations = exports.getFranchiseTerritoryDetails = exports.listFranchiseTerritories = exports.createFranchiseProduct = exports.listFranchiseProducts = exports.updateFranchiseApplication = exports.listFranchiseApplications = exports.getFranchiseAdminOverview = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const franchise_1 = require("../../models/schema/franchise");
const franchiseTerritory_service_1 = require("../../models/services/franchiseTerritory.service");
const users_1 = require("../../models/schema/users");
const emailSender_1 = require("../../utils/emailSender");
const rupeesToPaise = (value) => Math.round(Number(value || 0) * 100);
const now = () => new Date();
const addMonths = (date, months) => {
    const result = new Date(date);
    result.setUTCMonth(result.getUTCMonth() + months);
    return result;
};
const createNumber = (prefix) => {
    const date = new Date();
    const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return `${prefix}-${stamp}-${(0, crypto_1.randomBytes)(3).toString('hex').toUpperCase()}`;
};
const recordAudit = async (actorUserId, req, action, entityType, entityId, reason, before, after) => {
    await client_1.db.insert(franchise_1.franchiseAuditLogs).values({
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
    });
};
const applicationSelection = {
    id: franchise_1.franchiseApplications.id,
    applicationNumber: franchise_1.franchiseApplications.applicationNumber,
    applicantName: franchise_1.franchiseApplications.applicantName,
    applicantEmail: franchise_1.franchiseApplications.applicantEmail,
    applicantPhone: franchise_1.franchiseApplications.applicantPhone,
    legalName: franchise_1.franchiseApplications.legalName,
    tradeName: franchise_1.franchiseApplications.tradeName,
    pan: franchise_1.franchiseApplications.pan,
    gstin: franchise_1.franchiseApplications.gstin,
    status: franchise_1.franchiseApplications.status,
    kycStatus: franchise_1.franchiseApplications.kycStatus,
    paymentStatus: franchise_1.franchiseApplications.paymentStatus,
    agreementStatus: franchise_1.franchiseApplications.agreementStatus,
    commercialAmountPaise: franchise_1.franchiseApplications.commercialAmountPaise,
    depositAmountPaise: franchise_1.franchiseApplications.depositAmountPaise,
    paymentReference: franchise_1.franchiseApplications.paymentReference,
    adminNotes: franchise_1.franchiseApplications.adminNotes,
    applicantNotes: franchise_1.franchiseApplications.applicantNotes,
    source: franchise_1.franchiseApplications.source,
    applicationData: franchise_1.franchiseApplications.applicationData,
    decisionReason: franchise_1.franchiseApplications.decisionReason,
    submittedAt: franchise_1.franchiseApplications.submittedAt,
    reviewedAt: franchise_1.franchiseApplications.reviewedAt,
    activatedAt: franchise_1.franchiseApplications.activatedAt,
    productId: franchise_1.franchiseProducts.id,
    productName: franchise_1.franchiseProducts.name,
    tier: franchise_1.franchiseProducts.tier,
    productPricePaise: franchise_1.franchiseProducts.pricePaise,
    defaultShareBps: franchise_1.franchiseProducts.defaultShareBps,
    productDurationMonths: franchise_1.franchiseProducts.durationMonths,
    productAgreementVersion: franchise_1.franchiseProducts.agreementVersion,
    geoUnitId: franchise_1.franchiseGeoUnits.id,
    territoryCode: franchise_1.franchiseGeoUnits.code,
    territoryName: franchise_1.franchiseGeoUnits.name,
    territoryType: franchise_1.franchiseGeoUnits.type,
    territoryState: franchise_1.franchiseGeoUnits.state,
};
const getFranchiseAdminOverview = async (_req, res) => {
    const [applications, territories, organizations, ledger, settlements, exceptions] = await Promise.all([
        client_1.db.select().from(franchise_1.franchiseApplications),
        client_1.db.select().from(franchise_1.franchiseGeoUnits),
        client_1.db.select().from(franchise_1.franchiseOrganizations),
        client_1.db.select().from(franchise_1.franchiseLedgerEntries),
        client_1.db.select().from(franchise_1.franchiseSettlements),
        client_1.db.select().from(franchise_1.franchiseExceptions),
    ]);
    return res.json({
        success: true,
        data: {
            metrics: {
                applicationsPending: applications.filter((item) => ['submitted', 'under_review', 'info_requested'].includes(item.status)).length,
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
    });
};
exports.getFranchiseAdminOverview = getFranchiseAdminOverview;
const listFranchiseApplications = async (req, res) => {
    const status = String(req.query.status || '').trim();
    let query = client_1.db
        .select(applicationSelection)
        .from(franchise_1.franchiseApplications)
        .innerJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseApplications.productId))
        .innerJoin(franchise_1.franchiseGeoUnits, (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, franchise_1.franchiseApplications.geoUnitId))
        .$dynamic();
    if (status && status !== 'all') {
        query = query.where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.status, status));
    }
    const data = await query.orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseApplications.submittedAt));
    return res.json({ success: true, data });
};
exports.listFranchiseApplications = listFranchiseApplications;
const updateFranchiseApplication = async (req, res) => {
    const id = req.params.id;
    const action = String(req.body?.action || '').trim();
    const reason = String(req.body?.reason || '').trim() || null;
    const actorUserId = req.user?.sub;
    const [application] = await client_1.db
        .select(applicationSelection)
        .from(franchise_1.franchiseApplications)
        .innerJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseApplications.productId))
        .innerJoin(franchise_1.franchiseGeoUnits, (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, franchise_1.franchiseApplications.geoUnitId))
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id))
        .limit(1);
    if (!application) {
        return res.status(404).json({ success: false, message: 'Franchise request not found' });
    }
    if (['reject', 'request_info'].includes(action) && !reason) {
        return res.status(400).json({ success: false, message: 'A reason is required for this action' });
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
    ];
    if (!allowedActions.includes(action)) {
        return res.status(400).json({ success: false, message: 'Unsupported application action' });
    }
    let temporaryPassword = null;
    let invitation;
    try {
        if (action === 'approve_for_payment') {
            if (application.status !== 'under_review' || application.kycStatus !== 'verified') {
                return res.status(409).json({
                    success: false,
                    message: 'Complete review and KYC verification before commercial approval',
                });
            }
            const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
            await client_1.db.transaction(async (tx) => {
                const [reservation] = await tx
                    .insert(franchise_1.franchiseTerritoryReservations)
                    .values({
                    applicationId: application.id,
                    geoUnitId: application.geoUnitId,
                    status: 'payment_pending',
                    expiresAt,
                })
                    .onConflictDoNothing()
                    .returning();
                if (!reservation) {
                    const conflictError = new Error('Territory reservation conflict');
                    conflictError.code = '23505';
                    throw conflictError;
                }
                const [reservedTerritory] = await tx
                    .update(franchise_1.franchiseGeoUnits)
                    .set({ status: 'reserved', updatedAt: now() })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, application.geoUnitId), (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.status, 'available')))
                    .returning();
                if (!reservedTerritory) {
                    const conflictError = new Error('Territory is not available');
                    conflictError.code = '23505';
                    throw conflictError;
                }
                await tx
                    .update(franchise_1.franchiseApplications)
                    .set({
                    status: 'approved_for_payment',
                    paymentStatus: 'pending',
                    commercialAmountPaise: req.body?.commercialAmountRupees !== undefined
                        ? rupeesToPaise(req.body.commercialAmountRupees)
                        : application.productPricePaise,
                    depositAmountPaise: req.body?.depositAmountRupees !== undefined
                        ? rupeesToPaise(req.body.depositAmountRupees)
                        : application.depositAmountPaise,
                    adminNotes: reason,
                    reviewedBy: actorUserId,
                    reviewedAt: now(),
                    updatedAt: now(),
                })
                    .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id));
            });
        }
        else if (action === 'verify_payment') {
            if (!['approved_for_payment', 'payment_pending'].includes(application.status)) {
                return res.status(409).json({
                    success: false,
                    message: 'Payment can only be verified after commercial approval',
                });
            }
            await client_1.db
                .update(franchise_1.franchiseApplications)
                .set({
                status: 'payment_verified',
                paymentStatus: 'verified',
                paymentReference: String(req.body?.paymentReference || '').trim() || null,
                paymentVerifiedAt: now(),
                reviewedBy: actorUserId,
                updatedAt: now(),
            })
                .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id));
        }
        else if (action === 'generate_agreement') {
            if (application.status !== 'payment_verified' || application.paymentStatus !== 'verified') {
                return res.status(409).json({
                    success: false,
                    message: 'Verify payment before generating the final agreement',
                });
            }
            await client_1.db
                .update(franchise_1.franchiseApplications)
                .set({
                status: 'agreement_pending',
                agreementStatus: 'ready',
                reviewedBy: actorUserId,
                updatedAt: now(),
            })
                .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id));
        }
        else if (action === 'accept_agreement') {
            if (application.status !== 'agreement_pending' || application.agreementStatus !== 'ready') {
                return res.status(409).json({
                    success: false,
                    message: 'Generate the current agreement before marking it accepted',
                });
            }
            await client_1.db
                .update(franchise_1.franchiseApplications)
                .set({
                status: 'agreement_pending',
                agreementStatus: 'accepted',
                reviewedBy: actorUserId,
                updatedAt: now(),
            })
                .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id));
        }
        else if (action === 'activate') {
            if (application.status !== 'agreement_pending' ||
                application.kycStatus !== 'verified' ||
                application.paymentStatus !== 'verified' ||
                application.agreementStatus !== 'accepted') {
                return res.status(409).json({
                    success: false,
                    message: 'Verified KYC, verified payment, and an accepted agreement are required',
                });
            }
            const generatedPassword = `Shipray!${(0, crypto_1.randomBytes)(5).toString('hex')}`;
            const passwordHash = await bcryptjs_1.default.hash(generatedPassword, 10);
            const startsAt = now();
            const endsAt = addMonths(startsAt, application.productDurationMonths);
            const activationResult = await client_1.db.transaction(async (tx) => {
                let [account] = await tx
                    .select()
                    .from(users_1.users)
                    .where((0, drizzle_orm_1.eq)(users_1.users.email, application.applicantEmail.toLowerCase()))
                    .limit(1);
                if (!account) {
                    temporaryPassword = generatedPassword;
                    [account] = await tx
                        .insert(users_1.users)
                        .values({
                        email: application.applicantEmail.toLowerCase(),
                        passwordHash,
                        emailVerified: true,
                        accountVerified: true,
                        role: 'franchise',
                    })
                        .returning();
                }
                else if (!account.passwordHash) {
                    temporaryPassword = generatedPassword;
                    await tx
                        .update(users_1.users)
                        .set({
                        passwordHash,
                        emailVerified: true,
                        accountVerified: true,
                        updatedAt: now(),
                    })
                        .where((0, drizzle_orm_1.eq)(users_1.users.id, account.id));
                }
                else {
                    await tx
                        .update(users_1.users)
                        .set({
                        emailVerified: true,
                        accountVerified: true,
                        updatedAt: now(),
                    })
                        .where((0, drizzle_orm_1.eq)(users_1.users.id, account.id));
                }
                const [organization] = await tx
                    .insert(franchise_1.franchiseOrganizations)
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
                    .returning();
                await tx.insert(franchise_1.franchiseMembers).values({
                    organizationId: organization.id,
                    userId: account.id,
                    role: 'owner',
                    permissions: ['portal:*'],
                    isActive: true,
                    invitedAt: startsAt,
                    joinedAt: startsAt,
                });
                const [agreement] = await tx
                    .insert(franchise_1.franchiseAgreements)
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
                    .returning();
                await tx
                    .update(franchise_1.franchiseApplications)
                    .set({
                    organizationId: organization.id,
                    status: 'active',
                    agreementStatus: 'accepted',
                    activatedAt: startsAt,
                    reviewedBy: actorUserId,
                    updatedAt: startsAt,
                })
                    .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id));
                await tx
                    .update(franchise_1.franchiseGeoUnits)
                    .set({ status: 'active', updatedAt: startsAt })
                    .where((0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, application.geoUnitId));
                await tx
                    .update(franchise_1.franchiseTerritoryReservations)
                    .set({ status: 'converted', releasedAt: startsAt, updatedAt: startsAt })
                    .where((0, drizzle_orm_1.eq)(franchise_1.franchiseTerritoryReservations.applicationId, application.id));
                return { organization, agreement };
            });
            invitation = {
                to: application.applicantEmail,
                name: application.applicantName,
                organizationName: activationResult.organization.tradeName,
                territoryName: application.territoryName,
                temporaryPassword,
            };
        }
        else {
            const transitionAllowed = (action === 'start_review' &&
                ['submitted', 'info_requested'].includes(application.status)) ||
                (action === 'verify_kyc' && application.status === 'under_review') ||
                (action === 'request_info' &&
                    ['submitted', 'under_review'].includes(application.status)) ||
                (action === 'reject' &&
                    ['submitted', 'under_review', 'info_requested'].includes(application.status));
            if (!transitionAllowed) {
                return res.status(409).json({
                    success: false,
                    message: "This action is not valid for the request's current state",
                });
            }
            const changes = {
                reviewedBy: actorUserId,
                reviewedAt: now(),
                updatedAt: now(),
            };
            if (action === 'start_review')
                changes.status = 'under_review';
            if (action === 'verify_kyc')
                changes.kycStatus = 'verified';
            if (action === 'request_info') {
                changes.status = 'info_requested';
                changes.adminNotes = reason;
            }
            if (action === 'reject') {
                changes.status = 'rejected';
                changes.decisionReason = reason;
            }
            await client_1.db
                .update(franchise_1.franchiseApplications)
                .set(changes)
                .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id));
        }
        const [updated] = await client_1.db
            .select()
            .from(franchise_1.franchiseApplications)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.id, id))
            .limit(1);
        await recordAudit(actorUserId, req, `application.${action}`, 'franchise_application', id, reason, application, updated);
        if (invitation) {
            (0, emailSender_1.sendFranchiseInvitationEmail)(invitation).catch((error) => console.error('[Franchise] Invitation email failed:', error));
        }
        return res.json({
            success: true,
            data: updated,
            ...(temporaryPassword ? { temporaryPassword } : {}),
        });
    }
    catch (error) {
        console.error('[Franchise] Application action failed:', error);
        const conflict = error?.code === '23505';
        return res.status(conflict ? 409 : 500).json({
            success: false,
            message: conflict
                ? 'This territory is already reserved or active'
                : 'Unable to update the franchise request',
        });
    }
};
exports.updateFranchiseApplication = updateFranchiseApplication;
const listFranchiseProducts = async (_req, res) => {
    const data = await client_1.db.select().from(franchise_1.franchiseProducts).orderBy((0, drizzle_orm_1.asc)(franchise_1.franchiseProducts.tier));
    return res.json({ success: true, data });
};
exports.listFranchiseProducts = listFranchiseProducts;
const createFranchiseProduct = async (req, res) => {
    const { code, name, tier } = req.body || {};
    if (!code || !name || !['state', 'district_city', 'pincode'].includes(tier)) {
        return res.status(400).json({ success: false, message: 'Code, name, and a valid tier are required' });
    }
    try {
        const [product] = await client_1.db
            .insert(franchise_1.franchiseProducts)
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
            .returning();
        await recordAudit(req.user?.sub, req, 'product.create', 'franchise_product', product.id, null, null, product);
        return res.status(201).json({ success: true, data: product });
    }
    catch (error) {
        return res.status(error?.code === '23505' ? 409 : 500).json({
            success: false,
            message: error?.code === '23505' ? 'Product code already exists' : 'Unable to create product',
        });
    }
};
exports.createFranchiseProduct = createFranchiseProduct;
const listFranchiseTerritories = async (req, res) => {
    const catalog = await (0, franchiseTerritory_service_1.getFranchiseTerritoryCatalog)();
    const states = catalog.filter((entry) => entry.type === 'state');
    const requestedStateId = String(req.query.stateId || '').trim();
    const selectedStateId = states.some((entry) => entry.id === requestedStateId)
        ? requestedStateId
        : states[0]?.id || null;
    const districts = selectedStateId
        ? catalog.filter((entry) => entry.type === 'district_city' && entry.parentId === selectedStateId)
        : [];
    const requestedDistrictId = String(req.query.districtId || '').trim();
    const selectedDistrictId = districts.some((entry) => entry.id === requestedDistrictId)
        ? requestedDistrictId
        : districts[0]?.id || null;
    const pincodes = selectedDistrictId
        ? catalog.filter((entry) => entry.type === 'pincode' && entry.parentId === selectedDistrictId)
        : [];
    const serialize = (entry) => ({
        ...entry,
        ownerName: entry.owner?.tradeName || null,
        agreementNumber: entry.agreement?.agreementNumber || null,
        agreementStatus: entry.agreement?.status || null,
        agreementEndsAt: entry.agreement?.endsAt || null,
    });
    const stateRows = states.map((state) => {
        const stateDistricts = catalog.filter((entry) => entry.type === 'district_city' && entry.parentId === state.id);
        const districtIds = new Set(stateDistricts.map((entry) => entry.id));
        const statePincodes = catalog.filter((entry) => entry.type === 'pincode' && entry.parentId && districtIds.has(entry.parentId));
        return {
            ...serialize(state),
            districtCount: stateDistricts.length,
            pincodeCount: statePincodes.length,
            bookedDistricts: stateDistricts.filter((entry) => entry.status === 'booked').length,
            bookedPincodes: statePincodes.filter((entry) => entry.status === 'booked').length,
        };
    });
    const districtRows = districts.map((district) => {
        const districtPincodes = catalog.filter((entry) => entry.type === 'pincode' && entry.parentId === district.id);
        return {
            ...serialize(district),
            pincodeCount: districtPincodes.length,
            bookedPincodes: districtPincodes.filter((entry) => entry.status === 'booked').length,
            reservedPincodes: districtPincodes.filter((entry) => entry.status === 'reserved').length,
        };
    });
    return res.json({
        success: true,
        data: {
            summary: (0, franchiseTerritory_service_1.summarizeTerritoryCatalog)(catalog),
            states: stateRows,
            districts: districtRows,
            pincodes: pincodes.map(serialize),
            selection: {
                stateId: selectedStateId,
                districtId: selectedDistrictId,
            },
        },
    });
};
exports.listFranchiseTerritories = listFranchiseTerritories;
const getFranchiseTerritoryDetails = async (req, res) => {
    const geoUnitId = String(req.params.id || '').trim();
    const [territory] = await client_1.db
        .select({
        id: franchise_1.franchiseGeoUnits.id,
        type: franchise_1.franchiseGeoUnits.type,
        code: franchise_1.franchiseGeoUnits.code,
        name: franchise_1.franchiseGeoUnits.name,
        pincode: franchise_1.franchiseGeoUnits.pincode,
        state: franchise_1.franchiseGeoUnits.state,
        district: franchise_1.franchiseGeoUnits.district,
        city: franchise_1.franchiseGeoUnits.city,
        status: franchise_1.franchiseGeoUnits.status,
        organizationId: franchise_1.franchiseOrganizations.id,
        legalName: franchise_1.franchiseOrganizations.legalName,
        tradeName: franchise_1.franchiseOrganizations.tradeName,
        email: franchise_1.franchiseOrganizations.email,
        phone: franchise_1.franchiseOrganizations.phone,
        kycStatus: franchise_1.franchiseOrganizations.kycStatus,
        bankStatus: franchise_1.franchiseOrganizations.bankStatus,
        organizationStatus: franchise_1.franchiseOrganizations.status,
        agreementId: franchise_1.franchiseAgreements.id,
        agreementNumber: franchise_1.franchiseAgreements.agreementNumber,
        agreementStatus: franchise_1.franchiseAgreements.status,
        agreementVersion: franchise_1.franchiseAgreements.version,
        agreementStartsAt: franchise_1.franchiseAgreements.startsAt,
        agreementEndsAt: franchise_1.franchiseAgreements.endsAt,
        shareBps: franchise_1.franchiseAgreements.shareBps,
        pricePaise: franchise_1.franchiseAgreements.pricePaise,
        securityDepositPaise: franchise_1.franchiseAgreements.securityDepositPaise,
        productName: franchise_1.franchiseProducts.name,
    })
        .from(franchise_1.franchiseGeoUnits)
        .innerJoin(franchise_1.franchiseAgreements, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseAgreements.geoUnitId, franchise_1.franchiseGeoUnits.id), (0, drizzle_orm_1.inArray)(franchise_1.franchiseAgreements.status, ['active', 'suspended'])))
        .innerJoin(franchise_1.franchiseOrganizations, (0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, franchise_1.franchiseAgreements.organizationId))
        .innerJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseAgreements.productId))
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, geoUnitId))
        .limit(1);
    if (!territory?.organizationId || !territory.agreementId) {
        return res.status(404).json({
            success: false,
            message: 'No active franchise owner was found for this territory',
        });
    }
    const organizationId = territory.organizationId;
    const [orders, ledger, settlements, payouts, disputes] = await Promise.all([
        client_1.db
            .select({
            id: franchise_1.franchiseShipmentAttributions.id,
            awbMasked: franchise_1.franchiseShipmentAttributions.awbMasked,
            courierProvider: franchise_1.franchiseShipmentAttributions.courierProvider,
            shipmentType: franchise_1.franchiseShipmentAttributions.shipmentType,
            originPincode: franchise_1.franchiseShipmentAttributions.originPincode,
            originCity: franchise_1.franchiseShipmentAttributions.originCity,
            originState: franchise_1.franchiseShipmentAttributions.originState,
            orderStatus: franchise_1.franchiseShipmentAttributions.orderStatus,
            attributionStatus: franchise_1.franchiseShipmentAttributions.attributionStatus,
            bookedAt: franchise_1.franchiseShipmentAttributions.bookedAt,
            createdAt: franchise_1.franchiseShipmentAttributions.createdAt,
        })
            .from(franchise_1.franchiseShipmentAttributions)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.geoUnitId, geoUnitId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseShipmentAttributions.bookedAt)),
        client_1.db
            .select({
            id: franchise_1.franchiseLedgerEntries.id,
            attributionId: franchise_1.franchiseLedgerEntries.attributionId,
            entryType: franchise_1.franchiseLedgerEntries.entryType,
            state: franchise_1.franchiseLedgerEntries.state,
            amountPaise: franchise_1.franchiseLedgerEntries.amountPaise,
            sourceEventId: franchise_1.franchiseLedgerEntries.sourceEventId,
            reversalOfId: franchise_1.franchiseLedgerEntries.reversalOfId,
            calculationSnapshot: franchise_1.franchiseLedgerEntries.calculationSnapshot,
            occurredAt: franchise_1.franchiseLedgerEntries.occurredAt,
            awbMasked: franchise_1.franchiseShipmentAttributions.awbMasked,
            courierProvider: franchise_1.franchiseShipmentAttributions.courierProvider,
            orderStatus: franchise_1.franchiseShipmentAttributions.orderStatus,
        })
            .from(franchise_1.franchiseLedgerEntries)
            .innerJoin(franchise_1.franchiseShipmentAttributions, (0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.id, franchise_1.franchiseLedgerEntries.attributionId))
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.geoUnitId, geoUnitId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseLedgerEntries.occurredAt)),
        client_1.db
            .select()
            .from(franchise_1.franchiseSettlements)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseSettlements.organizationId, organizationId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseSettlements.periodEnd)),
        client_1.db
            .select()
            .from(franchise_1.franchisePayouts)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchisePayouts.organizationId, organizationId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchisePayouts.createdAt)),
        client_1.db
            .select()
            .from(franchise_1.franchiseDisputes)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseDisputes.organizationId, organizationId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseDisputes.createdAt)),
    ]);
    const amountFor = (states) => ledger
        .filter((entry) => states.includes(entry.state))
        .reduce((total, entry) => total + Number(entry.amountPaise || 0), 0);
    const orderStatusCounts = orders.reduce((counts, order) => {
        counts[order.orderStatus] = (counts[order.orderStatus] || 0) + 1;
        return counts;
    }, {});
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
                activeOrders: orders.filter((order) => ['booked', 'picked_up', 'in_transit', 'out_for_delivery'].includes(order.orderStatus)).length,
                deliveredOrders: orders.filter((order) => order.orderStatus === 'delivered').length,
                reversedOrders: orders.filter((order) => order.attributionStatus === 'reversed').length,
                provisionalPaise: amountFor(['provisional']),
                approvedPaise: amountFor(['approved', 'earned']),
                paidPaise: amountFor(['paid', 'settled']),
                totalLedgerPaise: ledger.reduce((total, entry) => total + Number(entry.amountPaise || 0), 0),
                orderStatusCounts,
            },
            orders,
            ledger,
            settlements,
            payouts,
            disputes,
        },
    });
};
exports.getFranchiseTerritoryDetails = getFranchiseTerritoryDetails;
const listFranchiseOrganizations = async (_req, res) => {
    const data = await client_1.db
        .select({
        id: franchise_1.franchiseOrganizations.id,
        legalName: franchise_1.franchiseOrganizations.legalName,
        tradeName: franchise_1.franchiseOrganizations.tradeName,
        email: franchise_1.franchiseOrganizations.email,
        phone: franchise_1.franchiseOrganizations.phone,
        kycStatus: franchise_1.franchiseOrganizations.kycStatus,
        bankStatus: franchise_1.franchiseOrganizations.bankStatus,
        status: franchise_1.franchiseOrganizations.status,
        createdAt: franchise_1.franchiseOrganizations.createdAt,
        agreementNumber: franchise_1.franchiseAgreements.agreementNumber,
        agreementStatus: franchise_1.franchiseAgreements.status,
        agreementEndsAt: franchise_1.franchiseAgreements.endsAt,
        geoUnitId: franchise_1.franchiseGeoUnits.id,
        territory: franchise_1.franchiseGeoUnits.name,
        territoryType: franchise_1.franchiseGeoUnits.type,
        tier: franchise_1.franchiseProducts.tier,
    })
        .from(franchise_1.franchiseOrganizations)
        .leftJoin(franchise_1.franchiseAgreements, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseAgreements.organizationId, franchise_1.franchiseOrganizations.id), (0, drizzle_orm_1.inArray)(franchise_1.franchiseAgreements.status, ['active', 'suspended'])))
        .leftJoin(franchise_1.franchiseGeoUnits, (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, franchise_1.franchiseAgreements.geoUnitId))
        .leftJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseAgreements.productId))
        .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseOrganizations.createdAt));
    return res.json({ success: true, data });
};
exports.listFranchiseOrganizations = listFranchiseOrganizations;
const listFranchiseAgreements = async (_req, res) => {
    const data = await client_1.db
        .select({
        id: franchise_1.franchiseAgreements.id,
        agreementNumber: franchise_1.franchiseAgreements.agreementNumber,
        organization: franchise_1.franchiseOrganizations.tradeName,
        product: franchise_1.franchiseProducts.name,
        tier: franchise_1.franchiseProducts.tier,
        territory: franchise_1.franchiseGeoUnits.name,
        status: franchise_1.franchiseAgreements.status,
        version: franchise_1.franchiseAgreements.version,
        pricePaise: franchise_1.franchiseAgreements.pricePaise,
        shareBps: franchise_1.franchiseAgreements.shareBps,
        startsAt: franchise_1.franchiseAgreements.startsAt,
        endsAt: franchise_1.franchiseAgreements.endsAt,
        acceptedAt: franchise_1.franchiseAgreements.acceptedAt,
    })
        .from(franchise_1.franchiseAgreements)
        .innerJoin(franchise_1.franchiseOrganizations, (0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, franchise_1.franchiseAgreements.organizationId))
        .innerJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseAgreements.productId))
        .innerJoin(franchise_1.franchiseGeoUnits, (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, franchise_1.franchiseAgreements.geoUnitId))
        .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseAgreements.createdAt));
    return res.json({ success: true, data });
};
exports.listFranchiseAgreements = listFranchiseAgreements;
const listFranchiseRules = async (_req, res) => {
    const data = await client_1.db
        .select()
        .from(franchise_1.franchiseCommissionRules)
        .orderBy((0, drizzle_orm_1.asc)(franchise_1.franchiseCommissionRules.tier), (0, drizzle_orm_1.desc)(franchise_1.franchiseCommissionRules.version));
    return res.json({ success: true, data });
};
exports.listFranchiseRules = listFranchiseRules;
const createFranchiseRule = async (req, res) => {
    const { code, label, tier } = req.body || {};
    if (!code || !label || !['state', 'district_city', 'pincode'].includes(tier)) {
        return res.status(400).json({ success: false, message: 'Code, label, and a valid tier are required' });
    }
    const valueBps = Math.round(Number(req.body.sharePercent || 0) * 100);
    const capBps = Math.round(Number(req.body.capPercent || 30) * 100);
    if (valueBps < 0 || valueBps > capBps || capBps > 10000) {
        return res.status(400).json({ success: false, message: 'The share must be within the configured cap' });
    }
    const existing = await client_1.db
        .select()
        .from(franchise_1.franchiseCommissionRules)
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseCommissionRules.code, String(code).trim().toUpperCase()));
    const version = existing.reduce((highest, rule) => Math.max(highest, rule.version), 0) + 1;
    const [rule] = await client_1.db
        .insert(franchise_1.franchiseCommissionRules)
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
        .returning();
    await recordAudit(req.user?.sub, req, 'rule.create', 'commission_rule', rule.id, null, null, rule);
    return res.status(201).json({ success: true, data: rule });
};
exports.createFranchiseRule = createFranchiseRule;
const publishFranchiseRule = async (req, res) => {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
        return res.status(400).json({ success: false, message: 'A publication reason is required' });
    }
    const [before] = await client_1.db
        .select()
        .from(franchise_1.franchiseCommissionRules)
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseCommissionRules.id, req.params.id))
        .limit(1);
    if (!before) {
        return res.status(404).json({ success: false, message: 'Commission rule not found' });
    }
    const [updated] = await client_1.db
        .update(franchise_1.franchiseCommissionRules)
        .set({
        status: 'published',
        approvedBy: req.user?.sub,
        publishedAt: now(),
        updatedAt: now(),
    })
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseCommissionRules.id, req.params.id))
        .returning();
    await recordAudit(req.user?.sub, req, 'rule.publish', 'commission_rule', updated.id, reason, before, updated);
    return res.json({ success: true, data: updated });
};
exports.publishFranchiseRule = publishFranchiseRule;
const listFranchiseSettlements = async (_req, res) => {
    const data = await client_1.db
        .select({
        id: franchise_1.franchiseSettlements.id,
        settlementNumber: franchise_1.franchiseSettlements.settlementNumber,
        organization: franchise_1.franchiseOrganizations.tradeName,
        periodStart: franchise_1.franchiseSettlements.periodStart,
        periodEnd: franchise_1.franchiseSettlements.periodEnd,
        grossPaise: franchise_1.franchiseSettlements.grossPaise,
        adjustmentsPaise: franchise_1.franchiseSettlements.adjustmentsPaise,
        holdPaise: franchise_1.franchiseSettlements.holdPaise,
        withholdingPaise: franchise_1.franchiseSettlements.withholdingPaise,
        netPaise: franchise_1.franchiseSettlements.netPaise,
        status: franchise_1.franchiseSettlements.status,
        payoutStatus: franchise_1.franchisePayouts.status,
        payoutReference: franchise_1.franchisePayouts.providerReference,
    })
        .from(franchise_1.franchiseSettlements)
        .innerJoin(franchise_1.franchiseOrganizations, (0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, franchise_1.franchiseSettlements.organizationId))
        .leftJoin(franchise_1.franchisePayouts, (0, drizzle_orm_1.eq)(franchise_1.franchisePayouts.settlementId, franchise_1.franchiseSettlements.id))
        .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseSettlements.periodEnd));
    return res.json({ success: true, data, automatedPayouts: false });
};
exports.listFranchiseSettlements = listFranchiseSettlements;
const listFranchiseExceptions = async (_req, res) => {
    const [exceptions, disputes] = await Promise.all([
        client_1.db
            .select()
            .from(franchise_1.franchiseExceptions)
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseExceptions.createdAt)),
        client_1.db
            .select({
            id: franchise_1.franchiseDisputes.id,
            type: franchise_1.franchiseDisputes.type,
            title: franchise_1.franchiseDisputes.subject,
            description: franchise_1.franchiseDisputes.description,
            status: franchise_1.franchiseDisputes.status,
            severity: franchise_1.franchiseDisputes.priority,
            owner: franchise_1.franchiseOrganizations.tradeName,
            financialValuePaise: franchise_1.franchiseLedgerEntries.amountPaise,
            createdAt: franchise_1.franchiseDisputes.createdAt,
        })
            .from(franchise_1.franchiseDisputes)
            .innerJoin(franchise_1.franchiseOrganizations, (0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, franchise_1.franchiseDisputes.organizationId))
            .leftJoin(franchise_1.franchiseLedgerEntries, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseDisputes.linkedType, 'ledger_entry'), (0, drizzle_orm_1.eq)(franchise_1.franchiseDisputes.linkedId, franchise_1.franchiseLedgerEntries.id)))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseDisputes.createdAt)),
    ]);
    return res.json({ success: true, data: [...exceptions, ...disputes] });
};
exports.listFranchiseExceptions = listFranchiseExceptions;
const listFranchiseAudit = async (_req, res) => {
    const data = await client_1.db
        .select({
        id: franchise_1.franchiseAuditLogs.id,
        actorEmail: users_1.users.email,
        actorRole: franchise_1.franchiseAuditLogs.actorRole,
        action: franchise_1.franchiseAuditLogs.action,
        entityType: franchise_1.franchiseAuditLogs.entityType,
        entityId: franchise_1.franchiseAuditLogs.entityId,
        reason: franchise_1.franchiseAuditLogs.reason,
        requestId: franchise_1.franchiseAuditLogs.requestId,
        createdAt: franchise_1.franchiseAuditLogs.createdAt,
    })
        .from(franchise_1.franchiseAuditLogs)
        .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, franchise_1.franchiseAuditLogs.actorUserId))
        .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseAuditLogs.createdAt))
        .limit(500);
    return res.json({ success: true, data });
};
exports.listFranchiseAudit = listFranchiseAudit;
const getFranchiseReportsAdmin = async (_req, res) => {
    const [organizations, territories, attributions, ledger, settlements, payouts] = await Promise.all([
        client_1.db.select().from(franchise_1.franchiseOrganizations),
        client_1.db.select().from(franchise_1.franchiseGeoUnits),
        client_1.db.select().from(franchise_1.franchiseShipmentAttributions),
        client_1.db.select().from(franchise_1.franchiseLedgerEntries),
        client_1.db.select().from(franchise_1.franchiseSettlements),
        client_1.db.select().from(franchise_1.franchisePayouts),
    ]);
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
    });
};
exports.getFranchiseReportsAdmin = getFranchiseReportsAdmin;
