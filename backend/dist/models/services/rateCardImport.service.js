"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importFlatFormat = exports.importB2CSlabFormat = exports.toRateCardNumber = exports.parseRateCardCsvText = exports.normalizeRateCardRow = exports.cell = exports.cellToString = exports.isSlabValidationError = void 0;
const papaparse_1 = __importDefault(require("papaparse"));
const courierIntegration_service_1 = require("./courierIntegration.service");
const b2cRateCard_service_1 = require("./b2cRateCard.service");
const delhiveryCourier_1 = require("../../utils/delhiveryCourier");
const B2C_RATE_CARD_ALLOWED_PROVIDERS = new Set(['delhivery', 'manual', 'velocity']);
const isSlabValidationError = (err) => /slab|overlap|extra_rate|extra_weight_unit|zone|header|column/i.test(String(err?.message || err || ''));
exports.isSlabValidationError = isSlabValidationError;
const cellToString = (value) => value === null || value === undefined ? '' : String(value).trim();
exports.cellToString = cellToString;
const cell = (row, key) => (0, exports.cellToString)(row[key]);
exports.cell = cell;
const normalizeRateCardRow = (row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
        normalized[String(key).trim()] = (0, exports.cellToString)(value);
    }
    return normalized;
};
exports.normalizeRateCardRow = normalizeRateCardRow;
const parseRateCardCsvText = (csvText) => {
    const parsed = papaparse_1.default.parse(csvText.replace(/^\uFEFF/, ''), {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
    });
    return {
        data: parsed.data.map((row) => (0, exports.normalizeRateCardRow)(row)),
        errors: parsed.errors,
    };
};
exports.parseRateCardCsvText = parseRateCardCsvText;
const toRateCardNumber = (v, fallback = 0) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : fallback;
};
exports.toRateCardNumber = toRateCardNumber;
const normalizeHeaderKey = (value) => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/_+/g, ' ')
    .replace(/\s*\(b2c\)\s*$/i, '')
    .replace(/[^a-z0-9]+/g, '');
