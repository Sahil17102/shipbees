import { Request, Response } from 'express'
import { pool } from '../../models/client'

const countries = [
  ['AT', 'Austria', 'Europe'], ['BE', 'Belgium', 'Europe'], ['BG', 'Bulgaria', 'Europe'],
  ['HR', 'Croatia', 'Europe'], ['CY', 'Cyprus', 'Europe'], ['CZ', 'Czech Republic', 'Europe'],
  ['DK', 'Denmark', 'Europe'], ['EE', 'Estonia', 'Europe'], ['FI', 'Finland', 'Europe'],
  ['FR', 'France', 'Europe'], ['DE', 'Germany', 'Europe'], ['GR', 'Greece', 'Europe'],
  ['HU', 'Hungary', 'Europe'], ['IE', 'Ireland', 'Europe'], ['IT', 'Italy', 'Europe'],
  ['LV', 'Latvia', 'Europe'], ['LT', 'Lithuania', 'Europe'], ['LU', 'Luxembourg', 'Europe'],
  ['MT', 'Malta', 'Europe'], ['NL', 'Netherlands', 'Europe'], ['PL', 'Poland', 'Europe'],
  ['PT', 'Portugal', 'Europe'], ['RO', 'Romania', 'Europe'], ['SK', 'Slovakia', 'Europe'],
  ['SI', 'Slovenia', 'Europe'], ['ES', 'Spain', 'Europe'], ['SE', 'Sweden', 'Europe'],
  ['GB', 'United Kingdom', 'Europe'], ['CH', 'Switzerland', 'Europe'], ['NO', 'Norway', 'Europe'],
  ['IS', 'Iceland', 'Europe'], ['RS', 'Serbia', 'Europe'], ['UA', 'Ukraine', 'Europe'],
  ['US', 'United States', 'North America'], ['CA', 'Canada', 'North America'],
  ['MX', 'Mexico', 'North America'], ['AU', 'Australia', 'Oceania'],
  ['NZ', 'New Zealand', 'Oceania'], ['AE', 'United Arab Emirates', 'Middle East'],
  ['SA', 'Saudi Arabia', 'Middle East'], ['SG', 'Singapore', 'Asia'], ['MY', 'Malaysia', 'Asia'],
  ['JP', 'Japan', 'Asia'], ['KR', 'South Korea', 'Asia'], ['HK', 'Hong Kong', 'Asia'],
] as const

const couriers = [
  { name: 'ICL International', service: 'International Priority', multiplier: 1 },
  { name: 'DilliKing', service: 'International Express', multiplier: 1 },
  { name: 'DHL Express', service: 'Express Worldwide', multiplier: 1.12 },
  { name: 'FedEx', service: 'International Priority', multiplier: 1.06 },
  { name: 'UPS', service: 'Worldwide Saver', multiplier: 1.09 },
  { name: 'Aramex', service: 'Priority Parcel Express', multiplier: 0.94 },
]

const regionBase: Record<string, number> = {
  Europe: 2150,
  'North America': 2350,
  Oceania: 2550,
  'Middle East': 1450,
  Asia: 1650,
}

