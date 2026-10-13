import axios, { AxiosError } from 'axios'
import { and, eq } from 'drizzle-orm'
import { db } from '../../client'
import { courier_credentials } from '../../schema/courierCredentials'
import { couriers } from '../../schema/couriers'

export const VELOCITY_PROVIDER = 'velocity' as const

export const VELOCITY_ENDPOINTS = {
  authToken: '/custom/api/v1/auth-token',
  warehouse: '/custom/api/v1/warehouse',
  serviceability: '/custom/api/v1/serviceability',
  forwardOrder: '/custom/api/v1/forward-order-orchestration',
  reverseOrder: '/custom/api/v1/reverse-order-orchestration',
  cancelOrder: '/custom/api/v1/cancel-order',
  tracking: '/custom/api/v1/order-tracking',
  reports: '/custom/api/v1/reports',
  rates: '/custom/api/v1/rates',
  shipments: '/custom/api/v1/shipments',
  returns: '/custom/api/v1/returns',
} as const

export type VelocityOperation = keyof typeof VELOCITY_ENDPOINTS

export type VelocityConfig = {
  apiBase: string
  username: string
  password: string
  authorizationScheme: 'bearer' | 'raw'
}

type TokenEntry = { token: string; expiresAt: number }
const tokenCache = new Map<string, TokenEntry>()

const trim = (value: unknown) => String(value ?? '').trim()

const readConfig = async (): Promise<VelocityConfig> => {
  const [row] = await db
    .select({
      apiBase: courier_credentials.apiBase,
      username: courier_credentials.username,
      password: courier_credentials.password,
      metadata: courier_credentials.metadata,
    })
    .from(courier_credentials)
    .where(eq(courier_credentials.provider, VELOCITY_PROVIDER))
    .limit(1)

  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const apiBase = trim(row?.apiBase || process.env.VELOCITY_API_BASE)
  const username = trim(row?.username || process.env.VELOCITY_USERNAME)
  const password = trim(row?.password || process.env.VELOCITY_PASSWORD)
  const authorizationScheme =
    trim(metadata.authorizationScheme || process.env.VELOCITY_AUTHORIZATION_SCHEME || 'raw').toLowerCase() ===
    'bearer'
      ? 'bearer'
      : 'raw'

  if (!apiBase || !username || !password) {
    throw new Error('Velocity API base URL, username, and password are required')
  }

  let parsed: URL
  try {
    parsed = new URL(apiBase)
  } catch {
    throw new Error('Velocity API base URL must be a valid URL')
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new Error('Velocity API base URL must use HTTPS in production')
  }

  return { apiBase: apiBase.replace(/\/+$/, ''), username, password, authorizationScheme }
}

const providerError = (operation: string, error: unknown): Error => {
  const axiosError = error as AxiosError<any>
  const status = axiosError.response?.status
  const body = axiosError.response?.data
  const bodyText =
    body && typeof body === 'object'
      ? JSON.stringify(body)
      : typeof body === 'string'
        ? body
        : ''
  const message =
    body?.message ||
    body?.error ||
    body?.errors?.[0]?.message ||
    bodyText ||
    axiosError.message ||
    'request failed'
  const enriched = new Error(`Velocity ${operation} failed${status ? ` (${status})` : ''}: ${message}`)
  ;(enriched as any).statusCode = status || 502
  ;(enriched as any).response = axiosError.response
  ;(enriched as any).providerBody = body ?? null
  return enriched
}

export const velocityGetToken = async (forceRefresh = false) => {
  const config = await readConfig()
  const cacheKey = `${config.apiBase}|${config.username}`
  const cached = tokenCache.get(cacheKey)
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) return cached

  try {
    const { data } = await axios.post(
      `${config.apiBase}${VELOCITY_ENDPOINTS.authToken}`,
      { username: config.username, password: config.password },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 },
    )
    const token = trim(data?.token || data?.payload?.token || data?.data?.token)
    if (!token) throw new Error('Velocity did not return an access token')
    const providerExpiry = Date.parse(data?.expires_at || data?.payload?.expires_at || '')
    const expiresAt = Number.isFinite(providerExpiry) ? providerExpiry : Date.now() + 23 * 60 * 60 * 1000
    const entry = { token, expiresAt }
    tokenCache.set(cacheKey, entry)
    return entry
  } catch (error) {
    throw providerError('authentication', error)
  }
}

