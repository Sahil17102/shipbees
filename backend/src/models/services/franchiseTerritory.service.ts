import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../client'
import {
  franchiseAgreements,
  franchiseGeoUnits,
  franchiseOrganizations,
  franchiseProducts,
} from '../schema/franchise'
import { locations } from '../schema/locations'

export type TerritoryTier = 'state' | 'district_city' | 'pincode'
export type TerritoryInventoryStatus = 'booked' | 'reserved' | 'available'

export type TerritoryCatalogEntry = {
  id: string
  parentId: string | null
  geoUnitId: string | null
  type: TerritoryTier
  code: string
  name: string
  pincode: string | null
  state: string
  district: string | null
  city: string | null
  status: TerritoryInventoryStatus
  sourceStatus: string
  mappingVersion: number
  owner: null | {
    id: string
    legalName: string
    tradeName: string
    email: string
    phone: string
    kycStatus: string
    bankStatus: string
    status: string
  }
  agreement: null | {
    id: string
    agreementNumber: string
    status: string
    startsAt: Date
    endsAt: Date
    shareBps: number
    pricePaise: number
    securityDepositPaise: number
    productName: string
    productTier: string
  }
}

const normalize = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('en-IN')
    .replace(/\s+/g, ' ')

const slug = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const districtName = (value: string | null | undefined) =>
  String(value || '')
    .trim()
    .replace(/\s+(district|city)$/i, '')
    .trim()

export const territoryStateId = (state: string) => `state:${slug(state)}`
export const territoryDistrictId = (state: string, district: string) =>
  `district_city:${slug(state)}:${slug(districtName(district))}`
export const territoryPincodeId = (pincode: string) => `pincode:${String(pincode).trim()}`

const inventoryStatus = (
  sourceStatus: string | null | undefined,
  agreementId: string | null | undefined,
): TerritoryInventoryStatus => {
  if (agreementId || ['active', 'suspended'].includes(String(sourceStatus))) return 'booked'
  if (['reserved', 'payment_pending'].includes(String(sourceStatus))) return 'reserved'
  return 'available'
}

const createEntry = (
  type: TerritoryTier,
  values: {
    state: string
    district?: string | null
    city?: string | null
    pincode?: string | null
    name: string
    code?: string
  },
): TerritoryCatalogEntry => {
  const district = districtName(values.district || values.city) || null
  const id =
    type === 'state'
      ? territoryStateId(values.state)
      : type === 'district_city'
        ? territoryDistrictId(values.state, district || values.name)
        : territoryPincodeId(values.pincode || values.code || values.name)
  const parentId =
    type === 'state'
      ? null
      : type === 'district_city'
        ? territoryStateId(values.state)
        : territoryDistrictId(values.state, district || values.city || 'Unmapped')

  return {
    id,
    parentId,
    geoUnitId: null,
    type,
    code:
      values.code ||
      (type === 'state'
        ? `IN-${slug(values.state).toUpperCase()}`
        : type === 'district_city'
          ? `${slug(values.state).toUpperCase()}-${slug(district || values.name).toUpperCase()}`
          : `IN-${values.pincode}`),
    name: values.name,
    pincode: values.pincode || null,
    state: values.state,
    district,
    city: values.city || district,
    status: 'available',
    sourceStatus: 'available',
    mappingVersion: 1,
    owner: null,
    agreement: null,
  }
}

