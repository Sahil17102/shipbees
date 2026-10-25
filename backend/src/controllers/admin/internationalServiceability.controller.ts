import { Request, Response } from 'express'
import { pool } from '../../models/client'

const rules = [
  ['AT', 'Austria', 'Europe', '^\\d{4}$', '4 digits', '1010'],
  ['BE', 'Belgium', 'Europe', '^\\d{4}$', '4 digits', '1000'],
  ['BG', 'Bulgaria', 'Europe', '^\\d{4}$', '4 digits', '1000'],
  ['HR', 'Croatia', 'Europe', '^\\d{5}$', '5 digits', '10000'],
  ['CY', 'Cyprus', 'Europe', '^\\d{4}$', '4 digits', '1010'],
  ['CZ', 'Czech Republic', 'Europe', '^\\d{3} ?\\d{2}$', '5 digits', '110 00'],
  ['DK', 'Denmark', 'Europe', '^\\d{4}$', '4 digits', '1050'],
  ['EE', 'Estonia', 'Europe', '^\\d{5}$', '5 digits', '10111'],
  ['FI', 'Finland', 'Europe', '^\\d{5}$', '5 digits', '00100'],
  ['FR', 'France', 'Europe', '^\\d{5}$', '5 digits', '75001'],
  ['DE', 'Germany', 'Europe', '^\\d{5}$', '5 digits', '10115'],
  ['GR', 'Greece', 'Europe', '^\\d{3} ?\\d{2}$', '5 digits', '105 57'],
  ['HU', 'Hungary', 'Europe', '^\\d{4}$', '4 digits', '1051'],
  ['IE', 'Ireland', 'Europe', '^[A-Z0-9]{3} ?[A-Z0-9]{4}$', 'Eircode', 'D02 X285'],
  ['IT', 'Italy', 'Europe', '^\\d{5}$', '5 digits', '00118'],
  ['LV', 'Latvia', 'Europe', '^(LV-)?\\d{4}$', 'LV-1234', 'LV-1050'],
  ['LT', 'Lithuania', 'Europe', '^(LT-)?\\d{5}$', 'LT-12345', 'LT-01100'],
  ['LU', 'Luxembourg', 'Europe', '^\\d{4}$', '4 digits', '1234'],
  ['MT', 'Malta', 'Europe', '^[A-Z]{3} ?\\d{4}$', 'AAA 1234', 'VLT 1117'],
  ['NL', 'Netherlands', 'Europe', '^\\d{4} ?[A-Z]{2}$', '1234 AB', '1012 JS'],
  ['PL', 'Poland', 'Europe', '^\\d{2}-?\\d{3}$', '12-345', '00-001'],
  ['PT', 'Portugal', 'Europe', '^\\d{4}-?\\d{3}$', '1234-567', '1000-001'],
  ['RO', 'Romania', 'Europe', '^\\d{6}$', '6 digits', '010011'],
  ['SK', 'Slovakia', 'Europe', '^\\d{3} ?\\d{2}$', '5 digits', '811 01'],
  ['SI', 'Slovenia', 'Europe', '^(SI-)?\\d{4}$', '4 digits', '1000'],
  ['ES', 'Spain', 'Europe', '^\\d{5}$', '5 digits', '28001'],
  ['SE', 'Sweden', 'Europe', '^\\d{3} ?\\d{2}$', '5 digits', '111 20'],
  ['GB', 'United Kingdom', 'Europe', '^[A-Z]{1,2}\\d[A-Z\\d]? ?\\d[A-Z]{2}$', 'UK postcode', 'SW1A 1AA'],
  ['CH', 'Switzerland', 'Europe', '^\\d{4}$', '4 digits', '8001'],
  ['NO', 'Norway', 'Europe', '^\\d{4}$', '4 digits', '0150'],
  ['IS', 'Iceland', 'Europe', '^\\d{3}$', '3 digits', '101'],
  ['RS', 'Serbia', 'Europe', '^\\d{5}$', '5 digits', '11000'],
  ['UA', 'Ukraine', 'Europe', '^\\d{5}$', '5 digits', '01001'],
  ['US', 'United States', 'North America', '^\\d{5}(-\\d{4})?$', 'ZIP or ZIP+4', '10001'],
  ['CA', 'Canada', 'North America', '^[A-Z]\\d[A-Z] ?\\d[A-Z]\\d$', 'A1A 1A1', 'M5V 3A8'],
  ['MX', 'Mexico', 'North America', '^\\d{5}$', '5 digits', '01000'],
  ['AU', 'Australia', 'Oceania', '^\\d{4}$', '4 digits', '2000'],
  ['NZ', 'New Zealand', 'Oceania', '^\\d{4}$', '4 digits', '1010'],
  ['AE', 'United Arab Emirates', 'Middle East', '^(N/?A|00000|[A-Z0-9 -]{3,12})$', 'Area/postal code', '00000'],
  ['SA', 'Saudi Arabia', 'Middle East', '^\\d{5}(-\\d{4})?$', '5 or 9 digits', '11564'],
  ['SG', 'Singapore', 'Asia', '^\\d{6}$', '6 digits', '018956'],
  ['MY', 'Malaysia', 'Asia', '^\\d{5}$', '5 digits', '50000'],
  ['JP', 'Japan', 'Asia', '^\\d{3}-?\\d{4}$', '123-4567', '100-0001'],
  ['KR', 'South Korea', 'Asia', '^\\d{5}$', '5 digits', '04524'],
  ['HK', 'Hong Kong', 'Asia', '^(N/?A|000000|[A-Z0-9 -]{2,12})$', 'Optional postal code', '000000'],
] as const

