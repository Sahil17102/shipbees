import axios, { AxiosError } from 'axios'
import { eq } from 'drizzle-orm'
import { db } from '../../client'
import { courier_credentials } from '../../schema/courierCredentials'
import { decryptSecret } from '../../../utils/secretEncryption'

const PROVIDER = 'icl'
const DEFAULT_API_BASE = 'https://cloud.iclinternational.in'
const AWB_PATH = '/api/v1/Awbentry/Awbentry'

type IclCredentials = { apiBase: string; userId: string; password: string; customerCode: string }
type IclResponse = {
  Response?: {
    Status?: string
    AWBNo?: string
    APIError?: string
    APIStatus?: string
    Error?: Array<{ Description?: string }>
    [key: string]: any
  }
}

const safeDecrypt = (value: string) => {
  if (!value) return ''
  try { return decryptSecret(value) } catch { return value }
}

const getCredentials = async (): Promise<IclCredentials> => {
  const [row] = await db.select({
    userId: courier_credentials.username,
    customerCode: courier_credentials.clientId,
    password: courier_credentials.password,
  }).from(courier_credentials).where(eq(courier_credentials.provider, PROVIDER)).limit(1)

  const apiBase = String(process.env.ICL_API_BASE || DEFAULT_API_BASE).trim().replace(/\/+$/, '')
  const userId = String(row?.userId || process.env.ICL_USER_ID || '').trim()
  const customerCode = String(row?.customerCode || process.env.ICL_CUSTOMER_CODE || userId).trim()
  const password = row?.password ? safeDecrypt(row.password) : String(process.env.ICL_PASSWORD || '').trim()
  if (apiBase !== DEFAULT_API_BASE) throw new Error('Use the approved ICL production API URL')
  if (!userId || !password || !customerCode) throw new Error('ICL User ID, password and customer code are not configured')
  return { apiBase, userId, password, customerCode }
}

const providerMessage = (data: IclResponse, fallback: string) => {
  const response = data?.Response
  const errors = Array.isArray(response?.Error)
    ? response.Error.map((item) => String(item?.Description || '').trim()).filter(Boolean)
    : []
  return errors.join('; ') || response?.APIError || response?.APIStatus || fallback
}

const requestError = (error: unknown, fallback: string) => {
  const axiosError = error as AxiosError<IclResponse>
  return axiosError.response?.data
    ? providerMessage(axiosError.response.data, axiosError.message || fallback)
    : axiosError.message || fallback
}

const authorizationFailed = (data: IclResponse) => {
  const message = providerMessage(data, '').toLowerCase()
  return ['not authorized', 'unauthorized', 'invalid credential', 'invalid user', 'invalid password']
    .some((part) => message.includes(part))
}

export class IclInternationalService {
  private async postAwb(payload: Record<string, any>) {
    const credentials = await getCredentials()
    try {
      const response = await axios.post<IclResponse>(`${credentials.apiBase}${AWB_PATH}`, {
        ...payload,
        UserId: credentials.userId,
        Password: credentials.password,
        CustomerCode: credentials.customerCode,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000,
        maxBodyLength: 25 * 1024 * 1024,
      })
      return response.data
    } catch (error) {
      throw new Error(requestError(error, 'ICL International request failed'))
    }
  }

  /** ICL documents no login route. This incomplete request cannot create an AWB. */
  async testConnection() {
    const data = await this.postAwb({})
    if (authorizationFailed(data)) throw new Error(providerMessage(data, 'ICL credentials were rejected'))
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
    const { UserId: _userId, Password: _password, CustomerCode: _customerCode, ...booking } = payload
    const data = await this.postAwb(booking)
    if (data?.Response?.Status?.toLowerCase() !== 'success' || !String(data?.Response?.AWBNo || '').trim()) {
      throw new Error(providerMessage(data, 'ICL AWB creation failed'))
    }
    return data
  }
}
