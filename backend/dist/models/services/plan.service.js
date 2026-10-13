"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensurePlanSplitSetup = exports.PlansService = exports.listUserPlanAssignments = exports.getUserPlanId = exports.getUserPlanAssignment = exports.getDefaultPlanByBusinessType = exports.getPlanById = exports.normalizePlanBusinessType = void 0;
// src/services/plans.service.ts
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const plans_1 = require("../schema/plans");
const userPlans_1 = require("../schema/userPlans");
const users_1 = require("../schema/users");
const zones_1 = require("../schema/zones");
const normalizePlanBusinessType = (value) => String(value ?? '').trim().toLowerCase() === 'b2b' ? 'b2b' : 'b2c';
exports.normalizePlanBusinessType = normalizePlanBusinessType;
let ensurePlanSplitSetupPromise = null;
const ensurePlanSplitSetup = async () => {
    if (!ensurePlanSplitSetupPromise) {
        ensurePlanSplitSetupPromise = (async () => {
            await client_1.db.execute(drizzle_orm_1.sql.raw(`
        ALTER TABLE "plans"
        ADD COLUMN IF NOT EXISTS "business_type" varchar(10) NOT NULL DEFAULT 'b2c';
      `));
            await client_1.db.execute(drizzle_orm_1.sql.raw(`
        UPDATE "plans"
        SET "business_type" = 'b2c'
        WHERE "business_type" IS NULL OR btrim("business_type") = '';
      `));
            await client_1.db.execute(drizzle_orm_1.sql.raw(`
        ALTER TABLE "user_plans"
        ADD COLUMN IF NOT EXISTS "business_type" varchar(10) NOT NULL DEFAULT 'b2c';
      `));
            await client_1.db.execute(drizzle_orm_1.sql.raw(`
        UPDATE "user_plans" up
        SET "business_type" = CASE
          WHEN p."business_type" = 'b2b' THEN 'b2b'
          ELSE 'b2c'
        END
        FROM "plans" p
        WHERE p."id" = up."plan_id"
          AND (up."business_type" IS NULL OR btrim(up."business_type") = '');
      `));
            await client_1.db.execute(drizzle_orm_1.sql.raw(`
        UPDATE "user_plans"
        SET "business_type" = 'b2c'
        WHERE "business_type" IS NULL OR btrim("business_type") = '';
      `));
            await client_1.db.execute(drizzle_orm_1.sql.raw(`
        ALTER TABLE "user_plans" DROP CONSTRAINT IF EXISTS "user_plans_userId_key";
        ALTER TABLE "user_plans" DROP CONSTRAINT IF EXISTS "user_plans_userId_unique";
        DROP INDEX IF EXISTS "user_plans_user_business_type_unique";
        CREATE UNIQUE INDEX "user_plans_user_business_type_unique"
        ON "user_plans" ("userId", "business_type");
      `));
            await client_1.db.execute(drizzle_orm_1.sql.raw(`
        DO $$
        DECLARE
          b2b_basic_plan_id uuid;
        BEGIN
          SELECT "id"
          INTO b2b_basic_plan_id
          FROM "plans"
          WHERE lower(btrim("name")) = 'basic'
            AND "business_type" = 'b2b'
          ORDER BY "created_at" DESC NULLS LAST
          LIMIT 1;

          IF b2b_basic_plan_id IS NULL THEN
            INSERT INTO "plans" ("name", "description", "business_type", "is_active", "created_at")
            VALUES (
              'Basic',
              'Default B2B plan assigned automatically',
              'b2b',
              true,
              NOW()
            )
            RETURNING "id" INTO b2b_basic_plan_id;
          END IF;

          INSERT INTO "user_plans" ("userId", "plan_id", "business_type", "assigned_at", "is_active")
          SELECT
            preserved."userId",
            preserved."plan_id",
            'b2c',
            COALESCE(preserved."assigned_at", NOW()),
            COALESCE(preserved."is_active", true)
          FROM (
            SELECT DISTINCT ON (up."userId")
              up."userId",
              up."plan_id",
              up."assigned_at",
              up."is_active"
            FROM "user_plans" up
            LEFT JOIN "plans" p ON p."id" = up."plan_id"
            WHERE COALESCE(NULLIF(btrim(up."business_type"), ''), 'b2c') = 'b2c'
               OR COALESCE(p."business_type", 'b2c') = 'b2c'
            ORDER BY up."userId", up."assigned_at" DESC NULLS LAST, up."id" DESC
          ) preserved
          WHERE NOT EXISTS (
            SELECT 1
            FROM "user_plans" existing_b2c
            WHERE existing_b2c."userId" = preserved."userId"
              AND existing_b2c."business_type" = 'b2c'
          );

          UPDATE "user_plans" up
          SET
            "plan_id" = b2b_basic_plan_id,
            "assigned_at" = NOW(),
            "is_active" = true
          WHERE up."business_type" = 'b2b'
            AND EXISTS (
              SELECT 1
              FROM "plans" p
              WHERE p."id" = up."plan_id"
                AND COALESCE(p."business_type", 'b2c') <> 'b2b'
            );

          INSERT INTO "user_plans" ("userId", "plan_id", "business_type", "assigned_at", "is_active")
          SELECT
            u."id",
            b2b_basic_plan_id,
            'b2b',
            NOW(),
            true
          FROM "users" u
          WHERE NOT EXISTS (
            SELECT 1
            FROM "user_plans" up
            WHERE up."userId" = u."id"
              AND up."business_type" = 'b2b'
          );

          IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'shipray_b2b_zone_to_zone_rates'
          ) THEN
            UPDATE "shipray_b2b_zone_to_zone_rates"
            SET "plan_id" = b2b_basic_plan_id
            WHERE "plan_id" IS NULL;
          END IF;

          IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'shipray_b2b_additional_charges'
          ) THEN
            UPDATE "shipray_b2b_additional_charges"
            SET "plan_id" = b2b_basic_plan_id
            WHERE "plan_id" IS NULL;
          END IF;

          IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'shipray_b2b_overhead_rules'
          ) THEN
            UPDATE "shipray_b2b_overhead_rules"
            SET "plan_id" = b2b_basic_plan_id
            WHERE "plan_id" IS NULL;
          END IF;
        END $$;
      `));
        })().catch((error) => {
            ensurePlanSplitSetupPromise = null;
            throw error;
        });
    }
    return ensurePlanSplitSetupPromise;
};
exports.ensurePlanSplitSetup = ensurePlanSplitSetup;
const getPlansByBusinessType = async (businessType, includeInactive = false) => {
    const conditions = [(0, drizzle_orm_1.eq)(plans_1.plans.business_type, businessType)];
    if (!includeInactive) {
        conditions.push((0, drizzle_orm_1.eq)(plans_1.plans.is_active, true));
    }
    return client_1.db.select().from(plans_1.plans).where((0, drizzle_orm_1.and)(...conditions)).orderBy((0, drizzle_orm_1.desc)(plans_1.plans.created_at));
};
const getPlanById = async (planId) => {
    await ensurePlanSplitSetup();
    const [plan] = await client_1.db.select().from(plans_1.plans).where((0, drizzle_orm_1.eq)(plans_1.plans.id, planId)).limit(1);
    return plan ?? null;
};
exports.getPlanById = getPlanById;
const getDefaultPlanByBusinessType = async (businessType, excludePlanId) => {
    const candidates = await getPlansByBusinessType(businessType);
    const filteredCandidates = excludePlanId
        ? candidates.filter((plan) => plan.id !== excludePlanId)
        : candidates;
    const basicPlan = filteredCandidates.find((plan) => plan.name.trim().toLowerCase() === 'basic');
    return basicPlan ?? filteredCandidates[0] ?? null;
};
exports.getDefaultPlanByBusinessType = getDefaultPlanByBusinessType;
const getUserPlanAssignment = async (userId, businessType) => {
    await ensurePlanSplitSetup();
    const [assignment] = await client_1.db
        .select({
        id: userPlans_1.userPlans.id,
        userId: userPlans_1.userPlans.userId,
        plan_id: userPlans_1.userPlans.plan_id,
        business_type: userPlans_1.userPlans.business_type,
        assigned_at: userPlans_1.userPlans.assigned_at,
        is_active: userPlans_1.userPlans.is_active,
        planName: plans_1.plans.name,
    })
        .from(userPlans_1.userPlans)
        .leftJoin(plans_1.plans, (0, drizzle_orm_1.eq)(plans_1.plans.id, userPlans_1.userPlans.plan_id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userId), (0, drizzle_orm_1.eq)(userPlans_1.userPlans.business_type, businessType), (0, drizzle_orm_1.eq)(userPlans_1.userPlans.is_active, true)))
        .limit(1);
    return assignment ?? null;
};
exports.getUserPlanAssignment = getUserPlanAssignment;
const getUserPlanId = async (userId, businessType) => {
    const assignment = await (0, exports.getUserPlanAssignment)(userId, businessType);
    return assignment?.plan_id ?? null;
};
exports.getUserPlanId = getUserPlanId;
const listUserPlanAssignments = async (userId) => {
    await ensurePlanSplitSetup();
    return client_1.db
        .select({
        id: userPlans_1.userPlans.id,
        userId: userPlans_1.userPlans.userId,
        plan_id: userPlans_1.userPlans.plan_id,
        business_type: userPlans_1.userPlans.business_type,
        assigned_at: userPlans_1.userPlans.assigned_at,
        is_active: userPlans_1.userPlans.is_active,
        planName: plans_1.plans.name,
    })
        .from(userPlans_1.userPlans)
        .leftJoin(plans_1.plans, (0, drizzle_orm_1.eq)(plans_1.plans.id, userPlans_1.userPlans.plan_id))
        .where((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userId));
};
exports.listUserPlanAssignments = listUserPlanAssignments;
const seedDefaultB2BAssignmentsAndRates = async (planId) => {
    await client_1.db.transaction(async (tx) => {
        const allUsers = await tx.select({ id: users_1.users.id }).from(users_1.users);
        const existingAssignments = await tx
            .select({ userId: userPlans_1.userPlans.userId })
            .from(userPlans_1.userPlans)
            .where((0, drizzle_orm_1.eq)(userPlans_1.userPlans.business_type, 'b2b'));
        const existingUserIds = new Set(existingAssignments.map((assignment) => assignment.userId));
        const missingAssignments = allUsers
            .filter((user) => !existingUserIds.has(user.id))
            .map((user) => ({
            userId: user.id,
            plan_id: planId,
            business_type: 'b2b',
            is_active: true,
        }));
        if (missingAssignments.length > 0) {
            await tx.insert(userPlans_1.userPlans).values(missingAssignments);
        }
        await tx
            .update(zones_1.b2bZoneToZoneRates)
            .set({ plan_id: planId, updated_at: new Date() })
            .where((0, drizzle_orm_1.isNull)(zones_1.b2bZoneToZoneRates.plan_id));
        await tx
            .update(zones_1.b2bAdditionalCharges)
            .set({ plan_id: planId, updated_at: new Date() })
            .where((0, drizzle_orm_1.isNull)(zones_1.b2bAdditionalCharges.plan_id));
        await tx
            .update(zones_1.b2bOverheadRules)
            .set({ plan_id: planId, updated_at: new Date() })
            .where((0, drizzle_orm_1.isNull)(zones_1.b2bOverheadRules.plan_id));
    });
};
exports.PlansService = {
    getAll: async (options) => {
        await ensurePlanSplitSetup();
        const conditions = [];
        if (options?.businessType) {
            conditions.push((0, drizzle_orm_1.eq)(plans_1.plans.business_type, (0, exports.normalizePlanBusinessType)(options.businessType)));
        }
        if (options?.status === 'active') {
            conditions.push((0, drizzle_orm_1.eq)(plans_1.plans.is_active, true));
        }
        else if (options?.status === 'inactive') {
            conditions.push((0, drizzle_orm_1.eq)(plans_1.plans.is_active, false));
        }
        return client_1.db
            .select()
            .from(plans_1.plans)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(plans_1.plans.created_at));
    },
    create: async (data) => {
        await ensurePlanSplitSetup();
        const businessType = (0, exports.normalizePlanBusinessType)(data.business_type);
        const existingTypedPlans = businessType === 'b2b'
            ? await client_1.db
                .select({ id: plans_1.plans.id })
                .from(plans_1.plans)
                .where((0, drizzle_orm_1.eq)(plans_1.plans.business_type, 'b2b'))
                .limit(1)
            : [];
        const [newPlan] = await client_1.db
            .insert(plans_1.plans)
            .values({
            name: data.name,
            description: data.description,
            business_type: businessType,
        })
            .returning();
        if (businessType === 'b2b' && existingTypedPlans.length === 0) {
            await seedDefaultB2BAssignmentsAndRates(newPlan.id);
        }
        return newPlan;
    },
    update: async (id, data) => {
        await ensurePlanSplitSetup();
        const { name, description, is_active } = data;
        const [updated] = await client_1.db
            .update(plans_1.plans)
            .set({
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(is_active !== undefined && { is_active }),
        })
            .where((0, drizzle_orm_1.eq)(plans_1.plans.id, id))
            .returning();
        return updated;
    },
    deactivate: async (planId) => {
        try {
            await ensurePlanSplitSetup();
            const planToDeactivate = await (0, exports.getPlanById)(planId);
            if (!planToDeactivate) {
                throw new Error('Plan not found');
            }
            const businessType = (0, exports.normalizePlanBusinessType)(planToDeactivate.business_type);
            const fallbackPlan = await (0, exports.getDefaultPlanByBusinessType)(businessType, planId);
            if (!fallbackPlan) {
                throw new Error('No fallback plan available for this business type');
            }
            const [deactivatedPlan] = await client_1.db
                .update(plans_1.plans)
                .set({ is_active: false })
                .where((0, drizzle_orm_1.eq)(plans_1.plans.id, planId))
                .returning();
            await client_1.db
                .update(userPlans_1.userPlans)
                .set({ plan_id: fallbackPlan.id })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(userPlans_1.userPlans.plan_id, planId), (0, drizzle_orm_1.eq)(userPlans_1.userPlans.business_type, businessType)));
            return deactivatedPlan;
        }
        catch (err) {
            console.error('Failed to deactivate plan:', err);
            throw new Error(err instanceof Error ? err.message : 'Unknown error');
        }
    },
    assignOrUpdateUserPlan: async (userId, planId, businessType) => {
        await ensurePlanSplitSetup();
        const plan = await (0, exports.getPlanById)(planId);
        if (!plan) {
            throw new Error('Plan not found');
        }
        const normalizedBusinessType = (0, exports.normalizePlanBusinessType)(businessType ?? plan.business_type ?? 'b2c');
        if ((0, exports.normalizePlanBusinessType)(plan.business_type) !== normalizedBusinessType) {
            throw new Error('Selected plan does not match the requested business type');
        }
        const existing = await client_1.db
            .select()
            .from(userPlans_1.userPlans)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userId), (0, drizzle_orm_1.eq)(userPlans_1.userPlans.business_type, normalizedBusinessType)))
            .limit(1);
        if (existing.length > 0) {
            const [updated] = await client_1.db
                .update(userPlans_1.userPlans)
                .set({ plan_id: planId, business_type: normalizedBusinessType, is_active: true })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userId), (0, drizzle_orm_1.eq)(userPlans_1.userPlans.business_type, normalizedBusinessType)))
                .returning();
            return updated;
        }
        const [inserted] = await client_1.db
            .insert(userPlans_1.userPlans)
            .values({
            userId,
            plan_id: planId,
            business_type: normalizedBusinessType,
            is_active: true,
        })
            .returning();
        return inserted;
    },
};
