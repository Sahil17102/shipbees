import axios, { AxiosError } from 'axios'
import { eq } from 'drizzle-orm'
import { db } from '../../client'
import { courier_credentials } from '../../schema/courierCredentials'
import { decryptSecret } from '../../../utils/secretEncryption'

const PROVIDER = 'dilliking'
const DEFAULT_API_BASE = 'https://api.dilliking.com'

type DilliKingCredentials = {
  apiBase: string
  email: string
  password: string
}

let cachedToken = ''
let cachedTokenAt = 0
const TOKEN_CACHE_MS = 45 * 60 * 1000

const safeDecrypt = (value: string) => {
  if (!value) return ''
  try {
    return decryptSecret(value)
  } catch {
    // Supports credentials saved before encrypted storage was introduced.
    return value
  }
}

const getCredentials = async (): Promise<DilliKingCredentials> => {
  const [row] = await db
    .select({
      apiBase: courier_credentials.apiBase,
      username: courier_credentials.username,
      password: courier_credentials.password,
    })
    .from(courier_credentials)
    .where(eq(courier_credentials.provider, PROVIDER))
    .limit(1)

  const storedApiBase = String(row?.apiBase || '').trim()
  const safeStoredApiBase = storedApiBase.includes('iclinternational.in') ? '' : storedApiBase
  const apiBase = String(safeStoredApiBase || process.env.DILLIKING_API_BASE || DEFAULT_API_BASE)
    .trim()
    .replace(/\/+$/, '')
  const email = String(row?.username || process.env.DILLIKING_EMAIL || '').trim()
  const password = row?.password
    ? safeDecrypt(row.password)
    : String(process.env.DILLIKING_PASSWORD || '').trim()

  if (!apiBase.startsWith('https://')) throw new Error('DilliKing API base must use HTTPS')
  if (!email || !password) throw new Error('DilliKing email and password are not configured')
  return { apiBase, email, password }
}

const errorMessage = (error: unknown, fallback: string) => {
  const axiosError = error as AxiosError<any>
  return (
    axiosError.response?.data?.message ||
    axiosError.response?.data?.error ||
    axiosError.message ||
    fallback
  )
}

export class DilliKingService {
  private async login(force = false) {
    if (!force && cachedToken && Date.now() - cachedTokenAt < TOKEN_CACHE_MS) return cachedToken

    const credentials = await getCredentials()
    const body = new URLSearchParams({
      email: credentials.email,
      password: credentials.password,
    })

    try {
      const response = await axios.post(`${credentials.apiBase}/auth/token`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20000,
      })
      const token = String(response.data?.data?.token || '').trim()
      if (response.data?.status !== true || !token) {
        throw new Error(response.data?.message || 'DilliKing login did not return a token')
      }
      cachedToken = token
      cachedTokenAt = Date.now()
      return token
    } catch (error) {
      throw new Error(errorMessage(error, 'DilliKing login failed'))
    }
  }

  private async authorizedRequest<T>(request: (apiBase: string, token: string) => Promise<T>) {
    const credentials = await getCredentials()
    let token = await this.login()
    try {
      return await request(credentials.apiBase, token)
    } catch (error) {
      if ((error as AxiosError)?.response?.status !== 401) throw error
      token = await this.login(true)
      return request(credentials.apiBase, token)
    }
  }

  async testConnection() {
    await this.login(true)
    const credentials = await getCredentials()
    return { connected: true, apiBase: credentials.apiBase, email: credentials.email }
  }

  async createAwb(payload: Record<string, any>) {
    if (!payload?.destination_country || !payload?.service) {
      throw new Error('destination_country and service are required')
    }
    if (!payload?.shipper || !payload?.consignee || !Array.isArray(payload?.boxes) || !Array.isArray(payload?.items)) {
      throw new Error('shipper, consignee, boxes and items are required')
    }

    try {
      const response: any = await this.authorizedRequest((apiBase, token) =>
        axios.post(`${apiBase}/shipment/awb`, payload, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 60000,
          maxBodyLength: 25 * 1024 * 1024,
        }),
      )
      if (response.data?.status !== true) {
        throw new Error(response.data?.message || 'DilliKing AWB creation failed')
      }
      return response.data
    } catch (error) {
      throw new Error(errorMessage(error, 'DilliKing AWB creation failed'))
    }
  }

  async track(airwayBill: string) {
    const normalized = String(airwayBill || '').trim()
    if (!normalized) throw new Error('airway_bill is required')
    try {
      const response: any = await this.authorizedRequest((apiBase, token) =>
        axios.get(`${apiBase}/tracking`, {
          params: { airway_bill: normalized },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 20000,
        }),
      )
      return response.data
    } catch (error) {
      throw new Error(errorMessage(error, 'DilliKing tracking failed'))
    }
  }
}

export const clearDilliKingTokenCache = () => {
  cachedToken = ''
  cachedTokenAt = 0
}
