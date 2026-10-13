"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateCodRemittanceAmounts = void 0;
const gst_1 = require("./gst");
/**
 * Booking charges are debited from the seller wallet and must not be deducted
 * again from the COD amount collected from the buyer.
 */
const calculateCodRemittanceAmounts = ({ codAmount, }) => {
    const normalizedCodAmount = Number(codAmount);
    if (!Number.isFinite(normalizedCodAmount) || normalizedCodAmount < 0) {
        throw new Error('COD amount must be a non-negative number');
    }
    return {
        deductions: 0,
        remittableAmount: (0, gst_1.roundCurrency)(normalizedCodAmount),
    };
};
exports.calculateCodRemittanceAmounts = calculateCodRemittanceAmounts;
