"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeTerritoryCatalog = exports.getFranchiseTerritoryCatalog = exports.territoryPincodeId = exports.territoryDistrictId = exports.territoryStateId = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const franchise_1 = require("../schema/franchise");
const locations_1 = require("../schema/locations");
const normalize = (value) => String(value || '')
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/\s+/g, ' ');
const slug = (value) => normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const districtName = (value) => String(value || '')
    .trim()
    .replace(/\s+(district|city)$/i, '')
    .trim();
const territoryStateId = (state) => `state:${slug(state)}`;
exports.territoryStateId = territoryStateId;
const territoryDistrictId = (state, district) => `district_city:${slug(state)}:${slug(districtName(district))}`;
exports.territoryDistrictId = territoryDistrictId;
const territoryPincodeId = (pincode) => `pincode:${String(pincode).trim()}`;
exports.territoryPincodeId = territoryPincodeId;
const inventoryStatus = (sourceStatus, agreementId) => {
    if (agreementId || ['active', 'suspended'].includes(String(sourceStatus)))
        return 'booked';
    if (['reserved', 'payment_pending'].includes(String(sourceStatus)))
        return 'reserved';
    return 'available';
};
const createEntry = (type, values) => {
    const district = districtName(values.district || values.city) || null;
    const id = type === 'state'
        ? (0, exports.territoryStateId)(values.state)
        : type === 'district_city'
            ? (0, exports.territoryDistrictId)(values.state, district || values.name)
            : (0, exports.territoryPincodeId)(values.pincode || values.code || values.name);
    const parentId = type === 'state'
        ? null
        : type === 'district_city'
            ? (0, exports.territoryStateId)(values.state)
            : (0, exports.territoryDistrictId)(values.state, district || values.city || 'Unmapped');
    return {
        id,
        parentId,
        geoUnitId: null,
        type,
        code: values.code ||
            (type === 'state'
                ? `IN-${slug(values.state).toUpperCase()}`
                : type === 'district_city'
                    ? `${slug(values.state).toUpperCase()}-${slug(district || values.name).toUpperCase()}`
                    : `IN-${values.pincode}`),
        name: values.name,
        pincode: values.pincode || null,
        state: values.state,
        district,
        city: values.city || district,
        status: 'available',
        sourceStatus: 'available',
        mappingVersion: 1,
        owner: null,
        agreement: null,
    };
};
const getFranchiseTerritoryCatalog = async () => {
    const [locationRows, geoRows] = await Promise.all([
        client_1.db
            .select({
            pincode: locations_1.locations.pincode,
            city: locations_1.locations.city,
            state: locations_1.locations.state,
        })
            .from(locations_1.locations),
        client_1.db
            .select({
            geoUnitId: franchise_1.franchiseGeoUnits.id,
            sourceParentId: franchise_1.franchiseGeoUnits.parentId,
            type: franchise_1.franchiseGeoUnits.type,
            code: franchise_1.franchiseGeoUnits.code,
            name: franchise_1.franchiseGeoUnits.name,
            pincode: franchise_1.franchiseGeoUnits.pincode,
            state: franchise_1.franchiseGeoUnits.state,
            district: franchise_1.franchiseGeoUnits.district,
            city: franchise_1.franchiseGeoUnits.city,
            sourceStatus: franchise_1.franchiseGeoUnits.status,
            mappingVersion: franchise_1.franchiseGeoUnits.mappingVersion,
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
            agreementStartsAt: franchise_1.franchiseAgreements.startsAt,
            agreementEndsAt: franchise_1.franchiseAgreements.endsAt,
            shareBps: franchise_1.franchiseAgreements.shareBps,
            pricePaise: franchise_1.franchiseAgreements.pricePaise,
            securityDepositPaise: franchise_1.franchiseAgreements.securityDepositPaise,
            productName: franchise_1.franchiseProducts.name,
            productTier: franchise_1.franchiseProducts.tier,
        })
            .from(franchise_1.franchiseGeoUnits)
            .leftJoin(franchise_1.franchiseAgreements, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(franchise_1.franchiseAgreements.geoUnitId, franchise_1.franchiseGeoUnits.id), (0, drizzle_orm_1.inArray)(franchise_1.franchiseAgreements.status, ['active', 'suspended'])))
            .leftJoin(franchise_1.franchiseOrganizations, (0, drizzle_orm_1.eq)(franchise_1.franchiseOrganizations.id, franchise_1.franchiseAgreements.organizationId))
            .leftJoin(franchise_1.franchiseProducts, (0, drizzle_orm_1.eq)(franchise_1.franchiseProducts.id, franchise_1.franchiseAgreements.productId)),
    ]);
    const entries = new Map();
    for (const location of locationRows) {
        const stateId = (0, exports.territoryStateId)(location.state);
        const districtId = (0, exports.territoryDistrictId)(location.state, location.city);
        const pincodeId = (0, exports.territoryPincodeId)(location.pincode);
        if (!entries.has(stateId)) {
            entries.set(stateId, createEntry('state', {
                state: location.state,
                name: location.state,
            }));
        }
        if (!entries.has(districtId)) {
            entries.set(districtId, createEntry('district_city', {
                state: location.state,
                district: location.city,
                city: location.city,
                name: location.city,
            }));
        }
        if (!entries.has(pincodeId)) {
            entries.set(pincodeId, createEntry('pincode', {
                state: location.state,
                district: location.city,
                city: location.city,
                pincode: location.pincode,
                name: `${location.city} ${location.pincode}`,
            }));
        }
    }
    for (const row of geoRows) {
        if (!['state', 'district_city', 'pincode'].includes(row.type))
            continue;
        const type = row.type;
        const district = districtName(row.district || row.city || row.name);
        const id = type === 'state'
            ? (0, exports.territoryStateId)(row.state)
            : type === 'district_city'
                ? (0, exports.territoryDistrictId)(row.state, district)
                : (0, exports.territoryPincodeId)(row.pincode || row.code);
        if (!entries.has((0, exports.territoryStateId)(row.state))) {
            entries.set((0, exports.territoryStateId)(row.state), createEntry('state', { state: row.state, name: row.state }));
        }
        if (type === 'pincode' && !entries.has((0, exports.territoryDistrictId)(row.state, district))) {
            entries.set((0, exports.territoryDistrictId)(row.state, district), createEntry('district_city', {
                state: row.state,
                district,
                city: row.city || district,
                name: district,
            }));
        }
        const entry = entries.get(id) ||
            createEntry(type, {
                state: row.state,
                district,
                city: row.city,
                pincode: row.pincode,
                name: row.name,
                code: row.code,
            });
        entry.geoUnitId = row.geoUnitId;
        entry.code = row.code;
        entry.name = row.name;
        entry.pincode = row.pincode;
        entry.state = row.state;
        entry.district = type === 'state' ? null : district || null;
        entry.city = row.city || (type === 'district_city' ? district : entry.city);
        entry.sourceStatus = row.sourceStatus;
        entry.status = inventoryStatus(row.sourceStatus, row.agreementId);
        entry.mappingVersion = row.mappingVersion;
        entry.owner = row.organizationId
            ? {
                id: row.organizationId,
                legalName: row.legalName || '',
                tradeName: row.tradeName || row.legalName || '',
                email: row.email || '',
                phone: row.phone || '',
                kycStatus: row.kycStatus || 'pending',
                bankStatus: row.bankStatus || 'pending',
                status: row.organizationStatus || 'pending',
            }
            : null;
        entry.agreement =
            row.agreementId &&
                row.agreementNumber &&
                row.agreementStatus &&
                row.agreementStartsAt &&
                row.agreementEndsAt
                ? {
                    id: row.agreementId,
                    agreementNumber: row.agreementNumber,
                    status: row.agreementStatus,
                    startsAt: row.agreementStartsAt,
                    endsAt: row.agreementEndsAt,
                    shareBps: row.shareBps || 0,
                    pricePaise: row.pricePaise || 0,
                    securityDepositPaise: row.securityDepositPaise || 0,
                    productName: row.productName || '',
                    productTier: row.productTier || type,
                }
                : null;
        entries.set(id, entry);
    }
    for (const entry of entries.values()) {
        const canonicalState = entries.get((0, exports.territoryStateId)(entry.state));
        if (canonicalState)
            entry.state = canonicalState.name;
    }
    return Array.from(entries.values()).sort((left, right) => {
        const stateOrder = left.state.localeCompare(right.state);
        if (stateOrder !== 0)
            return stateOrder;
        const tierOrder = { state: 0, district_city: 1, pincode: 2 };
        if (left.type !== right.type)
            return tierOrder[left.type] - tierOrder[right.type];
        return (left.pincode || left.name).localeCompare(right.pincode || right.name, 'en-IN', {
            numeric: true,
        });
    });
};
exports.getFranchiseTerritoryCatalog = getFranchiseTerritoryCatalog;
const summarizeTerritoryCatalog = (entries) => {
    const summarizeTier = (tier) => {
        const rows = entries.filter((entry) => entry.type === tier);
        return {
            total: rows.length,
            booked: rows.filter((entry) => entry.status === 'booked').length,
            reserved: rows.filter((entry) => entry.status === 'reserved').length,
            available: rows.filter((entry) => entry.status === 'available').length,
        };
    };
    return {
        state: summarizeTier('state'),
        district_city: summarizeTier('district_city'),
        pincode: summarizeTier('pincode'),
    };
};
exports.summarizeTerritoryCatalog = summarizeTerritoryCatalog;
