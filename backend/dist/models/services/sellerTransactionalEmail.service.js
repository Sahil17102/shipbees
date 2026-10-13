"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSellerWalletRechargeEmail = exports.sendSellerCodSettledEmail = exports.sendSellerOrderEventEmail = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const emailSender_1 = require("../../utils/emailSender");
const sellerIdentity = async (userId) => {
    const [account] = await client_1.db
        .select({ email: users_1.users.email, companyInfo: userProfile_1.userProfiles.companyInfo })
        .from(users_1.users)
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, users_1.users.id))
        .where((0, drizzle_orm_1.eq)(users_1.users.id, userId))
        .limit(1);
    const company = account?.companyInfo;
    return {
        email: account?.email || null,
        name: company?.contactPerson || company?.brandName || company?.businessName || 'Seller',
    };
};
const sendSellerOrderEventEmail = async (userId, eventType, data) => {
    const seller = await sellerIdentity(userId);
    if (!seller.email)
        return;
    const options = {
        to: seller.email,
        sellerName: seller.name,
        orderNumber: String(data.order_number || data.orderNumber || data.order_id || 'Order'),
        awbNumber: data.awb_number || data.awbNumber,
        courier: data.courier_partner || data.courierPartner,
        paymentType: data.payment_type || data.paymentType,
        occurredAt: data.delivered_at || data.updated_at || data.created_at || new Date(),
    };
    if (eventType === 'order.created')
        await (0, emailSender_1.sendOrderCreatedEmail)(options);
    else
        await (0, emailSender_1.sendOrderDeliveredEmail)(options);
};
exports.sendSellerOrderEventEmail = sendSellerOrderEventEmail;
const sendSellerCodSettledEmail = async (params) => {
    const seller = await sellerIdentity(params.userId);
    if (!seller.email)
        return;
    await (0, emailSender_1.sendCodSettledEmail)({ ...params, to: seller.email, sellerName: seller.name });
};
exports.sendSellerCodSettledEmail = sendSellerCodSettledEmail;
const sendSellerWalletRechargeEmail = async (params) => {
    const seller = await sellerIdentity(params.userId);
    if (!seller.email)
        return;
    await (0, emailSender_1.sendWalletRechargeEmail)({ ...params, to: seller.email, sellerName: seller.name });
};
exports.sendSellerWalletRechargeEmail = sendSellerWalletRechargeEmail;
