import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

export type AdminPermissionLevel = 'none' | 'view' | 'operate' | 'approve' | 'manage'
export type AdminPermissions = Record<string, AdminPermissionLevel>

export const adminRoles = pgTable(
  'shipray_admin_roles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: varchar('code', { length: 64 }).notNull(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    permissions: jsonb('permissions').$type<AdminPermissions>().notNull().default({}),
    isSystem: boolean('is_system').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({ codeUnique: uniqueIndex('shipray_admin_roles_code_unique').on(table.code) }),
)

export const adminStaff = pgTable(
  'shipray_admin_staff',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => adminRoles.id, { onDelete: 'restrict' }),
    managerStaffId: uuid('manager_staff_id'),
    employeeCode: varchar('employee_code', { length: 40 }),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 20 }),
    department: varchar('department', { length: 80 }).notNull(),
    designation: varchar('designation', { length: 100 }).notNull(),
    scopeType: varchar('scope_type', { length: 20 }).notNull().default('assigned'),
    permissionOverrides: jsonb('permission_overrides').$type<AdminPermissions>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    userUnique: uniqueIndex('shipray_admin_staff_user_unique').on(table.userId),
    employeeCodeUnique: uniqueIndex('shipray_admin_staff_employee_code_unique').on(
      table.employeeCode,
    ),
    roleIndex: index('shipray_admin_staff_role_idx').on(table.roleId),
    managerIndex: index('shipray_admin_staff_manager_idx').on(table.managerStaffId),
  }),
)

export const sellerAssignments = pgTable(
  'shipray_seller_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => adminStaff.id, { onDelete: 'restrict' }),
    assignmentType: varchar('assignment_type', { length: 20 }).notNull().default('primary'),
    isActive: boolean('is_active').notNull().default(true),
    reason: text('reason'),
    assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => ({
    sellerIndex: index('shipray_seller_assignments_seller_idx').on(table.sellerId),
    staffIndex: index('shipray_seller_assignments_staff_idx').on(table.staffId),
    assignmentIndex: index('shipray_seller_assignments_lookup_idx').on(
      table.sellerId,
      table.staffId,
      table.assignmentType,
    ),
  }),
)

export const crmTasks = pgTable(
  'shipray_crm_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedStaffId: uuid('assigned_staff_id').references(() => adminStaff.id, {
      onDelete: 'set null',
    }),
    category: varchar('category', { length: 50 }).notNull(),
    title: varchar('title', { length: 180 }).notNull(),
    description: text('description'),
    priority: varchar('priority', { length: 20 }).notNull().default('medium'),
    status: varchar('status', { length: 30 }).notNull().default('open'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    outcome: text('outcome'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => ({
    sellerIndex: index('shipray_crm_tasks_seller_idx').on(table.sellerId),
    staffIndex: index('shipray_crm_tasks_staff_idx').on(table.assignedStaffId),
    dueIndex: index('shipray_crm_tasks_due_idx').on(table.status, table.dueAt),
  }),
)

export const crmActivities = pgTable(
  'shipray_crm_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id').references(() => adminStaff.id, { onDelete: 'set null' }),
    taskId: uuid('task_id').references(() => crmTasks.id, { onDelete: 'set null' }),
    activityType: varchar('activity_type', { length: 50 }).notNull(),
    summary: varchar('summary', { length: 220 }).notNull(),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sellerIndex: index('shipray_crm_activities_seller_idx').on(table.sellerId),
    staffIndex: index('shipray_crm_activities_staff_idx').on(table.staffId),
    occurredIndex: index('shipray_crm_activities_occurred_idx').on(table.occurredAt),
  }),
)