const ensureTableAndDefaults = async () => {
  await pool.query(`
    create table if not exists shipray_international_rate_cards (
      id bigserial primary key,
      country_code varchar(2) not null,
      country_name varchar(120) not null,
      region varchar(80) not null,
      courier_name varchar(120) not null,
      service_type varchar(80) not null default 'Express',
      currency varchar(3) not null default 'INR',
      base_weight_kg numeric(10, 2) not null default 0.50,
      base_rate numeric(12, 2) not null default 0,
      additional_rate_per_kg numeric(12, 2) not null default 0,
      fuel_surcharge_percent numeric(7, 2) not null default 0,
      handling_fee numeric(12, 2) not null default 0,
      customs_clearance_fee numeric(12, 2) not null default 0,
      insurance_percent numeric(7, 2) not null default 0,
      tax_percent numeric(7, 2) not null default 18,
      duties_mode varchar(3) not null default 'DDU',
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (country_code, courier_name, service_type)
    )
  `)

  const values: unknown[] = []
  const rows: string[] = []
  countries.forEach(([code, name, region], countryIndex) => {
    couriers.forEach((courier, courierIndex) => {
      const offset = (countryIndex % 5) * 55
      const baseRate = Math.round((regionBase[region] + offset) * courier.multiplier)
      const extraRate = Math.round(baseRate * 0.72)
      const start = values.length
      values.push(code, name, region, courier.name, courier.service, baseRate, extraRate, 18 + courierIndex * 1.5, 125 + courierIndex * 25)
      rows.push(`($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, 'INR', 0.50, $${start + 6}, $${start + 7}, $${start + 8}, $${start + 9}, 350, 1, 18, 'DDU', true)`)
    })
  })

  await pool.query(
    `insert into shipray_international_rate_cards
      (country_code, country_name, region, courier_name, service_type, currency,
       base_weight_kg, base_rate, additional_rate_per_kg, fuel_surcharge_percent,
       handling_fee, customs_clearance_fee, insurance_percent, tax_percent,
       duties_mode, is_active)
     values ${rows.join(',')}
     on conflict (country_code, courier_name, service_type) do nothing`,
    values,
  )
}

export const getInternationalRateQuote = async (country: string, courierName: string) => {
  await ensureTableAndDefaults()
  const normalizedCountry = String(country || '').trim()
  const normalizedCourier = String(courierName || '').trim()
  if (!normalizedCountry || !normalizedCourier) return null
  const result = await pool.query(
    `select * from shipray_international_rate_cards
     where is_active = true
       and (upper(country_code) = upper($1) or lower(country_name) = lower($1))
       and lower(courier_name) = lower($2)
     limit 1`,
    [normalizedCountry, normalizedCourier],
  )
  return result.rows[0] ? serialize(result.rows[0]) : null
}

