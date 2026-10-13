import { sql } from 'drizzle-orm'
import { walletTransactions } from '../models/schema/wallet'

export const WALLET_TRANSACTION_CATEGORIES = [
  'cod',
  'rto',
  'shipping_charges',
  'wallet_recharge',
  'weight_discrepancy',
  'adjustments',
  'whatsapp_service_charges',
] as const

export type WalletTransactionCategory = (typeof WALLET_TRANSACTION_CATEGORIES)[number]

export const parseWalletTransactionCategory = (value: unknown): WalletTransactionCategory | undefined => {
  const normalized = String(value || '').trim().toLowerCase()
  return WALLET_TRANSACTION_CATEGORIES.includes(normalized as WalletTransactionCategory)
    ? (normalized as WalletTransactionCategory)
    : undefined
}

export const walletTransactionCategorySql = sql<string>`
  CASE
    WHEN lower(concat_ws(' ', coalesce(${walletTransactions.reason}, ''), coalesce(${walletTransactions.ref}, ''), coalesce(${walletTransactions.meta}::text, '')))
      LIKE '%whatsapp%'
      THEN 'whatsapp_service_charges'
    WHEN lower(concat_ws(' ', coalesce(${walletTransactions.reason}, ''), coalesce(${walletTransactions.ref}, ''), coalesce(${walletTransactions.meta}::text, '')))
      SIMILAR TO '%(wallet recharge|wallet_topup|wallet topup|topup)%'
      THEN 'wallet_recharge'
    WHEN lower(concat_ws(' ', coalesce(${walletTransactions.reason}, ''), coalesce(${walletTransactions.ref}, ''), coalesce(${walletTransactions.meta}::text, '')))
      SIMILAR TO '%(weight discrepancy|weight dispute|weight_disc)%'
      THEN 'weight_discrepancy'
    WHEN lower(concat_ws(' ', coalesce(${walletTransactions.reason}, ''), coalesce(${walletTransactions.ref}, ''), coalesce(${walletTransactions.meta}::text, '')))
      SIMILAR TO '%(rto|reverse shipment|reverse_shipment|reverse shipping)%'
      THEN 'rto'
    WHEN lower(concat_ws(' ', coalesce(${walletTransactions.reason}, ''), coalesce(${walletTransactions.ref}, ''), coalesce(${walletTransactions.meta}::text, '')))
      LIKE '%cod%'
      THEN 'cod'
    WHEN lower(concat_ws(' ', coalesce(${walletTransactions.reason}, ''), coalesce(${walletTransactions.ref}, ''), coalesce(${walletTransactions.meta}::text, '')))
      SIMILAR TO '%(shipping|shipment charge|order payment|freight)%'
      THEN 'shipping_charges'
    ELSE 'adjustments'
  END
`

export const walletTransactionCategoryCondition = (category: WalletTransactionCategory) =>
  sql`${walletTransactionCategorySql} = ${category}`
