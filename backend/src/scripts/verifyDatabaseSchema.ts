import { Client } from 'pg'

const databaseUrl = String(process.env.DATABASE_URL || '').trim()

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for schema verification')
}

const databaseHost = new URL(databaseUrl).hostname
const isLocalDatabase = /^(?:127\.0\.0\.1|localhost)$/i.test(databaseHost)
const isRenderInternalDatabase = /^dpg-[a-z0-9-]+$/i.test(databaseHost)

const client = new Client({
  connectionString: databaseUrl,
  ssl:
    process.env.NODE_ENV === 'production' && !isLocalDatabase && !isRenderInternalDatabase
      ? { rejectUnauthorized: false }
      : false,
})

const verifySchema = async () => {
  await client.connect()

  try {
    const result = await client.query<{ users: string | null }>(
      `SELECT to_regclass('public.users')::text AS users`,
    )

    if (result.rows[0]?.users !== 'users') {
      throw new Error('Database schema verification failed: users table is missing')
    }

    console.log('Database schema verification passed')
  } finally {
    await client.end()
  }
}

verifySchema().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
