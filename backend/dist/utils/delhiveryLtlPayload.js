"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDelhiveryLtlShipmentDetailsPayload = void 0;
const buildDelhiveryLtlShipmentDetailsPayload = ({ boxes, normalizedOrderNumber, description, totalWeightGrams, }) => {
    const panelOrderReference = String(normalizedOrderNumber || '').trim();
    const fallbackDescription = String(description || panelOrderReference).trim() || panelOrderReference;
    if (Array.isArray(boxes) && boxes.length > 0) {
        return boxes.map((box) => ({
            // Delhivery surfaces this as the PO reference, so keep our panel order ID unchanged
            // across every package row instead of generating per-box suffixed values.
            order_id: panelOrderReference,
            box_count: Math.max(1, Number(box?.quantity ?? 1) || 1),
            description: String(box?.box_name || fallbackDescription).trim() || fallbackDescription,
            weight: Math.max(1, Math.round(Number(box?.weight ?? 0) * 1000)),
        }));
    }
    return [
        {
            order_id: panelOrderReference,
            box_count: 1,
            description: fallbackDescription,
            weight: Math.max(1, Math.round(Number(totalWeightGrams || 0)) || 1),
        },
    ];
};
exports.buildDelhiveryLtlShipmentDetailsPayload = buildDelhiveryLtlShipmentDetailsPayload;
