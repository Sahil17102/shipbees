"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const employees_1 = require("../models/schema/employees");
const users_1 = require("../models/schema/users");
async function main() {
    const employeeUsers = await client_1.db
        .select({
        userId: employees_1.employees.userId,
        email: employees_1.employees.email,
    })
        .from(employees_1.employees);
    let updated = 0;
    for (const employee of employeeUsers) {
        const result = await client_1.db
            .update(users_1.users)
            .set({
            role: 'employee',
            accountVerified: true,
            emailVerified: true,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(users_1.users.id, employee.userId))
            .returning({ id: users_1.users.id });
        if (result.length > 0)
            updated += 1;
    }
    console.log(JSON.stringify({
        success: true,
        checked: employeeUsers.length,
        updated,
    }));
}
main()
    .catch((error) => {
    console.error('[backfillEmployeeUserRoles] failed', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end();
});
