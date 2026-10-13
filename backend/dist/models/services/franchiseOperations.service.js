"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFranchiseOperationalShipments = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const franchise_1 = require("../schema/franchise");
const ndr_1 = require("../schema/ndr");
const rto_1 = require("../schema/rto");
const trackingEvents_1 = require("../schema/trackingEvents");
const groupByOrder = (rows) => {
    const grouped = new Map();
    for (const row of rows) {
        const current = grouped.get(row.orderId) || [];
        current.push(row);
        grouped.set(row.orderId, current);
    }
    return grouped;
};
const sortedEvents = (events) => events.sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime());
const getFranchiseOperationalShipments = async (organizationId) => {
    const attributions = await client_1.db
        .select()
        .from(franchise_1.franchiseShipmentAttributions)
        .where((0, drizzle_orm_1.eq)(franchise_1.franchiseShipmentAttributions.organizationId, organizationId))
        .orderBy((0, drizzle_orm_1.desc)(franchise_1.franchiseShipmentAttributions.bookedAt));
    const b2cOrderIds = Array.from(new Set(attributions
        .filter((attribution) => attribution.shipmentType === 'b2c')
        .map((attribution) => attribution.shipmentId)));
    const [orders, trackingRows, ndrRows, rtoRows] = b2cOrderIds.length === 0
        ? [[], [], [], []]
        : await Promise.all([
            client_1.db
                .select({
                id: b2cOrders_1.b2c_orders.id,
                orderStatus: b2cOrders_1.b2c_orders.order_status,
                pickupStatus: b2cOrders_1.b2c_orders.pickup_status,
                courierPartner: b2cOrders_1.b2c_orders.courier_partner,
                providerStatus: b2cOrders_1.b2c_orders.provider_last_status,
                shippingMode: b2cOrders_1.b2c_orders.shipping_mode,
                createdAt: b2cOrders_1.b2c_orders.created_at,
                updatedAt: b2cOrders_1.b2c_orders.updated_at,
            })
                .from(b2cOrders_1.b2c_orders)
                .where((0, drizzle_orm_1.inArray)(b2cOrders_1.b2c_orders.id, b2cOrderIds)),
            client_1.db
                .select({
                id: trackingEvents_1.tracking_events.id,
                orderId: trackingEvents_1.tracking_events.order_id,
                status: trackingEvents_1.tracking_events.status_code,
                description: trackingEvents_1.tracking_events.status_text,
                location: trackingEvents_1.tracking_events.location,
                createdAt: trackingEvents_1.tracking_events.created_at,
            })
                .from(trackingEvents_1.tracking_events)
                .where((0, drizzle_orm_1.inArray)(trackingEvents_1.tracking_events.order_id, b2cOrderIds))
                .orderBy((0, drizzle_orm_1.asc)(trackingEvents_1.tracking_events.created_at)),
            client_1.db
                .select({
                id: ndr_1.ndr_events.id,
                orderId: ndr_1.ndr_events.order_id,
                status: ndr_1.ndr_events.status,
                reason: ndr_1.ndr_events.reason,
                remarks: ndr_1.ndr_events.remarks,
                attempt: ndr_1.ndr_events.attempt_no,
                createdAt: ndr_1.ndr_events.created_at,
            })
                .from(ndr_1.ndr_events)
                .where((0, drizzle_orm_1.inArray)(ndr_1.ndr_events.order_id, b2cOrderIds))
                .orderBy((0, drizzle_orm_1.asc)(ndr_1.ndr_events.created_at)),
            client_1.db
                .select({
                id: rto_1.rto_events.id,
                orderId: rto_1.rto_events.order_id,
                status: rto_1.rto_events.status,
                reason: rto_1.rto_events.reason,
                remarks: rto_1.rto_events.remarks,
                charges: rto_1.rto_events.rto_charges,
                createdAt: rto_1.rto_events.created_at,
            })
                .from(rto_1.rto_events)
                .where((0, drizzle_orm_1.inArray)(rto_1.rto_events.order_id, b2cOrderIds))
                .orderBy((0, drizzle_orm_1.asc)(rto_1.rto_events.created_at)),
        ]);
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const trackingByOrder = groupByOrder(trackingRows);
    const ndrByOrder = groupByOrder(ndrRows);
    const rtoByOrder = groupByOrder(rtoRows);
    return attributions.map((attribution) => {
        const order = orderById.get(attribution.shipmentId);
        const trackingTimeline = [
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
        ];
        const ndrTimeline = (ndrByOrder.get(attribution.shipmentId) || []).map((event) => ({
            id: event.id,
            status: event.status,
            description: event.reason || event.remarks,
            location: null,
            attempt: event.attempt,
            chargesPaise: 0,
            createdAt: event.createdAt,
        }));
        const rtoTimeline = (rtoByOrder.get(attribution.shipmentId) || []).map((event) => ({
            id: event.id,
            status: event.status,
            description: event.reason || event.remarks,
            location: null,
            attempt: null,
            chargesPaise: Math.round(Number(event.charges || 0) * 100),
            createdAt: event.createdAt,
        }));
        const latestTracking = trackingTimeline[trackingTimeline.length - 1];
        const latestNdr = ndrTimeline[ndrTimeline.length - 1] || null;
        const latestRto = rtoTimeline[rtoTimeline.length - 1] || null;
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
            currentStatus: order?.providerStatus || order?.orderStatus || latestTracking?.status || attribution.orderStatus,
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
            totalRtoChargesPaise: rtoTimeline.reduce((total, event) => total + event.chargesPaise, 0),
        };
    });
};
exports.getFranchiseOperationalShipments = getFranchiseOperationalShipments;
