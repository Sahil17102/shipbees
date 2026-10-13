import { eq, sql } from 'drizzle-orm'
import { db } from '../models/client'
import { employees } from '../models/schema/employees'
import { userProfiles } from '../models/schema/userProfile'

type StaffProfileRow = {
  employee_user_id: string
  parent_user_id: string
  has_staff_profile: boolean
}

const fetchStaffProfileRows = async () => {
  const result = await db.execute(sql`
    select
      e."userId" as employee_user_id,
      e.admin_id as parent_user_id,
      (staff_profile.id is not null) as has_staff_profile
    from ${employees} e
    inner join ${userProfiles} parent_profile
      on parent_profile."userId" = e.admin_id
    left join ${userProfiles} staff_profile
      on staff_profile."userId" = e."userId"
  `)

  return (result as any).rows as StaffProfileRow[]
}

export async function backfillSellerStaffProfiles() {
  console.log('Starting seller staff profile backfill...')

  const rows = await fetchStaffProfileRows()
  let created = 0
  let updated = 0

  for (const row of rows) {
    const parentProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, row.parent_user_id),
    })

    if (!parentProfile) continue

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
    }

    if (row.has_staff_profile) {
      await db
        .update(userProfiles)
        .set(profilePayload)
        .where(eq(userProfiles.userId, row.employee_user_id))
      updated += 1
    } else {
      await db.insert(userProfiles).values({
        userId: row.employee_user_id,
        ...profilePayload,
      })
      created += 1
    }
  }

  await db
    .update(employees)
    .set({ moduleAccess: sql`coalesce(${employees.moduleAccess}, '{}'::jsonb)` })
    .where(sql`${employees.moduleAccess} is null`)

  console.log('Seller staff profile backfill complete', {
    scanned: rows.length,
    created,
    updated,
  })
}

if (require.main === module) {
  backfillSellerStaffProfiles()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Seller staff profile backfill failed:', error)
      process.exit(1)
    })
}
