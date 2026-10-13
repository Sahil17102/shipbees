"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.releaseManualProviderBookingController = exports.reconcileManualProviderAwbController = exports.rebookManualShipmentController = exports.getManualProviderOptionsController = exports.addManualTrackingEventController = exports.setManualShipmentModeController = exports.getManualShipmentController = exports.getManualShipmentStatsController = exports.listManualShipmentsController = exports.removeManualCourierPincodeController = exports.importManualCourierPincodesController = exports.replaceManualCourierPincodesController = exports.updateManualCourierController = exports.createManualCourierController = exports.getManualCourierController = exports.listManualCouriersController = void 0;
const papaparse_1 = __importDefault(require("papaparse"));
const manualCourier_service_1 = require("../../models/services/manualCourier.service");
const shiprocket_service_1 = require("../../models/services/shiprocket.service");
const classes_1 = require("../../utils/classes");
const getAdminUserId = (req) => {
    const userId = String(req.user?.sub || '').trim();
    if (!userId)
        throw new classes_1.HttpError(401, 'Unauthorized');
    return userId;
};
const sendError = (res, error) => {
    console.error('[ManualCourierAdmin]', error);
    const status = Number(error?.statusCode || error?.status || 500);
    return res.status(Number.isFinite(status) ? status : 500).json({
        success: false,
        message: error?.message || 'Manual courier operation failed',
    });
};
const parsePincodeInput = (value) => {
    if (Array.isArray(value))
        return value;
    if (typeof value !== 'string')
        return [];
    return value
        .split(/[\s,;\r\n]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
};
const parseCsvPincodes = (file) => {
    if (!file?.buffer?.length)
        throw new classes_1.HttpError(400, 'CSV file is required');
    const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const parsed = papaparse_1.default.parse(text, {
        skipEmptyLines: true,
    });
    if (parsed.errors.length && !parsed.data.length) {
        throw new classes_1.HttpError(400, parsed.errors[0]?.message || 'Invalid CSV file');
    }
    return parsed.data.flatMap((row) => row);
};
const listManualCouriersController = async (_req, res) => {
    try {
        return res.json({ success: true, data: await (0, manualCourier_service_1.listManualCouriers)() });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listManualCouriersController = listManualCouriersController;
const getManualCourierController = async (req, res) => {
    try {
        return res.json({
            success: true,
            data: await (0, manualCourier_service_1.getManualCourier)(req.params.id, {
                pincodePage: Number(req.query.pincodePage || 1),
                pincodeLimit: Number(req.query.pincodeLimit || 100),
                pincodeSearch: req.query.pincodeSearch,
            }),
        });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.getManualCourierController = getManualCourierController;
const createManualCourierController = async (req, res) => {
    try {
        const data = await (0, manualCourier_service_1.createManualCourier)({
            ...req.body,
            pincodes: parsePincodeInput(req.body?.pincodes),
        }, getAdminUserId(req));
        return res.status(201).json({ success: true, data });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.createManualCourierController = createManualCourierController;
const updateManualCourierController = async (req, res) => {
    try {
        const data = await (0, manualCourier_service_1.updateManualCourier)(req.params.id, req.body || {}, getAdminUserId(req));
        return res.json({ success: true, data });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.updateManualCourierController = updateManualCourierController;
const replaceManualCourierPincodesController = async (req, res) => {
    try {
        const values = parsePincodeInput(req.body?.pincodes);
        const data = await (0, manualCourier_service_1.replaceManualCourierPincodes)(req.params.id, values);
        return res.json({ success: true, data });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.replaceManualCourierPincodesController = replaceManualCourierPincodesController;
const importManualCourierPincodesController = async (req, res) => {
    try {
        const values = parseCsvPincodes(req.file);
        const replace = String(req.body?.mode || '').toLowerCase() === 'replace';
        const data = replace
            ? await (0, manualCourier_service_1.replaceManualCourierPincodes)(req.params.id, values)
            : await (0, manualCourier_service_1.appendManualCourierPincodes)(req.params.id, values);
        return res.json({
            success: true,
            message: `${data.count} pincodes ${replace ? 'replaced' : 'imported'}`,
            data,
        });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.importManualCourierPincodesController = importManualCourierPincodesController;
const removeManualCourierPincodeController = async (req, res) => {
    try {
        await (0, manualCourier_service_1.removeManualCourierPincode)(req.params.id, req.params.pincode);
        return res.json({ success: true });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.removeManualCourierPincodeController = removeManualCourierPincodeController;
const listManualShipmentsController = async (req, res) => {
    try {
        const data = await (0, manualCourier_service_1.listManualShipmentsForAdmin)({
            page: Number(req.query.page || 1),
            limit: Number(req.query.limit || 20),
            search: req.query.search,
            status: req.query.status,
            courierId: req.query.courierId,
            fulfilmentMode: req.query.fulfilmentMode,
        });
        return res.json({ success: true, ...data });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.listManualShipmentsController = listManualShipmentsController;
const getManualShipmentStatsController = async (_req, res) => {
    try {
        return res.json({ success: true, data: await (0, manualCourier_service_1.getManualShipmentStats)() });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.getManualShipmentStatsController = getManualShipmentStatsController;
const getManualShipmentController = async (req, res) => {
    try {
        return res.json({
            success: true,
            data: await (0, manualCourier_service_1.getManualShipmentAdminDetail)(req.params.id),
        });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.getManualShipmentController = getManualShipmentController;
const setManualShipmentModeController = async (req, res) => {
    try {
        await (0, manualCourier_service_1.setManualFulfilmentMode)(req.params.id, getAdminUserId(req));
        return res.json({ success: true, message: 'Shipment assigned for manual fulfilment' });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.setManualShipmentModeController = setManualShipmentModeController;
const addManualTrackingEventController = async (req, res) => {
    try {
        const data = await (0, manualCourier_service_1.addManualTrackingEvent)(req.params.id, req.body || {}, getAdminUserId(req));
        return res.status(201).json({ success: true, data });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.addManualTrackingEventController = addManualTrackingEventController;
const getManualProviderOptionsController = async (req, res) => {
    try {
        const data = await (0, manualCourier_service_1.getProviderOptionsForManualShipment)(req.params.id, req.body || {});
        return res.json({ success: true, data });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.getManualProviderOptionsController = getManualProviderOptionsController;
const rebookManualShipmentController = async (req, res) => {
    let attempt;
    try {
        const adminUserId = getAdminUserId(req);
        attempt = await (0, manualCourier_service_1.startProviderBookingAttempt)(req.params.id, req.body || {}, adminUserId);
        if (attempt.completed) {
            return res.json({
                success: true,
                message: 'Provider AWB was already linked for this request',
                data: { providerLeg: attempt.attempt },
            });
        }
        const result = await (0, shiprocket_service_1.createB2CShipmentService)(attempt.providerParams, attempt.detail.shipment.userId, false, {
            manualRebookShipmentId: attempt.detail.shipment.id,
            manualRebookAttemptId: attempt.attempt.id,
        });
        return res.json({
            success: true,
            message: 'Provider AWB linked to the customer shipment',
            data: result,
        });
    }
    catch (error) {
        if (attempt) {
            await (0, manualCourier_service_1.failProviderBookingAttempt)(attempt.detail.shipment.id, attempt.attempt.id, error).catch((markError) => {
                console.error('[ManualCourierAdmin] Failed to mark provider attempt', markError);
            });
        }
        return sendError(res, error);
    }
};
exports.rebookManualShipmentController = rebookManualShipmentController;
const reconcileManualProviderAwbController = async (req, res) => {
    try {
        const data = await (0, manualCourier_service_1.attachProviderAwbForReconciliation)(req.params.id, req.body || {}, getAdminUserId(req));
        return res.status(201).json({
            success: true,
            message: 'Provider AWB linked for reconciliation',
            data,
        });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.reconcileManualProviderAwbController = reconcileManualProviderAwbController;
const releaseManualProviderBookingController = async (req, res) => {
    try {
        const data = await (0, manualCourier_service_1.releaseProviderBookingAttempt)(req.params.id, getAdminUserId(req), req.body?.reason);
        return res.json({
            success: true,
            message: 'Provider booking state released for review',
            data,
        });
    }
    catch (error) {
        return sendError(res, error);
    }
};
exports.releaseManualProviderBookingController = releaseManualProviderBookingController;
