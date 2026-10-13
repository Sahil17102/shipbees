"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.performanceController = exports.createActivityController = exports.listActivitiesController = exports.updateTaskController = exports.createTaskController = exports.listTasksController = exports.endAssignmentController = exports.assignSellerController = exports.listAssignmentsController = exports.sellerOrdersController = exports.sellerDetailController = exports.listSellersController = exports.updateStaffController = exports.createStaffController = exports.listStaffController = exports.updateRoleController = exports.createRoleController = exports.listRolesController = exports.dashboardController = exports.sessionController = exports.loadAdminCrmAccess = void 0;
const adminCrm_service_1 = require("../../models/services/adminCrm.service");
const adminAccess_1 = require("../../utils/adminAccess");
const classes_1 = require("../../utils/classes");
const actorId = (req) => {
    const id = String(req.user?.sub || '').trim();
    if (!id)
        throw new classes_1.HttpError(401, 'Unauthorized');
    return id;
};
const access = (req) => {
    if (!req.adminAccess)
        throw new classes_1.HttpError(401, 'Admin access context is missing');
    return req.adminAccess;
};
const requirePermission = (req, module, level = 'view') => {
    if (!(0, adminAccess_1.hasAdminPermission)(access(req), module, level)) {
        throw new classes_1.HttpError(403, `Permission required: ${module}.${level}`);
    }
};
const requireSuperAdmin = (req) => {
    if (access(req).actorType !== 'admin') {
        throw new classes_1.HttpError(403, 'Only a super admin can change staff accounts or access policies');
    }
};
const sendError = (res, error) => {
    console.error('[AdminCRM]', error);
    const status = Number(error?.statusCode || error?.status || 500);
    return res.status(Number.isFinite(status) ? status : 500).json({
        success: false,
        message: error?.message || 'CRM operation failed',
    });
};
const loadAdminCrmAccess = async (req, res, next) => {
    try {
        const context = await (0, adminAccess_1.resolveAdminAccess)(actorId(req));
        if (!context)
            return res.status(403).json({ success: false, message: 'Admin access required' });
        req.adminAccess = context;
        return next();
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.loadAdminCrmAccess = loadAdminCrmAccess;
const sessionController = async (req, res) => {
    try {
        return res.json({ success: true, data: await (0, adminCrm_service_1.getAdminCrmSession)(access(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.sessionController = sessionController;
const dashboardController = async (req, res) => {
    try {
        return res.json({ success: true, data: await (0, adminCrm_service_1.getCrmDashboard)(access(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.dashboardController = dashboardController;
const listRolesController = async (req, res) => {
    try {
        requirePermission(req, 'employees', 'view');
        return res.json({ success: true, data: await (0, adminCrm_service_1.listAdminRoles)() });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listRolesController = listRolesController;
const createRoleController = async (req, res) => {
    try {
        requirePermission(req, 'employees', 'manage');
        requireSuperAdmin(req);
        return res.status(201).json({ success: true, data: await (0, adminCrm_service_1.createAdminRole)(req.body, actorId(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.createRoleController = createRoleController;
const updateRoleController = async (req, res) => {
    try {
        requirePermission(req, 'employees', 'manage');
        requireSuperAdmin(req);
        return res.json({ success: true, data: await (0, adminCrm_service_1.updateAdminRole)(req.params.id, req.body) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.updateRoleController = updateRoleController;
const listStaffController = async (req, res) => {
    try {
        requirePermission(req, 'employees', 'view');
        return res.json({ success: true, ...(await (0, adminCrm_service_1.listAdminStaff)(req.query, access(req))) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listStaffController = listStaffController;
const createStaffController = async (req, res) => {
    try {
        requirePermission(req, 'employees', 'manage');
        requireSuperAdmin(req);
        return res.status(201).json({ success: true, data: await (0, adminCrm_service_1.createAdminStaff)(req.body, actorId(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.createStaffController = createStaffController;
const updateStaffController = async (req, res) => {
    try {
        requirePermission(req, 'employees', 'manage');
        requireSuperAdmin(req);
        return res.json({ success: true, data: await (0, adminCrm_service_1.updateAdminStaff)(req.params.id, req.body, actorId(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.updateStaffController = updateStaffController;
const listSellersController = async (req, res) => {
    try {
        return res.json({ success: true, ...(await (0, adminCrm_service_1.listCrmSellers)(access(req), req.query)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listSellersController = listSellersController;
const sellerDetailController = async (req, res) => {
    try {
        return res.json({ success: true, data: await (0, adminCrm_service_1.getCrmSellerDetail)(access(req), req.params.id) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.sellerDetailController = sellerDetailController;
const sellerOrdersController = async (req, res) => {
    try {
        return res.json({ success: true, ...(await (0, adminCrm_service_1.getCrmSellerOrders)(access(req), req.params.id, req.query)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.sellerOrdersController = sellerOrdersController;
const listAssignmentsController = async (req, res) => {
    try {
        requirePermission(req, 'assignments', 'view');
        return res.json({ success: true, ...(await (0, adminCrm_service_1.listAssignments)(req.query, access(req))) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listAssignmentsController = listAssignmentsController;
const assignSellerController = async (req, res) => {
    try {
        return res.status(201).json({ success: true, data: await (0, adminCrm_service_1.assignSeller)(access(req), req.body, actorId(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.assignSellerController = assignSellerController;
const endAssignmentController = async (req, res) => {
    try {
        requirePermission(req, 'assignments', 'manage');
        return res.json({ success: true, data: await (0, adminCrm_service_1.endAssignment)(access(req), req.params.id, actorId(req), req.body?.reason) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.endAssignmentController = endAssignmentController;
const listTasksController = async (req, res) => {
    try {
        return res.json({ success: true, ...(await (0, adminCrm_service_1.listCrmTasks)(access(req), req.query)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listTasksController = listTasksController;
const createTaskController = async (req, res) => {
    try {
        return res.status(201).json({ success: true, data: await (0, adminCrm_service_1.createCrmTask)(access(req), req.body, actorId(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.createTaskController = createTaskController;
const updateTaskController = async (req, res) => {
    try {
        return res.json({ success: true, data: await (0, adminCrm_service_1.updateCrmTask)(access(req), req.params.id, req.body, actorId(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.updateTaskController = updateTaskController;
const listActivitiesController = async (req, res) => {
    try {
        return res.json({ success: true, ...(await (0, adminCrm_service_1.listCrmActivities)(access(req), req.query)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listActivitiesController = listActivitiesController;
const createActivityController = async (req, res) => {
    try {
        return res.status(201).json({ success: true, data: await (0, adminCrm_service_1.addCrmActivity)(access(req), req.body, actorId(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.createActivityController = createActivityController;
const performanceController = async (req, res) => {
    try {
        return res.json({ success: true, data: await (0, adminCrm_service_1.getTeamPerformance)(access(req)) });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.performanceController = performanceController;