const ensureTableAndSeeds = async () => {
  await pool.query(`
    create table if not exists shipray_international_serviceability (
      id bigserial primary key, country_code varchar(2) not null, country_name varchar(120) not null,
      region varchar(80) not null, courier_name varchar(120) not null default 'DilliKing',
      postal_pattern varchar(240) not null, postal_format varchar(120) not null,
      postal_example varchar(40) not null, coverage_type varchar(30) not null default 'country-wide',
      is_active boolean not null default true, created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(), unique (country_code, courier_name, postal_pattern)
    )
  `)
  const values: unknown[] = []
  const rows = rules.map((rule) => {
    const start = values.length
    values.push(...rule)
    return `($${start + 1},$${start + 2},$${start + 3},'DilliKing',$${start + 4},$${start + 5},$${start + 6},'country-wide',true)`
  })
  await pool.query(
    `insert into shipray_international_serviceability
      (country_code,country_name,region,courier_name,postal_pattern,postal_format,postal_example,coverage_type,is_active)
     values ${rows.join(',')} on conflict (country_code,courier_name,postal_pattern) do nothing`,
    values,
  )
}

const serialize = (row: any) => ({
  id: Number(row.id), countryCode: row.country_code, countryName: row.country_name,
  region: row.region, courierName: row.courier_name, postalPattern: row.postal_pattern,
  postalFormat: row.postal_format, postalExample: row.postal_example,
  coverageType: row.coverage_type, isActive: row.is_active, updatedAt: row.updated_at,
})

export const listInternationalServiceability = async (_req: Request, res: Response) => {
  try {
    await ensureTableAndSeeds()
    const result = await pool.query('select * from shipray_international_serviceability order by region,country_name,courier_name')
    return res.json({ data: result.rows.map(serialize) })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to load international serviceability' })
  }
}

export const createInternationalServiceability = async (req: Request, res: Response) => {
  try {
    await ensureTableAndSeeds()
    const body = req.body || {}
    const code = String(body.countryCode || '').trim().toUpperCase()
    const pattern = String(body.postalPattern || '').trim()
    if (!/^[A-Z]{2}$/.test(code)) return res.status(400).json({ message: 'Two-letter country code is required' })
    try { new RegExp(pattern, 'i') } catch { return res.status(400).json({ message: 'Postal pattern is not a valid regular expression' }) }
    const result = await pool.query(
      `insert into shipray_international_serviceability
       (country_code,country_name,region,courier_name,postal_pattern,postal_format,postal_example,coverage_type,is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
      [code, String(body.countryName || '').trim(), String(body.region || 'Other').trim(),
       String(body.courierName || 'DilliKing').trim(), pattern, String(body.postalFormat || 'Custom').trim(),
       String(body.postalExample || '').trim(), String(body.coverageType || 'custom').trim(), body.isActive !== false],
    )
    return res.status(201).json({ data: serialize(result.rows[0]) })
  } catch (error: any) {
    const duplicate = error?.code === '23505'
    return res.status(duplicate ? 409 : 500).json({ message: duplicate ? 'This postal rule already exists' : error?.message || 'Unable to add postal rule' })
  }
}

export const updateInternationalServiceability = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    const body = req.body || {}
    const pattern = String(body.postalPattern || '').trim()
    try { new RegExp(pattern, 'i') } catch { return res.status(400).json({ message: 'Postal pattern is not valid' }) }
    const result = await pool.query(
      `update shipray_international_serviceability set postal_pattern=$1,postal_format=$2,postal_example=$3,
       coverage_type=$4,is_active=$5,updated_at=now() where id=$6 returning *`,
      [pattern, String(body.postalFormat || 'Custom').trim(), String(body.postalExample || '').trim(),
       String(body.coverageType || 'custom').trim(), body.isActive !== false, id],
    )
    if (!result.rowCount) return res.status(404).json({ message: 'Postal rule not found' })
    return res.json({ data: serialize(result.rows[0]) })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to update postal rule' })
  }
}

export const deleteInternationalServiceability = async (req: Request, res: Response) => {
  const result = await pool.query('delete from shipray_international_serviceability where id=$1 returning id', [Number(req.params.id)])
  if (!result.rowCount) return res.status(404).json({ message: 'Postal rule not found' })
  return res.json({ success: true })
}

export const checkInternationalServiceability = async (req: Request, res: Response) => {
  try {
    await ensureTableAndSeeds()
    const code = String(req.body?.countryCode || '').trim().toUpperCase()
    const postalCode = String(req.body?.postalCode || '').trim().toUpperCase()
    const result = await pool.query(
      'select * from shipray_international_serviceability where country_code=$1 and is_active=true order by courier_name',
      [code],
    )
    const matches = result.rows.filter((row) => {
      try { return new RegExp(row.postal_pattern, 'i').test(postalCode) } catch { return false }
    })
    return res.json({ serviceable: matches.length > 0, matches: matches.map(serialize) })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to check postal code' })
  }
}
