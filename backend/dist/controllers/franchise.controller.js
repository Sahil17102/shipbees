"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFranchiseDispute = exports.getFranchiseDisputes = exports.getFranchiseTeam = exports.getFranchiseDocuments = exports.getFranchiseReports = exports.getFranchiseSettlements = exports.getFranchiseEarnings = exports.getFranchiseTerritories = exports.getFranchiseRto = exports.getFranchiseNdr = exports.getFranchiseTracking = exports.getFranchiseOrders = exports.getFranchiseDashboard = exports.getFranchiseMe = exports.franchiseLogin = exports.submitPublicFranchiseApplication = exports.getPublicFranchiseOpportunities = void 0;
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const franchise_1 = require("../models/schema/franchise");
const users_1 = require("../models/schema/users");
const franchiseAuth_service_1 = require("../models/services/franchiseAuth.service");
const franchiseTerritory_service_1 = require("../models/services/franchiseTerritory.service");
const franchiseOperations_service_1 = require("../models/services/franchiseOperations.service");
const organizationIdFrom = (req) => req.franchise.organizationId;
const publicApplicationStatuses = [
    'submitted',
    'under_review',
    'info_requested',
    'approved_for_payment',
    'payment_pending',
    'payment_verified',
    'agreement_pending',
    'active',
];
const asText = (value, maxLength) => String(value || '')
    .trim()
    .slice(0, maxLength);
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const createApplicationNumber = () => {
    const date = new Date();
    const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return `FRQ-${stamp}-${(0, crypto_1.randomBytes)(4).toString('hex').toUpperCase()}`;
};
const getPublicFranchiseOpportunities = async (_req, res) => {
    const [products, territories] = await Promise.all([
        client_1.db
            .select({
            id: franchise_1.franchiseProducts.id,
            code: franchise_1.franchiseProducts.code,
            name: franchise_1.franchiseProducts.name,
            tier: franchise_1.franchiseProducts.tier,
            description: franchise_1.franchiseProducts.description,
            durationMonths: franchise_1.franchiseProducts.durationMonths,
        })
            .from(franchise_1.franchiseProducts)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.status, 'active'))
            .orderBy((0, drizzle_orm_1.asc)(franchise_1.franchiseProducts.name)),
        client_1.db
            .select({
            id: franchise_1.franchiseGeoUnits.id,
            type: franchise_1.franchiseGeoUnits.type,
            code: franchise_1.franchiseGeoUnits.code,
            name: franchise_1.franchiseGeoUnits.name,
            state: franchise_1.franchiseGeoUnits.state,
            district: franchise_1.franchiseGeoUnits.district,
            city: franchise_1.franchiseGeoUnits.city,
            pincode: franchise_1.franchiseGeoUnits.pincode,
        })
            .from(franchise_1.franchiseGeoUnits)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.status, 'available'))
            .orderBy((0, drizzle_orm_1.asc)(franchise_1.franchiseGeoUnits.state), (0, drizzle_orm_1.asc)(franchise_1.franchiseGeoUnits.name)),
    ]);
    return res.json({
        success: true,
        data: {
            products,
            territories,
            quoteEmail: 'info@shipraylogistics.com',
            quotePhone: '+91 84878 81121',
        },
    });
};
exports.getPublicFranchiseOpportunities = getPublicFranchiseOpportunities;
const submitPublicFranchiseApplication = async (req, res) => {
    if (asText(req.body?.website, 200)) {
        return res.status(400).json({ success: false, message: 'Unable to submit this request' });
    }
    const applicantName = asText(req.body?.applicantName, 160);
    const applicantEmail = asText(req.body?.applicantEmail, 160).toLowerCase();
    const applicantPhone = asText(req.body?.applicantPhone, 24).replace(/[\s()-]/g, '');
    const businessName = asText(req.body?.businessName, 180);
    const registeredBusinessName = asText(req.body?.registeredBusinessName, 180);
    const productId = asText(req.body?.productId, 50);
    const geoUnitId = asText(req.body?.geoUnitId, 50);
    if (!applicantName ||
        !applicantEmail ||
        !applicantPhone ||
        !businessName ||
        !productId ||
        !geoUnitId) {
        return res.status(400).json({
            success: false,
            message: 'Name, email, phone, business, franchise plan, and territory are required',
        });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }
    if (!/^\+?[0-9]{10,15}$/.test(applicantPhone)) {
        return res.status(400).json({ success: false, message: 'Enter a valid phone number' });
    }
    if (!isUuid(productId) || !isUuid(geoUnitId)) {
        return res.status(400).json({ success: false, message: 'Select a valid plan and territory' });
    }
    if (req.body?.consent !== true) {
        return res.status(400).json({
            success: false,
            message: 'Consent is required before submitting the application',
        });
    }
    const [[product], [territory]] = await Promise.all([
        client_1.db
            .select({ id: franchise_1.franchiseProducts.id, tier: franchise_1.franchiseProducts.tier })
            .from(franchise_1.franchiseProducts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, productId), (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.status, 'active')))
            .limit(1),
        client_1.db
            .select({ id: franchise_1.franchiseGeoUnits.id, type: franchise_1.franchiseGeoUnits.type })
            .from(franchise_1.franchiseGeoUnits)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, geoUnitId), (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.status, 'available')))
            .limit(1),
    ]);
    if (!product || !territory || product.tier !== territory.type) {
        return res.status(409).json({
            success: false,
            message: 'That franchise plan or territory is no longer available. Refresh and choose again.',
        });
    }
    const [existing] = await client_1.db
        .select({ applicationNumber: franchise_1.franchiseApplications.applicationNumber })
        .from(franchise_1.franchiseApplications)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.applicantEmail, applicantEmail), (0, drizzle_orm_1.eq)(franchise_1.franchiseApplications.geoUnitId, geoUnitId), (0, drizzle_orm_1.inArray)(franchise_1.franchiseApplications.status, publicApplicationStatuses)))
        .limit(1);
    if (existing) {
        return res.status(409).json({
            success: false,
            message: `You already have an active request for this territory (${existing.applicationNumber}).`,
            applicationNumber: existing.applicationNumber,
        });
    }
    const applicationData = {
        businessType: asText(req.body?.businessType, 80),
        currentCity: asText(req.body?.currentCity, 120),
        currentState: asText(req.body?.currentState, 120),
        experience: asText(req.body?.experience, 1000),
        expectedMonthlyShipments: asText(req.body?.expectedMonthlyShipments, 40),
        preferredContactMethod: asText(req.body?.preferredContactMethod, 24) || 'phone',
    };
    const applicationNumber = createApplicationNumber();
    const application = await client_1.db.transaction(async (tx) => {
        const [created] = await tx
            .insert(franchise_1.franchiseApplications)
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
            .returning({ id: franchise_1.franchiseApplications.id, applicationNumber: franchise_1.franchiseApplications.applicationNumber });
        await tx.insert(franchise_1.franchiseAuditLogs).values({
            actorRole: 'public',
            action: 'application_submitted',
            entityType: 'application',
            entityId: created.id,
            after: { applicationNumber: created.applicationNumber, source: 'landing_page', productId, geoUnitId },
            requestId: req.requestId || null,
            ipAddress: req.ip || null,
        });
        return created;
    });
    return res.status(201).json({
        success: true,
        message: 'Your franchise request has been sent to the Shipray team',
        data: { applicationNumber: application.applicationNumber },
    });
};
exports.submitPublicFranchiseApplication = submitPublicFranchiseApplication;
const sumAmounts = (entries, states) => entries
    .filter((entry) => states.includes(entry.state))
    .reduce((total, entry) => total + Number(entry.amountPaise || 0), 0);
