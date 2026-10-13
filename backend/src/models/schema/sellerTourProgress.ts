import { integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const sellerTourProgress = pgTable('seller_tour_progress', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  completedPages: jsonb('completed_pages').$type<string[]>().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
