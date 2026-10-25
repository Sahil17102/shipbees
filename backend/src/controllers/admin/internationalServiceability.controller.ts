import { Request, Response } from 'express'
import axios from 'axios'
import { createInterface } from 'readline'
import * as unzipper from 'unzipper'
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

const POSTAL_SOURCE_BASE = 'https://download.geonames.org/export/zip'
const supportedCountryCodes = new Set<string>(rules.map(([code]) => code))

type SyncState = {
  status: 'idle' | 'running' | 'complete' | 'failed'
  processed: number
  imported: number
  countriesCompleted: number
  countriesTotal: number
  failedCountries: string[]
  startedAt: string | null
  finishedAt: string | null
  error: string | null
}

let syncState: SyncState = {
  status: 'idle', processed: 0, imported: 0, countriesCompleted: 0,
  countriesTotal: supportedCountryCodes.size, failedCountries: [],
  startedAt: null, finishedAt: null, error: null,
}

const ensurePostalTable = async () => {
  await pool.query(`
    create table if not exists shipray_international_postal_codes (
      id bigserial primary key,
      country_code varchar(2) not null,
      postal_code varchar(24) not null,
      place_name varchar(180) not null default '',
      admin_name varchar(180) not null default '',
      latitude numeric(10,7),
      longitude numeric(10,7),
      source varchar(40) not null default 'GeoNames',
      synced_at timestamptz not null default now(),
      unique (country_code, postal_code)
    )
  `)
  await pool.query(`create index if not exists shipray_intl_postal_country_code_idx
    on shipray_international_postal_codes (country_code, postal_code)`)
  await pool.query(`create index if not exists shipray_intl_postal_place_idx
    on shipray_international_postal_codes (lower(place_name))`)
}

type PostalRow = {
  countryCode: string
  postalCode: string
  placeName: string
  adminName: string
  latitude: number | null
  longitude: number | null
}

