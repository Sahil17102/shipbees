"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletTransactionCategoryCondition = exports.walletTransactionCategorySql = exports.parseWalletTransactionCategory = exports.WALLET_TRANSACTION_CATEGORIES = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const wallet_1 = require("../models/schema/wallet");
exports.WALLET_TRANSACTION_CATEGORIES = [
    'cod',
    'rto',
    'shipping_charges',
    'wallet_recharge',
    'weight_discrepancy',
    'adjustments',
    'whatsapp_service_charges',
];
const parseWalletTransactionCategory = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return exports.WALLET_TRANSACTION_CATEGORIES.includes(normalized)
        ? normalized
        : undefined;
};
exports.parseWalletTransactionCategory = parseWalletTransactionCategory;
exports.walletTransactionCategorySql = (0, drizzle_orm_1.sql) `
  CASE
    WHEN lower(concat_ws(' ', coalesce(${wallet_1.walletTransactions.reason}, ''), coalesce(${wallet_1.walletTransactions.ref}, ''), coalesce(${wallet_1.walletTransactions.meta}::text, '')))
      LIKE '%whatsapp%'
      THEN 'whatsapp_service_charges'
    WHEN lower(concat_ws(' ', coalesce(${wallet_1.walletTransactions.reason}, ''), coalesce(${wallet_1.walletTransactions.ref}, ''), coalesce(${wallet_1.walletTransactions.meta}::text, '')))
      SIMILAR TO '%(wallet recharge|wallet_topup|wallet topup|topup)%'
      THEN 'wallet_recharge'
    WHEN lower(concat_ws(' ', coalesce(${wallet_1.walletTransactions.reason}, ''), coalesce(${wallet_1.walletTransactions.ref}, ''), coalesce(${wallet_1.walletTransactions.meta}::text, '')))
      SIMILAR TO '%(weight discrepancy|weight dispute|weight_disc)%'
      THEN 'weight_discrepancy'
    WHEN lower(concat_ws(' ', coalesce(${wallet_1.walletTransactions.reason}, ''), coalesce(${wallet_1.walletTransactions.ref}, ''), coalesce(${wallet_1.walletTransactions.meta}::text, '')))
      SIMILAR TO '%(rto|reverse shipment|reverse_shipment|reverse shipping)%'
      THEN 'rto'
    WHEN lower(concat_ws(' ', coalesce(${wallet_1.walletTransactions.reason}, ''), coalesce(${wallet_1.walletTransactions.ref}, ''), coalesce(${wallet_1.walletTransactions.meta}::text, '')))
      LIKE '%cod%'
      THEN 'cod'
    WHEN lower(concat_ws(' ', coalesce(${wallet_1.walletTransactions.reason}, ''), coalesce(${wallet_1.walletTransactions.ref}, ''), coalesce(${wallet_1.walletTransactions.meta}::text, '')))
      SIMILAR TO '%(shipping|shipment charge|order payment|freight)%'
      THEN 'shipping_charges'
    ELSE 'adjustments'
  END
`;
const walletTransactionCategoryCondition = (category) => (0, drizzle_orm_1.sql) `${exports.walletTransactionCategorySql} = ${category}`;
exports.walletTransactionCategoryCondition = walletTransactionCategoryCondition;
