"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateGstBreakup = exports.normalizeGstPercent = exports.roundCurrency = void 0;
const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
exports.roundCurrency = roundCurrency;
const normalizeGstPercent = (value) => {
    const percent = Number(value ?? 0);
    if (!Number.isFinite(percent) || percent < 0)
        return 0;
    return (0, exports.roundCurrency)(percent);
};
exports.normalizeGstPercent = normalizeGstPercent;
const calculateGstBreakup = (baseAmount, gstPercent) => {
    const normalizedBase = Number(baseAmount ?? 0);
    const safeBaseAmount = Number.isFinite(normalizedBase) && normalizedBase > 0 ? normalizedBase : 0;
    const safeGstPercent = (0, exports.normalizeGstPercent)(gstPercent);
    const gstAmount = (0, exports.roundCurrency)((safeBaseAmount * safeGstPercent) / 100);
    return {
        baseAmount: (0, exports.roundCurrency)(safeBaseAmount),
        gstPercent: safeGstPercent,
        gstAmount,
        totalAmount: (0, exports.roundCurrency)(safeBaseAmount + gstAmount),
    };
};
exports.calculateGstBreakup = calculateGstBreakup;
