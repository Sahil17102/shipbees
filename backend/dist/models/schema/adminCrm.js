"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.crmActivities = exports.crmTasks = exports.sellerAssignments = exports.adminStaff = exports.adminRoles = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.adminRoles = (0, pg_core_1.pgTable)('shipray_admin_roles', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    code: (0, pg_core_1.varchar)('code', { length: 64 }).notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    permissions: (0, pg_core_1.jsonb)('permissions').$type().notNull().default({}),
    isSystem: (0, pg_core_1.boolean)('is_system').notNull().default(false),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => new Date()),
}, (table) => ({ codeUnique: (0, pg_core_1.uniqueIndex)('shipray_admin_roles_code_unique').on(table.code) }));
exports.adminStaff = (0, pg_core_1.pgTable)('shipray_admin_staff', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    roleId: (0, pg_core_1.uuid)('role_id')
        .notNull()
        .references(() => exports.adminRoles.id, { onDelete: 'restrict' }),
    managerStaffId: (0, pg_core_1.uuid)('manager_staff_id'),
    employeeCode: (0, pg_core_1.varchar)('employee_code', { length: 40 }),
    name: (0, pg_core_1.varchar)('name', { length: 120 }).notNull(),
    phone: (0, pg_core_1.varchar)('phone', { length: 20 }),
    department: (0, pg_core_1.varchar)('department', { length: 80 }).notNull(),
    designation: (0, pg_core_1.varchar)('designation', { length: 100 }).notNull(),
    scopeType: (0, pg_core_1.varchar)('scope_type', { length: 20 }).notNull().default('assigned'),
    permissionOverrides: (0, pg_core_1.jsonb)('permission_overrides').$type().notNull().default({}),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    lastLoginAt: (0, pg_core_1.timestamp)('last_login_at', { withTimezone: true }),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => new Date()),
}, (table) => ({
    userUnique: (0, pg_core_1.uniqueIndex)('shipray_admin_staff_user_unique').on(table.userId),
    employeeCodeUnique: (0, pg_core_1.uniqueIndex)('shipray_admin_staff_employee_code_unique').on(table.employeeCode),
    roleIndex: (0, pg_core_1.index)('shipray_admin_staff_role_idx').on(table.roleId),
    managerIndex: (0, pg_core_1.index)('shipray_admin_staff_manager_idx').on(table.managerStaffId),
}));
exports.sellerAssignments = (0, pg_core_1.pgTable)('shipray_seller_assignments', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    staffId: (0, pg_core_1.uuid)('staff_id')
        .notNull()
        .references(() => exports.adminStaff.id, { onDelete: 'restrict' }),
    assignmentType: (0, pg_core_1.varchar)('assignment_type', { length: 20 }).notNull().default('primary'),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    reason: (0, pg_core_1.text)('reason'),
    assignedBy: (0, pg_core_1.uuid)('assigned_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: (0, pg_core_1.timestamp)('ended_at', { withTimezone: true }),
}, (table) => ({
    sellerIndex: (0, pg_core_1.index)('shipray_seller_assignments_seller_idx').on(table.sellerId),
    staffIndex: (0, pg_core_1.index)('shipray_seller_assignments_staff_idx').on(table.staffId),
    assignmentIndex: (0, pg_core_1.index)('shipray_seller_assignments_lookup_idx').on(table.sellerId, table.staffId, table.assignmentType),
}));
exports.crmTasks = (0, pg_core_1.pgTable)('shipray_crm_tasks', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    assignedStaffId: (0, pg_core_1.uuid)('assigned_staff_id').references(() => exports.adminStaff.id, {
        onDelete: 'set null',
    }),
    category: (0, pg_core_1.varchar)('category', { length: 50 }).notNull(),
    title: (0, pg_core_1.varchar)('title', { length: 180 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).notNull().default('medium'),
    status: (0, pg_core_1.varchar)('status', { length: 30 }).notNull().default('open'),
    dueAt: (0, pg_core_1.timestamp)('due_at', { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    outcome: (0, pg_core_1.text)('outcome'),
    nextFollowUpAt: (0, pg_core_1.timestamp)('next_follow_up_at', { withTimezone: true }),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow()
        .$onUpdateFn(() => new Date()),
}, (table) => ({
    sellerIndex: (0, pg_core_1.index)('shipray_crm_tasks_seller_idx').on(table.sellerId),
    staffIndex: (0, pg_core_1.index)('shipray_crm_tasks_staff_idx').on(table.assignedStaffId),
    dueIndex: (0, pg_core_1.index)('shipray_crm_tasks_due_idx').on(table.status, table.dueAt),
}));
exports.crmActivities = (0, pg_core_1.pgTable)('shipray_crm_activities', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    sellerId: (0, pg_core_1.uuid)('seller_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    staffId: (0, pg_core_1.uuid)('staff_id').references(() => exports.adminStaff.id, { onDelete: 'set null' }),
    taskId: (0, pg_core_1.uuid)('task_id').references(() => exports.crmTasks.id, { onDelete: 'set null' }),
    activityType: (0, pg_core_1.varchar)('activity_type', { length: 50 }).notNull(),
    summary: (0, pg_core_1.varchar)('summary', { length: 220 }).notNull(),
    notes: (0, pg_core_1.text)('notes'),
    metadata: (0, pg_core_1.jsonb)('metadata').notNull().default({}),
    occurredAt: (0, pg_core_1.timestamp)('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: (0, pg_core_1.uuid)('created_by').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    sellerIndex: (0, pg_core_1.index)('shipray_crm_activities_seller_idx').on(table.sellerId),
    staffIndex: (0, pg_core_1.index)('shipray_crm_activities_staff_idx').on(table.staffId),
    occurredIndex: (0, pg_core_1.index)('shipray_crm_activities_occurred_idx').on(table.occurredAt),
}));
