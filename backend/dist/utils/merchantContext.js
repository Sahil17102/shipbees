"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMerchantUserId = exports.getMerchantUserIdFromRequest = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const employees_1 = require("../models/schema/employees");
const getMerchantUserIdFromRequest = (req) => {
    const merchantUserId = String(req?.merchantUserId || req?.user?.merchantSub || req?.userId || req?.user?.sub || '').trim();
    return merchantUserId;
};
exports.getMerchantUserIdFromRequest = getMerchantUserIdFromRequest;
const resolveMerchantUserId = async (userId) => {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId)
        return normalizedUserId;
    const [employeeRecord] = await client_1.db
        .select({ adminId: employees_1.employees.adminId })
        .from(employees_1.employees)
        .where((0, drizzle_orm_1.eq)(employees_1.employees.userId, normalizedUserId))
        .limit(1);
    return employeeRecord?.adminId || normalizedUserId;
};
exports.resolveMerchantUserId = resolveMerchantUserId;
