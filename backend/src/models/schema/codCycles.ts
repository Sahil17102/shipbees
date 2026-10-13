import { pgTable, uuid, varchar, integer, numeric, timestamp } from 'drizzle-orm/pg-core'
import { users } from './users'

export const codCycles = pgTable('cod_remittance_cycles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  days: integer('days').notNull(),
  fee: numeric('fee', { precision: 12, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
export const sellerCodCycles = pgTable('seller_cod_cycles', {
  userId: uuid('user_id').primaryKey().references(() => users.id),
  cycleId: uuid('cycle_id').notNull().references(() => codCycles.id),
  assignedBy: uuid('assigned_by').references(() => users.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
})
