"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.backfillSellerStaffProfiles = backfillSellerStaffProfiles;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const employees_1 = require("../models/schema/employees");
const userProfile_1 = require("../models/schema/userProfile");
const fetchStaffProfileRows = async () => {
    const result = await client_1.db.execute((0, drizzle_orm_1.sql) `
    select
      e."userId" as employee_user_id,
      e.admin_id as parent_user_id,
      (staff_profile.id is not null) as has_staff_profile
    from ${employees_1.employees} e
    inner join ${userProfile_1.userProfiles} parent_profile
      on parent_profile."userId" = e.admin_id
    left join ${userProfile_1.userProfiles} staff_profile
      on staff_profile."userId" = e."userId"
  `);
    return result.rows;
};
async function backfillSellerStaffProfiles() {
    console.log('Starting seller staff profile backfill...');
    const rows = await fetchStaffProfileRows();
    let created = 0;
    let updated = 0;
    for (const row of rows) {
        const parentProfile = await client_1.db.query.userProfiles.findFirst({
            where: (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, row.parent_user_id),
        });
        if (!parentProfile)
            continue;
        const profilePayload = {
            onboardingStep: parentProfile.onboardingStep,
            monthlyOrderCount: parentProfile.monthlyOrderCount,
            salesChannels: parentProfile.salesChannels,
            companyInfo: parentProfile.companyInfo,
            domesticKyc: parentProfile.domesticKyc,
            bankDetails: parentProfile.bankDetails,
            gstDetails: parentProfile.gstDetails,
            businessType: parentProfile.businessType,
            approved: parentProfile.approved,
            rejectionReason: parentProfile.rejectionReason,
            onboardingComplete: parentProfile.onboardingComplete,
            profileComplete: parentProfile.profileComplete,
            approvedAt: parentProfile.approvedAt,
            updatedAt: new Date(),
        };
        if (row.has_staff_profile) {
            await client_1.db
                .update(userProfile_1.userProfiles)
                .set(profilePayload)
                .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, row.employee_user_id));
            updated += 1;
        }
        else {
            await client_1.db.insert(userProfile_1.userProfiles).values({
                userId: row.employee_user_id,
                ...profilePayload,
            });
            created += 1;
        }
    }
    await client_1.db
        .update(employees_1.employees)
        .set({ moduleAccess: (0, drizzle_orm_1.sql) `coalesce(${employees_1.employees.moduleAccess}, '{}'::jsonb)` })
        .where((0, drizzle_orm_1.sql) `${employees_1.employees.moduleAccess} is null`);
    console.log('Seller staff profile backfill complete', {
        scanned: rows.length,
        created,
        updated,
    });
}
if (require.main === module) {
    backfillSellerStaffProfiles()
        .then(() => process.exit(0))
        .catch((error) => {
        console.error('Seller staff profile backfill failed:', error);
        process.exit(1);
    });
}