export const getFranchiseTerritoryCatalog = async (): Promise<TerritoryCatalogEntry[]> => {
  const [locationRows, geoRows] = await Promise.all([
    db
      .select({
        pincode: locations.pincode,
        city: locations.city,
        state: locations.state,
      })
      .from(locations),
    db
      .select({
        geoUnitId: franchiseGeoUnits.id,
        sourceParentId: franchiseGeoUnits.parentId,
        type: franchiseGeoUnits.type,
        code: franchiseGeoUnits.code,
        name: franchiseGeoUnits.name,
        pincode: franchiseGeoUnits.pincode,
        state: franchiseGeoUnits.state,
        district: franchiseGeoUnits.district,
        city: franchiseGeoUnits.city,
        sourceStatus: franchiseGeoUnits.status,
        mappingVersion: franchiseGeoUnits.mappingVersion,
        organizationId: franchiseOrganizations.id,
        legalName: franchiseOrganizations.legalName,
        tradeName: franchiseOrganizations.tradeName,
        email: franchiseOrganizations.email,
        phone: franchiseOrganizations.phone,
        kycStatus: franchiseOrganizations.kycStatus,
        bankStatus: franchiseOrganizations.bankStatus,
        organizationStatus: franchiseOrganizations.status,
        agreementId: franchiseAgreements.id,
        agreementNumber: franchiseAgreements.agreementNumber,
        agreementStatus: franchiseAgreements.status,
        agreementStartsAt: franchiseAgreements.startsAt,
        agreementEndsAt: franchiseAgreements.endsAt,
        shareBps: franchiseAgreements.shareBps,
        pricePaise: franchiseAgreements.pricePaise,
        securityDepositPaise: franchiseAgreements.securityDepositPaise,
        productName: franchiseProducts.name,
        productTier: franchiseProducts.tier,
      })
      .from(franchiseGeoUnits)
      .leftJoin(
        franchiseAgreements,
        and(
          eq(franchiseAgreements.geoUnitId, franchiseGeoUnits.id),
          inArray(franchiseAgreements.status, ['active', 'suspended']),
        ),
      )
      .leftJoin(
        franchiseOrganizations,
        eq(franchiseOrganizations.id, franchiseAgreements.organizationId),
      )
      .leftJoin(franchiseProducts, eq(franchiseProducts.id, franchiseAgreements.productId)),
  ])

  const entries = new Map<string, TerritoryCatalogEntry>()

  for (const location of locationRows) {
    const stateId = territoryStateId(location.state)
    const districtId = territoryDistrictId(location.state, location.city)
    const pincodeId = territoryPincodeId(location.pincode)

    if (!entries.has(stateId)) {
      entries.set(
        stateId,
        createEntry('state', {
          state: location.state,
          name: location.state,
        }),
      )
    }
    if (!entries.has(districtId)) {
      entries.set(
        districtId,
        createEntry('district_city', {
          state: location.state,
          district: location.city,
          city: location.city,
          name: location.city,
        }),
      )
    }
    if (!entries.has(pincodeId)) {
      entries.set(
        pincodeId,
        createEntry('pincode', {
          state: location.state,
          district: location.city,
          city: location.city,
          pincode: location.pincode,
          name: `${location.city} ${location.pincode}`,
        }),
      )
    }
  }

  for (const row of geoRows) {
    if (!['state', 'district_city', 'pincode'].includes(row.type)) continue
    const type = row.type as TerritoryTier
    const district = districtName(row.district || row.city || row.name)
    const id =
      type === 'state'
        ? territoryStateId(row.state)
        : type === 'district_city'
          ? territoryDistrictId(row.state, district)
          : territoryPincodeId(row.pincode || row.code)

    if (!entries.has(territoryStateId(row.state))) {
      entries.set(
        territoryStateId(row.state),
        createEntry('state', { state: row.state, name: row.state }),
      )
    }
    if (type === 'pincode' && !entries.has(territoryDistrictId(row.state, district))) {
      entries.set(
        territoryDistrictId(row.state, district),
        createEntry('district_city', {
          state: row.state,
          district,
          city: row.city || district,
          name: district,
        }),
      )
    }

    const entry =
      entries.get(id) ||
      createEntry(type, {
        state: row.state,
        district,
        city: row.city,
        pincode: row.pincode,
        name: row.name,
        code: row.code,
      })

    entry.geoUnitId = row.geoUnitId
    entry.code = row.code
    entry.name = row.name
    entry.pincode = row.pincode
    entry.state = row.state
    entry.district = type === 'state' ? null : district || null
    entry.city = row.city || (type === 'district_city' ? district : entry.city)
    entry.sourceStatus = row.sourceStatus
    entry.status = inventoryStatus(row.sourceStatus, row.agreementId)
    entry.mappingVersion = row.mappingVersion
    entry.owner = row.organizationId
      ? {
          id: row.organizationId,
          legalName: row.legalName || '',
          tradeName: row.tradeName || row.legalName || '',
          email: row.email || '',
          phone: row.phone || '',
          kycStatus: row.kycStatus || 'pending',
          bankStatus: row.bankStatus || 'pending',
          status: row.organizationStatus || 'pending',
        }
      : null
    entry.agreement =
      row.agreementId &&
      row.agreementNumber &&
      row.agreementStatus &&
      row.agreementStartsAt &&
      row.agreementEndsAt
        ? {
            id: row.agreementId,
            agreementNumber: row.agreementNumber,
            status: row.agreementStatus,
            startsAt: row.agreementStartsAt,
            endsAt: row.agreementEndsAt,
            shareBps: row.shareBps || 0,
            pricePaise: row.pricePaise || 0,
            securityDepositPaise: row.securityDepositPaise || 0,
            productName: row.productName || '',
            productTier: row.productTier || type,
          }
        : null
    entries.set(id, entry)
  }

  for (const entry of entries.values()) {
    const canonicalState = entries.get(territoryStateId(entry.state))
    if (canonicalState) entry.state = canonicalState.name
  }

  return Array.from(entries.values()).sort((left, right) => {
    const stateOrder = left.state.localeCompare(right.state)
    if (stateOrder !== 0) return stateOrder
    const tierOrder: Record<TerritoryTier, number> = { state: 0, district_city: 1, pincode: 2 }
    if (left.type !== right.type) return tierOrder[left.type] - tierOrder[right.type]
    return (left.pincode || left.name).localeCompare(right.pincode || right.name, 'en-IN', {
      numeric: true,
    })
  })
}

export const summarizeTerritoryCatalog = (entries: TerritoryCatalogEntry[]) => {
  const summarizeTier = (tier: TerritoryTier) => {
    const rows = entries.filter((entry) => entry.type === tier)
    return {
      total: rows.length,
      booked: rows.filter((entry) => entry.status === 'booked').length,
      reserved: rows.filter((entry) => entry.status === 'reserved').length,
      available: rows.filter((entry) => entry.status === 'available').length,
    }
  }

  return {
    state: summarizeTier('state'),
    district_city: summarizeTier('district_city'),
    pincode: summarizeTier('pincode'),
  }
}
