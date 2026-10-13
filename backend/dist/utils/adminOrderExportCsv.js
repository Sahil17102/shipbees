"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toAdminOrderExportRow = exports.getAdminOrderDeliveryDateOrLastStatus = exports.getAdminOrderPickupDate = exports.getAdminOrderSellerName = exports.ADMIN_ORDER_EXPORT_HEADERS = void 0;
exports.ADMIN_ORDER_EXPORT_HEADERS = [
    'Order ID',
    'Seller Name',
    'AWB Number',
    'Customer Name',
    'Customer Phone',
    'Customer Email',
    'Status',
    'Order Type',
    'Amount',
    'Courier Partner',
    'Order Date',
    'Pickup Date',
    'Delivery Date / Last Status',
    'Charged Weight (kg)',
    'City',
    'State',
    'Pincode',
    'Address',
];
const getTrimmedString = (value) => {
    if (value === null || value === undefined)
        return '';
    return String(value).trim();
};
const firstPresent = (...values) => {
    for (const value of values) {
        const normalized = getTrimmedString(value);
        if (normalized)
            return value;
    }
    return '';
};
const parseJsonObject = (value) => {
    if (!value)
        return {};
    if (typeof value === 'object')
        return value;
    if (typeof value !== 'string')
        return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : {};
    }
    catch {
        return {};
    }
};
const formatDateValue = (value) => {
    if (!value)
        return '';
    if (value instanceof Date)
        return value.toISOString();
    const raw = getTrimmedString(value);
    if (!raw)
        return '';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()))
        return raw;
    return parsed.toISOString();
};
const formatNumber = (value, fallback) => {
    const candidate = value ?? fallback;
    if (candidate === null || candidate === undefined || candidate === '')
        return '';
    const numeric = Number(candidate);
    return Number.isFinite(numeric) ? numeric.toFixed(3) : getTrimmedString(candidate);
};
const normalizeStatus = (value) => getTrimmedString(value).toLowerCase().replace(/[\s-]+/g, '_');
const getAdminOrderSellerName = (order) => {
    const companyInfo = parseJsonObject(order.userProfile?.companyInfo);
    return getTrimmedString(firstPresent(order.merchantName, companyInfo.businessName, companyInfo.brandName, companyInfo.companyName, companyInfo.displayName, companyInfo.contactPerson, order.merchantEmail, order.merchantPhone, order.user_id));
};
exports.getAdminOrderSellerName = getAdminOrderSellerName;
const getAdminOrderPickupDate = (order) => {
    const pickupDetails = parseJsonObject(order.pickup_details);
    return formatDateValue(firstPresent(order.pickup_date, order.pickupDate, pickupDetails.pickup_date, pickupDetails.pickupDate, pickupDetails.requested_pickup_date, pickupDetails.requestedPickupDate, pickupDetails.final_pickup_date, pickupDetails.finalPickupDate, pickupDetails.expected_pickup_date, pickupDetails.expectedPickupDate));
};
exports.getAdminOrderPickupDate = getAdminOrderPickupDate;
const getAdminOrderDeliveryDateOrLastStatus = (order) => {
    if (normalizeStatus(order.order_status) !== 'delivered') {
        return getTrimmedString(firstPresent(order.delivery_message, order.order_status));
    }
    return formatDateValue(firstPresent(order.delivered_at, order.deliveredAt, order.delivery_date, order.deliveryDate, order.delivered_time, order.deliveredTime, order.updated_at, order.updatedAt, order.created_at, order.createdAt));
};
exports.getAdminOrderDeliveryDateOrLastStatus = getAdminOrderDeliveryDateOrLastStatus;
const toAdminOrderExportRow = (order) => [
    firstPresent(order.order_id, order.order_number, order.id),
    (0, exports.getAdminOrderSellerName)(order),
    order.awb_number,
    order.buyer_name,
    order.buyer_phone,
    order.buyer_email,
    order.order_status,
    order.order_type,
    order.order_amount,
    order.courier_partner,
    order.order_date,
    (0, exports.getAdminOrderPickupDate)(order),
    (0, exports.getAdminOrderDeliveryDateOrLastStatus)(order),
    formatNumber(order.charged_weight, order.weight),
    order.city,
    order.state,
    order.pincode,
    order.address,
];
exports.toAdminOrderExportRow = toAdminOrderExportRow;
