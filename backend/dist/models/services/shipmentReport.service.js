"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildShipmentReportCsv = exports.getShipmentReportOptions = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const bookingWalletDebit_1 = require("../../utils/bookingWalletDebit");
const csv_1 = require("../../utils/csv");
const text = (value) => String(value ?? '').trim();
const amount = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value) => amount(value).toFixed(2);
const weight = (value) => amount(value).toFixed(3);
const isoDate = (value) => {
    if (!value)
        return '';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toISOString();
};
const sellerCompanyName = (companyInfo, email) => text(companyInfo?.businessName ||
    companyInfo?.brandName ||
    companyInfo?.companyName ||
    companyInfo?.displayName ||
    email);
const loadReportOrders = async (scope, filters) => {
    const b2cConditions = [
        (0, drizzle_orm_1.gte)(b2cOrders_1.b2c_orders.created_at, filters.fromDate),
        (0, drizzle_orm_1.lte)(b2cOrders_1.b2c_orders.created_at, filters.toDate),
    ];
    const b2bConditions = [
        (0, drizzle_orm_1.gte)(b2bOrders_1.b2b_orders.created_at, filters.fromDate),
        (0, drizzle_orm_1.lte)(b2bOrders_1.b2b_orders.created_at, filters.toDate),
    ];
    if (scope.userId) {
        b2cConditions.push((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.user_id, scope.userId));
        b2bConditions.push((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.user_id, scope.userId));
    }
    if (filters.courier) {
        b2cConditions.push((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.courier_partner, filters.courier));
        b2bConditions.push((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.courier_partner, filters.courier));
    }
    const [b2cRows, b2bRows] = await Promise.all([
        client_1.db
            .select({ order: b2cOrders_1.b2c_orders, companyInfo: userProfile_1.userProfiles.companyInfo, sellerEmail: users_1.users.email })
            .from(b2cOrders_1.b2c_orders)
            .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, b2cOrders_1.b2c_orders.user_id))
            .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, b2cOrders_1.b2c_orders.user_id))
            .where((0, drizzle_orm_1.and)(...b2cConditions))
            .orderBy((0, drizzle_orm_1.asc)(b2cOrders_1.b2c_orders.created_at)),
        client_1.db
            .select({ order: b2bOrders_1.b2b_orders, companyInfo: userProfile_1.userProfiles.companyInfo, sellerEmail: users_1.users.email })
            .from(b2bOrders_1.b2b_orders)
            .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(users_1.users.id, b2bOrders_1.b2b_orders.user_id))
            .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, b2bOrders_1.b2b_orders.user_id))
            .where((0, drizzle_orm_1.and)(...b2bConditions))
            .orderBy((0, drizzle_orm_1.asc)(b2bOrders_1.b2b_orders.created_at)),
    ]);
    const rows = [
        ...b2cRows.map((row) => ({
            shipmentType: 'B2C',
            order: row.order,
            sellerCompany: sellerCompanyName(row.companyInfo, row.sellerEmail),
            sellerEmail: text(row.sellerEmail),
        })),
        ...b2bRows.map((row) => ({
            shipmentType: 'B2B',
            order: row.order,
            sellerCompany: sellerCompanyName(row.companyInfo, row.sellerEmail),
            sellerEmail: text(row.sellerEmail),
        })),
    ];
    const company = text(filters.company).toLowerCase();
    return rows
        .filter((row) => !company || row.sellerCompany.toLowerCase() === company)
        .sort((a, b) => new Date(a.order.created_at || 0).getTime() - new Date(b.order.created_at || 0).getTime());
};
const getShipmentReportOptions = async (scope, filters) => {
    const rows = await loadReportOrders(scope, { ...filters, courier: undefined, company: undefined });
    return {
        couriers: Array.from(new Set(rows.map((row) => text(row.order.courier_partner)).filter(Boolean))).sort(),
        companies: Array.from(new Set(rows.map((row) => row.sellerCompany).filter(Boolean))).sort(),
        shipmentCount: rows.length,
    };
};
exports.getShipmentReportOptions = getShipmentReportOptions;
const commonHeaders = [
    'Shipment Type',
    'Order Number',
    'Order Date',
    'Shipment Created At',
    'Seller Company',
    'Seller Email',
    'Consignee Company',
    'AWB Number',
    'Courier',
    'Shipment Status',
    'Payment Mode',
    'Buyer Name',
    'Buyer Phone',
    'Origin Warehouse',
    'Destination City',
    'Destination State',
    'Destination Pincode',
    'Declared Weight (kg)',
    'Charged Weight (kg)',
    'Order Value',
];
const buildShipmentReportCsv = async (scope, filters) => {
    const rows = await loadReportOrders(scope, filters);
    if (rows.length > 50000) {
        throw new Error('This report contains more than 50,000 shipments. Please use a smaller date range.');
    }
    const withGst = filters.gstMode !== 'without';
    const chargeHeaders = withGst
        ? ['Shipping Charges Before GST', 'GST Rate (%)', 'GST Amount', 'Shipping Charges With GST']
        : ['Shipping Charges Without GST'];
    const csvRows = rows.map(({ shipmentType, order, sellerCompany, sellerEmail }) => {
        const isB2c = shipmentType === 'B2C';
        const chargeBeforeGst = isB2c
            ? (0, bookingWalletDebit_1.getBookingWalletDebitBaseAmount)({
                paymentType: order.order_type,
                freightCharges: order.freight_charges,
                otherCharges: order.other_charges,
                codCharges: order.cod_charges,
            })
            : amount(order.freight_charges);
        const gstPercent = isB2c ? amount(order.gst_percent) : 0;
        const gstAmount = isB2c ? amount(order.gst_amount) : 0;
        const chargeWithGst = isB2c
            ? (0, bookingWalletDebit_1.resolveGstInclusiveWalletDebit)({
                storedDebit: order.wallet_debit_amount,
                paymentType: order.order_type,
                freightCharges: order.freight_charges,
                otherCharges: order.other_charges,
                codCharges: order.cod_charges,
                gstPercent,
                gstAmount,
            })
            : chargeBeforeGst;
        const pickupDetails = order.pickup_details || {};
        const common = [
            shipmentType,
            order.order_number,
            order.order_date,
            isoDate(order.created_at),
            sellerCompany,
            sellerEmail,
            shipmentType === 'B2B' ? order.company_name : '',
            order.awb_number,
            order.courier_partner,
            order.order_status,
            order.order_type,
            order.buyer_name,
            order.buyer_phone,
            pickupDetails.warehouse_name || pickupDetails.name || '',
            order.city,
            order.state,
            order.pincode,
            weight(order.weight),
            weight(order.charged_weight || order.weight),
            money(order.order_amount),
        ];
        return withGst
            ? [...common, money(chargeBeforeGst), money(gstPercent), money(gstAmount), money(chargeWithGst)]
            : [...common, money(chargeBeforeGst)];
    });
    return {
        csv: (0, csv_1.buildCsv)([...commonHeaders, ...chargeHeaders], csvRows),
        count: rows.length,
    };
};
exports.buildShipmentReportCsv = buildShipmentReportCsv;
