"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerShadowfaxWebhookTestController = exports.updateShopifyOAuthCredentialsController = exports.getShopifyOAuthCredentialsController = exports.getDeveloperLiveLogsController = exports.retryDeveloperManifestController = exports.updateDeveloperIssueStateController = exports.getDeveloperErrorLogsController = void 0;
const adminDeveloper_service_1 = require("../../models/services/adminDeveloper.service");
const adminLiveLogs_service_1 = require("../../models/services/adminLiveLogs.service");
const shopifyOAuthCredentials_service_1 = require("../../models/services/shopifyOAuthCredentials.service");
const webhookProcessor_1 = require("../../models/services/webhookProcessor");
const getDeveloperErrorLogsController = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const filters = {
            source: req.query.source,
            status: req.query.status,
            priority: req.query.priority,
            search: req.query.search,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            courier: req.query.courier,
            merchant: req.query.merchant,
            issueOwner: req.query.issueOwner,
            actionRequired: req.query.actionRequired,
            actionable: req.query.actionable,
            rootCause: req.query.rootCause,
        };
        const result = await (0, adminDeveloper_service_1.getDeveloperErrorLogsService)({
            page,
            limit,
            filters,
        });
        return res.status(200).json({
            success: true,
            ...result,
        });
    }
    catch (error) {
        console.error('Error fetching developer logs:', error?.message || error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch developer logs',
        });
    }
};
exports.getDeveloperErrorLogsController = getDeveloperErrorLogsController;
const updateDeveloperIssueStateController = async (req, res) => {
    try {
        const adminUserId = req.user?.sub;
        const issueKey = decodeURIComponent(String(req.params.issueKey || ''));
        const result = await (0, adminDeveloper_service_1.updateDeveloperIssueStateService)({
            issueKey,
            adminUserId,
            status: req.body?.status,
            priority: req.body?.priority,
            assignToMe: req.body?.assignToMe === true,
            clearOwner: req.body?.clearOwner === true,
            markAlertSeen: req.body?.markAlertSeen === true,
        });
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error updating developer issue:', error?.message || error);
        return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            message: error?.message || 'Failed to update developer issue',
        });
    }
};
exports.updateDeveloperIssueStateController = updateDeveloperIssueStateController;
const retryDeveloperManifestController = async (req, res) => {
    try {
        const adminUserId = req.user?.sub;
        const orderId = String(req.body?.orderId || '').trim();
        const issueKey = req.body?.issueKey ? String(req.body.issueKey) : undefined;
        const result = await (0, adminDeveloper_service_1.retryFailedManifestServiceForAdmin)({ orderId, issueKey, adminUserId });
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error retrying manifest from developer tab:', error?.message || error);
        return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            message: error?.message || 'Failed to retry manifest',
        });
    }
};
exports.retryDeveloperManifestController = retryDeveloperManifestController;
const getDeveloperLiveLogsController = async (req, res) => {
    try {
        const requestedLimit = parseInt(String(req.query.limit || '1000'), 10);
        const result = await (0, adminLiveLogs_service_1.getDeveloperLiveLogsService)({ limit: requestedLimit });
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error fetching live developer logs:', error?.message || error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch live developer logs',
        });
    }
};
exports.getDeveloperLiveLogsController = getDeveloperLiveLogsController;
const getShopifyOAuthCredentialsController = async (_req, res) => {
    try {
        const result = await (0, shopifyOAuthCredentials_service_1.getShopifyOAuthCredentialsStatusService)();
        return res.status(200).json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('Error fetching Shopify OAuth credentials status:', error?.message || error);
        return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            message: error?.message || 'Failed to fetch Shopify OAuth credentials status',
        });
    }
};
exports.getShopifyOAuthCredentialsController = getShopifyOAuthCredentialsController;
const updateShopifyOAuthCredentialsController = async (req, res) => {
    try {
        const result = await (0, shopifyOAuthCredentials_service_1.updateShopifyOAuthCredentialsService)({
            clientId: req.body?.clientId ?? req.body?.SHOPIFY_CLIENT_ID,
            clientSecret: req.body?.clientSecret ?? req.body?.SHOPIFY_CLIENT_SECRET,
            adminUserId: req.user?.sub,
        });
        return res.status(200).json({
            success: true,
            message: 'Shopify OAuth credentials updated successfully',
            data: result,
        });
    }
    catch (error) {
        console.error('Error updating Shopify OAuth credentials:', error?.message || error);
        return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            message: error?.message || 'Failed to update Shopify OAuth credentials',
        });
    }
};
exports.updateShopifyOAuthCredentialsController = updateShopifyOAuthCredentialsController;
const buildShadowfaxWebhookTemplate = ({ template, awb, orderRef, remarks, location, chargedWeight, actualWeight, volumetricWeight, }) => {
    const eventTime = new Date().toISOString();
    const resolvedAwb = String(awb || '').trim() || 'SFX-TEST-AWB';
    const resolvedOrderRef = String(orderRef || '').trim() || 'SFX-TEST-ORDER';
    const basePayload = {
        awb_number: resolvedAwb,
        order_id: resolvedOrderRef,
        client_order_id: resolvedOrderRef,
        current_location: location || 'Developer Test Console',
        message: remarks || 'Developer-triggered Shadowfax webhook test',
        event_time: eventTime,
        event_timestamp: eventTime,
    };
    if (chargedWeight !== undefined && chargedWeight !== null && chargedWeight !== '') {
        basePayload.chargeable_weight = Number(chargedWeight);
    }
    if (actualWeight !== undefined && actualWeight !== null && actualWeight !== '') {
        basePayload.actual_weight = Number(actualWeight);
    }
    if (volumetricWeight !== undefined && volumetricWeight !== null && volumetricWeight !== '') {
        basePayload.volumetric_weight = Number(volumetricWeight);
    }
    switch (String(template || 'forward_in_transit')) {
        case 'forward_delivered':
            return {
                ...basePayload,
                event: 'delivered',
                status: 'delivered',
            };
        case 'forward_ndr':
            return {
                ...basePayload,
                event: 'nc',
                status: 'nc',
                message: remarks || 'Customer not contactable',
            };
        case 'forward_rto':
            return {
                ...basePayload,
                event: 'rts',
                status: 'rts',
                message: remarks || 'Return to shipper initiated',
            };
        case 'reverse_pickup':
            return {
                ...basePayload,
                awb_number: String(awb || '').trim() || 'R-TEST-REQUEST',
                request_id: String(awb || '').trim() || 'R-TEST-REQUEST',
                client_request_id: String(awb || '').trim() || 'R-TEST-REQUEST',
                event: 'picked',
                status: 'picked',
                message: remarks || 'Reverse pickup completed',
            };
        case 'weight_discrepancy':
            return {
                ...basePayload,
                event: 'recd_at_fwd_hub',
                status: 'recd_at_fwd_hub',
                chargeable_weight: Number(chargedWeight ?? 2.5),
                actual_weight: Number(actualWeight ?? 2.2),
                volumetric_weight: Number(volumetricWeight ?? 2.4),
                weight_remarks: remarks || 'Weight updated at hub',
                weight_proof_url: 'https://example.com/shadowfax/weight-proof/test-slip.jpg',
            };
        case 'forward_in_transit':
        default:
            return {
                ...basePayload,
                event: 'recd_at_fwd_hub',
                status: 'recd_at_fwd_hub',
            };
    }
};
const triggerShadowfaxWebhookTestController = async (req, res) => {
    try {
        const { template, awb, orderRef, remarks, location, chargedWeight, actualWeight, volumetricWeight, payload, } = req.body || {};
        let resolvedPayload;
        if (payload) {
            resolvedPayload =
                typeof payload === 'string'
                    ? JSON.parse(payload)
                    : payload;
        }
        else {
            const hasLookupReference = [awb, orderRef].some((value) => String(value || '').trim());
            if (!hasLookupReference) {
                return res.status(400).json({
                    success: false,
                    message: 'Provide a real Shadowfax AWB/request ID or order reference to test.',
                });
            }
            resolvedPayload = buildShadowfaxWebhookTemplate({
                template,
                awb,
                orderRef,
                remarks,
                location,
                chargedWeight: chargedWeight !== undefined && chargedWeight !== null && String(chargedWeight) !== ''
                    ? Number(chargedWeight)
                    : undefined,
                actualWeight: actualWeight !== undefined && actualWeight !== null && String(actualWeight) !== ''
                    ? Number(actualWeight)
                    : undefined,
                volumetricWeight: volumetricWeight !== undefined &&
                    volumetricWeight !== null &&
                    String(volumetricWeight) !== ''
                    ? Number(volumetricWeight)
                    : undefined,
            });
        }
        console.log('🧪 Admin-triggered Shadowfax webhook test', {
            adminUserId: req.user?.sub || null,
            template: template || 'custom',
            payload: resolvedPayload,
        });
        const result = await (0, webhookProcessor_1.processShadowfaxWebhook)(resolvedPayload);
        if (!result?.success) {
            const reason = result?.reason || 'unknown';
            const statusCode = reason === 'order_not_found'
                ? 404
                : reason === 'missing_awb'
                    ? 400
                    : 422;
            const message = reason === 'order_not_found'
                ? 'No local Shadowfax order was found for the supplied AWB/request ID or order reference.'
                : reason === 'missing_awb'
                    ? 'The Shadowfax test payload is missing an AWB/request identifier.'
                    : 'Shadowfax webhook test was not applied.';
            return res.status(statusCode).json({
                success: false,
                message,
                data: {
                    template: template || 'custom',
                    payload: resolvedPayload,
                    result,
                },
            });
        }
        return res.status(200).json({
            success: true,
            data: {
                template: template || 'custom',
                payload: resolvedPayload,
                result,
            },
        });
    }
    catch (error) {
        console.error('Error triggering Shadowfax webhook test:', error?.message || error);
        return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
            success: false,
            message: error?.message || 'Failed to trigger Shadowfax webhook test',
        });
    }
};
exports.triggerShadowfaxWebhookTestController = triggerShadowfaxWebhookTestController;
