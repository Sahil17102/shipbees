"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
async function assignBasicPlans() {
    const basicPlans = await client_1.db.select().from(schema_1.plans).where((0, drizzle_orm_1.eq)(schema_1.plans.name, 'Basic'));
    const basicB2CPlan = basicPlans.find((plan) => plan.business_type === 'b2c');
    const basicB2BPlan = basicPlans.find((plan) => plan.business_type === 'b2b');
    if (!basicB2CPlan || !basicB2BPlan) {
        throw new Error('Basic B2C/B2B plans not found. Run seedBasicPlan.ts first.');
    }
    const appUsers = await client_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.role, 'customer'));
    console.log(`Found ${appUsers.length} users with role "customer".`);
    for (const user of appUsers) {
        const existingB2C = await client_1.db
            .select()
            .from(schema_1.userPlans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPlans.userId, user.id), (0, drizzle_orm_1.eq)(schema_1.userPlans.business_type, 'b2c')))
            .limit(1);
        const existingB2B = await client_1.db
            .select()
            .from(schema_1.userPlans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPlans.userId, user.id), (0, drizzle_orm_1.eq)(schema_1.userPlans.business_type, 'b2b')))
            .limit(1);
        if (!existingB2C.length) {
            await client_1.db.insert(schema_1.userPlans).values({
                id: (0, crypto_1.randomUUID)(),
                userId: user.id,
                plan_id: basicB2CPlan.id,
                business_type: 'b2c',
                assigned_at: new Date(),
                is_active: true,
            });
            console.log(`Assigned Basic B2C plan to ${user.email}`);
        }
        if (!existingB2B.length) {
            await client_1.db.insert(schema_1.userPlans).values({
                id: (0, crypto_1.randomUUID)(),
                userId: user.id,
                plan_id: basicB2BPlan.id,
                business_type: 'b2b',
                assigned_at: new Date(),
                is_active: true,
            });
            console.log(`Assigned Basic B2B plan to ${user.email}`);
        }
    }
    console.log('Done seeding Basic B2C/B2B plans to users.');
}
assignBasicPlans()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});
