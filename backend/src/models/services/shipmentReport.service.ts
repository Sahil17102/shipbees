import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'
import { getBookingWalletDebitBaseAmount, resolveGstInclusiveWalletDebit } from '../../utils/bookingWalletDebit'
import { buildCsv, CsvValue } from '../../utils/csv'

export type ShipmentReportScope = {
  userId?: string
}

export type ShipmentReportFilters = {
  fromDate: Date
  toDate: Date
  courier?: string
  company?: string
  gstMode?: 'with' | 'without'
}

type ReportOrder = {
  shipmentType: 'B2C' | 'B2B'
  order: Record<string, any>
  sellerCompany: string
  sellerEmail: string
}

const text = (value: unknown) => String(value ?? '').trim()
const amount = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const money = (value: unknown) => amount(value).toFixed(2)
const weight = (value: unknown) => amount(value).toFixed(3)
const isoDate = (value: unknown) => {
  if (!value) return ''
  const parsed = new Date(value as any)
  return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toISOString()
}

const sellerCompanyName = (companyInfo: any, email: unknown) =>
  text(
    companyInfo?.businessName ||
      companyInfo?.brandName ||
      companyInfo?.companyName ||
      companyInfo?.displayName ||
      email,
  )

const loadReportOrders = async (
  scope: ShipmentReportScope,
  filters: ShipmentReportFilters,
): Promise<ReportOrder[]> => {
  const b2cConditions = [
    gte(b2c_orders.created_at, filters.fromDate),
    lte(b2c_orders.created_at, filters.toDate),
  ]
  const b2bConditions = [
    gte(b2b_orders.created_at, filters.fromDate),
    lte(b2b_orders.created_at, filters.toDate),
  ]

  if (scope.userId) {
    b2cConditions.push(eq(b2c_orders.user_id, scope.userId))
    b2bConditions.push(eq(b2b_orders.user_id, scope.userId))
  }
  if (filters.courier) {
    b2cConditions.push(eq(b2c_orders.courier_partner, filters.courier))
    b2bConditions.push(eq(b2b_orders.courier_partner, filters.courier))
  }

  const [b2cRows, b2bRows] = await Promise.all([
    db
      .select({ order: b2c_orders, companyInfo: userProfiles.companyInfo, sellerEmail: users.email })
      .from(b2c_orders)
      .leftJoin(users, eq(users.id, b2c_orders.user_id))
      .leftJoin(userProfiles, eq(userProfiles.userId, b2c_orders.user_id))
      .where(and(...b2cConditions))
      .orderBy(asc(b2c_orders.created_at)),
    db
      .select({ order: b2b_orders, companyInfo: userProfiles.companyInfo, sellerEmail: users.email })
      .from(b2b_orders)
      .leftJoin(users, eq(users.id, b2b_orders.user_id))
      .leftJoin(userProfiles, eq(userProfiles.userId, b2b_orders.user_id))
      .where(and(...b2bConditions))
      .orderBy(asc(b2b_orders.created_at)),
  ])

  const rows: ReportOrder[] = [
    ...b2cRows.map((row) => ({
      shipmentType: 'B2C' as const,
      order: row.order,
      sellerCompany: sellerCompanyName(row.companyInfo, row.sellerEmail),
      sellerEmail: text(row.sellerEmail),
    })),
    ...b2bRows.map((row) => ({
      shipmentType: 'B2B' as const,
      order: row.order,
      sellerCompany: sellerCompanyName(row.companyInfo, row.sellerEmail),
      sellerEmail: text(row.sellerEmail),
    })),
  ]

  const company = text(filters.company).toLowerCase()
  return rows
    .filter((row) => !company || row.sellerCompany.toLowerCase() === company)
    .sort(
      (a, b) =>
        new Date(a.order.created_at || 0).getTime() - new Date(b.order.created_at || 0).getTime(),
    )
}

export const getShipmentReportOptions = async (
  scope: ShipmentReportScope,
  filters: ShipmentReportFilters,
) => {
  const rows = await loadReportOrders(scope, { ...filters, courier: undefined, company: undefined })
  return {
    couriers: Array.from(new Set(rows.map((row) => text(row.order.courier_partner)).filter(Boolean))).sort(),
    companies: Array.from(new Set(rows.map((row) => row.sellerCompany).filter(Boolean))).sort(),
    shipmentCount: rows.length,
  }
}

const commonHeaders = [
  'Shipment Type',
  'Order Number',
  'Order Date',
  'Shipment Created At',
  'Seller Company',
  'Seller Email',
  'Consignee Company',
  'AWB Number',
  'Courier',
  'Shipment Status',
  'Payment Mode',
  'Buyer Name',
  'Buyer Phone',
  'Origin Warehouse',
  'Destination City',
  'Destination State',
  'Destination Pincode',
  'Declared Weight (kg)',
  'Charged Weight (kg)',
  'Order Value',
]

export const buildShipmentReportCsv = async (
  scope: ShipmentReportScope,
  filters: ShipmentReportFilters,
) => {
  const rows = await loadReportOrders(scope, filters)
  if (rows.length > 50000) {
    throw new Error('This report contains more than 50,000 shipments. Please use a smaller date range.')
  }

  const withGst = filters.gstMode !== 'without'
  const chargeHeaders = withGst
    ? ['Shipping Charges Before GST', 'GST Rate (%)', 'GST Amount', 'Shipping Charges With GST']
    : ['Shipping Charges Without GST']

  const csvRows = rows.map(({ shipmentType, order, sellerCompany, sellerEmail }): CsvValue[] => {
    const isB2c = shipmentType === 'B2C'
    const chargeBeforeGst = isB2c
      ? getBookingWalletDebitBaseAmount({
          paymentType: order.order_type,
          freightCharges: order.freight_charges,
          otherCharges: order.other_charges,
          codCharges: order.cod_charges,
        })
      : amount(order.freight_charges)
    const gstPercent = isB2c ? amount(order.gst_percent) : 0
    const gstAmount = isB2c ? amount(order.gst_amount) : 0
    const chargeWithGst = isB2c
      ? resolveGstInclusiveWalletDebit({
          storedDebit: order.wallet_debit_amount,
          paymentType: order.order_type,
          freightCharges: order.freight_charges,
          otherCharges: order.other_charges,
          codCharges: order.cod_charges,
          gstPercent,
          gstAmount,
        })
      : chargeBeforeGst
    const pickupDetails = order.pickup_details || {}
    const common: CsvValue[] = [
      shipmentType,
      order.order_number,
      order.order_date,
      isoDate(order.created_at),
      sellerCompany,
      sellerEmail,
      shipmentType === 'B2B' ? order.company_name : '',
      order.awb_number,
      order.courier_partner,
      order.order_status,
      order.order_type,
      order.buyer_name,
      order.buyer_phone,
      pickupDetails.warehouse_name || pickupDetails.name || '',
      order.city,
      order.state,
      order.pincode,
      weight(order.weight),
      weight(order.charged_weight || order.weight),
      money(order.order_amount),
    ]
    return withGst
      ? [...common, money(chargeBeforeGst), money(gstPercent), money(gstAmount), money(chargeWithGst)]
      : [...common, money(chargeBeforeGst)]
  })

  return {
    csv: buildCsv([...commonHeaders, ...chargeHeaders], csvRows),
    count: rows.length,
  }
}