const franchiseLogin = async (req, res) => {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    try {
        const result = await (0, franchiseAuth_service_1.loginFranchiseMember)(email, password);
        return res.json({ success: true, ...result });
    }
    catch (error) {
        return res.status(401).json({
            success: false,
            message: error?.message || 'Unable to sign in',
        });
    }
};
exports.franchiseLogin = franchiseLogin;
const getFranchiseMe = async (req, res) => {
    const [organization] = await client_1.db
        .select()
        .from(franchise_1.franchiseOrganizations)
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, organizationIdFrom(req)))
        .limit(1);
    return res.json({
        success: true,
        data: {
            organization,
            membership: req.franchise,
        },
    });
};
exports.getFranchiseMe = getFranchiseMe;
const getFranchiseDashboard = async (req, res) => {
    const organizationId = organizationIdFrom(req);
    const [entries, attributions, agreements, settlements, disputes] = await Promise.all([
        client_1.db
            .select({
            state: franchise_1.franchiseLedgerEntries.state,
            amountPaise: franchise_1.franchiseLedgerEntries.amountPaise,
        })
            .from(franchise_1.franchiseLedgerEntries)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseLedgerEntries.organizationId, organizationId)),
        client_1.db
            .select()
            .from(franchise_1.franchiseShipmentAttributions)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.organizationId, organizationId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseShipmentAttributions.bookedAt)),
        client_1.db
            .select({
            agreementId: franchise_1.franchiseAgreements.id,
            status: franchise_1.franchiseAgreements.status,
            startsAt: franchise_1.franchiseAgreements.startsAt,
            endsAt: franchise_1.franchiseAgreements.endsAt,
            tier: franchise_1.franchiseProducts.tier,
            territoryName: franchise_1.franchiseGeoUnits.name,
            territoryState: franchise_1.franchiseGeoUnits.state,
        })
            .from(franchise_1.franchiseAgreements)
            .innerJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseAgreements.productId))
            .innerJoin(franchise_1.franchiseGeoUnits, (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, franchise_1.franchiseAgreements.geoUnitId))
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseAgreements.organizationId, organizationId)),
        client_1.db
            .select()
            .from(franchise_1.franchiseSettlements)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseSettlements.organizationId, organizationId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseSettlements.periodEnd))
            .limit(4),
        client_1.db
            .select()
            .from(franchise_1.franchiseDisputes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseDisputes.organizationId, organizationId), (0, drizzle_orm_1.inArray)(franchise_1.franchiseDisputes.status, ['open', 'in_review']))),
    ]);
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
            nextSettlement: settlements.find((settlement) => ['draft', 'review', 'approved'].includes(settlement.status)),
            recentOrders: attributions.slice(0, 6),
        },
    });
};
exports.getFranchiseDashboard = getFranchiseDashboard;
const getFranchiseOrders = async (req, res) => {
    const organizationId = organizationIdFrom(req);
    const [orders, ledger] = await Promise.all([
        client_1.db
            .select()
            .from(franchise_1.franchiseShipmentAttributions)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.organizationId, organizationId))
            .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseShipmentAttributions.bookedAt)),
        client_1.db
            .select({
            attributionId: franchise_1.franchiseLedgerEntries.attributionId,
            amountPaise: franchise_1.franchiseLedgerEntries.amountPaise,
            state: franchise_1.franchiseLedgerEntries.state,
            entryType: franchise_1.franchiseLedgerEntries.entryType,
            snapshot: franchise_1.franchiseLedgerEntries.calculationSnapshot,
        })
            .from(franchise_1.franchiseLedgerEntries)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseLedgerEntries.organizationId, organizationId)),
    ]);
    const ledgerByAttribution = new Map(ledger
        .filter((entry) => entry.attributionId)
        .map((entry) => [entry.attributionId, entry]));
    return res.json({
        success: true,
        data: orders.map((order) => ({
            ...order,
            earning: ledgerByAttribution.get(order.id) || null,
        })),
    });
};
exports.getFranchiseOrders = getFranchiseOrders;
const normalizedStatus = (value) => String(value || '')
    .trim()
    .toLowerCase();
