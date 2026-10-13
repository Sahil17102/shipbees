"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMerchantSafeOperationalError = exports.isInternalProviderBalanceIssue = void 0;
const normalizeErrorText = (value) => String(value || '').trim();
const isInternalProviderBalanceIssue = (value) => {
    const normalized = normalizeErrorText(value).toLowerCase();
    return ((normalized.includes('wallet balance') && normalized.includes('less than')) ||
        normalized.includes('insufficient balance') ||
        normalized.includes('low balance') ||
        (normalized.includes('client wallet') && normalized.includes('balance')) ||
        (normalized.includes('recharge') && normalized.includes('wallet')));
};
exports.isInternalProviderBalanceIssue = isInternalProviderBalanceIssue;
const getMerchantSafeOperationalError = (value, fallback = 'We could not complete this step right now. Our operations team has been notified.') => {
    const normalized = normalizeErrorText(value);
    if (!normalized)
        return fallback;
    if ((0, exports.isInternalProviderBalanceIssue)(normalized)) {
        return fallback;
    }
    return normalized;
};
exports.getMerchantSafeOperationalError = getMerchantSafeOperationalError;
