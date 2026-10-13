"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const codAmount_1 = require("../utils/codAmount");
const wooOrder = {
    order_id: 'woo_woo_3c59a4f7143455_143455',
    integration_type: 'woocommerce',
    tags: 'woocommerce_store:woo_3c59a4f7',
    order_amount: 1599,
    shipping_charges: 99,
    discount: 400,
    prepaid_amount: 0,
};
assert_1.default.equal((0, codAmount_1.isSalesChannelOrder)(wooOrder), true);
assert_1.default.equal((0, codAmount_1.resolveBuyerCollectableAmount)({
    orderAmount: wooOrder.order_amount,
    shippingCharges: wooOrder.shipping_charges,
    discount: wooOrder.discount,
    prepaidAmount: wooOrder.prepaid_amount,
    trustOrderAmount: (0, codAmount_1.isSalesChannelOrder)(wooOrder),
}), 1599);
assert_1.default.equal((0, codAmount_1.resolveItemsAmountWithTax)([
    { price: 1000, qty: 1, discount: 100, tax_rate: 18 },
    { price: 250, qty: 2, tax_value: 45 },
]), 1607);
assert_1.default.equal((0, codAmount_1.resolveBuyerCollectableAmount)({
    orderAmount: 1000,
    items: [{ price: 1000, qty: 1, tax_rate: 18 }],
    paymentType: 'cod',
    shippingCharges: 50,
    transactionFee: 10,
    giftWrap: 5,
    discount: 100,
    prepaidAmount: 200,
}), 945);
assert_1.default.equal((0, codAmount_1.resolveBuyerCollectableAmount)({
    orderAmount: 1000,
    paymentType: 'cod',
    shippingCharges: 50,
    transactionFee: 10,
    giftWrap: 5,
    discount: 100,
    prepaidAmount: 200,
}), 765);
assert_1.default.equal((0, codAmount_1.resolveBuyerCollectableAmount)({
    orderAmount: 100,
    paymentType: 'cod',
    discount: 500,
    prepaidAmount: 500,
}), 0);
assert_1.default.equal((0, codAmount_1.resolveBuyerCollectableAmount)({
    orderAmount: 799,
    items: [{ price: 799, qty: 1 }],
    paymentType: 'prepaid',
    prepaidAmount: 799,
}), 799);
console.log('COD amount guard checks passed');
