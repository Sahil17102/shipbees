"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const couriers_1 = require("../models/schema/couriers");
const delhiveryCourier_1 = require("../utils/delhiveryCourier");
async function seedDelhiveryB2CCouriers() {
    const now = new Date();
    for (const courier of delhiveryCourier_1.DELHIVERY_B2C_COURIER_CATALOG) {
        await client_1.db
            .insert(couriers_1.couriers)
            .values({
            id: courier.id,
            name: courier.name,
            serviceProvider: courier.serviceProvider,
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
    const expectedIds = delhiveryCourier_1.DELHIVERY_B2C_COURIER_CATALOG.map((courier) => courier.id);
    const savedCouriers = await client_1.db
        .select({
        id: couriers_1.couriers.id,
        name: couriers_1.couriers.name,
        serviceProvider: couriers_1.couriers.serviceProvider,
        isEnabled: couriers_1.couriers.isEnabled,
        businessType: couriers_1.couriers.businessType,
    })
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, 'delhivery'), (0, drizzle_orm_1.inArray)(couriers_1.couriers.id, expectedIds)))
        .orderBy(couriers_1.couriers.id);
    if (savedCouriers.length !== delhiveryCourier_1.DELHIVERY_B2C_COURIER_CATALOG.length) {
        throw new Error('Delhivery B2C courier catalog verification failed');
    }
    console.log('Delhivery B2C courier catalog seeded successfully');
    console.log(JSON.stringify(savedCouriers, null, 2));
}
seedDelhiveryB2CCouriers()
    .catch((error) => {
    console.error('Failed to seed Delhivery B2C courier catalog:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end();
});
