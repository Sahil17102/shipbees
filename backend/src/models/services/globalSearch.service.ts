import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { invoices } from '../schema/invoices'
import { ndr_events } from '../schema/ndr'
import { rto_events } from '../schema/rto'
import { weight_discrepancies } from '../schema/weightDiscrepancies'

export interface GlobalSearchResult {
  type: 'order' | 'invoice' | 'ndr' | 'rto' | 'weight_discrepancy'
  id: string
  title: string
  subtitle?: string
  link: string
  metadata?: Record<string, any>
}

const normalizeQuery = (value: string) => value.trim()

const normalizeCompact = (value: string) => normalizeQuery(value).replace(/[\s-]+/g, '')

const textLike = (column: any, value: string) =>
  sql`COALESCE(CAST(${column} AS TEXT), '') ILIKE ${`%${value}%`}`

const compactLike = (column: any, value: string) =>
  sql`REPLACE(REPLACE(COALESCE(CAST(${column} AS TEXT), ''), '-', ''), ' ', '') ILIKE ${`%${value}%`}`

const joinSubtitle = (parts: Array<string | number | null | undefined>) =>
  parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' | ')

const scoreResult = (result: GlobalSearchResult, rawQuery: string) => {
  const query = normalizeQuery(rawQuery).toLowerCase()
  const compactQuery = normalizeCompact(rawQuery).toLowerCase()
  const searchable = [
    result.title,
    result.subtitle,
    result.metadata?.awb,
    result.metadata?.orderId,
    result.metadata?.shipmentId,
    result.metadata?.buyerPhone,
    result.metadata?.buyerEmail,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ')
  const compactSearchable = searchable.replace(/[\s-]+/g, '')

  if (compactSearchable === compactQuery || searchable === query) return 100
  if (compactSearchable.startsWith(compactQuery)) return 80
  if (searchable.includes(query) || compactSearchable.includes(compactQuery)) return 50
  return 0
}

export const globalSearch = async (
  userId: string,
  query: string,
  limit = 10,
): Promise<GlobalSearchResult[]> => {
  const normalizedQuery = normalizeQuery(query)
  const compactQuery = normalizeCompact(query)
  const searchLimit = Math.max(1, Math.min(Number(limit) || 10, 25))
  const results: GlobalSearchResult[] = []

  const b2cOrders = await db
    .select({
      id: b2c_orders.id,
      order_number: b2c_orders.order_number,
      order_id: b2c_orders.order_id,
      awb_number: b2c_orders.awb_number,
      shipment_id: b2c_orders.shipment_id,
      buyer_name: b2c_orders.buyer_name,
      buyer_phone: b2c_orders.buyer_phone,
      buyer_email: b2c_orders.buyer_email,
      city: b2c_orders.city,
      state: b2c_orders.state,
      order_status: b2c_orders.order_status,
      order_type: b2c_orders.order_type,
      courier_partner: b2c_orders.courier_partner,
      invoice_number: b2c_orders.invoice_number,
    })
    .from(b2c_orders)
    .where(
      and(
        eq(b2c_orders.user_id, userId),
        or(
          ilike(b2c_orders.order_number, `%${normalizedQuery}%`),
          textLike(b2c_orders.order_id, normalizedQuery),
          textLike(b2c_orders.awb_number, normalizedQuery),
          textLike(b2c_orders.shipment_id, normalizedQuery),
          textLike(b2c_orders.provider_reference, normalizedQuery),
          textLike(b2c_orders.provider_request_id, normalizedQuery),
          textLike(b2c_orders.invoice_number, normalizedQuery),
          textLike(b2c_orders.courier_partner, normalizedQuery),
          ilike(b2c_orders.buyer_name, `%${normalizedQuery}%`),
          textLike(b2c_orders.buyer_phone, normalizedQuery),
          textLike(b2c_orders.buyer_email, normalizedQuery),
          compactQuery ? compactLike(b2c_orders.order_number, compactQuery) : undefined,
          compactQuery ? compactLike(b2c_orders.order_id, compactQuery) : undefined,
          compactQuery ? compactLike(b2c_orders.awb_number, compactQuery) : undefined,
          compactQuery ? compactLike(b2c_orders.shipment_id, compactQuery) : undefined,
          compactQuery ? compactLike(b2c_orders.buyer_phone, compactQuery) : undefined,
        ),
      ),
    )
    .limit(searchLimit)

  for (const order of b2cOrders) {
    results.push({
      type: 'order',
      id: order.id,
      title: order.order_number,
      subtitle: joinSubtitle([
        'B2C',
        order.order_status,
        order.buyer_name,
        order.buyer_phone,
        order.city && order.state ? `${order.city}, ${order.state}` : order.city || order.state,
        order.awb_number ? `AWB ${order.awb_number}` : null,
        order.courier_partner,
      ]),
      link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
      metadata: {
        awb: order.awb_number,
        status: order.order_status,
        type: 'b2c',
        orderId: order.order_id,
        shipmentId: order.shipment_id,
        buyerPhone: order.buyer_phone,
        buyerEmail: order.buyer_email,
        paymentMode: order.order_type,
      },
    })
  }

  const b2bOrders = await db
    .select({
      id: b2b_orders.id,
      order_number: b2b_orders.order_number,
      order_id: b2b_orders.order_id,
      awb_number: b2b_orders.awb_number,
      shipment_id: b2b_orders.shipment_id,
      buyer_name: b2b_orders.buyer_name,
      buyer_phone: b2b_orders.buyer_phone,
      buyer_email: b2b_orders.buyer_email,
      city: b2b_orders.city,
      state: b2b_orders.state,
      order_status: b2b_orders.order_status,
      order_type: b2b_orders.order_type,
      courier_partner: b2b_orders.courier_partner,
      invoice_number: b2b_orders.invoice_number,
      company_name: b2b_orders.company_name,
    })
    .from(b2b_orders)
    .where(
      and(
        eq(b2b_orders.user_id, userId),
        or(
          ilike(b2b_orders.order_number, `%${normalizedQuery}%`),
          textLike(b2b_orders.order_id, normalizedQuery),
          textLike(b2b_orders.awb_number, normalizedQuery),
          textLike(b2b_orders.shipment_id, normalizedQuery),
          textLike(b2b_orders.provider_reference, normalizedQuery),
          textLike(b2b_orders.provider_request_id, normalizedQuery),
          textLike(b2b_orders.invoice_number, normalizedQuery),
          textLike(b2b_orders.courier_partner, normalizedQuery),
          textLike(b2b_orders.company_name, normalizedQuery),
          ilike(b2b_orders.buyer_name, `%${normalizedQuery}%`),
          textLike(b2b_orders.buyer_phone, normalizedQuery),
          textLike(b2b_orders.buyer_email, normalizedQuery),
          compactQuery ? compactLike(b2b_orders.order_number, compactQuery) : undefined,
          compactQuery ? compactLike(b2b_orders.order_id, compactQuery) : undefined,
          compactQuery ? compactLike(b2b_orders.awb_number, compactQuery) : undefined,
          compactQuery ? compactLike(b2b_orders.shipment_id, compactQuery) : undefined,
          compactQuery ? compactLike(b2b_orders.buyer_phone, compactQuery) : undefined,
        ),
      ),
    )
    .limit(searchLimit)

  for (const order of b2bOrders) {
    results.push({
      type: 'order',
      id: order.id,
      title: order.order_number,
      subtitle: joinSubtitle([
        'B2B',
        order.order_status,
        order.company_name,
        order.buyer_name,
        order.buyer_phone,
        order.city && order.state ? `${order.city}, ${order.state}` : order.city || order.state,
        order.awb_number ? `AWB ${order.awb_number}` : null,
        order.courier_partner,
      ]),
      link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
      metadata: {
        awb: order.awb_number,
        status: order.order_status,
        type: 'b2b',
        orderId: order.order_id,
        shipmentId: order.shipment_id,
        buyerPhone: order.buyer_phone,
        buyerEmail: order.buyer_email,
        paymentMode: order.order_type,
      },
    })
  }

  const invoiceResults = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoiceNumber,
      status: invoices.status,
      net_payable_amount: invoices.netPayableAmount,
    })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), ilike(invoices.invoiceNumber, `%${normalizedQuery}%`)))
    .limit(5)

  for (const invoice of invoiceResults) {
    results.push({
      type: 'invoice',
      id: String(invoice.id),
      title: invoice.invoice_number,
      subtitle: `Status: ${invoice.status} | Amount: INR ${Number(
        invoice.net_payable_amount,
      ).toLocaleString('en-IN')}`,
      link: `/billing/invoice_management?search=${encodeURIComponent(invoice.invoice_number)}`,
      metadata: {
        status: invoice.status,
        amount: invoice.net_payable_amount,
      },
    })
  }

  const ndrResults = await db
    .select({
      id: ndr_events.id,
      order_id: ndr_events.order_id,
      awb_number: ndr_events.awb_number,
      status: ndr_events.status,
      reason: ndr_events.reason,
    })
    .from(ndr_events)
    .where(
      and(
        eq(ndr_events.user_id, userId),
        or(textLike(ndr_events.awb_number, normalizedQuery), textLike(ndr_events.order_id, normalizedQuery)),
      ),
    )
    .limit(5)

  for (const ndr of ndrResults) {
    results.push({
      type: 'ndr',
      id: ndr.id,
      title: ndr.awb_number || `NDR-${ndr.id.slice(0, 8)}`,
      subtitle: `NDR | ${ndr.status} | ${ndr.reason || 'No reason'}`,
      link: `/ops/ndr?search=${encodeURIComponent(ndr.awb_number || ndr.order_id)}`,
      metadata: {
        status: ndr.status,
        reason: ndr.reason,
        awb: ndr.awb_number,
        orderId: ndr.order_id,
      },
    })
  }

  const rtoResults = await db
    .select({
      id: rto_events.id,
      order_id: rto_events.order_id,
      awb_number: rto_events.awb_number,
      status: rto_events.status,
      reason: rto_events.reason,
    })
    .from(rto_events)
    .where(
      and(
        eq(rto_events.user_id, userId),
        or(textLike(rto_events.awb_number, normalizedQuery), textLike(rto_events.order_id, normalizedQuery)),
      ),
    )
    .limit(5)

  for (const rto of rtoResults) {
    results.push({
      type: 'rto',
      id: rto.id,
      title: rto.awb_number || `RTO-${rto.id.slice(0, 8)}`,
      subtitle: `RTO | ${rto.status} | ${rto.reason || 'No reason'}`,
      link: `/ops/rto?search=${encodeURIComponent(rto.awb_number || rto.order_id)}`,
      metadata: {
        status: rto.status,
        reason: rto.reason,
        awb: rto.awb_number,
        orderId: rto.order_id,
      },
    })
  }

  const weightResults = await db
    .select({
      id: weight_discrepancies.id,
      order_number: weight_discrepancies.order_number,
      awb_number: weight_discrepancies.awb_number,
      status: weight_discrepancies.status,
    })
    .from(weight_discrepancies)
    .where(
      and(
        eq(weight_discrepancies.user_id, userId),
        or(
          ilike(weight_discrepancies.order_number, `%${normalizedQuery}%`),
          textLike(weight_discrepancies.awb_number, normalizedQuery),
        ),
      ),
    )
    .limit(5)

  for (const weight of weightResults) {
    results.push({
      type: 'weight_discrepancy',
      id: weight.id,
      title: weight.order_number,
      subtitle: weight.awb_number
        ? `Weight Discrepancy | ${weight.status} | AWB: ${weight.awb_number}`
        : `Weight Discrepancy | ${weight.status}`,
      link: `/reconciliation/weight?search=${encodeURIComponent(weight.order_number)}`,
      metadata: {
        status: weight.status,
        awb: weight.awb_number,
        orderId: weight.order_number,
      },
    })
  }

  return results
    .sort((a, b) => {
      const aScore = scoreResult(a, normalizedQuery)
      const bScore = scoreResult(b, normalizedQuery)
      if (aScore !== bScore) return bScore - aScore
      return a.title.localeCompare(b.title)
    })
    .slice(0, searchLimit)
}
