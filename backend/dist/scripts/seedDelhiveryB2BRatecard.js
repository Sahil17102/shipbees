"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const drizzle_orm_1 = require("drizzle-orm");
const XLSX = __importStar(require("xlsx"));
const client_1 = require("../models/client");
const b2bAdmin_service_1 = require("../models/services/b2bAdmin.service");
const b2bPricingConfig_service_1 = require("../models/services/b2bPricingConfig.service");
const zone_service_1 = require("../models/services/zone.service");
const couriers_1 = require("../models/schema/couriers");
const plans_1 = require("../models/schema/plans");
const zones_1 = require("../models/schema/zones");
const DEFAULT_WORKBOOK = path_1.default.resolve(process.env.USERPROFILE || '', 'Downloads', 'new Star Logistics Jaipur Rate Card 50 150.xlsx');
const normalizeText = (value) => String(value ?? '').trim();
const toNumericValue = (value) => {
    const normalized = normalizeText(value);
    if (!normalized)
        return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};
const argValue = (flag) => {
    const arg = process.argv.find((entry) => entry.startsWith(`${flag}=`));
    return arg ? arg.slice(flag.length + 1) : '';
};
const hasFlag = (flag) => process.argv.includes(flag);
const titleToName = (value) => normalizeText(value).replace(/\s+/g, ' ');
const toFieldKey = (value, fallback) => {
    const normalized = normalizeText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || fallback;
};
const expandStateToken = (token) => {
    const normalized = titleToName(token);
    const upper = normalized.toUpperCase();
    const aliases = {
        AP: ['Andhra Pradesh'],
        UP: ['Uttar Pradesh'],
        WB: ['West Bengal'],
        HP: ['Himachal Pradesh'],
        'J&K': ['Jammu and Kashmir', 'Jammu & Kashmir'],
        JNK: ['Jammu and Kashmir', 'Jammu & Kashmir'],
        'DADRA & NAGAR HAVELI AND DAMAN & DIU': ['Dadra and Nagar Haveli and Daman and Diu'],
        'DADRA AND NAGAR HAVELI AND DAMAN AND DIU': ['Dadra and Nagar Haveli and Daman and Diu'],
        PONDICHERRY: ['Puducherry'],
    };
    if (aliases[upper]) {
        return aliases[upper];
    }
    return [normalized];
};
const parseStates = (rawValue) => {
    const prepared = rawValue
        .replace(/Daman\s*&\s*Diu\s+and\s+Dadra\s*&\s*Nagar\s*Haveli/gi, 'Daman & Diu|Dadra & Nagar Haveli')
        .replace(/Tamil Nadu\s*&\s*Puducherry/gi, 'Tamil Nadu|Puducherry')
        .replace(/Nagaland\s+and\s+Sikkim/gi, 'Nagaland|Sikkim')
        .replace(/\bJ&K\b/gi, 'Jammu & Kashmir');
    const tokens = prepared
        .split(/[,|]/)
        .map((part) => part.trim())
        .filter(Boolean);
    const unique = new Set();
    for (const token of tokens) {
        for (const expanded of expandStateToken(token)) {
            const value = titleToName(expanded);
            if (value) {
                unique.add(value);
            }
        }
    }
    if (unique.has('Daman and Diu') && unique.has('Dadra and Nagar Haveli')) {
        unique.add('Dadra and Nagar Haveli and Daman and Diu');
    }
    return Array.from(unique);
};
const parseWorkbook = (filePath) => {
    const workbook = XLSX.readFile(filePath);
    const matrixRows = XLSX.utils.sheet_to_json(workbook.Sheets.Sheet1, {
        header: 1,
        defval: null,
    });
    const zoneRows = XLSX.utils.sheet_to_json(workbook.Sheets.Zone, {
        header: 1,
        defval: null,
    });
    if (!matrixRows.length || !zoneRows.length) {
        throw new Error('Workbook is missing the expected Sheet1/Zone content.');
    }
    const matrixCodes = matrixRows[0]
        .map((cell) => normalizeText(cell))
        .filter(Boolean);
    if (matrixCodes.length === 0) {
        throw new Error('Could not find any destination zone codes in Sheet1.');
    }
    const zoneDefinitions = zoneRows
        .slice(1)
        .filter((row) => normalizeText(row[0]) && normalizeText(row[1]))
        .slice(0, matrixCodes.length);
    if (zoneDefinitions.length !== matrixCodes.length) {
        throw new Error(`Zone definition count (${zoneDefinitions.length}) does not match matrix code count (${matrixCodes.length}).`);
    }
    const zonesFromWorkbook = zoneDefinitions.map((row, index) => ({
        code: matrixCodes[index],
        name: titleToName(normalizeText(row[0])),
        rawStates: normalizeText(row[1]),
        states: parseStates(normalizeText(row[1])),
    }));
    const rateRows = [];
    for (const row of matrixRows.slice(1, matrixCodes.length + 1)) {
        const originCode = normalizeText(row[0]);
        if (!originCode)
            continue;
        matrixCodes.forEach((destinationCode, index) => {
            const ratePerKg = toNumericValue(row[index + 1]);
            if (ratePerKg == null)
                return;
            rateRows.push({
                originCode,
                destinationCode,
                ratePerKg,
            });
        });
    }
    const additionalRows = matrixRows
        .slice(24)
        .filter((row) => normalizeText(row[0]) &&
        normalizeText(row[0]) !== 'ODA Charges' &&
        normalizeText(row[0]) !== 'Charge')
        .map((row) => ({
        key: normalizeText(row[0]),
        remark: normalizeText(row[1]),
        calculation: normalizeText(row[2]),
        unitCharge: row[3] ?? null,
        min: row[4] ?? null,
        max: row[5] ?? null,
    }));
    const odaRows = matrixRows
        .slice(75)
        .filter((row) => normalizeText(row[0]) === 'ODA')
        .map((row) => ({
        lowerLimitKg: toNumericValue(row[1]),
        upperLimitKg: toNumericValue(row[2]),
        perKgCharge: row[3] ?? null,
        minCharge: row[4] ?? null,
        maxCharge: row[5] ?? null,
    }));
    return {
        zones: zonesFromWorkbook,
        rates: rateRows,
        charges: additionalRows,
        odaRows,
        specialNote: normalizeText(matrixRows[11]?.[0]),
    };
};
const buildChargeIndex = (rows) => {
    const index = new Map();
    for (const row of rows) {
        const existing = index.get(row.key) || [];
        existing.push(row);
        index.set(row.key, existing);
    }
    return index;
};
const getFirstCharge = (index, key) => index.get(key)?.[0];
const formatChargeLabel = (value) => {
    const normalized = normalizeText(value);
    if (!normalized)
        return 'Imported Workbook Field';
    return normalized
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
};
const resolveCourier = async (explicitCourierId) => {
    const candidates = await client_1.db
        .select()
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, 'delhivery'), (0, drizzle_orm_1.eq)(couriers_1.couriers.isEnabled, true), (0, drizzle_orm_1.sql) `${couriers_1.couriers.businessType} @> '["b2b"]'::jsonb`))
        .orderBy((0, drizzle_orm_1.asc)(couriers_1.couriers.name), (0, drizzle_orm_1.asc)(couriers_1.couriers.id));
    if (!candidates.length) {
        throw new Error('No enabled Delhivery courier with B2B business type was found.');
    }
    if (explicitCourierId) {
        const matched = candidates.find((courier) => String(courier.id) === String(explicitCourierId));
        if (!matched) {
            throw new Error(`Courier ${explicitCourierId} is not an enabled Delhivery B2B courier.`);
        }
        return matched;
    }
    if (candidates.length === 1) {
        return candidates[0];
    }
    const scored = [...candidates]
        .map((courier) => {
        const name = normalizeText(courier.name).toLowerCase();
        let score = 0;
        if (name.includes('ltl'))
            score += 5;
        if (name.includes('b2b'))
            score += 4;
        if (name.includes('freight'))
            score += 3;
        if (name.includes('surface'))
            score += 1;
        return { courier, score };
    })
        .sort((left, right) => right.score - left.score);
    if (scored[0]?.score > 0 && scored[0].score !== scored[1]?.score) {
        return scored[0].courier;
    }
    const choices = candidates.map((courier) => `${courier.id} - ${courier.name}`).join(', ');
    throw new Error(`Multiple Delhivery B2B couriers were found. Re-run with --courier-id=<id>. Choices: ${choices}`);
};
const resolvePlan = async (planId, planName) => {
    if (planId) {
        const [matched] = await client_1.db.select().from(plans_1.plans).where((0, drizzle_orm_1.eq)(plans_1.plans.id, planId)).limit(1);
        if (!matched) {
            throw new Error(`Plan ${planId} was not found.`);
        }
        return matched;
    }
    if (planName) {
        const [matched] = await client_1.db
            .select()
            .from(plans_1.plans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(plans_1.plans.name, planName), (0, drizzle_orm_1.eq)(plans_1.plans.business_type, 'b2b')))
            .limit(1);
        if (!matched) {
            throw new Error(`Plan "${planName}" was not found.`);
        }
        return matched;
    }
    const [basicPlan] = await client_1.db
        .select()
        .from(plans_1.plans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(plans_1.plans.name, 'Basic'), (0, drizzle_orm_1.eq)(plans_1.plans.business_type, 'b2b')))
        .limit(1);
    if (!basicPlan) {
        throw new Error('Basic plan was not found. Create the Basic plan before seeding the Delhivery B2B rate card.');
    }
    return basicPlan;
};
const upsertZones = async (zoneSeeds) => {
    const zoneIdByCode = new Map();
    for (const zoneSeed of zoneSeeds) {
        const [zoneRecord] = await client_1.db
            .insert(zones_1.zones)
            .values({
            code: zoneSeed.code,
            name: zoneSeed.name,
            business_type: 'B2B',
            region: zoneSeed.name,
            states: zoneSeed.states,
            metadata: {
                source: 'delhivery-b2b-workbook',
                rawStates: zoneSeed.rawStates,
            },
        })
            .onConflictDoUpdate({
            target: [zones_1.zones.code, zones_1.zones.business_type],
            set: {
                name: zoneSeed.name,
                region: zoneSeed.name,
                states: zoneSeed.states,
                metadata: {
                    source: 'delhivery-b2b-workbook',
                    rawStates: zoneSeed.rawStates,
                },
                updated_at: new Date(),
            },
        })
            .returning();
        await client_1.db
            .delete(zones_1.b2bZoneStates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.b2bZoneStates.zone_id, zoneRecord.id), (0, drizzle_orm_1.isNull)(zones_1.b2bZoneStates.courier_id), (0, drizzle_orm_1.isNull)(zones_1.b2bZoneStates.service_provider)));
        if (zoneSeed.states.length > 0) {
            await client_1.db.insert(zones_1.b2bZoneStates).values(zoneSeed.states.map((stateName) => ({
                zone_id: zoneRecord.id,
                state_name: stateName,
                courier_id: null,
                service_provider: null,
            })));
        }
        await (0, zone_service_1.remapZonePincodes)(zoneRecord.id);
        zoneIdByCode.set(zoneSeed.code, zoneRecord.id);
    }
    return zoneIdByCode;
};
const applyRateMatrix = async (rates, zoneIdByCode, courier, plan) => {
    for (const rate of rates) {
        const originZoneId = zoneIdByCode.get(rate.originCode);
        const destinationZoneId = zoneIdByCode.get(rate.destinationCode);
        if (!originZoneId || !destinationZoneId) {
            throw new Error(`Missing zone mapping for ${rate.originCode} -> ${rate.destinationCode}.`);
        }
        await (0, b2bAdmin_service_1.upsertZoneToZoneRate)({
            originZoneId,
            destinationZoneId,
            ratePerKg: rate.ratePerKg,
            planId: plan.id,
            courierScope: {
                courierId: courier.id,
                serviceProvider: courier.serviceProvider,
            },
        });
    }
};
const applyAdditionalCharges = async (chargeRows, odaRows, courier, plan, specialNote) => {
    const index = buildChargeIndex(chargeRows);
    const processing = getFirstCharge(index, 'processing');
    const divisor = getFirstCharge(index, 'divisor');
    const minimumChargeableFreight = getFirstCharge(index, 'Minimum chargeable freight amount ( Base Freight +AWB+FM )');
    const minimumChargeableWeight = getFirstCharge(index, 'min_chg_wt');
    const demurrageFreeDays = getFirstCharge(index, 'demurrage_free_store_period');
    const reattempt = getFirstCharge(index, 're_attempt_charge');
    const appointmentHandling = getFirstCharge(index, 'apt_handling');
    const fsc = getFirstCharge(index, 'fsc');
    const demurrage = getFirstCharge(index, 'demurrage_charge');
    const mallDelivery = getFirstCharge(index, 'mall_delivery');
    const rovCarrier = getFirstCharge(index, 'rov_carrier');
    const mappedKeys = new Set([
        'processing',
        'divisor',
        'Minimum chargeable freight amount ( Base Freight +AWB+FM )',
        'min_chg_wt',
        'demurrage_charge',
        'demurrage_free_store_period',
        'fsc',
        're_attempt_charge',
        'apt_handling',
        'mall_delivery',
        'rov_carrier',
    ]);
    const importedCustomFields = {};
    const importedFieldDefinitions = {};
    let importedOrder = 1;
    const addReferenceField = (fieldKey, label, row, description) => {
        importedCustomFields[fieldKey] = {
            remark: normalizeText(row.remark),
            calculation: normalizeText(row.calculation),
            unitCharge: row.unitCharge ?? '',
            min: row.min ?? '',
            max: row.max ?? '',
            lowerLimitKg: row.lowerLimitKg ?? '',
            upperLimitKg: row.upperLimitKg ?? '',
        };
        importedFieldDefinitions[fieldKey] = {
            label,
            visible: true,
            group: 'Workbook Imported Rates',
            order: importedOrder++,
            description: description || normalizeText(row.remark) || 'Imported from the Delhivery B2B workbook.',
            unit: normalizeText(row.calculation),
            condition: {
                referenceOnly: true,
            },
        };
    };
    if (specialNote) {
        addReferenceField('workbook_special_note', 'Workbook Special Note', {
            remark: 'Special commercial note from workbook',
            calculation: 'note',
            unitCharge: specialNote,
        }, 'Reference-only note imported from the rate card workbook.');
    }
    chargeRows.forEach((row, indexValue) => {
        if (mappedKeys.has(row.key)) {
            return;
        }
        const fieldKey = `${toFieldKey(row.key, `imported_charge_${indexValue + 1}`)}_${indexValue + 1}`;
        addReferenceField(fieldKey, formatChargeLabel(row.key), row);
    });
    odaRows.forEach((row, indexValue) => {
        addReferenceField(`oda_slab_${indexValue + 1}`, `ODA Slab ${indexValue + 1}`, {
            remark: 'Imported ODA slab configuration',
            calculation: 'per kg',
            unitCharge: row.perKgCharge,
            min: row.minCharge,
            max: row.maxCharge,
            lowerLimitKg: row.lowerLimitKg,
            upperLimitKg: row.upperLimitKg,
        }, 'Reference-only ODA slab imported from the workbook.');
    });
    const payload = {
        planId: plan.id,
        awbCharges: toNumericValue(processing?.unitCharge) ?? 0,
        cftFactor: toNumericValue(divisor?.unitCharge) ?? 4500,
        minimumChargeableAmount: toNumericValue(minimumChargeableFreight?.unitCharge) ?? 0,
        minimumChargeableWeight: toNumericValue(minimumChargeableWeight?.unitCharge) ?? 0,
        freeStorageDays: toNumericValue(demurrageFreeDays?.unitCharge) ?? 5,
        demurragePerKgDay: toNumericValue(demurrage?.unitCharge) ?? 0,
        demurragePerAwbDay: toNumericValue(demurrage?.min) ?? 0,
        fuelSurchargePercentage: toNumericValue(fsc?.unitCharge) ?? 0,
        odaCharges: toNumericValue(odaRows[0]?.minCharge) ?? 0,
        odaPerKgCharge: toNumericValue(odaRows[0]?.perKgCharge) ?? 0,
        odaMethod: 'whichever_is_higher',
        deliveryReattemptPerKg: toNumericValue(reattempt?.unitCharge) ?? 0,
        deliveryReattemptPerAwb: toNumericValue(reattempt?.min) ?? 0,
        deliveryReattemptMethod: 'whichever_is_higher',
        timeSpecificPerKg: toNumericValue(appointmentHandling?.unitCharge) ?? 0,
        timeSpecificPerAwb: toNumericValue(appointmentHandling?.min) ?? 0,
        timeSpecificMethod: 'whichever_is_higher',
        mallDeliveryPerKg: toNumericValue(mallDelivery?.unitCharge) ?? 0,
        mallDeliveryPerAwb: toNumericValue(mallDelivery?.min) ?? 0,
        mallDeliveryMethod: 'whichever_is_higher',
        rovFixedAmount: toNumericValue(rovCarrier?.min) ?? 0,
        rovPercentage: toNumericValue(rovCarrier?.unitCharge) ?? 0,
        rovMethod: 'whichever_is_higher',
        courierScope: {
            courierId: courier.id,
            serviceProvider: courier.serviceProvider,
        },
        customFields: {},
        fieldDefinitions: {},
    };
    const existingCharges = await (0, b2bPricingConfig_service_1.getAdditionalCharges)({
        courierScope: {
            courierId: courier.id,
            serviceProvider: courier.serviceProvider,
        },
        includeGlobal: false,
        planId: plan.id,
    });
    const preservedCustomFields = Object.fromEntries(Object.entries(existingCharges?.custom_fields || {}).filter(([fieldKey]) => {
        const definition = existingCharges?.field_definitions?.[fieldKey];
        return definition?.group !== 'Workbook Imported Rates';
    }));
    const preservedFieldDefinitions = Object.fromEntries(Object.entries(existingCharges?.field_definitions || {}).filter(([, definition]) => {
        return definition?.group !== 'Workbook Imported Rates';
    }));
    payload.customFields = {
        ...preservedCustomFields,
        ...importedCustomFields,
    };
    payload.fieldDefinitions = {
        ...preservedFieldDefinitions,
        ...importedFieldDefinitions,
    };
    await (0, b2bPricingConfig_service_1.upsertAdditionalCharges)(payload);
    await (0, b2bPricingConfig_service_1.upsertVolumetricRules)({
        volumetricDivisor: toNumericValue(divisor?.unitCharge) ?? 4500,
        cftFactor: toNumericValue(divisor?.unitCharge) ?? 4500,
        courierScope: {
            courierId: courier.id,
            serviceProvider: courier.serviceProvider,
        },
    });
};
async function main() {
    const workbookPath = argValue('--file') || (fs_1.default.existsSync(DEFAULT_WORKBOOK) ? DEFAULT_WORKBOOK : '');
    const planId = argValue('--plan-id');
    const planName = argValue('--plan-name');
    const courierId = argValue('--courier-id');
    const dryRun = hasFlag('--dry-run');
    if (!workbookPath) {
        throw new Error('Workbook file not found. Pass --file="C:\\path\\to\\rate-card.xlsx" to seed the Delhivery B2B rate card.');
    }
    if (!fs_1.default.existsSync(workbookPath)) {
        throw new Error(`Workbook not found at ${workbookPath}`);
    }
    const workbook = parseWorkbook(workbookPath);
    const courier = await resolveCourier(courierId);
    const plan = await resolvePlan(planId, planName);
    console.log(`Workbook: ${workbookPath}`);
    console.log(`Courier: ${courier.name} (${courier.id} / ${courier.serviceProvider})`);
    console.log(`Plan: ${plan.name} (${plan.id})`);
    console.log(`Zones: ${workbook.zones.length}`);
    console.log(`Rates: ${workbook.rates.length}`);
    if (workbook.specialNote) {
        console.log(`Special note: ${workbook.specialNote}`);
    }
    if (dryRun) {
        console.log('Dry run only. No database changes were applied.');
        return;
    }
    const zoneIdByCode = await upsertZones(workbook.zones);
    await applyRateMatrix(workbook.rates, zoneIdByCode, courier, plan);
    await applyAdditionalCharges(workbook.charges, workbook.odaRows, courier, plan, workbook.specialNote);
    console.log('Delhivery B2B Basic-plan zones, rate matrix, and workbook additional charges seeded successfully.');
}
main()
    .catch((error) => {
    console.error('Failed to seed Delhivery B2B rate card:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end();
});
