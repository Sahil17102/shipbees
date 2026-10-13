"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteReverse = exports.createReversePickup = void 0;
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const reverse_service_1 = require("../models/services/reverse.service");
const getOriginalOrderId = (body) => String(body?.original_order_id || body?.order_id || body?.orderId || '').trim();
const createReversePickup = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const body = req.body || {};
        const originalOrderId = getOriginalOrderId(body);
        if (!originalOrderId) {
            return res.status(400).json({ success: false, message: 'Original order ID is required' });
        }
        await (0, reverse_service_1.assertReversePickupAllowed)(originalOrderId, userId);
        const quote = await (0, reverse_service_1.quoteReverseForOrder)(originalOrderId, Number(body?.package_weight), userId);
        const reverseCharge = Number(quote.rate || 0);
        if (!Number.isFinite(reverseCharge) || reverseCharge <= 0) {
            return res.status(400).json({
                success: false,
                message: 'No reverse pickup rate available for this order',
            });
        }
        const payload = {
            ...body,
            original_order_id: originalOrderId,
            payment_type: 'reverse',
            package_weight: Number(quote.weightGrams || 0) / 1000,
            shipping_charges: reverseCharge,
            freight_charges: reverseCharge,
            selected_max_slab_weight: quote.max_slab_weight ?? undefined,
            courier_id: body.courier_id ?? quote.courierId,
            tags: (0, reverse_service_1.appendReversePickupTags)(body.tags, originalOrderId),
        };
        const shipment = await (0, shiprocket_service_1.createB2CShipmentService)(payload, userId);
        res.status(200).json({ success: true, shipment });
    }
    catch (error) {
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 400;
        res.status(statusCode).json({ success: false, message: error.message });
    }
};
exports.createReversePickup = createReversePickup;
const quoteReverse = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { orderId, weightGrams } = req.body;
        if (!orderId)
            return res.status(400).json({ success: false, message: 'orderId required' });
        await (0, reverse_service_1.assertReversePickupAllowed)(String(orderId), userId);
        const quote = await (0, reverse_service_1.quoteReverseForOrder)(String(orderId), weightGrams ? Number(weightGrams) : undefined, userId);
        return res.json({ success: true, quote });
    }
    catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
};
exports.quoteReverse = quoteReverse;
