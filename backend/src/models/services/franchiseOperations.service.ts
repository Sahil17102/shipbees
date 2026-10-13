import { asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { franchiseShipmentAttributions } from '../schema/franchise'
import { ndr_events } from '../schema/ndr'
import { rto_events } from '../schema/rto'
import { tracking_events } from '../schema/trackingEvents'

type OperationalEvent = {
  id: string
  status: string
  description: string | null
  location: string | null
  attempt: string | null
  chargesPaise: number
  createdAt: Date | null
}

const groupByOrder = <T extends { orderId: string }>(rows: T[]) => {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const current = grouped.get(row.orderId) || []
    current.push(row)
    grouped.set(row.orderId, current)
  }
  return grouped
}

const sortedEvents = (events: OperationalEvent[]) =>
  events.sort(
    (left, right) =>
      new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime(),
  )

export const getFranchiseOperationalShipments = async (organizationId: string) => {
  const attributions = await db
    .select()
    .from(franchiseShipmentAttributions)
    .where(eq(franchiseShipmentAttributions.organizationId, organizationId))
    .orderBy(desc(franchiseShipmentAttributions.bookedAt))

  const b2cOrderIds = Array.from(
    new Set(
      attributions
        .filter((attribution) => attribution.shipmentType === 'b2c')
        .map((attribution) => attribution.shipmentId),
    ),
  )

  const [orders, trackingRows, ndrRows, rtoRows] =
    b2cOrderIds.length === 0
      ? [[], [], [], []]
      : await Promise.all([
          db
            .select({
              id: b2c_orders.id,
              orderStatus: b2c_orders.order_status,
              pickupStatus: b2c_orders.pickup_status,
              courierPartner: b2c_orders.courier_partner,
              providerStatus: b2c_orders.provider_last_status,
              shippingMode: b2c_orders.shipping_mode,
              createdAt: b2c_orders.created_at,
              updatedAt: b2c_orders.updated_at,
            })
            .from(b2c_orders)
            .where(inArray(b2c_orders.id, b2cOrderIds)),
          db
            .select({
              id: tracking_events.id,
              orderId: tracking_events.order_id,
              status: tracking_events.status_code,
              description: tracking_events.status_text,
              location: tracking_events.location,
              createdAt: tracking_events.created_at,
            })
            .from(tracking_events)
            .where(inArray(tracking_events.order_id, b2cOrderIds))
            .orderBy(asc(tracking_events.created_at)),
          db
            .select({
              id: ndr_events.id,
              orderId: ndr_events.order_id,
              status: ndr_events.status,
              reason: ndr_events.reason,
              remarks: ndr_events.remarks,
              attempt: ndr_events.attempt_no,
              createdAt: ndr_events.created_at,
            })
            .from(ndr_events)
            .where(inArray(ndr_events.order_id, b2cOrderIds))
            .orderBy(asc(ndr_events.created_at)),
          db
            .select({
              id: rto_events.id,
              orderId: rto_events.order_id,
              status: rto_events.status,
              reason: rto_events.reason,
              remarks: rto_events.remarks,
              charges: rto_events.rto_charges,
              createdAt: rto_events.created_at,
            })
            .from(rto_events)
            .where(inArray(rto_events.order_id, b2cOrderIds))
            .orderBy(asc(rto_events.created_at)),
        ])

  const orderById = new Map(orders.map((order) => [order.id, order]))
  const trackingByOrder = groupByOrder(trackingRows)
  const ndrByOrder = groupByOrder(ndrRows)
  const rtoByOrder = groupByOrder(rtoRows)

  return attributions.map((attribution) => {
    const order = orderById.get(attribution.shipmentId)
    const trackingTimeline: OperationalEvent[] = [
      {
        id: `attribution-${attribution.id}`,
        status: 'attributed',
        description: 'Shipment entered the franchise territory ledger',
        location: [attribution.originCity, attribution.originState].filter(Boolean).join(', '),
        attempt: null,
        chargesPaise: 0,
        createdAt: attribution.bookedAt,
      },
      ...(trackingByOrder.get(attribution.shipmentId) || []).map((event) => ({
        id: event.id,
        status: event.status || 'tracking_update',
        description: event.description,
        location: event.location,
        attempt: null,
        chargesPaise: 0,
        createdAt: event.createdAt,
      })),
    ]
    const ndrTimeline: OperationalEvent[] = (ndrByOrder.get(attribution.shipmentId) || []).map(
      (event) => ({
        id: event.id,
        status: event.status,
        description: event.reason || event.remarks,
        location: null,
        attempt: event.attempt,
        chargesPaise: 0,
        createdAt: event.createdAt,
      }),
    )
    const rtoTimeline: OperationalEvent[] = (rtoByOrder.get(attribution.shipmentId) || []).map(
      (event) => ({
        id: event.id,
        status: event.status,
        description: event.reason || event.remarks,
        location: null,
        attempt: null,
        chargesPaise: Math.round(Number(event.charges || 0) * 100),
        createdAt: event.createdAt,
      }),
    )
    const latestTracking = trackingTimeline[trackingTimeline.length - 1]
    const latestNdr = ndrTimeline[ndrTimeline.length - 1] || null
    const latestRto = rtoTimeline[rtoTimeline.length - 1] || null

    return {
      id: attribution.id,
      shipmentId: attribution.shipmentId,
      shipmentType: attribution.shipmentType,
      awbMasked: attribution.awbMasked,
      courierProvider: order?.courierPartner || attribution.courierProvider,
      originPincode: attribution.originPincode,
      originCity: attribution.originCity,
      originState: attribution.originState,
      tier: attribution.tier,
      attributionStatus: attribution.attributionStatus,
      currentStatus:
        order?.providerStatus || order?.orderStatus || latestTracking?.status || attribution.orderStatus,
      pickupStatus: order?.pickupStatus || null,
      shippingMode: order?.shippingMode || null,
      bookedAt: attribution.bookedAt,
      updatedAt: order?.updatedAt || latestTracking?.createdAt || attribution.updatedAt,
      latestTracking,
      trackingTimeline: sortedEvents(trackingTimeline),
      latestNdr,
      ndrTimeline: sortedEvents(ndrTimeline),
      latestRto,
      rtoTimeline: sortedEvents(rtoTimeline),
      totalRtoChargesPaise: rtoTimeline.reduce(
        (total, event) => total + event.chargesPaise,
        0,
      ),
    }
  })
}
