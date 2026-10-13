import assert from 'assert'
import path from 'path'
import { calculateCodRemittanceAmounts } from '../utils/codRemittance'

const fullCod = calculateCodRemittanceAmounts({
  codAmount: 599,
  codCharges: 22,
  freightCharges: 33,
})

assert.deepStrictEqual(fullCod, {
  deductions: 0,
  remittableAmount: 599,
})

assert.deepStrictEqual(
  calculateCodRemittanceAmounts({
    codAmount: 1399,
    codCharges: 500,
    freightCharges: 750,
  }),
  {
    deductions: 0,
    remittableAmount: 1399,
  },
)

assert.deepStrictEqual(calculateCodRemittanceAmounts({ codAmount: 510.126 }), {
  deductions: 0,
  remittableAmount: 510.13,
})

assert.throws(
  () => calculateCodRemittanceAmounts({ codAmount: -1 }),
  /COD amount must be a non-negative number/,
)

const verifyDatabase = process.argv.includes('--database')

const verifyPendingDatabaseRows = async () => {
  const dotenv = await import('dotenv')
  const { Client } = await import('pg')

  dotenv.config({ path: path.resolve(process.cwd(), '.env.production') })

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the COD remittance database check')
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    const result = await client.query<{
      pending_count: number
      invalid_pending_count: number
      pending_cod_total: string
      pending_remittable_total: string
    }>(`
      SELECT
        COUNT(*)::int AS pending_count,
        COUNT(*) FILTER (
          WHERE deductions IS DISTINCT FROM 0::numeric
             OR remittable_amount IS DISTINCT FROM cod_amount
        )::int AS invalid_pending_count,
        COALESCE(SUM(cod_amount), 0)::numeric(14, 2)::text AS pending_cod_total,
        COALESCE(SUM(remittable_amount), 0)::numeric(14, 2)::text AS pending_remittable_total
      FROM cod_remittances
      WHERE status = 'pending'
    `)

    const row = result.rows[0]
    assert.strictEqual(
      row.invalid_pending_count,
      0,
      `${row.invalid_pending_count} pending COD remittances still contain booking-charge deductions`,
    )

    console.log('Pending COD remittance database check passed', row)
  } finally {
    await client.end().catch(() => undefined)
  }
}

if (verifyDatabase) {
  verifyPendingDatabaseRows().catch((error) => {
    console.error('COD remittance accounting check failed:', error)
    process.exit(1)
  })
} else {
  console.log('COD remittance accounting checks passed')
}
