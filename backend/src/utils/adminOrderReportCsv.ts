import type { CsvValue } from './csv'
import { getAdminOrderSellerName } from './adminOrderExportCsv'

type ExportOrder = Record<string, any>

const numberValue = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (value: number) => value.toFixed(2)

const dateKey = (order: ExportOrder) => {
  const raw = order.created_at || order.order_date
  const date = raw ? new Date(raw) : null
  if (!date || Number.isNaN(date.getTime())) return 'Unknown'
  return date.toISOString().slice(0, 10)
}

const monthKey = (order: ExportOrder) => dateKey(order).slice(0, 7)

const status = (order: ExportOrder) => String(order.order_status || '').trim().toLowerCase()

const isRto = (order: ExportOrder) => status(order) === 'rto' || status(order).startsWith('rto_')

const revenueFor = (order: ExportOrder) =>
  numberValue(order.freight_charges ?? order.shipping_charges ?? order.order_amount)

const codCollectionFor = (order: ExportOrder) =>
  String(order.order_type || '').toLowerCase() === 'cod' ? numberValue(order.order_amount) : 0

const sellerIdFor = (order: ExportOrder) => String(order.user_id || '')

const sellerEmailFor = (order: ExportOrder) => String(order.merchantEmail || '')

const courierFor = (order: ExportOrder) => String(order.courier_partner || order.integration_type || 'Unassigned')

const groupRows = (
  orders: ExportOrder[],
  keyFor: (order: ExportOrder) => string,
  labelFor: (order: ExportOrder) => string,
  extraFor: (order: ExportOrder) => CsvValue[],
) => {
  const groups = new Map<string, { label: string; orders: ExportOrder[]; first: ExportOrder }>()
  for (const order of orders) {
    const key = keyFor(order)
    const group = groups.get(key)
    if (group) group.orders.push(order)
    else groups.set(key, { label: labelFor(order), orders: [order], first: order })
  }

  return Array.from(groups.values()).map(({ label, orders: grouped, first }) => {
    const shipmentCount = grouped.length
    const rtoCount = grouped.filter(isRto).length
    const revenue = grouped.reduce((sum, order) => sum + revenueFor(order), 0)
    const codCollection = grouped.reduce((sum, order) => sum + codCollectionFor(order), 0)
    return [
      label,
      sellerIdFor(first),
      getAdminOrderSellerName(first),
      sellerEmailFor(first),
      shipmentCount,
      money(revenue),
      money(codCollection),
      grouped.filter((order) => status(order) === 'delivered').length,
      rtoCount,
      shipmentCount ? `${((rtoCount / shipmentCount) * 100).toFixed(2)}%` : '0.00%',
      ...extraFor(first),
    ] as CsvValue[]
  })
}

export const USER_WISE_REPORT_HEADERS = [
  'Seller ID',
  'Seller Name',
  'Seller Email',
  'Shipment Count',
  'Revenue',
  'COD Collection',
  'Delivered Shipments',
  'RTO Shipments',
  'RTO %',
]

export const ORDER_REPORT_HEADERS = [
  'Report Type',
  'Date / Month / Courier',
  'Shipment Count',
  'Revenue',
  'COD Collection',
  'Delivered Shipments',
  'RTO Shipments',
  'RTO %',
]

export const toUserWiseReportRows = (orders: ExportOrder[]) =>
  groupRows(orders, sellerIdFor, (order) => sellerIdFor(order), () => []).map((row) => row.slice(1))

export const toDailyOrderReportRows = (orders: ExportOrder[]) =>
  groupRows(orders, dateKey, dateKey, () => []).map((row) => row)

export const toMonthlyOrderReportRows = (orders: ExportOrder[]) =>
  groupRows(orders, monthKey, monthKey, () => []).map((row) => row)

export const toCourierOrderReportRows = (orders: ExportOrder[]) =>
  groupRows(orders, courierFor, courierFor, (order) => [courierFor(order)]).map((row) => row)
