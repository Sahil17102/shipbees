import { eq } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { employees } from '../models/schema/employees'
import { users } from '../models/schema/users'

async function main() {
  const employeeUsers = await db
    .select({
      userId: employees.userId,
      email: employees.email,
    })
    .from(employees)

  let updated = 0

  for (const employee of employeeUsers) {
    const result = await db
      .update(users)
      .set({
        role: 'employee',
        accountVerified: true,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, employee.userId))
      .returning({ id: users.id })

    if (result.length > 0) updated += 1
  }

  console.log(
    JSON.stringify({
      success: true,
      checked: employeeUsers.length,
      updated,
    }),
  )
}

main()
  .catch((error) => {
    console.error('[backfillEmployeeUserRoles] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