const zoneHeaderAliases = {
    METRO_TO_METRO: ['METRO TO METRO', 'Metro to Metro'],
    ROI: ['ROI', 'Rest of India'],
    SPECIAL_ZONE: ['SPECIAL ZONE', 'Special Zone'],
    WITHIN_CITY: ['WITHIN CITY', 'Within City'],
    WITHIN_REGION: ['WITHIN REGION', 'Within Region'],
    WITHIN_STATE: ['WITHIN STATE', 'Within State'],
};
const canonicalZoneCode = (code) => String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/_B2C$/, '');
const getZoneAliases = (zone) => {
    const code = canonicalZoneCode(zone.code);
    const codeAsWords = code.replace(/_/g, ' ');
    const aliases = zoneHeaderAliases[code]
        ? [zone.code, zone.region, code, codeAsWords, ...zoneHeaderAliases[code]]
        : [zone.name, zone.code, zone.region, code, codeAsWords];
    return aliases
        .filter(Boolean)
        .map(normalizeHeaderKey);
};
const buildHeaderLookup = (row) => {
    const lookup = new Map();
    for (const header of Object.keys(row)) {
        const normalized = normalizeHeaderKey(header);
        if (!normalized)
            continue;
        const headers = lookup.get(normalized) || [];
        if (!headers.includes(header))
            headers.push(header);
        lookup.set(normalized, headers);
    }
    return lookup;
};
const resolveZoneHeaders = (row, zonesList) => {
    const headerLookup = buildHeaderLookup(row);
    const resolved = {};
    const usedHeaders = new Map();
    for (const zone of zonesList) {
        const aliases = Array.from(new Set(getZoneAliases(zone)));
        const matchedHeaders = [];
        for (const alias of aliases) {
            const headers = headerLookup.get(alias) || [];
            if (headers.length > 1) {
                throw new Error(`Ambiguous rate card column "${headers.join(', ')}" for zone ${zone.name}`);
            }
            const header = headers[0];
            if (header && !matchedHeaders.includes(header))
                matchedHeaders.push(header);
        }
        if (matchedHeaders.length > 1) {
            throw new Error(`Ambiguous zone columns for ${zone.name}: ${matchedHeaders.join(', ')}`);
        }
        const matchedHeader = matchedHeaders[0];
        if (!matchedHeader)
            continue;
        const previousZone = usedHeaders.get(matchedHeader);
        if (previousZone && previousZone !== zone.id) {
            throw new Error(`Rate card column "${matchedHeader}" matched multiple zones. Check B2C zone headers.`);
        }
        usedHeaders.set(matchedHeader, zone.id);
        resolved[zone.id] = matchedHeader;
    }
    return resolved;
};
const getZoneCell = (row, zone, zoneHeaders) => {
    const key = zoneHeaders[zone.id];
    return key ? row[key] : undefined;
};
const inferServiceProvider = (value, courierName) => {
    const normalized = (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(value);
    if (normalized)
        return normalized;
    const lowerName = String(courierName ?? '').toLowerCase();
    if (lowerName.includes('delhivery'))
        return 'delhivery';
    if (lowerName.includes('amazon'))
        return 'amazon';
    if (lowerName.includes('ekart'))
        return 'ekart';
    if (lowerName.includes('shadowfax'))
        return 'shadowfax';
    if (lowerName.includes('xpress'))
        return 'xpressbees';
    return '';
};
const canonicalizeImportedCourier = (input) => {
    if (input.serviceProvider !== 'delhivery')
        return input;
    const shippingMode = (0, delhiveryCourier_1.resolveDelhiveryRateCardShippingMode)({
        courierId: input.courierId,
        mode: input.mode,
        courierName: input.courierName,
    });
    const canonicalCourierId = (0, delhiveryCourier_1.getCanonicalDelhiveryCourierIdByMode)(shippingMode);
    if (!shippingMode || !canonicalCourierId)
        return input;
    return {
        ...input,
        courierId: String(canonicalCourierId),
        courierName: (0, delhiveryCourier_1.getDelhiveryCourierDisplayName)(shippingMode),
        mode: shippingMode === 'Express' ? 'air' : 'surface',
    };
};
const rtoMultiplierFromCell = (value) => {
    const raw = (0, exports.toRateCardNumber)(value, 0);
    if (!raw)
        return 0;
    return raw <= 1 ? raw : raw / 100;
};
const roundMoney = (value) => Math.round(value * 100) / 100;
const weightsMatch = (left, right) => Math.abs(left - right) < 0.001;
const normalizeSlabLabel = (value) => {
    const raw = (0, exports.cellToString)(value);
    if (!raw)
        return '';
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
        return String(Number(raw));
    }
    return raw
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
};
const findAdditionalRowForSlab = (rows, firstRow) => {
    const additionalRows = rows.filter((row) => row._type === 'additional');
    const slabLabel = normalizeSlabLabel(firstRow['Slab']);
    if (slabLabel) {
        const labelMatches = additionalRows.filter((row) => normalizeSlabLabel(row['Slab']) === slabLabel);
        if (labelMatches.length === 1)
            return labelMatches[0];
        const labelAndWeightMatches = labelMatches.filter((row) => weightsMatch(row._weight, firstRow._weight));
        if (labelAndWeightMatches.length === 1)
            return labelAndWeightMatches[0];
    }
    const matchingWeightRows = additionalRows.filter((row) => weightsMatch(row._weight, firstRow._weight));
    return matchingWeightRows.length === 1 ? matchingWeightRows[0] : undefined;
};
const prepareFirstSlabRows = (rows) => {
    const firstRows = rows
        .filter((r) => r._type === 'first')
        .sort((a, b) => a._weight - b._weight);
    let previousWeightTo = 0;
    let previousAdditionalRow;
    return firstRows.map((firstRow, index) => {
        const additionalRow = findAdditionalRowForSlab(rows, firstRow);
        const startsIndependentSlab = index === 0 || Boolean(previousAdditionalRow);
        const prepared = {
            firstRow,
            additionalRow,
            weight_from: startsIndependentSlab ? 0 : previousWeightTo,
            weight_to: firstRow._weight,
        };
        previousWeightTo = firstRow._weight;
        previousAdditionalRow = additionalRow;
        return prepared;
    });
};
const importB2CSlabFormat = async (data, plan_id, zonesList, courierScope = {}) => {
    const groups = new Map();
    let savedRows = 0;
    for (const row of data) {
        const rowCourierId = (0, exports.cell)(row, 'Courier ID');
        if (courierScope.courierId && rowCourierId && rowCourierId !== courierScope.courierId) {
            throw new Error(`B2C rate card import supports one courier at a time. Found Courier ID ${rowCourierId}, expected ${courierScope.courierId}.`);
        }
        const courierId = rowCourierId || courierScope.courierId || '';
        const courierName = (0, exports.cell)(row, 'Courier') || (0, exports.cell)(row, 'Courier Name') || courierScope.courierName || '';
        const serviceProvider = inferServiceProvider((0, exports.cell)(row, 'Service Provider') || courierScope.serviceProvider, courierName);
        if (!serviceProvider || !B2C_RATE_CARD_ALLOWED_PROVIDERS.has(serviceProvider)) {
            throw new Error(`B2C rate-card import is allowed only for Delhivery, Velocity, and manual couriers. Check row for courier "${courierName || courierId || 'unknown'}".`);
        }
        const mode = (0, exports.cell)(row, 'Mode') ||
            ((0, b2cRateCard_service_1.normalizeB2CServiceProvider)(serviceProvider) === 'manual' ? 'standard' : '');
        const slabType = (0, exports.cell)(row, 'Slab Type').toLowerCase();
        if (!courierId || !mode)
            continue;
        if (slabType !== 'first' && slabType !== 'additional')
            continue;
        const weight = (0, exports.toRateCardNumber)(row['Weight (KG)']);
        if (!weight)
            continue;
        const canonicalCourier = canonicalizeImportedCourier({
            courierId,
            courierName,
            serviceProvider,
            mode,
        });
        const key = `${canonicalCourier.courierId}|${canonicalCourier.serviceProvider}|${canonicalCourier.mode.toLowerCase()}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups
            .get(key)
            .push(Object.assign({}, row, {
            'Courier ID': canonicalCourier.courierId,
            Courier: canonicalCourier.courierName,
            'Courier Name': canonicalCourier.courierName,
            'Service Provider': canonicalCourier.serviceProvider,
            Mode: canonicalCourier.mode,
            _weight: weight,
            _type: slabType,
        }));
    }
    for (const rows of groups.values()) {
        const first = rows.find((r) => r._type === 'first');
        if (!first)
            continue;
        const courierId = (0, exports.cell)(first, 'Courier ID');
        const courierName = (0, exports.cell)(first, 'Courier') || (0, exports.cell)(first, 'Courier Name');
        const serviceProvider = inferServiceProvider((0, exports.cell)(first, 'Service Provider'), courierName);
        const mode = (0, exports.cell)(first, 'Mode');
        const codCharges = (0, exports.toRateCardNumber)(first['COD Rs'] ?? first['COD Charges'], 0) || null;
        const codPercent = (0, exports.toRateCardNumber)(first['COD %'] ?? first['COD Percent'], 0) || null;
        const rtoMultiplier = rtoMultiplierFromCell(first['RTO %']);
        const preparedFirstRows = prepareFirstSlabRows(rows);
        const zoneHeaders = resolveZoneHeaders(first, zonesList);
        const zoneForwardSlabs = {};
        const zoneRtoSlabs = {};
        for (const zone of zonesList) {
            const fwdSlabs = [];
            const rtoSlabs = [];
            for (const preparedSlab of preparedFirstRows) {
                const { firstRow: fr, additionalRow: addRow, weight_from: weightFrom, weight_to: weightTo, } = preparedSlab;
                const fwdRate = (0, exports.toRateCardNumber)(getZoneCell(fr, zone, zoneHeaders));
                if (!fwdRate) {
                    continue;
                }
                const extraRate = addRow
                    ? (0, exports.toRateCardNumber)(getZoneCell(addRow, zone, zoneHeaders)) || null
                    : null;
                const extraWeightUnit = addRow && extraRate ? addRow._weight || null : null;
                fwdSlabs.push({
                    weight_from: weightFrom,
                    weight_to: weightTo,
                    rate: fwdRate,
                    extra_rate: extraRate,
                    extra_weight_unit: extraWeightUnit,
                });
                if (rtoMultiplier > 0) {
                    rtoSlabs.push({
                        weight_from: weightFrom,
                        weight_to: weightTo,
                        rate: roundMoney(fwdRate * rtoMultiplier),
                        extra_rate: extraRate ? roundMoney(extraRate * rtoMultiplier) : null,
                        extra_weight_unit: extraWeightUnit,
                    });
                }
            }
            if (fwdSlabs.length) {
                zoneForwardSlabs[zone.id] = fwdSlabs;
                if (rtoSlabs.length)
                    zoneRtoSlabs[zone.id] = rtoSlabs;
            }
        }
        for (const zone of zonesList) {
            const fwdSlabs = zoneForwardSlabs[zone.id];
            if (!fwdSlabs?.length)
                continue;
            savedRows += await (0, courierIntegration_service_1.upsertShippingRate)({
                courier_id: courierId,
                courier_name: courierName,
                service_provider: serviceProvider,
                plan_id,
                mode,
                business_type: 'b2c',
                cod_charges: codCharges,
                cod_percent: codPercent,
                other_charges: null,
                rates: [{ zone_id: zone.id, type: 'forward', rate: fwdSlabs[0]?.rate ?? 0 }],
                zone_slabs: { [zone.id]: { forward: fwdSlabs } },
            });
            const rtoSlabs = zoneRtoSlabs[zone.id];
            if (rtoSlabs?.length) {
                savedRows += await (0, courierIntegration_service_1.upsertShippingRate)({
                    courier_id: courierId,
                    courier_name: courierName,
                    service_provider: serviceProvider,
                    plan_id,
                    mode,
                    business_type: 'b2c',
                    cod_charges: null,
                    cod_percent: null,
                    other_charges: null,
                    rates: [{ zone_id: zone.id, type: 'rto', rate: rtoSlabs[0]?.rate ?? 0 }],
                    zone_slabs: { [zone.id]: { rto: rtoSlabs } },
                });
            }
        }
    }
    return savedRows;
};
exports.importB2CSlabFormat = importB2CSlabFormat;
const importFlatFormat = async (data, plan_id, business_type, zonesList) => {
    let savedRows = 0;
    for (const row of data) {
        const courierId = (0, exports.cell)(row, 'Courier ID');
        const courierName = (0, exports.cell)(row, 'Courier Name') || (0, exports.cell)(row, 'Courier');
        const serviceProvider = inferServiceProvider((0, exports.cell)(row, 'Service Provider'), courierName);
        const minWeight = (0, exports.cell)(row, 'Min Weight');
        const mode = (0, exports.cell)(row, 'Mode');
        if (!courierId || !courierName)
            continue;
        const canonicalCourier = canonicalizeImportedCourier({
            courierId,
            courierName,
            serviceProvider,
            mode,
        });
        const rates = Object.entries(row)
            .filter(([key]) => business_type === 'b2b'
            ? key.toLowerCase().includes('forward') || key.toLowerCase().includes('rto')
            : key.includes('(Forward)') || key.includes('(RTO)'))
            .flatMap(([zoneKey, value]) => {
            if (!value)
                return [];
            const zone = zonesList.find((z) => normalizeHeaderKey(zoneKey).includes(normalizeHeaderKey(z.name)));
            if (!zone)
                return [];
            const rate = (0, exports.toRateCardNumber)(value);
            if (!rate)
                return [];
            if (zoneKey.toLowerCase().includes('forward'))
                return [{ zone_id: zone.id, type: 'forward', rate }];
            if (zoneKey.toLowerCase().includes('rto'))
                return [{ zone_id: zone.id, type: 'rto', rate }];
            return [];
        });
        const codCharges = (0, exports.cell)(row, 'COD Charges') ? (0, exports.toRateCardNumber)(row['COD Charges']) : null;
        const codPercent = (0, exports.cell)(row, 'COD Percent') ? (0, exports.toRateCardNumber)(row['COD Percent']) : null;
        const otherCharges = (0, exports.cell)(row, 'Other Charges') ? (0, exports.toRateCardNumber)(row['Other Charges']) : null;
        const hasData = mode || codCharges !== null || codPercent !== null || otherCharges !== null || rates.length > 0;
        if (!hasData)
            continue;
        savedRows += await (0, courierIntegration_service_1.upsertShippingRate)({
            courier_id: canonicalCourier.courierId,
            courier_name: canonicalCourier.courierName,
            service_provider: canonicalCourier.serviceProvider,
            plan_id,
            min_weight: minWeight,
            business_type: business_type,
            mode: canonicalCourier.mode,
            cod_charges: codCharges,
            cod_percent: codPercent,
            other_charges: otherCharges,
            rates,
        });
    }
    return savedRows;
};
exports.importFlatFormat = importFlatFormat;