const toNumber = (value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be between ${min} and ${max}`)
  }
  return parsed
}

const serialize = (row: any) => ({
  id: Number(row.id),
  countryCode: row.country_code,
  countryName: row.country_name,
  region: row.region,
  courierName: row.courier_name,
  serviceType: row.service_type,
  currency: row.currency,
  baseWeightKg: Number(row.base_weight_kg),
  baseRate: Number(row.base_rate),
  additionalRatePerKg: Number(row.additional_rate_per_kg),
  fuelSurchargePercent: Number(row.fuel_surcharge_percent),
  handlingFee: Number(row.handling_fee),
  customsClearanceFee: Number(row.customs_clearance_fee),
  insurancePercent: Number(row.insurance_percent),
  taxPercent: Number(row.tax_percent),
  dutiesMode: row.duties_mode,
  isActive: row.is_active,
  updatedAt: row.updated_at,
})

const requiredText = (value: unknown, field: string, maxLength: number) => {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${field} is required`)
  if (text.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer`)
  return text
}

const parseRatePayload = (body: any) => {
  const countryCode = requiredText(body.countryCode, 'Country code', 2).toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Country code must be a 2-letter ISO code')

  const currency = requiredText(body.currency || 'INR', 'Currency', 3).toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be a 3-letter code')

  const dutiesMode = String(body.dutiesMode || '').toUpperCase()
  if (!['DDU', 'DDP'].includes(dutiesMode)) throw new Error('Duties mode must be DDU or DDP')

  return {
    countryCode,
    countryName: requiredText(body.countryName, 'Country name', 120),
    region: requiredText(body.region, 'Region', 80),
    courierName: requiredText(body.courierName, 'Courier name', 120),
    serviceType: requiredText(body.serviceType, 'Service type', 80),
    currency,
    baseWeightKg: toNumber(body.baseWeightKg, 'Base weight', 0.01, 1000),
    baseRate: toNumber(body.baseRate, 'Base rate', 0.01),
    additionalRatePerKg: toNumber(body.additionalRatePerKg, 'Additional rate'),
    fuelSurchargePercent: toNumber(body.fuelSurchargePercent, 'Fuel surcharge', 0, 100),
    handlingFee: toNumber(body.handlingFee, 'Handling fee'),
    customsClearanceFee: toNumber(body.customsClearanceFee, 'Customs clearance fee'),
    insurancePercent: toNumber(body.insurancePercent, 'Insurance', 0, 100),
    taxPercent: toNumber(body.taxPercent, 'Tax', 0, 100),
    dutiesMode,
    isActive: body.isActive !== false,
  }
}

export const listInternationalRates = async (_req: Request, res: Response) => {
  try {
    await ensureTableAndDefaults()
    const result = await pool.query(
      `select * from shipray_international_rate_cards
       order by region, country_name, courier_name`,
    )
    return res.json({ data: result.rows.map(serialize) })
  } catch (error: any) {
    console.error('[international-rates:list]', error)
    return res.status(500).json({ message: error?.message || 'Unable to load international rates' })
  }
}

export const createInternationalRate = async (req: Request, res: Response) => {
  try {
    await ensureTableAndDefaults()
    const rate = parseRatePayload(req.body || {})
    const result = await pool.query(
      `insert into shipray_international_rate_cards
        (country_code, country_name, region, courier_name, service_type, currency,
         base_weight_kg, base_rate, additional_rate_per_kg, fuel_surcharge_percent,
         handling_fee, customs_clearance_fee, insurance_percent, tax_percent,
         duties_mode, is_active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       returning *`,
      [
        rate.countryCode, rate.countryName, rate.region, rate.courierName,
        rate.serviceType, rate.currency, rate.baseWeightKg, rate.baseRate,
        rate.additionalRatePerKg, rate.fuelSurchargePercent, rate.handlingFee,
        rate.customsClearanceFee, rate.insurancePercent, rate.taxPercent,
        rate.dutiesMode, rate.isActive,
      ],
    )
    return res.status(201).json({ data: serialize(result.rows[0]) })
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'A rate card already exists for this country, courier and service' })
    }
    const message = error?.message || 'Unable to create international rate'
    const isValidationError = message.includes('required') || message.includes('must be')
    return res.status(isValidationError ? 400 : 500).json({ message })
  }
}

export const updateInternationalRate = async (req: Request, res: Response) => {
  try {
    await ensureTableAndDefaults()
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Invalid rate ID' })

    const body = req.body || {}
    const dutiesMode = String(body.dutiesMode || '').toUpperCase()
    if (!['DDU', 'DDP'].includes(dutiesMode)) throw new Error('Duties mode must be DDU or DDP')

    const result = await pool.query(
      `update shipray_international_rate_cards set
        currency = $1, base_weight_kg = $2, base_rate = $3,
        additional_rate_per_kg = $4, fuel_surcharge_percent = $5,
        handling_fee = $6, customs_clearance_fee = $7, insurance_percent = $8,
        tax_percent = $9, duties_mode = $10, is_active = $11, updated_at = now()
       where id = $12 returning *`,
      [
        String(body.currency || 'INR').toUpperCase().slice(0, 3),
        toNumber(body.baseWeightKg, 'Base weight', 0.01, 1000),
        toNumber(body.baseRate, 'Base rate'),
        toNumber(body.additionalRatePerKg, 'Additional rate'),
        toNumber(body.fuelSurchargePercent, 'Fuel surcharge', 0, 100),
        toNumber(body.handlingFee, 'Handling fee'),
        toNumber(body.customsClearanceFee, 'Customs clearance fee'),
        toNumber(body.insurancePercent, 'Insurance', 0, 100),
        toNumber(body.taxPercent, 'Tax', 0, 100),
        dutiesMode,
        body.isActive !== false,
        id,
      ],
    )
    if (!result.rowCount) return res.status(404).json({ message: 'International rate not found' })
    return res.json({ data: serialize(result.rows[0]) })
  } catch (error: any) {
    const message = error?.message || 'Unable to update international rate'
    return res.status(message.includes('must be') ? 400 : 500).json({ message })
  }
}
