"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelOrderShipment = cancelOrderShipment;
const drizzle_orm_1 = require("drizzle-orm");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const amazonShipping_service_1 = require("./amazonShipping.service");
const amazonShippingCredentials_service_1 = require("./amazonShippingCredentials.service");
const delhivery_service_1 = require("./couriers/delhivery.service");
const ekart_service_1 = require("./couriers/ekart.service");
const shadowfax_service_1 = require("./couriers/shadowfax.service");
const velocity_service_1 = require("./couriers/velocity.service");
const xpressbees_service_1 = require("./couriers/xpressbees.service");
const trackingEvents_service_1 = require("./trackingEvents.service");
const webhookProcessor_1 = require("./webhookProcessor");
const SUPPORTED_CANCELLATION_PROVIDERS = new Set([
    'delhivery',
    'ekart',
    'xpressbees',
    'shadowfax',
    'amazon',
    'velocity',
]);
const TERMINAL_NON_CANCELLABLE_STATUSES = new Set(['delivered', 'rto_delivered']);
const DELHIVERY_LTL_PLACEHOLDER_VALUES = new Set([
    'processing',
    'pending',
    'unknown',
    'null',
    'undefined',
    'n/a',
    'na',
]);
const cancellationResponseText = (value) => {
    try {
        return JSON.stringify(value || {}).toLowerCase();
    }
    catch {
        return String(value || '').toLowerCase();
    }
};
const isCancellationAccepted = (result) => {
    const responseText = cancellationResponseText(result);
    const numericStatus = Number(result?.status ??
        result?.responseCode ??
        result?.code ??
        result?.ReturnCode ??
        result?.returnCode);
    const alreadyCancelled = responseText.includes('already cancelled') || responseText.includes('already canceled');
    const rejected = responseText.includes('not accepted') ||
        responseText.includes('failed') ||
        responseText.includes('failure');
    const acceptedText = responseText.includes('cancelled') ||
        responseText.includes('canceled') ||
        responseText.includes('shipment updated successfully') ||
        responseText.includes('successful') ||
        responseText.includes('cancellation initiated') ||
        responseText.includes('cancellation accepted') ||
        responseText.includes('cancellation request accepted');
    return (alreadyCancelled ||
        result?.success === true ||
        result?.Success === true ||
        result?.status === true ||
        String(result?.ReturnCode || result?.returnCode || '').trim() === '100' ||
        String(result?.status || '').toLowerCase() === 'success' ||
        (Number.isFinite(numericStatus) && numericStatus >= 200 && numericStatus < 300) ||
        result?.response?.status === true ||
        (acceptedText && !rejected));
};
const getCancellationErrorMessage = (result) => result?.error ||
    result?.message ||
    result?.ReturnMessage ||
    result?.returnMessage ||
    result?.responseMsg ||
    result?.remark ||
    'Courier cancellation not accepted';
const truncateText = (value, maxLength) => {
    const text = String(value || '').trim();
    if (!text)
        return null;
    return text.length > maxLength ? text.slice(0, maxLength - 3).trimEnd() + '...' : text;
};
const getCancellationDeliveryMessage = (result) => truncateText(result?.message ||
    result?.ReturnMessage ||
    result?.returnMessage ||
    result?.remark ||
    result?.responseMsg, 100);
