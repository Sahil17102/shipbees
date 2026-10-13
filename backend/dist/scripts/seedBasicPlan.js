"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const ensureBasicPlan = async (businessType, description) => {
    const existing = await client_1.db
        .select()
        .from(schema_1.plans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.plans.name, 'Basic'), (0, drizzle_orm_1.eq)(schema_1.plans.business_type, businessType)))
        .limit(1);
    if (existing.length > 0) {
        console.log(`Basic ${businessType.toUpperCase()} plan already exists:`, existing[0]);
        return existing[0];
    }
    const [plan] = await client_1.db
        .insert(schema_1.plans)
        .values({
        id: (0, crypto_1.randomUUID)(),
        name: 'Basic',
        description,
        business_type: businessType,
        created_at: new Date(),
    })
        .returning();
    console.log(`Seeded Basic ${businessType.toUpperCase()} plan:`, plan);
    return plan;
};
async function seedBasicPlan() {
    await ensureBasicPlan('b2c', 'Default B2C plan assigned to all new users');
    await ensureBasicPlan('b2b', 'Default B2B plan assigned to all users');
}
seedBasicPlan()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});
