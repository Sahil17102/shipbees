"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.indiaPostTrackingController = exports.indiaPostEventsController = exports.indiaPostLabelController = exports.indiaPostBookArticlesFileController = exports.indiaPostBookArticlesController = exports.indiaPostPincodeController = exports.businessParcelTariffController = exports.speedPostTariffController = exports.testIndiaPostCredentialsController = void 0;
const indiaPost_service_1 = require("../../models/services/couriers/indiaPost.service");
const service = () => new indiaPost_service_1.IndiaPostService();
const fail = (res, error) => {
    const status = Number(error?.statusCode || error?.status || 500);
    return res.status(status).json({ success: false, message: error?.message || 'India Post request failed' });
};
const testIndiaPostCredentialsController = async (_req, res) => {
    try {
        const result = await service().login();
        return res.json({
            success: true,
            message: 'India Post credentials are working',
            tokenIssued: Boolean(result.accessToken),
            expiresIn: result.response?.data?.expires_in ?? null,
            refreshExpiresIn: result.response?.data?.refresh_expires_in ?? null,
        });
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.testIndiaPostCredentialsController = testIndiaPostCredentialsController;
const speedPostTariffController = async (req, res) => {
    try {
        return res.json({ success: true, data: await service().speedPostTariff(req.body) });
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.speedPostTariffController = speedPostTariffController;
const businessParcelTariffController = async (req, res) => {
    try {
        return res.json({ success: true, data: await service().businessParcelTariff(req.body) });
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.businessParcelTariffController = businessParcelTariffController;
const indiaPostPincodeController = async (req, res) => {
    try {
        return res.json({
            success: true,
            data: await service().searchPincode(String(req.query.pincode || ''), Number(req.query.limit || 50)),
        });
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.indiaPostPincodeController = indiaPostPincodeController;
const indiaPostBookArticlesController = async (req, res) => {
    try {
        const api = service();
        return res.json({
            success: true,
            data: await api.bookArticles(req.body?.articles, String(req.params.customId || api.customerId)),
        });
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.indiaPostBookArticlesController = indiaPostBookArticlesController;
const indiaPostBookArticlesFileController = async (req, res) => {
    const file = req.file;
    if (!file?.buffer)
        return res.status(400).json({ success: false, message: 'JSON file is required' });
    try {
        const api = service();
        return res.json({
            success: true,
            data: await api.bookArticlesFileBuffer(file.buffer, file.originalname, String(req.params.customId || api.customerId)),
        });
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.indiaPostBookArticlesFileController = indiaPostBookArticlesFileController;
const indiaPostLabelController = async (req, res) => {
    try {
        const pdf = await service().generateDomesticLabel(req.body);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="indiapost-${String(req.body?.barcode_no || 'label')}.pdf"`);
        return res.send(Buffer.from(pdf));
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.indiaPostLabelController = indiaPostLabelController;
const indiaPostEventsController = async (req, res) => {
    try {
        const xml = await service().downloadEvents({
            customerId: req.body?.customerId,
            eventCode: req.body?.eventCode,
            eventDate: req.body?.eventDate,
        });
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        return res.send(xml);
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.indiaPostEventsController = indiaPostEventsController;
const indiaPostTrackingController = async (req, res) => {
    try {
        return res.json({ success: true, data: await service().trackBulk(req.body?.bulk || []) });
    }
    catch (error) {
        return fail(res, error);
    }
};
exports.indiaPostTrackingController = indiaPostTrackingController;