const getFranchiseTracking = async (req, res) => {
    const shipments = await (0, franchiseOperations_service_1.getFranchiseOperationalShipments)(organizationIdFrom(req));
    const isDelivered = (status) => {
        const normalized = normalizedStatus(status);
        return normalized.includes('delivered') && !normalized.includes('rto');
    };
    const isException = (shipment) => shipment.ndrTimeline.length > 0 ||
        shipment.rtoTimeline.length > 0 ||
        /failed|exception|undelivered|lost|cancelled|ndr|rto/.test(normalizedStatus(shipment.currentStatus));
    return res.json({
        success: true,
        data: {
            summary: {
                total: shipments.length,
                inTransit: shipments.filter((shipment) => /picked|transit|manifest|out_for_delivery|shipped/.test(normalizedStatus(shipment.currentStatus))).length,
                delivered: shipments.filter((shipment) => isDelivered(shipment.currentStatus)).length,
                exceptions: shipments.filter(isException).length,
            },
            shipments,
        },
    });
};
exports.getFranchiseTracking = getFranchiseTracking;
const getFranchiseNdr = async (req, res) => {
    const shipments = await (0, franchiseOperations_service_1.getFranchiseOperationalShipments)(organizationIdFrom(req));
    const ndrShipments = shipments
        .filter((shipment) => shipment.ndrTimeline.length > 0 ||
        /ndr|undelivered|delivery_failed|address_issue|consignee_unavailable/.test(normalizedStatus(shipment.currentStatus)))
        .map((shipment) => ({
        ...shipment,
        latestNdr: shipment.latestNdr ||
            {
                id: `status-${shipment.id}`,
                status: shipment.currentStatus,
                description: 'NDR state reported by the shipment provider',
                location: null,
                attempt: null,
                chargesPaise: 0,
                createdAt: shipment.updatedAt,
            },
    }));
    const isResolved = (status) => /resolved|actioned|reattempt_success|delivered|closed/.test(normalizedStatus(status));
    return res.json({
        success: true,
        data: {
            summary: {
                total: ndrShipments.length,
                open: ndrShipments.filter((shipment) => !isResolved(shipment.latestNdr?.status || shipment.currentStatus)).length,
                resolved: ndrShipments.filter((shipment) => isResolved(shipment.latestNdr?.status || shipment.currentStatus)).length,
                attempts: ndrShipments.reduce((total, shipment) => total + shipment.ndrTimeline.length, 0),
            },
            shipments: ndrShipments,
        },
    });
};
exports.getFranchiseNdr = getFranchiseNdr;
const getFranchiseRto = async (req, res) => {
    const shipments = await (0, franchiseOperations_service_1.getFranchiseOperationalShipments)(organizationIdFrom(req));
    const rtoShipments = shipments
        .filter((shipment) => shipment.rtoTimeline.length > 0 || /rto/.test(normalizedStatus(shipment.currentStatus)))
        .map((shipment) => ({
        ...shipment,
        latestRto: shipment.latestRto ||
            {
                id: `status-${shipment.id}`,
                status: shipment.currentStatus,
                description: 'RTO state reported by the shipment provider',
                location: null,
                attempt: null,
                chargesPaise: 0,
                createdAt: shipment.updatedAt,
            },
    }));
    return res.json({
        success: true,
        data: {
            summary: {
                total: rtoShipments.length,
                inTransit: rtoShipments.filter((shipment) => /in_transit|initiated|moving/.test(normalizedStatus(shipment.latestRto?.status || shipment.currentStatus))).length,
                delivered: rtoShipments.filter((shipment) => /rto_delivered|returned|closed/.test(normalizedStatus(shipment.latestRto?.status || shipment.currentStatus))).length,
                chargesPaise: rtoShipments.reduce((total, shipment) => total + shipment.totalRtoChargesPaise, 0),
            },
            shipments: rtoShipments,
        },
    });
};
exports.getFranchiseRto = getFranchiseRto;
const getFranchiseTerritories = async (req, res) => {
    const organizationId = organizationIdFrom(req);
    const owned = await client_1.db
        .select({
        agreementId: franchise_1.franchiseAgreements.id,
        agreementNumber: franchise_1.franchiseAgreements.agreementNumber,
        agreementStatus: franchise_1.franchiseAgreements.status,
        startsAt: franchise_1.franchiseAgreements.startsAt,
        endsAt: franchise_1.franchiseAgreements.endsAt,
        shareBps: franchise_1.franchiseAgreements.shareBps,
        geoUnitId: franchise_1.franchiseGeoUnits.id,
        type: franchise_1.franchiseGeoUnits.type,
        code: franchise_1.franchiseGeoUnits.code,
        name: franchise_1.franchiseGeoUnits.name,
        state: franchise_1.franchiseGeoUnits.state,
        district: franchise_1.franchiseGeoUnits.district,
        city: franchise_1.franchiseGeoUnits.city,
        pincode: franchise_1.franchiseGeoUnits.pincode,
        tier: franchise_1.franchiseProducts.tier,
        productName: franchise_1.franchiseProducts.name,
    })
        .from(franchise_1.franchiseAgreements)
        .innerJoin(franchise_1.franchiseGeoUnits, (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, franchise_1.franchiseAgreements.geoUnitId))
        .innerJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseAgreements.productId))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseAgreements.organizationId, organizationId), (0, drizzle_orm_1.inArray)(franchise_1.franchiseAgreements.status, ['active', 'suspended'])));
    const catalog = await (0, franchiseTerritory_service_1.getFranchiseTerritoryCatalog)();
    const byId = new Map(catalog.map((entry) => [entry.id, entry]));
    const catalogIdByGeoUnit = new Map(catalog
        .filter((entry) => entry.geoUnitId)
        .map((entry) => [entry.geoUnitId, entry.id]));
    const included = new Map();
    const coverage = owned.map((territory) => {
        const rootId = catalogIdByGeoUnit.get(territory.geoUnitId);
        const root = rootId ? byId.get(rootId) : null;
        const entries = root
            ? catalog.filter((entry) => {
                if (root.type === 'state')
                    return entry.state === root.state;
                if (root.type === 'district_city') {
                    return entry.id === root.id || entry.parentId === root.id;
                }
                return entry.id === root.id;
            })
            : [];
        entries.forEach((entry) => included.set(entry.id, entry));
        const descendants = entries.filter((entry) => entry.id !== root?.id);
        return {
            ...territory,
            rootId: root?.id || null,
            path: root
                ? [byId.get(root.parentId || ''), root]
                    .filter(Boolean)
                    .flatMap((entry) => {
                    if (entry?.type !== 'district_city' || !entry.parentId)
                        return [entry?.name];
                    const state = byId.get(entry.parentId);
                    return [state?.name, entry.name];
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
        };
    });
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
    }));
    return res.json({
        success: true,
        data: {
            owned: coverage,
            network,
            summary: (0, franchiseTerritory_service_1.summarizeTerritoryCatalog)(Array.from(included.values())),
        },
    });
};
exports.getFranchiseTerritories = getFranchiseTerritories;
const getFranchiseEarnings = async (req, res) => {
    const entries = await client_1.db
        .select({
        id: franchise_1.franchiseLedgerEntries.id,
        entryType: franchise_1.franchiseLedgerEntries.entryType,
        state: franchise_1.franchiseLedgerEntries.state,
        amountPaise: franchise_1.franchiseLedgerEntries.amountPaise,
        occurredAt: franchise_1.franchiseLedgerEntries.occurredAt,
        calculationSnapshot: franchise_1.franchiseLedgerEntries.calculationSnapshot,
        awbMasked: franchise_1.franchiseShipmentAttributions.awbMasked,
        originPincode: franchise_1.franchiseShipmentAttributions.originPincode,
        courierProvider: franchise_1.franchiseShipmentAttributions.courierProvider,
        tier: franchise_1.franchiseShipmentAttributions.tier,
    })
        .from(franchise_1.franchiseLedgerEntries)
        .leftJoin(franchise_1.franchiseShipmentAttributions, (0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.id, franchise_1.franchiseLedgerEntries.attributionId))
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseLedgerEntries.organizationId, organizationIdFrom(req)))
        .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseLedgerEntries.occurredAt));
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
    });
};
exports.getFranchiseEarnings = getFranchiseEarnings;
const getFranchiseSettlements = async (req, res) => {
    const organizationId = organizationIdFrom(req);
    const [settlements, payouts] = await Promise.all([
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
    ]);
    return res.json({ success: true, data: { settlements, payouts } });
};
exports.getFranchiseSettlements = getFranchiseSettlements;
const getFranchiseReports = async (req, res) => {
    const organizationId = organizationIdFrom(req);
    const [orders, entries, settlements] = await Promise.all([
        client_1.db
            .select()
            .from(franchise_1.franchiseShipmentAttributions)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.organizationId, organizationId)),
        client_1.db
            .select()
            .from(franchise_1.franchiseLedgerEntries)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseLedgerEntries.organizationId, organizationId)),
        client_1.db
            .select()
            .from(franchise_1.franchiseSettlements)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseSettlements.organizationId, organizationId)),
    ]);
    return res.json({
        success: true,
        data: {
            generatedAt: new Date().toISOString(),
            summary: {
                orderCount: orders.length,
                totalEarningsPaise: entries.reduce((total, entry) => total + Number(entry.amountPaise || 0), 0),
                settlementCount: settlements.length,
            },
            reports: [],
        },
    });
};
exports.getFranchiseReports = getFranchiseReports;
const getFranchiseDocuments = async (req, res) => {
    const organizationId = organizationIdFrom(req);
    const [organization, agreements] = await Promise.all([
        client_1.db
            .select()
            .from(franchise_1.franchiseOrganizations)
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, organizationId))
            .limit(1),
        client_1.db
            .select({
            id: franchise_1.franchiseAgreements.id,
            agreementNumber: franchise_1.franchiseAgreements.agreementNumber,
            version: franchise_1.franchiseAgreements.version,
            status: franchise_1.franchiseAgreements.status,
            startsAt: franchise_1.franchiseAgreements.startsAt,
            endsAt: franchise_1.franchiseAgreements.endsAt,
            territory: franchise_1.franchiseGeoUnits.name,
        })
            .from(franchise_1.franchiseAgreements)
            .innerJoin(franchise_1.franchiseGeoUnits, (0, drizzle_orm_1.eq)(franchise_1.franchiseGeoUnits.id, franchise_1.franchiseAgreements.geoUnitId))
            .where((0, drizzle_orm_1.eq)(franchise_1.franchiseAgreements.organizationId, organizationId)),
    ]);
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
    });
};
exports.getFranchiseDocuments = getFranchiseDocuments;
const getFranchiseTeam = async (req, res) => {
    const team = await client_1.db
        .select({
        id: franchise_1.franchiseMembers.id,
        userId: franchise_1.franchiseMembers.userId,
        email: users_1.users.email,
        role: franchise_1.franchiseMembers.role,
        permissions: franchise_1.franchiseMembers.permissions,
        mfaStatus: franchise_1.franchiseMembers.mfaStatus,
        isActive: franchise_1.franchiseMembers.isActive,
        joinedAt: franchise_1.franchiseMembers.joinedAt,
    })
        .from(franchise_1.franchiseMembers)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, franchise_1.franchiseMembers.userId))
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseMembers.organizationId, organizationIdFrom(req)))
        .orderBy((0, drizzle_orm_1.asc)(users_1.users.email));
    return res.json({ success: true, data: team });
};
exports.getFranchiseTeam = getFranchiseTeam;
const getFranchiseDisputes = async (req, res) => {
    const disputes = await client_1.db
        .select()
        .from(franchise_1.franchiseDisputes)
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseDisputes.organizationId, organizationIdFrom(req)))
        .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseDisputes.createdAt));
    return res.json({ success: true, data: disputes });
};
exports.getFranchiseDisputes = getFranchiseDisputes;
const createFranchiseDispute = async (req, res) => {
    const subject = String(req.body?.subject || '').trim();
    const description = String(req.body?.description || '').trim();
    const type = String(req.body?.type || 'general').trim();
    if (!subject || !description) {
        return res.status(400).json({ success: false, message: 'Subject and description are required' });
    }
    const [dispute] = await client_1.db
        .insert(franchise_1.franchiseDisputes)
        .values({
        organizationId: organizationIdFrom(req),
        type,
        subject,
        description,
        linkedType: req.body?.linkedType || null,
        linkedId: req.body?.linkedId || null,
    })
        .returning();
    return res.status(201).json({ success: true, data: dispute });
};
exports.createFranchiseDispute = createFranchiseDispute;
