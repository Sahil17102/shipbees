import crypto from 'crypto'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { Client } from 'pg'

const backendRoot = path.resolve(__dirname, '../..')
const migrationsDirectory = path.join(backendRoot, 'migrations', 'features')
const environment = process.env.NODE_ENV || 'development'

dotenv.config({ path: path.join(backendRoot, `.env.${environment}`) })
dotenv.config({ path: path.join(backendRoot, '.env') })

const migrationNameFromArgs = () => {
  const inline = process.argv.find((argument) => argument.startsWith('--only='))
  if (inline) return inline.slice('--only='.length)

  const index = process.argv.indexOf('--only')
  return index >= 0 ? process.argv[index + 1] : undefined
}

const discoverMigrations = () => {
  if (!fs.existsSync(migrationsDirectory)) {
    throw new Error(`Migration directory does not exist: ${migrationsDirectory}`)
  }

  const requestedMigration = migrationNameFromArgs()
  const migrationNames = fs
    .readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))

  if (!migrationNames.length) throw new Error('No feature migrations were found')
  if (!requestedMigration) return migrationNames
  if (!migrationNames.includes(requestedMigration)) {
    throw new Error(`Unknown feature migration: ${requestedMigration}`)
  }
  return [requestedMigration]
}

const checksum = (contents: string) =>
  crypto.createHash('sha256').update(contents).digest('hex')

const run = async () => {
  const migrationNames = discoverMigrations()

  if (process.argv.includes('--list')) {
    migrationNames.forEach((migrationName) => console.log(migrationName))
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error(
      `DATABASE_URL is required (checked backend/.env.${environment} and backend/.env)`,
    )
  }
  const isLocalDatabaseUrl =
    /^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(databaseUrl)

  const client = new Client({
    connectionString: databaseUrl,
    ssl: environment === 'production' && !isLocalDatabaseUrl ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  let lockAcquired = false

  try {
    await client.query(
      `select pg_advisory_lock(hashtext('shipray_feature_migrations'))`,
    )
    lockAcquired = true

    await client.query(`
      create table if not exists shipray_schema_migrations (
        id bigserial primary key,
        name text not null unique,
        checksum varchar(64) not null,
        execution_ms integer not null,
        applied_at timestamptz not null default now()
      )
    `)

    const appliedResult = await client.query<{
      name: string
      checksum: string
    }>('select name, checksum from shipray_schema_migrations')
    const applied = new Map(
      appliedResult.rows.map((migration) => [migration.name, migration.checksum]),
    )

    for (const migrationName of migrationNames) {
      const migrationPath = path.join(migrationsDirectory, migrationName)
      const sql = fs.readFileSync(migrationPath, 'utf8')
      const migrationChecksum = checksum(sql)
      const recordedChecksum = applied.get(migrationName)

      if (recordedChecksum) {
        if (recordedChecksum !== migrationChecksum) {
          throw new Error(
            `Applied migration ${migrationName} has changed; restore it and add a new migration`,
          )
        }
        console.log(`Skipped ${migrationName} (already applied)`)
        continue
      }

      const startedAt = Date.now()
      await client.query('begin')
      try {
        await client.query(sql)
        await client.query(
          `insert into shipray_schema_migrations (name, checksum, execution_ms)
           values ($1, $2, $3)`,
          [migrationName, migrationChecksum, Date.now() - startedAt],
        )
        await client.query('commit')
        console.log(`Applied ${migrationName}`)
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }
  } finally {
    if (lockAcquired) {
      await client
        .query(`select pg_advisory_unlock(hashtext('shipray_feature_migrations'))`)
        .catch(() => undefined)
    }
    await client.end()
  }
}

run().catch((error) => {
  console.error('Feature migration failed:', error?.message || error)
  process.exit(1)
})
