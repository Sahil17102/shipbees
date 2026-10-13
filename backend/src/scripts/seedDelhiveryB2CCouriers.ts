import { and, eq, inArray } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { couriers } from '../models/schema/couriers'
import { DELHIVERY_B2C_COURIER_CATALOG } from '../utils/delhiveryCourier'

async function seedDelhiveryB2CCouriers() {
  const now = new Date()

  for (const courier of DELHIVERY_B2C_COURIER_CATALOG) {
    await db
      .insert(couriers)
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
        target: [couriers.id, couriers.serviceProvider],
        set: {
          name: courier.name,
          isEnabled: true,
          businessType: ['b2c'],
          updatedAt: now,
        },
      })
  }

  const expectedIds = DELHIVERY_B2C_COURIER_CATALOG.map((courier) => courier.id)
  const savedCouriers = await db
    .select({
      id: couriers.id,
      name: couriers.name,
      serviceProvider: couriers.serviceProvider,
      isEnabled: couriers.isEnabled,
      businessType: couriers.businessType,
    })
    .from(couriers)
    .where(
      and(
        eq(couriers.serviceProvider, 'delhivery'),
        inArray(couriers.id, expectedIds),
      ),
    )
    .orderBy(couriers.id)

  if (savedCouriers.length !== DELHIVERY_B2C_COURIER_CATALOG.length) {
    throw new Error('Delhivery B2C courier catalog verification failed')
  }

  console.log('Delhivery B2C courier catalog seeded successfully')
  console.log(JSON.stringify(savedCouriers, null, 2))
}

seedDelhiveryB2CCouriers()
  .catch((error) => {
    console.error('Failed to seed Delhivery B2C courier catalog:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
