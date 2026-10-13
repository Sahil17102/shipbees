"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const couriers_1 = require("../models/schema/couriers");
const VELOCITY_COURIER_CATALOG = [
    { id: 890001, name: 'DTDC Express' },
    { id: 890002, name: 'XpressBees Standard 5Kg' },
    { id: 890003, name: 'Amazon Standard 5KG' },
    { id: 890004, name: 'Amazon Standard 10KG' },
    { id: 890005, name: 'XpressBees Standard 2Kg' },
    { id: 847019, name: 'Shadowfax Standard' },
    { id: 889547, name: 'DTDC Standard' },
    { id: 825757, name: 'Ekart Standard' },
    { id: 808800, name: 'Amazon Transportation' },
    { id: 849989, name: 'XpressBees Standard' },
    { id: 814793, name: 'ElasticRun NDD' },
    { id: 854822, name: 'Bluedart Standard' },
    { id: 835985, name: 'Bluedart Air' },
    { id: 890006, name: 'Delhivery Express' },
    { id: 853331, name: 'Delhivery Standard 5 Kg' },
    { id: 890007, name: 'Delhivery Standard 2 Kg' },
    { id: 890008, name: 'Delhivery Standard 10 Kg' },
    { id: 858447, name: 'Delhivery Standard' },
];
async function seedVelocityCouriers() {
    const now = new Date();
    for (const courier of VELOCITY_COURIER_CATALOG) {
        await client_1.db
            .insert(couriers_1.couriers)
            .values({
            id: courier.id,
            name: courier.name,
            serviceProvider: 'velocity',
            isEnabled: true,
            businessType: ['b2c'],
            createdAt: now,
            updatedAt: now,
        })
            .onConflictDoUpdate({
            target: [couriers_1.couriers.id, couriers_1.couriers.serviceProvider],
            set: {
                name: courier.name,
                isEnabled: true,
                businessType: ['b2c'],
                updatedAt: now,
            },
        });
    }
    const expectedIds = VELOCITY_COURIER_CATALOG.map((courier) => courier.id);
    const savedCouriers = await client_1.db
        .select({
        id: couriers_1.couriers.id,
        name: couriers_1.couriers.name,
        serviceProvider: couriers_1.couriers.serviceProvider,
        isEnabled: couriers_1.couriers.isEnabled,
        businessType: couriers_1.couriers.businessType,
    })
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, 'velocity'), (0, drizzle_orm_1.inArray)(couriers_1.couriers.id, expectedIds)))
        .orderBy(couriers_1.couriers.name);
    if (savedCouriers.length !== VELOCITY_COURIER_CATALOG.length) {
        throw new Error(`Velocity courier catalog verification failed: expected ${VELOCITY_COURIER_CATALOG.length}, found ${savedCouriers.length}`);
    }
    console.log('Velocity courier catalog seeded successfully');
    console.log(JSON.stringify(savedCouriers, null, 2));
}
seedVelocityCouriers()
    .catch((error) => {
    console.error('Failed to seed Velocity courier catalog:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end();
});