const isShadowfaxCancellationProcessingError = (error) => {
    const responseText = cancellationResponseText({
        message: error?.message,
        response: error?.response?.data,
        status: error?.statusCode || error?.response?.status,
    });
    return (responseText.includes('order is being processed') ||
        responseText.includes('try cancelling after sometime'));
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isAmazonCancellationPropagationError = (error) => {
    const responseText = cancellationResponseText({
        message: error?.message,
        response: error?.response?.data,
        status: error?.statusCode || error?.response?.status,
    });
    return (responseText.includes('ineligible state') ||
        responseText.includes('trackingid not found') ||
        responseText.includes('tracking id not found'));
};
const amazonTrackingConfirmsCancellation = async ({ order, credentials, }) => {
    const trackingId = String(order?.awb_number ||
        order?.provider_meta?.amazon_tracking_id ||
        order?.provider_meta?.trackingId ||
        order?.provider_meta?.tracking_id ||
        '').trim();
    if (!trackingId)
        return false;
    const carrierId = String(order?.provider_meta?.amazon_carrier_id ||
        order?.provider_meta?.carrierId ||
        order?.provider_service ||
        'ATS').trim();
    try {
        const tracking = await (0, amazonShipping_service_1.getAmazonShippingTracking)({ trackingId, carrierId }, credentials);
        const trackingText = cancellationResponseText(tracking);
        return (trackingText.includes('pickupcancelled') ||
            trackingText.includes('pickup cancelled') ||
            trackingText.includes('cancelled') ||
            trackingText.includes('canceled'));
    }
    catch {
        return false;
    }
};
const cancelAmazonShipmentWithRetry = async ({ shipmentId, order, credentials, }) => {
    const retryDelaysMs = [5000, 15000, 30000];
    let lastError = null;
    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
        try {
            return await (0, amazonShipping_service_1.cancelAmazonShipment)({ shipmentId }, credentials);
        }
        catch (error) {
            lastError = error;
            if (!isAmazonCancellationPropagationError(error)) {
                throw error;
            }
            if (await amazonTrackingConfirmsCancellation({ order, credentials })) {
                return {
                    success: true,
                    message: 'Amazon tracking confirms cancellation',
                    provider_response: error?.response?.data || null,
                };
            }
            const delayMs = retryDelaysMs[attempt];
            if (!delayMs)
                break;
            console.warn('Amazon cancellation is still propagating; retrying', {
                orderId: order?.id,
                shipmentId,
                attempt: attempt + 1,
                delayMs,
                message: error?.message || error,
            });
            await delay(delayMs);
        }
    }
    if (await amazonTrackingConfirmsCancellation({ order, credentials })) {
        return {
            success: true,
            message: 'Amazon tracking confirms cancellation',
            provider_response: lastError?.response?.data || null,
        };
    }
    throw lastError;
};
const resolveCancellationProvider = (order) => {
    const providerText = `${order?.integration_type || ''} ${order?.courier_partner || ''}`
        .trim()
        .toLowerCase();
    if (providerText.includes('delhivery'))
        return 'delhivery';
    if (providerText.includes('ekart'))
        return 'ekart';
    if (providerText.includes('xpressbees') || providerText.includes('xpress bees')) {
        return 'xpressbees';
    }
    if (providerText.includes('shadowfax'))
        return 'shadowfax';
    if (providerText.includes('amazon'))
        return 'amazon';
    if (providerText.includes('velocity'))
        return 'velocity';
    return providerText;
};
const getOrderProviderMeta = (order) => order?.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
    ? order.provider_meta
    : {};