const request = async <T = any>(operation: VelocityOperation, payload: Record<string, any>) => {
  const config = await readConfig()
  const token = await velocityGetToken()
  const authorization = config.authorizationScheme === 'raw' ? token.token : `Bearer ${token.token}`

  try {
    const { data } = await axios.post<T>(
      `${config.apiBase}${VELOCITY_ENDPOINTS[operation]}`,
      payload,
      {
        headers: { 'Content-Type': 'application/json', Authorization: authorization },
        timeout: 60_000,
      },
    )
    return data
  } catch (error) {
    const axiosError = error as AxiosError<any>
    if (axiosError.response?.status === 401) {
      tokenCache.delete(`${config.apiBase}|${config.username}`)
      const refreshed = await velocityGetToken(true)
      const refreshedAuthorization =
        config.authorizationScheme === 'raw' ? refreshed.token : `Bearer ${refreshed.token}`
      try {
        const { data } = await axios.post<T>(
          `${config.apiBase}${VELOCITY_ENDPOINTS[operation]}`,
          payload,
          {
            headers: { 'Content-Type': 'application/json', Authorization: refreshedAuthorization },
            timeout: 60_000,
          },
        )
        return data
      } catch (retryError) {
        throw providerError(operation, retryError)
      }
    }
    throw providerError(operation, error)
  }
}

export const velocityCreateWarehouse = (payload: Record<string, any>) => request('warehouse', payload)
export const velocityServiceability = (payload: Record<string, any>) => request('serviceability', payload)
export const velocityForwardOrder = (payload: Record<string, any>) => request('forwardOrder', payload)
export const velocityReverseOrder = (payload: Record<string, any>) => request('reverseOrder', payload)
export const velocityCancelOrder = (payload: Record<string, any>) => request('cancelOrder', payload)
export const velocityTracking = (payload: Record<string, any>) => request('tracking', payload)
export const velocityReports = (payload: Record<string, any>) => request('reports', payload)
export const velocityRates = (payload: Record<string, any>) => request('rates', payload)
export const velocityShipments = (payload: Record<string, any>) => request('shipments', payload)
export const velocityReturns = (payload: Record<string, any>) => request('returns', payload)

export const velocityOperation = async (operation: VelocityOperation, payload: Record<string, any>) => {
  if (!(operation in VELOCITY_ENDPOINTS) || operation === 'authToken') {
    throw new Error('Unsupported Velocity operation')
  }
  return request(operation, payload)
}

const hashCarrierId = (value: string) => {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return 800000 + (hash >>> 0) % 99999
}

export const extractVelocityCouriers = (response: any) => {
  const candidates =
    response?.result?.serviceable_couriers ||
    response?.result?.serviceability_results ||
    response?.payload?.result?.serviceable_couriers ||
    response?.payload?.serviceable_couriers ||
    []
  return Array.isArray(candidates)
    ? candidates
        .map((item) => ({
          externalId: trim(item?.carrier_id || item?.carrier_code || item?.id),
          name: trim(item?.carrier_name || item?.courier_name || item?.name),
        }))
        .filter((item) => item.externalId && item.name)
    : []
}

export const upsertVelocityCouriers = async (response: any) => {
  const carriers = extractVelocityCouriers(response)
  const saved = []
  for (const carrier of carriers) {
    let id = hashCarrierId(carrier.externalId)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [existing] = await db
        .select({ id: couriers.id, name: couriers.name })
        .from(couriers)
        .where(and(eq(couriers.id, id), eq(couriers.serviceProvider, VELOCITY_PROVIDER)))
        .limit(1)
      if (!existing || existing.name === carrier.name) break
      id = 800000 + ((id - 800000 + 1) % 99999)
    }
    const [row] = await db
      .insert(couriers)
      .values({
        id,
        name: carrier.name,
        serviceProvider: VELOCITY_PROVIDER,
        isEnabled: true,
        businessType: ['b2c'],
        updatedAt: new Date(),
      } as any)
      .onConflictDoUpdate({
        target: [couriers.id, couriers.serviceProvider],
        set: { name: carrier.name, isEnabled: true, updatedAt: new Date() },
      })
      .returning()
    saved.push({ ...row, externalId: carrier.externalId })
  }
  return saved
}
