import path from 'path'
import dotenv from 'dotenv'
import { Client } from 'pg'

dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })

const REQUIRED_TABLES = ['b2c_orders', 'b2b_orders'] as const

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to verify order label reference capacity')
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    const result = await client.query<{
      table_name: string
      data_type: string
      character_maximum_length: number | null
    }>(
      `select table_name, data_type, character_maximum_length
         from information_schema.columns
        where table_schema = 'public'
          and column_name = 'label'
          and table_name = any($1::text[])
        order by table_name`,
      [REQUIRED_TABLES],
    )

    const columns = new Map(result.rows.map((row) => [row.table_name, row]))
    for (const tableName of REQUIRED_TABLES) {
      const column = columns.get(tableName)
      if (!column) {
        throw new Error(`${tableName}.label is missing`)
      }
      if (column.data_type !== 'text' || column.character_maximum_length !== null) {
        throw new Error(
          `${tableName}.label must be unbounded text; found ${column.data_type}` +
            (column.character_maximum_length === null
              ? ''
              : `(${column.character_maximum_length})`),
        )
      }
    }

    console.log('Order label reference capacity verified', {
      tables: REQUIRED_TABLES,
      dataType: 'text',
    })
  } finally {
    await client.end().catch(() => undefined)
  }
}

run().catch((error) => {
  console.error('Order label reference capacity check failed:', error)
  process.exit(1)
})
