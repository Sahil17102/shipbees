import * as dotenv from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import path from 'path'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `.env.${env}`) })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for franchise migrations')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/models/schema/franchise.ts',
  out: './drizzle/franchise',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    table: '__shipray_franchise_migrations',
    schema: 'public',
  },
})
