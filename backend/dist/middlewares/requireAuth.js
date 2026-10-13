"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const employees_1 = require("../models/schema/employees");
const stores_1 = require("../models/schema/stores");
const shopify_service_1 = require("../models/services/shopify.service");
const jwt_1 = require("../utils/jwt");
const readHeader = (value) => Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
const readBearerToken = (value) => value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : '';
const normalizeModuleAccess = (moduleAccess) => {
    if (!moduleAccess)
        return {};
    if (typeof moduleAccess === 'string') {
        try {
            return JSON.parse(moduleAccess);
        }
        catch {
            return {};
        }
    }
    return typeof moduleAccess === 'object' ? moduleAccess : {};
};
const getEmployeeModulesForRequest = (originalUrl) => {
    const pathname = originalUrl.split('?')[0] || '';
    if (pathname.startsWith('/api/profile') ||
        pathname.startsWith('/api/user/user-info') ||
        pathname.startsWith('/api/auth') ||
        pathname.startsWith('/api/notifications')) {
        return [];
    }
    if (pathname.startsWith('/api/dashboard'))
        return ['dashboard', 'overview'];
    if (pathname.startsWith('/api/orders') || pathname.startsWith('/api/shipments/cancel')) {
        return ['orders'];
    }
    if (pathname.startsWith('/api/ndr') ||
        pathname.startsWith('/api/rto') ||
        pathname.startsWith('/api/returns')) {
        return ['exceptions'];
    }
    if (pathname.startsWith('/api/payments') ||
        pathname.startsWith('/api/wallet') ||
        pathname.startsWith('/api/billing') ||
        pathname.startsWith('/api/invoices') ||
        pathname.startsWith('/api/cod-remittance')) {
        return ['finance'];
    }
    if (pathname.startsWith('/api/weight-reconciliation'))
        return ['audits'];
    if (pathname.startsWith('/api/couriers') ||
        pathname.startsWith('/api/courier') ||
        pathname.startsWith('/api/serviceability') ||
        pathname.startsWith('/api/plans')) {
        return ['utilities', 'orders', 'workspace'];
    }
    if (pathname.startsWith('/api/reports'))
        return ['reports'];
    if (pathname.startsWith('/api/integrations') || pathname.startsWith('/api/v1'))
        return ['channels'];
    if (pathname.startsWith('/api/user-management') ||
        pathname.startsWith('/api/label-preference') ||
        pathname.startsWith('/api/invoice-preferences') ||
        pathname.startsWith('/api/bank-account')) {
        return ['workspace'];
    }
    if (pathname.startsWith('/api/pickup-addresses') ||
        pathname.startsWith('/api/pickup') ||
        pathname.startsWith('/api/uploads')) {
        return ['workspace', 'orders'];
    }
    if (pathname.startsWith('/api/support'))
        return ['support'];
    return [];
};
const canAccessEmployeeModules = (moduleAccess, modules) => {
    if (!modules.length)
        return true;
    const access = normalizeModuleAccess(moduleAccess);
    const configuredModules = access.modules;
    if (!configuredModules || typeof configuredModules !== 'object')
        return true;
    return modules.some((module) => configuredModules[module] === true);
};
const requireAuth = async (req, res, next) => {
    const authenticatedRequest = req;
    const authorization = readHeader(req.headers.authorization);
    const shiprayAccessToken = readHeader(req.headers['x-shipray-access-token']);
    const token = shiprayAccessToken || readBearerToken(authorization);
    if (!token) {
        return res.status(401).json({ error: 'Missing token' });
    }
    let decoded;
    try {
        decoded = await (0, jwt_1.verifyAccessToken)(token);
        if (!decoded || typeof decoded !== 'object') {
            return res.status(401).json({ error: 'Invalid token payload' });
        }
    }
    catch (error) {
        if (error?.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                code: 'TOKEN_EXPIRED',
            });
        }
        console.error('Token verification error:', error?.name || error?.message || error);
        return res.status(401).json({
            error: 'Token invalid or expired',
            code: error?.name || 'TOKEN_INVALID',
        });
    }
    if (shiprayAccessToken) {
        const shopifySessionToken = readBearerToken(authorization);
        if (!shopifySessionToken) {
            return res.status(401).set('Cache-Control', 'no-store').json({
                error: 'Shopify session token is required',
                code: 'SHOPIFY_SESSION_MISSING',
            });
        }
        let shop;
        try {
            const shopifySession = (0, shopify_service_1.verifyShopifySessionToken)(shopifySessionToken);
            shop = (0, shopify_service_1.normalizeShopifyDomain)(new URL(shopifySession.dest).hostname);
        }
        catch {
            return res.status(401).set('Cache-Control', 'no-store').json({
                error: 'Shopify session expired or is invalid',
                code: 'SHOPIFY_SESSION_INVALID',
            });
        }
        let binding;
        try {
            const bindings = await client_1.db
                .select({ id: stores_1.stores.id })
                .from(stores_1.stores)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, decoded.sub), (0, drizzle_orm_1.eq)(stores_1.stores.domain, shop)))
                .limit(1);
            binding = bindings[0];
        }
        catch (error) {
            console.error('Shopify session binding check failed:', error?.message || error);
            return res.status(503).json({
                error: 'Unable to verify the Shopify session right now',
                code: 'SHOPIFY_SESSION_CHECK_UNAVAILABLE',
            });
        }
        if (!binding) {
            return res.status(403).set('Cache-Control', 'no-store').json({
                error: 'Shopify store is not connected to this account',
                code: 'SHOPIFY_SESSION_STORE_MISMATCH',
            });
        }
        authenticatedRequest.shopifySession = { shop };
    }
    const actorUserId = decoded.sub;
    let merchantUserId = decoded.sub;
    let employeeContext = null;
    const [employeeRecord] = await client_1.db
        .select({
        id: employees_1.employees.id,
        adminId: employees_1.employees.adminId,
        role: employees_1.employees.role,
        isActive: employees_1.employees.isActive,
        moduleAccess: employees_1.employees.moduleAccess,
    })
        .from(employees_1.employees)
        .where((0, drizzle_orm_1.eq)(employees_1.employees.userId, decoded.sub))
        .limit(1);
    if (employeeRecord || decoded.role === 'employee') {
        if (!employeeRecord) {
            return res.status(403).json({
                error: 'Employee access is not configured for this account',
                code: 'EMPLOYEE_ACCESS_MISSING',
            });
        }
        if (!employeeRecord.isActive) {
            return res.status(403).json({
                error: 'Your account is temporarily suspended by your administrator.',
                code: 'EMPLOYEE_INACTIVE',
            });
        }
        const requiredModules = getEmployeeModulesForRequest(req.originalUrl || req.url);
        if (!canAccessEmployeeModules(employeeRecord.moduleAccess, requiredModules)) {
            return res.status(403).json({
                error: 'You do not have access to this module',
                code: 'EMPLOYEE_MODULE_FORBIDDEN',
                requiredModules,
            });
        }
        merchantUserId = employeeRecord.adminId;
        employeeContext = employeeRecord;
    }
    authenticatedRequest.actorUserId = actorUserId;
    authenticatedRequest.merchantUserId = merchantUserId;
    authenticatedRequest.userId = merchantUserId;
    authenticatedRequest.user = {
        ...decoded,
        actorSub: actorUserId,
        merchantSub: merchantUserId,
        sub: merchantUserId,
        employeeId: employeeContext?.id ?? null,
        employeeRole: employeeContext?.role ?? null,
        moduleAccess: employeeContext?.moduleAccess ?? null,
    };
    next();
};
exports.requireAuth = requireAuth;
