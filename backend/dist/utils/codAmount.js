"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSalesChannelOrder = exports.resolveBuyerCollectableAmount = exports.resolveItemsAmountWithTax = exports.clampMoney = exports.roundMoney = exports.toMoneyNumber = void 0;
const toMoneyNumber = (value, fallback = 0) => {
    if (value === undefined || value === null || value === '')
        return fallback;
    const normalized = typeof value === 'string' ? value.replace(/[^0-9.-]+/g, '') : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
};
exports.toMoneyNumber = toMoneyNumber;
const roundMoney = (value) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
exports.roundMoney = roundMoney;
const clampMoney = (value) => Math.max(0, (0, exports.roundMoney)(value));
exports.clampMoney = clampMoney;
const resolveItemsAmountWithTax = (items) => {
    if (!Array.isArray(items))
        return 0;
    return (0, exports.clampMoney)(items.reduce((sum, item) => {
        const qty = Math.max(1, (0, exports.toMoneyNumber)(item?.qty ?? item?.quantity, 1));
        const price = (0, exports.toMoneyNumber)(item?.price, 0);
        const discount = Math.max(0, (0, exports.toMoneyNumber)(item?.discount, 0));
        const taxable = Math.max(0, price * qty - discount);
        const explicitTax = (0, exports.toMoneyNumber)(item?.tax_value ?? item?.taxValue ?? item?.total_tax, NaN);
        const tax = Number.isFinite(explicitTax) && explicitTax > 0
            ? explicitTax
            : taxable * (Math.max(0, (0, exports.toMoneyNumber)(item?.tax_rate ?? item?.taxRate, 0)) / 100);
        return sum + taxable + tax;
    }, 0));
};
exports.resolveItemsAmountWithTax = resolveItemsAmountWithTax;
const resolveBuyerCollectableAmount = ({ orderAmount, invoiceAmount, items, paymentType, shippingCharges, transactionFee, giftWrap, discount, prepaidAmount, trustOrderAmount = false, }) => {
    const storedOrderAmount = (0, exports.toMoneyNumber)(orderAmount, 0);
    const storedInvoiceAmount = (0, exports.toMoneyNumber)(invoiceAmount, 0);
    const trustedAmount = storedOrderAmount > 0 ? storedOrderAmount : storedInvoiceAmount;
    if (trustOrderAmount && trustedAmount > 0) {
        return (0, exports.clampMoney)(trustedAmount);
    }
    const itemAmount = (0, exports.resolveItemsAmountWithTax)(items);
    const baseAmount = storedOrderAmount > 0 && itemAmount > 0
        ? Math.max(storedOrderAmount, itemAmount)
        : storedOrderAmount > 0
            ? storedOrderAmount
            : itemAmount;
    const fallbackBaseAmount = baseAmount > 0 ? baseAmount : storedInvoiceAmount;
    const normalizedPaymentType = String(paymentType || '').trim().toLowerCase();
    const prepaidDeduction = normalizedPaymentType === 'prepaid' ? 0 : Math.abs((0, exports.toMoneyNumber)(prepaidAmount, 0));
    return (0, exports.clampMoney)(fallbackBaseAmount +
        (0, exports.toMoneyNumber)(shippingCharges, 0) +
        (0, exports.toMoneyNumber)(transactionFee, 0) +
        (0, exports.toMoneyNumber)(giftWrap, 0) -
        Math.abs((0, exports.toMoneyNumber)(discount, 0)) -
        prepaidDeduction);
};
exports.resolveBuyerCollectableAmount = resolveBuyerCollectableAmount;
const isSalesChannelOrder = (order) => {
    const orderId = String(order?.order_id || '').toLowerCase();
    const integrationType = String(order?.integration_type || '').toLowerCase();
    const tags = String(order?.tags || '').toLowerCase();
    return (orderId.startsWith('shopify_') ||
        orderId.startsWith('woo_') ||
        integrationType === 'shopify' ||
        integrationType === 'woocommerce' ||
        tags.includes('shopify_store:') ||
        tags.includes('woocommerce_store:'));
};
exports.isSalesChannelOrder = isSalesChannelOrder;
