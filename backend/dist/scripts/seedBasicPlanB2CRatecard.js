"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const couriers_1 = require("../models/schema/couriers");
const plans_1 = require("../models/schema/plans");
const shippingRates_1 = require("../models/schema/shippingRates");
const zones_1 = require("../models/schema/zones");
const courierIntegration_service_1 = require("../models/services/courierIntegration.service");
const BASIC_PLAN_NAME = 'basic';
const COD_CHARGE = 10;
const COD_PERCENT = 1;
const BASE_RATE = 10;
const EXTRA_RATE = 10;
const EXTRA_WEIGHT_UNIT_KG = 1;
const RATE_CARD_MODE = '';
const BASIC_B2C_SLABS = [
    {
        weight_from: 0,
        weight_to: 0.5,
        rate: BASE_RATE,
        extra_rate: EXTRA_RATE,
        extra_weight_unit: EXTRA_WEIGHT_UNIT_KG,
    },
];
const supportsB2C = (businessType) => {
    if (!Array.isArray(businessType))
        return false;
    return businessType.map((type) => String(type).toLowerCase()).includes('b2c');
};
async function seedBasicPlanB2CRateCard() {
    const [basicPlan] = await client_1.db
        .select()
        .from(plans_1.plans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `lower(${plans_1.plans.name}) = ${BASIC_PLAN_NAME}`, (0, drizzle_orm_1.eq)(plans_1.plans.business_type, 'b2c')))
        .limit(1);
    if (!basicPlan) {
        throw new Error('Basic plan not found');
    }
    const b2cZones = await client_1.db
        .select()
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.eq)(zones_1.zones.business_type, 'B2C'))
        .orderBy((0, drizzle_orm_1.asc)(zones_1.zones.code));
    if (!b2cZones.length) {
        throw new Error('No B2C zones found');
    }
    const enabledCouriers = await client_1.db
        .select()
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.eq)(couriers_1.couriers.isEnabled, true))
        .orderBy((0, drizzle_orm_1.asc)(couriers_1.couriers.serviceProvider), (0, drizzle_orm_1.asc)(couriers_1.couriers.id));
    const b2cCouriers = enabledCouriers.filter((courier) => supportsB2C(courier.businessType));
    if (!b2cCouriers.length) {
        throw new Error('No enabled B2C couriers found');
    }
    const deletedRates = await client_1.db
        .delete(shippingRates_1.shippingRates)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, basicPlan.id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c')))
        .returning({ id: shippingRates_1.shippingRates.id });
    let savedRows = 0;
    for (const courier of b2cCouriers) {
        for (const zone of b2cZones) {
            savedRows += await (0, courierIntegration_service_1.upsertShippingRate)({
                courier_id: String(courier.id),
                courier_name: courier.name,
                service_provider: courier.serviceProvider,
                plan_id: basicPlan.id,
                mode: RATE_CARD_MODE,
                business_type: 'b2c',
                cod_charges: COD_CHARGE,
                cod_percent: COD_PERCENT,
                other_charges: null,
                rates: [{ zone_id: zone.id, type: 'forward', rate: BASE_RATE }],
                zone_slabs: { [zone.id]: { forward: BASIC_B2C_SLABS } },
            });
            savedRows += await (0, courierIntegration_service_1.upsertShippingRate)({
                courier_id: String(courier.id),
                courier_name: courier.name,
                service_provider: courier.serviceProvider,
                plan_id: basicPlan.id,
                mode: RATE_CARD_MODE,
                business_type: 'b2c',
                cod_charges: null,
                cod_percent: null,
                other_charges: null,
                rates: [{ zone_id: zone.id, type: 'rto', rate: BASE_RATE }],
                zone_slabs: { [zone.id]: { rto: BASIC_B2C_SLABS } },
            });
        }
    }
    console.log(`Seeded Basic plan B2C rate cards: deleted ${deletedRates.length} old rows and saved ${savedRows} rows for ${b2cCouriers.length} couriers across ${b2cZones.length} zones.`);
}
seedBasicPlanB2CRateCard()
    .catch((error) => {
    console.error('Failed to seed Basic plan B2C rate cards:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end();
});