const insertPostalBatch = async (rows: PostalRow[]) => {
  if (!rows.length) return 0
  const uniqueRows = [...new Map(rows.map((row) => [`${row.countryCode}:${row.postalCode}`, row])).values()]
  const values: unknown[] = []
  const placeholders = uniqueRows.map((row) => {
    const offset = values.length
    values.push(row.countryCode, row.postalCode, row.placeName, row.adminName, row.latitude, row.longitude)
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},'GeoNames',now())`
  })
  await pool.query(
    `insert into shipray_international_postal_codes
      (country_code,postal_code,place_name,admin_name,latitude,longitude,source,synced_at)
     values ${placeholders.join(',')}
     on conflict (country_code,postal_code) do update set
       place_name=excluded.place_name, admin_name=excluded.admin_name,
       latitude=excluded.latitude, longitude=excluded.longitude,
       source=excluded.source, synced_at=excluded.synced_at`,
    values,
  )
  return uniqueRows.length
}

const syncCountryPostalDirectory = async (countryCode: string) => {
  let response
  try {
    response = await axios.get(`${POSTAL_SOURCE_BASE}/${countryCode}.zip`, {
      responseType: 'stream', timeout: 120000, maxContentLength: 30 * 1024 * 1024,
    })
  } catch (error: any) {
    if (error?.response?.status === 404) {
      syncState.countriesCompleted += 1
      return
    }
    throw error
  }
    const textStream = response.data.pipe(unzipper.ParseOne(new RegExp(`${countryCode}\\.txt$`, 'i')))
    const lines = createInterface({ input: textStream, crlfDelay: Infinity })
    let batch: PostalRow[] = []
    for await (const rawLine of lines) {
      syncState.processed += 1
      const columns = String(rawLine).split('\t')
      const rowCountryCode = String(columns[0] || '').toUpperCase()
      if (rowCountryCode !== countryCode) continue
      const postalCode = String(columns[1] || '').trim().toUpperCase()
      if (!postalCode) continue
      batch.push({
        countryCode: rowCountryCode,
        postalCode,
        placeName: String(columns[2] || '').trim(),
        adminName: String(columns[3] || columns[5] || '').trim(),
        latitude: Number.isFinite(Number(columns[9])) ? Number(columns[9]) : null,
        longitude: Number.isFinite(Number(columns[10])) ? Number(columns[10]) : null,
      })
      if (batch.length >= 1000) {
        syncState.imported += await insertPostalBatch(batch)
        batch = []
      }
    }
    syncState.imported += await insertPostalBatch(batch)
    syncState.countriesCompleted += 1
}

const syncPostalDirectory = async () => {
  syncState = {
    status: 'running', processed: 0, imported: 0, countriesCompleted: 0,
    countriesTotal: supportedCountryCodes.size, failedCountries: [],
    startedAt: new Date().toISOString(), finishedAt: null, error: null,
  }
  try {
    await ensurePostalTable()
    const countryCodes = [...supportedCountryCodes]
    let nextCountry = 0
    const worker = async () => {
      while (nextCountry < countryCodes.length) {
        const countryCode = countryCodes[nextCountry++]
        try {
          await syncCountryPostalDirectory(countryCode)
        } catch (error: any) {
          console.warn('[international-postal-sync:country]', countryCode, error?.message || error)
          syncState.failedCountries.push(countryCode)
          syncState.countriesCompleted += 1
        }
      }
    }
    await Promise.all(Array.from({ length: 3 }, worker))
    if (!syncState.imported && syncState.failedCountries.length) {
      throw new Error(`No postal codes were imported; failed countries: ${syncState.failedCountries.join(', ')}`)
    }
    syncState.status = 'complete'
    syncState.finishedAt = new Date().toISOString()
  } catch (error: any) {
    console.error('[international-postal-sync]', error?.message || error)
    syncState.status = 'failed'
    syncState.error = String(error?.message || 'Postal directory sync failed').slice(0, 300)
    syncState.finishedAt = new Date().toISOString()
  }
}

const getPostalStats = async () => {
  await ensurePostalTable()
  const [totals, countries] = await Promise.all([
    pool.query(`select count(*)::int as total, count(distinct country_code)::int as countries,
      max(synced_at) as last_synced_at from shipray_international_postal_codes`),
    pool.query(`select country_code, count(*)::int as count from shipray_international_postal_codes
      group by country_code order by country_code`),
  ])
  return {
    totalPostalCodes: Number(totals.rows[0]?.total || 0),
    countriesWithPostalCodes: Number(totals.rows[0]?.countries || 0),
    lastSyncedAt: totals.rows[0]?.last_synced_at || null,
    countsByCountry: Object.fromEntries(countries.rows.map((row) => [row.country_code, Number(row.count)])),
    source: 'GeoNames postal code data (CC BY 4.0)',
    sync: syncState,
  }
}

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
    const [result, stats] = await Promise.all([
      pool.query('select * from shipray_international_serviceability order by region,country_name,courier_name'),
      getPostalStats(),
    ])
    return res.json({ data: result.rows.map(serialize), stats })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to load international serviceability' })
  }
}

export const listInternationalPostalCodes = async (req: Request, res: Response) => {
  try {
    await ensurePostalTable()
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 50))
    const countryCode = String(req.query.countryCode || '').trim().toUpperCase()
    const search = String(req.query.search || '').trim()
    const where: string[] = []
    const values: unknown[] = []
    if (countryCode) {
      values.push(countryCode)
      where.push(`country_code=$${values.length}`)
    }
    if (search) {
      values.push(`%${search}%`)
      where.push(`(postal_code ilike $${values.length} or place_name ilike $${values.length} or admin_name ilike $${values.length})`)
    }
    const clause = where.length ? `where ${where.join(' and ')}` : ''
    const countResult = await pool.query(`select count(*)::int as total from shipray_international_postal_codes ${clause}`, values)
    values.push(limit, (page - 1) * limit)
    const result = await pool.query(
      `select country_code,postal_code,place_name,admin_name,latitude,longitude,source
       from shipray_international_postal_codes ${clause}
       order by country_code,postal_code limit $${values.length - 1} offset $${values.length}`,
      values,
    )
    const total = Number(countResult.rows[0]?.total || 0)
    return res.json({
      data: result.rows.map((row) => ({
        countryCode: row.country_code, postalCode: row.postal_code,
        placeName: row.place_name, adminName: row.admin_name,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude), source: row.source,
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to load postal directory' })
  }
}

export const startInternationalPostalSync = async (_req: Request, res: Response) => {
  try {
    await ensurePostalTable()
    if (syncState.status === 'running') return res.status(202).json({ sync: syncState })
    void syncPostalDirectory()
    return res.status(202).json({ message: 'Postal directory sync started', sync: syncState })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to start postal sync' })
  }
}

export const getInternationalPostalSyncStatus = async (_req: Request, res: Response) => {
  try {
    return res.json({ stats: await getPostalStats() })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to load postal sync status' })
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
    const formatMatches = result.rows.filter((row) => {
      try { return new RegExp(row.postal_pattern, 'i').test(postalCode) } catch { return false }
    })
    await ensurePostalTable()
    const directoryCount = await pool.query(
      'select count(*)::int as count from shipray_international_postal_codes where country_code=$1',
      [code],
    )
    const hasDirectory = Number(directoryCount.rows[0]?.count || 0) > 0
    const exact = hasDirectory
      ? await pool.query(
          'select postal_code,place_name,admin_name from shipray_international_postal_codes where country_code=$1 and postal_code=$2 limit 1',
          [code, postalCode],
        )
      : { rows: [] }
    const matches = hasDirectory && !exact.rows.length ? [] : formatMatches
    return res.json({
      serviceable: matches.length > 0,
      matches: matches.map(serialize),
      postalLocation: exact.rows[0] ? {
        postalCode: exact.rows[0].postal_code,
        placeName: exact.rows[0].place_name,
        adminName: exact.rows[0].admin_name,
      } : null,
      validationSource: hasDirectory ? 'GeoNames postal directory' : 'country postal format',
    })
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Unable to check postal code' })
  }
}
