"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveGstInclusiveWalletDebit = exports.calculateBookingWalletDebit = exports.getBookingWalletDebitBaseAmount = void 0;
const gst_1 = require("./gst");
const toAmount = (value) => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};
const isCodPayment = (paymentType) => String(paymentType || '').toLowerCase() === 'cod';
const getBookingWalletDebitBaseAmount = ({ paymentType, freightCharges = 0, otherCharges = 0, codCharges = 0, }) => {
    const base = toAmount(freightCharges) +
        toAmount(otherCharges) +
        (isCodPayment(paymentType) ? toAmount(codCharges) : 0);
    return (0, gst_1.roundCurrency)(base);
};
exports.getBookingWalletDebitBaseAmount = getBookingWalletDebitBaseAmount;
const calculateBookingWalletDebit = ({ paymentType, freightCharges = 0, otherCharges = 0, codCharges = 0, gstPercent = 0, }) => (0, gst_1.calculateGstBreakup)((0, exports.getBookingWalletDebitBaseAmount)({
    paymentType,
    freightCharges,
    otherCharges,
    codCharges,
}), gstPercent);
exports.calculateBookingWalletDebit = calculateBookingWalletDebit;
const resolveGstInclusiveWalletDebit = ({ storedDebit, paymentType, freightCharges = 0, otherCharges = 0, codCharges = 0, gstPercent = 0, gstAmount = 0, }) => {
    const stored = toAmount(storedDebit);
    const gst = toAmount(gstAmount);
    const percent = toAmount(gstPercent);
    const computed = (0, exports.calculateBookingWalletDebit)({
        paymentType,
        freightCharges,
        otherCharges,
        codCharges,
        gstPercent: percent,
    });
    if (stored <= 0)
        return computed.totalAmount;
    if (gst <= 0 || percent <= 0)
        return Math.max(stored, computed.totalAmount);
    const gstOnStoredDebit = (0, gst_1.roundCurrency)((stored * percent) / 100);
    const storedLooksTaxableOnly = Math.abs(gstOnStoredDebit - gst) <= 0.02;
    if (storedLooksTaxableOnly) {
        return (0, gst_1.roundCurrency)(stored + gst);
    }
    return Math.max(stored, computed.totalAmount);
};
exports.resolveGstInclusiveWalletDebit = resolveGstInclusiveWalletDebit;
