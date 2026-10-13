"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOrderAwbNumber = exports.resolvePickupDetailsForOrder = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const pickupAddresses_1 = require("../schema/pickupAddresses");
const userProfile_1 = require("../schema/userProfile");
const trimText = (value) => String(value ?? '').trim();
const firstText = (...values) => {
    for (const value of values) {
        const text = trimText(value);
        if (text)
            return text;
    }
    return '';
};
const parseObject = (value) => {
    if (!value)
        return null;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        }
        catch {
            return null;
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value : null;
};
const AWB_KEY_PATTERN = /(awb|waybill|airwaybill|air_waybill|tracking_number)/i;
const INVALID_AWB_VALUES = new Set([
    'pending',
    'completed',
    'cancelled',
    'delivered',
    'failed',
    'success',
]);
const normalizeAwbCandidate = (value) => {
    const text = trimText(value);
    if (!text)
        return '';
    const lower = text.toLowerCase();
    if (lower.startsWith('status_'))
        return '';
    if (INVALID_AWB_VALUES.has(lower))
        return '';
    if (text.length < 6)
        return '';
    return text;
};
const findAwbLikeValue = (value, seen = new Set()) => {
    if (!value)
        return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const text = normalizeAwbCandidate(value);
        return text || null;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const candidate = findAwbLikeValue(item, seen);
            if (candidate)
                return candidate;
        }
        return null;
    }
    if (typeof value !== 'object')
        return null;
    const record = value;
    if (seen.has(record))
        return null;
    seen.add(record);
    for (const [key, nestedValue] of Object.entries(record)) {
        if (AWB_KEY_PATTERN.test(key)) {
            const candidate = findAwbLikeValue(nestedValue, seen);
            if (candidate)
                return candidate;
        }
    }
    for (const nestedValue of Object.values(record)) {
        if (nestedValue && typeof nestedValue === 'object') {
            const candidate = findAwbLikeValue(nestedValue, seen);
            if (candidate)
                return candidate;
        }
    }
    return null;
};
const mergeDefinedValues = (...sources) => {
    const merged = {};
    for (const source of sources) {
        if (!source || typeof source !== 'object' || Array.isArray(source))
            continue;
        for (const [key, value] of Object.entries(source)) {
            if (value === undefined || value === null)
                continue;
            if (typeof value === 'string' && !value.trim())
                continue;
            if (merged[key] === undefined || merged[key] === null) {
                merged[key] = value;
            }
        }
    }
    return Object.keys(merged).length > 0 ? merged : null;
};
const buildProfilePickupDetails = (profileRow) => {
    const companyInfo = (profileRow?.companyInfo || {});
    const gstDetails = (profileRow?.gstDetails || {});
    const warehouseName = firstText(companyInfo.brandName, companyInfo.businessName, companyInfo.companyName, companyInfo.displayName, companyInfo.contactPerson, 'Seller');
    const address = firstText(companyInfo.companyAddress, companyInfo.address);
    const city = firstText(companyInfo.city);
    const state = firstText(companyInfo.state);
    const pincode = firstText(companyInfo.pincode);
    const phone = firstText(companyInfo.companyContactNumber, companyInfo.contactNumber);
    const name = firstText(companyInfo.contactPerson, companyInfo.brandName, companyInfo.businessName, companyInfo.companyName);
    const gstNumber = firstText(gstDetails.gstNumber, companyInfo.gstNumber, companyInfo.gst, companyInfo.companyGst);
    const details = {
        warehouse_name: warehouseName,
        name: name || warehouseName,
        address,
        city,
        state,
        pincode,
        phone,
    };
    if (gstNumber) {
        details.gst_number = gstNumber;
    }
    return mergeDefinedValues(details);
};
const buildAddressPickupDetails = (pickupRow) => {
    if (!pickupRow)
        return null;
    const details = {
        warehouse_name: firstText(pickupRow.addressNickname, pickupRow.contactName),
        name: firstText(pickupRow.contactName, pickupRow.addressNickname),
        address: firstText(pickupRow.addressLine1),
        address_2: firstText(pickupRow.addressLine2),
        city: firstText(pickupRow.city),
        state: firstText(pickupRow.state),
        pincode: firstText(pickupRow.pincode),
        phone: firstText(pickupRow.contactPhone),
    };
    const gstNumber = firstText(pickupRow.gstNumber);
    if (gstNumber) {
        details.gst_number = gstNumber;
    }
    return mergeDefinedValues(details);
};
const fetchPrimaryPickupAddress = async (userId, pickupLocationId, tx = client_1.db) => {
    const normalizedPickupLocationId = trimText(pickupLocationId);
    const whereClause = normalizedPickupLocationId
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.id, normalizedPickupLocationId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, true))
        : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, true));
    const rows = await tx
        .select({
        pickupLocationId: pickupAddresses_1.pickupAddresses.id,
        addressNickname: pickupAddresses_1.addresses.addressNickname,
        addressLine1: pickupAddresses_1.addresses.addressLine1,
        addressLine2: pickupAddresses_1.addresses.addressLine2,
        city: pickupAddresses_1.addresses.city,
        state: pickupAddresses_1.addresses.state,
        pincode: pickupAddresses_1.addresses.pincode,
        contactName: pickupAddresses_1.addresses.contactName,
        contactPhone: pickupAddresses_1.addresses.contactPhone,
        gstNumber: pickupAddresses_1.addresses.gstNumber,
    })
        .from(pickupAddresses_1.pickupAddresses)
        .innerJoin(pickupAddresses_1.addresses, (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.addressId, pickupAddresses_1.addresses.id))
        .where(whereClause)
        .orderBy((0, drizzle_orm_1.desc)(pickupAddresses_1.pickupAddresses.isPrimary))
        .limit(1);
    return rows[0] ?? null;
};
const resolvePickupDetailsForOrder = async (userId, tx = client_1.db, order, profileOverride) => {
    const orderPickupDetails = parseObject(order?.pickup_details);
    const pickupAddressRow = await fetchPrimaryPickupAddress(userId, order?.pickup_location_id, tx);
    const profileRow = profileOverride ??
        (await tx
            .select()
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
            .limit(1)
            .then((rows) => rows[0] ?? null));
    const resolved = mergeDefinedValues(orderPickupDetails, buildAddressPickupDetails(pickupAddressRow), buildProfilePickupDetails(profileRow));
    const pickupLocationId = trimText(pickupAddressRow?.pickupLocationId) || trimText(order?.pickup_location_id) || null;
    return {
        pickupLocationId,
        pickupDetails: resolved,
    };
};
exports.resolvePickupDetailsForOrder = resolvePickupDetailsForOrder;
const resolveOrderAwbNumber = (order) => {
    const providerMeta = parseObject(order?.provider_meta);
    const candidates = [
        order?.awb_number,
        providerMeta?.awb_number,
        providerMeta?.awbNumber,
        providerMeta?.waybill,
        providerMeta?.AirWayBillNO,
        providerMeta?.awb,
        providerMeta?.tracking_number,
        findAwbLikeValue(order),
        order?.provider_reference,
        order?.provider_request_id,
        findAwbLikeValue(providerMeta),
    ];
    for (const candidate of candidates) {
        const normalized = normalizeAwbCandidate(candidate);
        if (normalized)
            return normalized;
    }
    return null;
};
exports.resolveOrderAwbNumber = resolveOrderAwbNumber;
