import axios, { AxiosError } from 'axios'
import { eq } from 'drizzle-orm'
import { db } from '../../client'
import { courier_credentials } from '../../schema/courierCredentials'
import { decryptSecret } from '../../../utils/secretEncryption'

const PROVIDER = 'dilliking'
const DEFAULT_API_BASE = 'https://cloud.iclinternational.in'
const AWB_PATH = '/api/v1/Awbentry/Awbentry'

type IclCredentials = {
  apiBase: string
  userId: string
  password: string
  customerCode: string
}

type IclResponse = {
  Response?: {
    ResponseCode?: string
    Status?: string
    ErrorCode?: string
    AWBNo?: string
    Error?: Array<{ Description?: string }>
    [key: string]: any
  }
}

const safeDecrypt = (value: string) => {
  if (!value) return ''
  try {
    return decryptSecret(value)
  } catch {
    return value
  }
}

const getCredentials = async (): Promise<IclCredentials> => {
  const [row] = await db
    .select({
      apiBase: courier_credentials.apiBase,
      userId: courier_credentials.username,
      customerCode: courier_credentials.clientId,
      password: courier_credentials.password,
    })
    .from(courier_credentials)
    .where(eq(courier_credentials.provider, PROVIDER))
    .limit(1)

  const apiBase = String(row?.apiBase || process.env.ICL_API_BASE || DEFAULT_API_BASE)
    .trim()
    .replace(/\/+$/, '')
  const userId = String(row?.userId || process.env.ICL_USER_ID || '').trim()
  const customerCode = String(row?.customerCode || process.env.ICL_CUSTOMER_CODE || userId).trim()
  const password = row?.password
    ? safeDecrypt(row.password)
    : String(process.env.ICL_PASSWORD || '').trim()

  if (!apiBase.startsWith('https://')) throw new Error('ICL API base must use HTTPS')
  if (!userId || !password || !customerCode) {
    throw new Error('ICL User ID, password and customer code are not configured')
  }
  return { apiBase, userId, password, customerCode }
}

const getProviderMessage = (data: IclResponse, fallback: string) => {
  const response = data?.Response
  const descriptions = Array.isArray(response?.Error)
    ? response.Error.map((item) => String(item?.Description || '').trim()).filter(Boolean)
    : []
  return descriptions.join('; ') || response?.APIError || response?.APIStatus || fallback
}

const errorMessage = (error: unknown, fallback: string) => {
  const axiosError = error as AxiosError<any>
  const providerData = axiosError.response?.data as IclResponse | undefined
  return providerData
    ? getProviderMessage(providerData, axiosError.message || fallback)
    : axiosError.message || fallback
}

const isAuthorizationFailure = (data: IclResponse) => {
  const message = getProviderMessage(data, '').toLowerCase()
  return (
    message.includes('not authorized') ||
    message.includes('unauthorized') ||
    message.includes('invalid credential') ||
    message.includes('invalid user') ||
    message.includes('invalid password')
  )
}

export class DilliKingService {
  private async postAwb(payload: Record<string, any>) {
    const credentials = await getCredentials()
    const requestBody = {
      ...payload,
      UserId: credentials.userId,
      Password: credentials.password,
      CustomerCode: credentials.customerCode,
    }

    try {
      const response = await axios.post<IclResponse>(
        `${credentials.apiBase}${AWB_PATH}`,
        requestBody,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
          maxBodyLength: 25 * 1024 * 1024,
        },
      )
      return response.data
    } catch (error) {
      throw new Error(errorMessage(error, 'ICL International request failed'))
    }
  }

  /** ICL has no documented login endpoint. This incomplete request cannot create an AWB. */
  async testConnection() {
    const data = await this.postAwb({})
    if (isAuthorizationFailure(data)) {
      throw new Error(getProviderMessage(data, 'ICL API credentials were rejected'))
    }
    const credentials = await getCredentials()
    return {
      connected: true,
      apiBase: credentials.apiBase,
      userId: credentials.userId,
      customerCode: credentials.customerCode,
      check: 'Credentials accepted; no shipment was created',
    }
  }

  async createAwb(payload: Record<string, any>) {
    const required = [
      'CustomerRefNo', 'OriginName', 'DestinationName', 'ShipperName', 'ShipperAdd1',
      'ShipperCity', 'ShipperState', 'ShipperPin', 'ConsigneeName', 'ConsigneeAdd1',
      'ConsigneeCity', 'ConsigneeState', 'ConsigneePin', 'VendorName', 'ServiceName',
      'ProductCode', 'Pieces', 'Weight', 'Content', 'Currency', 'ShipmentValue',
    ]
    const missing = required.filter((field) => !String(payload?.[field] ?? '').trim())
    if (missing.length) throw new Error(`Missing required ICL fields: ${missing.join(', ')}`)
    if (!Array.isArray(payload?.Dimensions) || payload.Dimensions.length === 0) {
      throw new Error('At least one Dimensions entry is required')
    }

    // Credentials always come from encrypted server storage, never from the browser.
    const { UserId: _userId, Password: _password, CustomerCode: _customerCode, ...booking } = payload
    const data = await this.postAwb(booking)
    const response = data?.Response
    if (response?.Status?.toLowerCase() !== 'success' || !String(response?.AWBNo || '').trim()) {
      throw new Error(getProviderMessage(data, 'ICL AWB creation failed'))
    }
    return data
  }

  async track(_airwayBill: string) {
    throw new Error('Tracking endpoint is not included in the supplied ICL API documentation')
  }
}

// Compatibility with the existing controller import; ICL uses no token cache.
export const clearDilliKingTokenCache = () => undefined