const normalizeMeaningfulText = (...values) => {
    for (const value of values) {
        const text = String(value || '').trim();
        if (!text)
            continue;
        if (DELHIVERY_LTL_PLACEHOLDER_VALUES.has(text.toLowerCase()))
            continue;
        return text;
    }
    return '';
};
const isMeaningfulDelhiveryValue = (value, blocked = new Set()) => {
    const normalized = normalizeMeaningfulText(value);
    return normalized.length > 0 && !blocked.has(normalized);
};
const extractAcceptedDelhiveryB2BIdentifiers = async (order, delhivery) => {
    const providerMeta = getOrderProviderMeta(order);
    const pickupRequestMeta = providerMeta.pickup_request && typeof providerMeta.pickup_request === 'object'
        ? providerMeta.pickup_request
        : {};
    const pickupResponseMeta = pickupRequestMeta.response && typeof pickupRequestMeta.response === 'object'
        ? pickupRequestMeta.response
        : {};
    const pickupProviderResponseMeta = pickupResponseMeta.provider_response && typeof pickupResponseMeta.provider_response === 'object'
        ? pickupResponseMeta.provider_response
        : {};
    const pickupProviderDataMeta = pickupProviderResponseMeta.data && typeof pickupProviderResponseMeta.data === 'object'
        ? pickupProviderResponseMeta.data
        : {};
    const manifestSubmissionMeta = providerMeta.manifest_submission && typeof providerMeta.manifest_submission === 'object'
        ? providerMeta.manifest_submission
        : {};
    const manifestSubmissionProviderResponse = manifestSubmissionMeta.provider_response && typeof manifestSubmissionMeta.provider_response === 'object'
        ? manifestSubmissionMeta.provider_response
        : {};
    const jobId = normalizeMeaningfulText(providerMeta.job_id, manifestSubmissionMeta.jobId, manifestSubmissionMeta.job_id, manifestSubmissionProviderResponse.job_id, manifestSubmissionProviderResponse.jobId, order.order_status === 'manifest_pending' ? order.provider_request_id : '', order.shipment_id, order.manifest);
    const pickupId = normalizeMeaningfulText(pickupResponseMeta.pickupId, pickupResponseMeta.pickup_id, pickupProviderResponseMeta.pickupId, pickupProviderDataMeta.pickup_id, pickupProviderDataMeta.pickupId);
    const pickupRequestId = normalizeMeaningfulText(pickupResponseMeta.requestId, pickupResponseMeta.request_id, pickupProviderResponseMeta.request_id, pickupProviderResponseMeta.requestId);
    const blockedValues = new Set([jobId, pickupId, pickupRequestId].map((value) => String(value || '').trim()).filter(Boolean));
    let lrn = normalizeMeaningfulText(order.provider_reference, order.order_id, providerMeta.lrn);
    if (!isMeaningfulDelhiveryValue(lrn, blockedValues)) {
        lrn = '';
    }
    const awbCandidates = [
        order.awb_number,
        providerMeta.awb_number,
        ...(Array.isArray(providerMeta.awbs) ? providerMeta.awbs : []),
    ];
    let awb = awbCandidates
        .map((value) => normalizeMeaningfulText(value))
        .find((value) => value && !blockedValues.has(value));
    if (!awb)
        awb = '';
    let manifestStatusResponse = null;
    if (jobId && (!lrn || !awb)) {
        manifestStatusResponse = await delhivery.getLtlManifestStatus(jobId);
        const refreshedBlockedValues = new Set([
            ...blockedValues,
            normalizeMeaningfulText(manifestStatusResponse?.jobId),
            normalizeMeaningfulText(manifestStatusResponse?.provider_response?.request_id),
        ]);
        const refreshedLrn = normalizeMeaningfulText(manifestStatusResponse?.lrn);
        if (refreshedLrn && !refreshedBlockedValues.has(refreshedLrn)) {
            lrn = refreshedLrn;
        }
        const refreshedAwbCandidates = Array.isArray(manifestStatusResponse?.awbs)
            ? manifestStatusResponse.awbs
            : [];
        const refreshedAwb = refreshedAwbCandidates
            .map((value) => normalizeMeaningfulText(value))
            .find((value) => value && !refreshedBlockedValues.has(value));
        if (refreshedAwb) {
            awb = refreshedAwb;
        }
    }
    return {
        jobId: jobId || null,
        pickupId: pickupId || null,
        pickupRequestId: pickupRequestId || null,
        lrn: lrn || null,
        awb: awb || null,
        manifestStatusResponse,
        providerMeta,
    };
};
const cancelB2BOrderShipment = async (order, integration) => {
    const currentStatus = String(order.order_status || '').trim().toLowerCase();
    if (currentStatus === 'cancelled') {
        return {
            success: true,
            alreadyCancelled: true,
            message: 'Order already cancelled',
        };
    }
    if (TERMINAL_NON_CANCELLABLE_STATUSES.has(currentStatus)) {
        throw new Error(`Order is already ${currentStatus} and cannot be cancelled`);
    }
    const providerMeta = getOrderProviderMeta(order);
    const cancelledAt = new Date();
    let cancellationResult = null;
    let resolvedAwb = normalizeMeaningfulText(order.awb_number) || null;
    let resolvedReference = normalizeMeaningfulText(order.provider_reference, order.order_id) || null;
    let providerRequestId = normalizeMeaningfulText(order.provider_request_id) || null;
    if (integration === 'delhivery') {
        const delhivery = new delhivery_service_1.DelhiveryService();
        const identifiers = await extractAcceptedDelhiveryB2BIdentifiers(order, delhivery);
        resolvedAwb = identifiers.awb || resolvedAwb;
        resolvedReference = identifiers.lrn || resolvedReference;
        providerRequestId = identifiers.jobId || providerRequestId;
        let shipmentCancellation = null;
        let pickupCancellation = null;
        if (identifiers.lrn) {
            shipmentCancellation = await delhivery.cancelLtlShipment(identifiers.lrn);
        }
        if (identifiers.pickupId &&
            (!shipmentCancellation || !isCancellationAccepted(shipmentCancellation))) {
            pickupCancellation = await delhivery.cancelLtlPickupRequest(identifiers.pickupId, identifiers.pickupRequestId || undefined);
        }
        const shipmentAccepted = shipmentCancellation && isCancellationAccepted(shipmentCancellation);
        const pickupAccepted = pickupCancellation?.success === true || isCancellationAccepted(pickupCancellation);
        if (!shipmentAccepted && !pickupAccepted && !identifiers.jobId) {
            throw new Error('Delhivery cancellation requires a valid LRN or pickup request.');
        }
        cancellationResult =
            shipmentCancellation ||
                pickupCancellation ||
                {
                    success: true,
                    localOnly: true,
                    pending: true,
                    job_id: identifiers.jobId,
                    message: 'Delhivery manifest was accepted but no LRN/AWB has been issued yet. The order has been cancelled locally before pickup dispatch.',
                };
        await client_1.db
            .update(b2bOrders_1.b2b_orders)
            .set({
            order_status: 'cancelled',
            awb_number: resolvedAwb || order.awb_number || null,
            order_id: resolvedReference || order.order_id || null,
            shipment_id: resolvedReference || order.shipment_id || identifiers.jobId || null,
            provider_reference: resolvedReference || order.provider_reference || null,
            provider_request_id: providerRequestId || order.provider_request_id || null,
            provider_last_status: 'cancelled',
            delivery_message: getCancellationDeliveryMessage(cancellationResult) || 'Shipment cancelled',
            provider_meta: {
                ...providerMeta,
                ...(identifiers.manifestStatusResponse
                    ? { manifest_status: identifiers.manifestStatusResponse }
                    : {}),
                cancellation: {
                    provider: integration,
                    requested_at: cancelledAt.toISOString(),
                    awb_number: resolvedAwb,
                    lrn: resolvedReference,
                    job_id: identifiers.jobId,
                    pickup_id: identifiers.pickupId,
                    result: cancellationResult,
                },
            },
            updated_at: cancelledAt,
        })
            .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, order.id));
    }
    else {
        if (!resolvedAwb && integration !== 'shadowfax') {
            cancellationResult = {
                success: true,
                localOnly: true,
                message: 'Order has no provider AWB yet; cancelled locally before courier booking.',
            };
        }
        else if (integration === 'shadowfax') {
            const svc = new shadowfax_service_1.ShadowfaxService();
            const reference = normalizeMeaningfulText(order.provider_request_id, order.provider_reference, order.awb_number);
            cancellationResult = await svc.cancelShipment(reference);
        }
        else if (integration === 'ekart') {
            const svc = new ekart_service_1.EkartService();
            cancellationResult = await svc.cancelShipment(String(resolvedAwb));
        }
        else if (integration === 'xpressbees') {
            const svc = new xpressbees_service_1.XpressbeesService();
            cancellationResult = await svc.cancelShipment(String(resolvedAwb));
        }
        else if (integration === 'amazon') {
            const amazonShipmentId = normalizeMeaningfulText(order.shipment_id, order.provider_reference, order.order_id, providerMeta.shipment_id, providerMeta.provider_reference, providerMeta.shipmentId);
            if (!amazonShipmentId) {
                throw new Error('Amazon cancellation requires a shipment id');
            }
            const amazonCredentials = await (0, amazonShippingCredentials_service_1.getStoredAmazonShippingCredentials)();
            (0, amazonShippingCredentials_service_1.applyAmazonShippingCredentialsToEnv)(amazonCredentials);
            cancellationResult = await cancelAmazonShipmentWithRetry({
                shipmentId: amazonShipmentId,
                order,
                credentials: amazonCredentials,
            });
        }
        else if (integration === 'velocity') {
            cancellationResult = await (0, velocity_service_1.velocityCancelOrder)({ awbs: [String(resolvedAwb)] });
        }
        else {
            throw new Error('Unsupported B2B cancellation provider');
        }
        if (!isCancellationAccepted(cancellationResult) && cancellationResult?.localOnly !== true) {
            throw new Error(getCancellationErrorMessage(cancellationResult));
        }
        await client_1.db
            .update(b2bOrders_1.b2b_orders)
            .set({
            order_status: 'cancelled',
            provider_last_status: 'cancelled',
            delivery_message: getCancellationDeliveryMessage(cancellationResult) || 'Shipment cancelled',
            provider_meta: {
                ...providerMeta,
                cancellation: {
                    provider: integration,
                    requested_at: cancelledAt.toISOString(),
                    awb_number: resolvedAwb,
                    result: cancellationResult,
                },
            },
            updated_at: cancelledAt,
        })
            .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, order.id));
    }
    await (0, webhookDelivery_service_1.sendWebhookEvent)(order.user_id, 'order.cancelled', {
        order_id: order.id,
        order_number: order.order_number,
        awb_number: resolvedAwb || order.awb_number || null,
        status: 'cancelled',
        courier_partner: order.courier_partner || integration,
        provider_reference: resolvedReference || order.provider_reference || null,
        provider_request_id: providerRequestId || order.provider_request_id || null,
        cancelled_at: cancelledAt.toISOString(),
        order_type: 'b2b',
    }).catch((err) => {
        console.warn('Failed to send B2B cancellation webhook:', err);
    });
    return cancellationResult;
};
const isSalesChannelSourceOrder = (order) => {
    const localOrderId = String(order?.order_id || '').trim();
    return localOrderId.startsWith('shopify_') || localOrderId.startsWith('woo_');
};
const syncSalesChannelStatusForOrder = async (orderId, source) => {
    const [updatedOrder] = await client_1.db
        .select()
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId))
        .limit(1);
    if (!updatedOrder)
        return;
    const localOrderId = String(updatedOrder.order_id || '').trim();
    if (localOrderId.startsWith('shopify_')) {
        const { syncShopifyStatusForLocalOrder } = await Promise.resolve().then(() => __importStar(require('./shopify.service')));
        await syncShopifyStatusForLocalOrder(updatedOrder, client_1.db, { source }).catch((err) => {
            console.warn(`Shopify status sync skipped after ${source}:`, err?.message || err);
        });
    }
    if (localOrderId.startsWith('woo_')) {
        const { syncWooCommerceStatusForLocalOrder } = await Promise.resolve().then(() => __importStar(require('./woocommerce.service')));
        await syncWooCommerceStatusForLocalOrder(updatedOrder, client_1.db, { source }).catch((err) => {
            console.warn(`WooCommerce status sync skipped after ${source}:`, err?.message || err);
        });
    }
};
async function cancelOrderShipment(orderId) {
    console.log('Starting cancellation for orderId:', orderId);
    const [b2cOrder] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
    let order = b2cOrder || null;
    let orderType = 'b2c';
    if (!order) {
        ;
        [order] = await client_1.db.select().from(b2bOrders_1.b2b_orders).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, orderId));
        if (order)
            orderType = 'b2b';
    }
    if (!order) {
        console.error('Order not found:', orderId);
        throw new Error('Order not found');
    }
    let integration = resolveCancellationProvider(order);
    const currentStatus = String(order.order_status || '').trim().toLowerCase();
    let awbNumber = String(order.awb_number || '').trim();
    const manualLocalAwb = integration === 'manual' ? awbNumber : '';
    let manualTrackingContext = null;
    if (integration === 'manual' && manualLocalAwb) {
        const { resolveManualTrackingContext } = await Promise.resolve().then(() => __importStar(require('./manualCourier.service')));
        manualTrackingContext = await resolveManualTrackingContext(manualLocalAwb);
        if (manualTrackingContext?.activeLeg) {
            integration = String(manualTrackingContext.activeLeg.provider || '').trim().toLowerCase();
            awbNumber = String(manualTrackingContext.activeLeg.actualAwb || '').trim();
            order = {
                ...order,
                awb_number: awbNumber,
                provider_reference: manualTrackingContext.activeLeg.providerReference,
                provider_request_id: manualTrackingContext.activeLeg.providerRequestId,
                provider_meta: manualTrackingContext.activeLeg.providerResponse,
                shipment_id: manualTrackingContext.activeLeg.providerReference ||
                    manualTrackingContext.activeLeg.providerRequestId ||
                    order.shipment_id,
            };
        }
    }
    console.log('Order found for cancellation:', {
        orderId: order.id,
        orderNumber: order.order_number,
        integrationType: integration,
        awbNumber,
        shipmentId: order.shipment_id,
        currentStatus,
    });
    if (currentStatus === 'cancelled') {
        await syncSalesChannelStatusForOrder(orderId, 'already-cancelled order check');
        return {
            success: true,
            alreadyCancelled: true,
            message: 'Order already cancelled',
        };
    }
    if (TERMINAL_NON_CANCELLABLE_STATUSES.has(currentStatus)) {
        throw new Error(`Order is already ${currentStatus} and cannot be cancelled`);
    }
    if (orderType === 'b2b') {
        if (integration === 'manual') {
            const cancelledAt = new Date();
            await client_1.db
                .update(b2bOrders_1.b2b_orders)
                .set({
                order_status: 'cancelled',
                provider_last_status: 'cancelled',
                delivery_message: 'Shipment cancelled',
                updated_at: cancelledAt,
            })
                .where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, orderId));
            const { markManualShipmentCancelled } = await Promise.resolve().then(() => __importStar(require('./manualCourier.service')));
            await markManualShipmentCancelled(manualLocalAwb, 'Cancelled before onward provider booking');
            return { success: true, localOnly: true, message: 'Shipment cancelled' };
        }
        if (!SUPPORTED_CANCELLATION_PROVIDERS.has(integration)) {
            console.error('Unsupported B2B integration type:', { orderId, integration });
            throw new Error('Only Delhivery, Ekart, Xpressbees, Shadowfax, Amazon and Velocity are supported for cancellation');
        }
        return cancelB2BOrderShipment(order, integration);
    }
    if (integration !== 'manual' &&
        !SUPPORTED_CANCELLATION_PROVIDERS.has(integration) &&
        !(isSalesChannelSourceOrder(order) && !awbNumber)) {
        console.error('Unsupported integration type:', { orderId, integration });
        throw new Error('Only Delhivery, Ekart, Xpressbees, Shadowfax, Amazon and Velocity are supported for cancellation');
    }
    const amazonShipmentId = String(order.shipment_id ||
        order.provider_reference ||
        order.order_id ||
        order.provider_meta?.shipment_id ||
        order.provider_meta?.provider_reference ||
        order.provider_meta?.shipmentId ||
        '').trim();
    if (integration === 'amazon' && !amazonShipmentId) {
        console.error('Amazon cancellation failed: Missing shipment id', {
            orderId,
            integration,
            awbNumber,
            shipmentId: order.shipment_id,
            providerReference: order.provider_reference,
        });
        throw new Error('Amazon cancellation requires a shipment id');
    }
    const providerMeta = order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
        ? order.provider_meta
        : {};
    console.log('Attempting courier cancellation:', {
        orderId,
        awbNumber,
        shipmentId: integration === 'amazon' ? amazonShipmentId : order.shipment_id,
        integration,
    });
    let cancellationResult = null;
    if (integration === 'delhivery' && !awbNumber) {
        throw new Error('Delhivery cancellation requires an AWB number');
    }
    if (integration === 'manual') {
        cancellationResult = {
            success: true,
            localOnly: true,
            message: 'Shipment cancelled before onward provider booking.',
        };
    }
    else if (integration !== 'amazon' && !awbNumber) {
        cancellationResult = {
            success: true,
            localOnly: true,
            message: 'Order has no provider AWB yet; cancelled locally before courier booking.',
        };
    }
    else if (integration === 'delhivery') {
        const svc = new delhivery_service_1.DelhiveryService();
        cancellationResult = await svc.cancelShipment(awbNumber);
    }
    else if (integration === 'ekart') {
        const svc = new ekart_service_1.EkartService();
        cancellationResult = await svc.cancelShipment(awbNumber);
    }
    else if (integration === 'shadowfax') {
        const svc = new shadowfax_service_1.ShadowfaxService();
        const shadowfaxCancelRef = String(order.provider_request_id || order.provider_reference || awbNumber).trim();
        console.log('Shadowfax cancellation identifier', {
            orderId,
            awbNumber,
            providerRequestId: order.provider_request_id,
            providerReference: order.provider_reference,
            cancelReference: shadowfaxCancelRef,
            orderStatus: order.order_status,
        });
        try {
            cancellationResult = await svc.cancelShipment(shadowfaxCancelRef);
        }
        catch (error) {
            if (!isShadowfaxCancellationProcessingError(error)) {
                throw error;
            }
            const requestedAt = new Date();
            const pendingResult = {
                success: true,
                pending: true,
                provider: 'shadowfax',
                message: 'Shadowfax is still processing this new order. Cancellation has been requested and will finalize after provider confirmation.',
                provider_response: error?.response?.data || null,
            };
            console.warn('Shadowfax cancellation is processing; marking local order as cancellation_requested', {
                orderId,
                awbNumber,
                cancelReference: shadowfaxCancelRef,
                providerResponse: error?.response?.data || null,
            });
            await client_1.db
                .update(b2cOrders_1.b2c_orders)
                .set({
                order_status: 'cancellation_requested',
                pickup_status: 'cancellation_requested',
                provider_last_status: 'cancellation_requested',
                delivery_message: 'Cancellation requested with Shadowfax',
                provider_meta: {
                    ...providerMeta,
                    cancellation: {
                        provider: integration,
                        requested_at: requestedAt.toISOString(),
                        awb_number: awbNumber || null,
                        pending: true,
                        result: pendingResult,
                    },
                },
                updated_at: requestedAt,
            })
                .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
            await (0, trackingEvents_service_1.logTrackingEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: awbNumber || null,
                courier: order.courier_partner || integration,
                statusCode: 'cancellation_requested',
                statusText: 'Cancellation requested',
                raw: pendingResult,
            }).catch((err) => {
                console.warn('Failed to log Shadowfax cancellation-requested event:', err);
            });
            await (0, webhookDelivery_service_1.sendWebhookEvent)(order.user_id, 'tracking.updated', {
                awb_number: awbNumber || order.awb_number,
                order_id: order.id,
                order_number: order.order_number,
                status: 'cancellation_requested',
                raw_status: 'cancellation_requested',
                courier_partner: order.courier_partner,
            }).catch((err) => {
                console.warn('Failed to send Shadowfax cancellation-requested webhook:', err);
            });
            await syncSalesChannelStatusForOrder(orderId, 'cancellation request');
            return pendingResult;
        }
    }
    else if (integration === 'amazon') {
        const amazonCredentials = await (0, amazonShippingCredentials_service_1.getStoredAmazonShippingCredentials)();
        (0, amazonShippingCredentials_service_1.applyAmazonShippingCredentialsToEnv)(amazonCredentials);
        cancellationResult = await cancelAmazonShipmentWithRetry({
            shipmentId: amazonShipmentId,
            order,
            credentials: amazonCredentials,
        });
    }
    else if (integration === 'velocity') {
        cancellationResult = await (0, velocity_service_1.velocityCancelOrder)({ awbs: [awbNumber] });
    }
    else {
        const svc = new xpressbees_service_1.XpressbeesService();
        cancellationResult = await svc.cancelShipment(awbNumber);
    }
    const isSuccess = isCancellationAccepted(cancellationResult);
    console.log('Courier cancellation response validation:', {
        integration,
        isSuccess,
        success: cancellationResult?.success,
        Success: cancellationResult?.Success,
        status: cancellationResult?.status,
        statusType: typeof cancellationResult?.status,
        remark: cancellationResult?.remark,
        message: cancellationResult?.message,
        error: cancellationResult?.error,
        fullResponse: cancellationResult,
    });
    if (!isSuccess) {
        const errorMsg = getCancellationErrorMessage(cancellationResult);
        console.error('Courier cancellation failed:', {
            orderId,
            integration,
            response: cancellationResult,
            message: errorMsg,
        });
        throw new Error(errorMsg);
    }
    const finalStatus = 'cancelled';
    console.log(`Updating order status to ${finalStatus}:`, { orderId, integration });
    const cancelledAt = new Date();
    await client_1.db.transaction(async (tx) => {
        await tx
            .update(b2cOrders_1.b2c_orders)
            .set({
            order_status: finalStatus,
            pickup_status: finalStatus,
            provider_last_status: finalStatus,
            delivery_message: getCancellationDeliveryMessage(cancellationResult),
            provider_meta: {
                ...providerMeta,
                cancellation: {
                    provider: integration,
                    requested_at: cancelledAt.toISOString(),
                    awb_number: awbNumber || null,
                    result: cancellationResult,
                },
            },
            updated_at: cancelledAt,
        })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
        await (0, webhookProcessor_1.applyCancellationRefundOnce)(tx, order, 'pickup_cancel_api');
    });
    await syncSalesChannelStatusForOrder(orderId, 'order cancellation');
    if (manualLocalAwb) {
        const { markManualShipmentCancelled } = await Promise.resolve().then(() => __importStar(require('./manualCourier.service')));
        await markManualShipmentCancelled(manualLocalAwb, getCancellationDeliveryMessage(cancellationResult) || 'Shipment cancelled');
    }
    await (0, trackingEvents_service_1.logTrackingEvent)({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: manualLocalAwb || awbNumber || null,
        courier: order.courier_partner || integration,
        statusCode: finalStatus,
        statusText: 'Shipment cancelled',
        raw: cancellationResult,
    }).catch((err) => {
        console.warn('Failed to log cancellation tracking event:', err);
    });
    await (0, webhookDelivery_service_1.sendWebhookEvent)(order.user_id, 'tracking.updated', {
        awb_number: manualLocalAwb || awbNumber || order.awb_number,
        order_id: order.id,
        order_number: order.order_number,
        status: finalStatus,
        raw_status: finalStatus,
        courier_partner: order.courier_partner,
    }).catch((err) => {
        console.warn('Failed to send cancellation tracking webhook:', err);
    });
    await (0, webhookDelivery_service_1.sendWebhookEvent)(order.user_id, 'order.cancelled', {
        awb_number: manualLocalAwb || awbNumber || order.awb_number,
        order_id: order.id,
        order_number: order.order_number,
        status: finalStatus,
        courier_partner: order.courier_partner,
    }).catch((err) => {
        console.warn('Failed to send order cancellation webhook:', err);
    });
    console.log(`Order status updated to ${finalStatus} successfully:`, { orderId, integration });
    return cancellationResult;
}
