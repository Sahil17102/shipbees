import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { Request, Response } from 'express'
import * as XLSX from 'xlsx'
import { db } from '../../models/client'
import {
  deleteCourierService,
  deleteShippingRate,
  getShippingRates,
  ShippingRateUpdatePayload,
  updateShippingRate,
} from '../../models/services/courierIntegration.service'
import {
  CSVRow,
  B2CImportCourierScope,
  importB2CSlabFormat,
  importFlatFormat,
  isSlabValidationError,
  normalizeRateCardRow,
  parseRateCardCsvText,
} from '../../models/services/rateCardImport.service'
import { fetchAvailableCouriersWithRatesAdmin } from '../../models/services/shiprocket.service'
import { courier_credentials } from '../../models/schema/courierCredentials'
import { couriers } from '../../models/schema/couriers'
import { getAllZones } from '../../models/services/zone.service'
import { XpressbeesService } from '../../models/services/couriers/xpressbees.service'
import { ShadowfaxService } from '../../models/services/couriers/shadowfax.service'
import {
  createXpressbeesManualAwbRange,
  getXpressbeesManualAwbSummary,
} from '../../models/services/xpressbeesAwbRange.service'
import {
  AMAZON_CREDENTIALS_PROVIDER,
  AMAZON_DEFAULT_BUSINESS_ID,
  AMAZON_DEFAULT_REGION,
  applyAmazonShippingCredentialsToEnv,
  buildAmazonShippingCredentialsFromRow,
  maskAmazonCredential,
  normalizeAmazonCredentialTokens,
  normalizeAmazonCredentialValue,
  parseAmazonSandboxFlag,
} from '../../models/services/amazonShippingCredentials.service'
import { DelhiveryService } from '../../models/services/couriers/delhivery.service'
import {
  VELOCITY_ENDPOINTS,
  velocityGetToken,
  velocityOperation,
  velocityServiceability,
  upsertVelocityCouriers,
  type VelocityOperation,
} from '../../models/services/couriers/velocity.service'

const ADMIN_VISIBLE_COURIER_PROVIDERS = ['delhivery', 'velocity']

export interface ShippingRateFilters {
  courier_name?: string[]
  mode?: string
  min_weight?: number
  plan_id?: string
  business_type?: 'b2b' | 'b2c'
}

export const fetchAvailableCouriersForAdmin = async (req: Request, res: Response) => {
  try {
    const {
      origin,
      destination,
      payment_type,
      order_amount,
      weight,
      length,
      breadth,
      height,
      shipment_type,
      plan_id,
      isCalculator,
      context,
      shadowfax_forward_mode,
      shadowfaxForwardMode,
      shadowfax_service_mode,
      shadowfaxServiceMode,
    } = req.body
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'pickupPincode and deliveryPincode are required',
      })
    }

    const couriers = await fetchAvailableCouriersWithRatesAdmin(
      {
        origin: Number(origin),
        destination: Number(destination),
        payment_type: payment_type,
        order_amount: order_amount,
        shipment_type: shipment_type,
        weight: Number(weight),
        length: Number(length),
        breadth: Number(breadth),
        height: Number(height),
        isCalculator: isCalculator === true || context === 'rate_calculator',
        shadowfax_forward_mode: shadowfax_forward_mode ?? shadowfaxForwardMode,
        shadowfax_service_mode: shadowfax_service_mode ?? shadowfaxServiceMode,
      },
      plan_id,
    )

    return res.json({ success: true, data: couriers ?? [] })
  } catch (err: any) {
    console.error('Error fetching couriers:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}

export const getShippingRatesController = async (req: Request, res: Response) => {
  try {
    let courierNames: string[] = []

    const rawCourierNames = req.query['courier_name[]'] ?? req.query.courier_name

    const normalizeQueryList = (value: unknown): string[] =>
      (Array.isArray(value) ? value : [value])
        .flat()
        .flatMap((item) => String(item || '').split(','))
        .map((item) => item.trim())
        .filter(Boolean)

    courierNames = normalizeQueryList(rawCourierNames)
    const requestedBusinessType = (req.query.businessType as 'b2b' | 'b2c') || undefined
    const parsedMinWeight = Number(req.query.min_weight)

    const filters: ShippingRateFilters = {
      courier_name: courierNames.length ? courierNames : undefined,
      mode: req.query.mode as string | undefined,
      min_weight:
        requestedBusinessType?.toLowerCase() === 'b2c'
          ? undefined
          : Number.isFinite(parsedMinWeight)
            ? parsedMinWeight
            : undefined,
      plan_id: req.query.planId as string | undefined,
      business_type: requestedBusinessType,
    }

    const rates = await getShippingRates(filters)
    res.json({ success: true, data: rates })
  } catch (err) {
    console.error('Error fetching shipping rates:', err)
    res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}

export const getAllCouriersController = async (req: Request, res: Response) => {
  try {
    const courierList = await db
      .select({
        id: couriers.id,
        name: couriers.name,
        serviceProvider: couriers.serviceProvider,
        isEnabled: couriers.isEnabled,
        createdAt: couriers.createdAt,
      })
      .from(couriers)
      .where(inArray(couriers.serviceProvider, ADMIN_VISIBLE_COURIER_PROVIDERS))
      .orderBy(desc(couriers.createdAt))

    res.json({ success: true, data: courierList })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false })
  }
}

export const getAllCouriersListController = async (req: Request, res: Response) => {
  try {
    const { search, serviceProvider, businessType } = req.query

    const whereClauses = [inArray(couriers.serviceProvider, ADMIN_VISIBLE_COURIER_PROVIDERS)]

    // Filter by search (name or id)
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      whereClauses.push(
        or(
          ilike(couriers.name, searchTerm),
          sql`CAST(${couriers.id} AS TEXT) ILIKE ${searchTerm}`,
        )!,
      )
    }

    // Filter by service provider
    if (serviceProvider && typeof serviceProvider === 'string' && serviceProvider.trim()) {
      const normalizedProvider = serviceProvider.trim().toLowerCase()
      if (!ADMIN_VISIBLE_COURIER_PROVIDERS.includes(normalizedProvider)) {
        return res.json({ success: true, data: [] })
      }
      whereClauses.push(eq(couriers.serviceProvider, normalizedProvider))
    }

    // Filter by business type (b2c or b2b)
    if (businessType && typeof businessType === 'string') {
      const normalizedBusinessType = businessType.trim().toLowerCase()
      if (normalizedBusinessType === 'b2c' || normalizedBusinessType === 'b2b') {
        // Construct JSONB array string - value is validated above (only 'b2c' or 'b2b')
        const jsonbArrayStr = JSON.stringify([normalizedBusinessType])
        // Match the pattern from shiprocket.service.ts - construct the full JSONB literal
        whereClauses.push(
          sql`${couriers.businessType} @> ${sql.raw(
            `'${jsonbArrayStr.replace(/'/g, "''")}'::jsonb`,
          )}`,
        )
      }
    }

    const whereCondition = whereClauses.length > 0 ? and(...whereClauses) : undefined

    const courierList = await db
      .select()
      .from(couriers)
      .where(whereCondition)
      .orderBy(desc(couriers.createdAt))

    res.json({ success: true, data: courierList })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch couriers' })
  }
}

export const updateCourierStatusController = async (req: Request, res: Response) => {
  const { id } = req.params
  const { serviceProvider, isEnabled, businessType } = req.body

  try {
    if (!serviceProvider) {
      return res.status(400).json({
        success: false,
        message: 'serviceProvider is required',
      })
    }

    // Build update object
    const updateData: any = {
      updatedAt: new Date(),
    }

    // Update isEnabled if provided
    if (typeof isEnabled === 'boolean') {
      updateData.isEnabled = isEnabled
    }

    // Update businessType if provided
    if (businessType && Array.isArray(businessType) && businessType.length > 0) {
      // Validate businessType values
      const validTypes = businessType.filter((type) => type === 'b2c' || type === 'b2b')
      if (validTypes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'businessType must contain at least one valid value: "b2c" or "b2b"',
        })
      }
      updateData.businessType = validTypes
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 1) {
      // Only updatedAt was added, nothing to update
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update. Provide isEnabled and/or businessType',
      })
    }

    const updated = await db
      .update(couriers)
      .set(updateData)
      .where(and(eq(couriers.id, Number(id)), eq(couriers.serviceProvider, serviceProvider)))
      .returning()

    if (!updated.length) {
      return res.status(404).json({ success: false, message: 'Courier not found' })
    }

    res.json({ success: true, data: updated[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update courier' })
  }
}

export const getServiceProvidersController = async (req: Request, res: Response) => {
  try {
    // Only expose the providers actively managed in the admin courier UI.
    const allowedProviders = ADMIN_VISIBLE_COURIER_PROVIDERS

    const rows = await db
      .select({
        serviceProvider: couriers.serviceProvider,
        totalCouriers: sql<number>`count(*)`,
        enabledCouriers: sql<number>`sum(case when ${couriers.isEnabled} then 1 else 0 end)`,
      })
      .from(couriers)
      .where(inArray(couriers.serviceProvider, allowedProviders))
      .groupBy(couriers.serviceProvider)
      .orderBy(couriers.serviceProvider)

    const byProvider = new Map(
      rows.map((row) => [
        row.serviceProvider,
        {
          serviceProvider: row.serviceProvider,
          totalCouriers: Number(row.totalCouriers || 0),
          enabledCouriers: Number(row.enabledCouriers || 0),
          isEnabled: Number(row.enabledCouriers || 0) > 0,
        },
      ]),
    )

    // Ensure allowed providers are always visible in admin UI,
    // even when no rows exist in couriers table yet.
    const providers = allowedProviders.map((provider) => ({
      serviceProvider: provider,
      totalCouriers: byProvider.get(provider)?.totalCouriers ?? 0,
      enabledCouriers: byProvider.get(provider)?.enabledCouriers ?? 0,
      isEnabled: byProvider.get(provider)?.isEnabled ?? false,
    }))

    res.json({ success: true, data: providers })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch service providers' })
  }
}

export const updateServiceProviderStatusController = async (req: Request, res: Response) => {
  const { serviceProvider } = req.params
  const { isEnabled } = req.body

  try {
    const allowedProviders = ADMIN_VISIBLE_COURIER_PROVIDERS

    if (!serviceProvider || typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'serviceProvider (param) and boolean isEnabled (body) are required',
      })
    }
    if (!allowedProviders.includes(String(serviceProvider).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Only these providers are supported: ${allowedProviders.join(', ')}`,
      })
    }

    const updated = await db
      .update(couriers)
      .set({
        isEnabled,
        updatedAt: new Date(),
      })
      .where(eq(couriers.serviceProvider, serviceProvider))
      .returning()

    if (!updated.length) {
      return res.status(404).json({ success: false, message: 'No couriers found for provider' })
    }

    res.json({
      success: true,
      data: {
        serviceProvider,
        isEnabled,
        affectedCouriers: updated.length,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update service provider status' })
  }
}

const buildAmazonCredentialResponse = (
  row?: Partial<typeof courier_credentials.$inferSelect> | null,
) => {
  const credentials = buildAmazonShippingCredentialsFromRow(row)
  const accessToken = normalizeAmazonCredentialValue(credentials.accessToken)
  const refreshToken = normalizeAmazonCredentialValue(credentials.refreshToken)
  const lwaClientId = normalizeAmazonCredentialValue(credentials.lwaClientId)
  const lwaClientSecret = normalizeAmazonCredentialValue(credentials.lwaClientSecret)

  return {
    provider: AMAZON_CREDENTIALS_PROVIDER,
    apiBase: normalizeAmazonCredentialValue(credentials.endpoint),
    endpoint: normalizeAmazonCredentialValue(credentials.endpoint),
    lwaClientId,
    shippingBusinessId:
      normalizeAmazonCredentialValue(credentials.shippingBusinessId) || AMAZON_DEFAULT_BUSINESS_ID,
    region: normalizeAmazonCredentialValue(credentials.region) || AMAZON_DEFAULT_REGION,
    sandbox: Boolean(credentials.sandbox),
    lwaTokenUrl: normalizeAmazonCredentialValue(credentials.lwaTokenUrl),
    hasAccessToken: Boolean(accessToken),
    accessTokenMasked: maskAmazonCredential(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    refreshTokenMasked: maskAmazonCredential(refreshToken),
    hasLwaClientSecret: Boolean(lwaClientSecret),
    configured: Boolean(accessToken || (refreshToken && lwaClientId && lwaClientSecret)),
  }
}

const optionalCredentialString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : undefined

const maskCourierCredential = (value: unknown) => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (normalized.length <= 8) return '*'.repeat(normalized.length)
  return `${normalized.slice(0, 4)}${'*'.repeat(Math.max(normalized.length - 8, 0))}${normalized.slice(-4)}`
}

const parseCourierControllerJsonValue = <T>(value: unknown, fallback: T): T => {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string') return value as T

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const normalizePublicUrl = (value: unknown, fallback: string) => {
  const normalized = String(value || fallback).trim()
  return normalized.replace(/\/+$/, '')
}

const getPublicApiUrl = () =>
  normalizePublicUrl(process.env.API_URL || process.env.PUBLIC_API_URL, 'https://api.shipray.com')

const resolvePublicWebhookUrl = (envName: string, path: string) => {
  const configured = optionalCredentialString(process.env[envName])
  if (configured) {
    return /^https?:\/\//i.test(configured)
      ? normalizePublicUrl(configured, configured)
      : `${getPublicApiUrl()}/${configured.replace(/^\/+/, '')}`
  }

  return `${getPublicApiUrl()}${path}`
}

const buildDelhiveryWebhookConfig = () => ({
  scanPushUrl: resolvePublicWebhookUrl(
    'DELHIVERY_SCAN_PUSH_WEBHOOK_URL',
    '/api/webhook/delhivery/scan',
  ),
  documentPushUrl: resolvePublicWebhookUrl(
    'DELHIVERY_DOCUMENT_PUSH_WEBHOOK_URL',
    '/api/webhook/delhivery/document',
  ),
  legacyUnifiedUrl: resolvePublicWebhookUrl(
    'DELHIVERY_LEGACY_WEBHOOK_URL',
    '/api/webhook/delhivery/order',
  ),
  method: 'POST',
  contentType: 'application/json',
  expectedResponse: '200 OK',
  requiredFields: [
    'Shipment.AWB',
    'Shipment.ReferenceNo',
    'Shipment.Status.Status',
    'Shipment.Status.StatusType',
    'Shipment.Status.Instructions',
    'Shipment.NSLCode or Shipment.Status.StatusCode',
  ],
})

export const getCourierCredentialsController = async (req: Request, res: Response) => {
  try {
    const xpressbeesManualAwb = await getXpressbeesManualAwbSummary().catch((err: any) => {
      console.warn('Failed to load Xpressbees manual AWB summary:', err?.message || err)
      return {
        configured: false,
        active: false,
        range: null,
        recentAllocations: [],
      }
    })

    const rows = await db
      .select({
        provider: courier_credentials.provider,
        apiBase: courier_credentials.apiBase,
        clientName: courier_credentials.clientName,
        apiKey: courier_credentials.apiKey,
        clientId: courier_credentials.clientId,
        username: courier_credentials.username,
        password: courier_credentials.password,
        webhookSecret: courier_credentials.webhookSecret,
        metadata: courier_credentials.metadata,
      })
      .from(courier_credentials)
      .where(
        inArray(courier_credentials.provider, [
          'delhivery',
          'velocity',
          'dilliking',
          'icl',
        ]),
      )

    const defaults = {
      delhivery: {
        provider: 'delhivery',
        apiBase: 'https://track.delhivery.com',
        clientName: '',
        ltlApiBase: 'https://ltl-clients-api.delhivery.com',
        ltlUsername: '',
        hasApiKey: false,
        apiKeyMasked: '',
        hasLtlUsername: false,
        hasLtlPassword: false,
        hasLtlToken: false,
        ltlTokenMasked: '',
        ltlTokenExpiresAt: '',
        webhookConfig: buildDelhiveryWebhookConfig(),
      },
      ekart: {
        provider: 'ekart',
        apiBase: 'https://api.ekartlogistics.com',
        clientId: '',
        username: '',
        hasPassword: false,
        hasWebhookSecret: false,
      },
      xpressbees: {
        provider: 'xpressbees',
        apiBase: 'https://shipment.xpressbees.com',
        username: '',
        hasApiKey: false,
        apiKeyMasked: '',
        hasPassword: false,
        hasAuthBearer: false,
        hasSecretKey: false,
        hasXbKey: false,
        hasXbAccessKey: false,
        businessAccountName: '',
        pickupVendorCode: '',
        businessUnit: 'ECOM',
        businessFlow: 'FORWARD',
        businessService: '',
        businessServices: 'SD,SDD,NDD,AIR,SFC,IntraSDD',
        hasWebhookSecret: false,
        pincodeBusinessUnit: 'eComm',
        pincodeBusinessFlow: 'Forward',
        pickupBusinessService: 'PickUp',
        deliveryBusinessService: 'Delivery',
        serviceabilityVersion: 'v1',
        trackingVersion: 'v1',
        manualAwb: xpressbeesManualAwb,
      },
      shadowfax: {
        provider: 'shadowfax',
        apiBase: 'https://dale.staging.shadowfax.in/api',
        clientName: '',
        hasApiKey: false,
        apiKeyMasked: '',
        hasWebhookSecret: false,
      },
      velocity: {
        provider: 'velocity',
        apiBase: '',
        username: '',
        hasPassword: false,
        hasAuthorizationToken: false,
        authorizationScheme: 'raw',
      },
      amazon: buildAmazonCredentialResponse(),
      dilliking: {
        provider: 'dilliking',
        apiBase: 'https://api.dilliking.com',
        email: '',
        hasPassword: false,
        configured: false,
      },
      icl: {
        provider: 'icl',
        apiBase: 'https://cloud.iclinternational.in',
        userId: '',
        customerCode: '',
        hasPassword: false,
        configured: false,
      },
    }

    const data = rows.reduce<Record<string, any>>((acc, row) => {
      const provider = (row.provider || '').toLowerCase()
      if (!provider) return acc
      if (provider === 'delhivery') {
        const apiKey = row.apiKey || ''
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const ltlApiBase = String(
          metadata.ltlApiBase || metadata.ltl_api_base || 'https://ltl-clients-api.delhivery.com',
        ).trim()
        const ltlUsername = String(metadata.ltlUsername || metadata.ltl_username || '').trim()
        const ltlPassword = String(metadata.ltlPassword || metadata.ltl_password || '').trim()
        const ltlToken = String(metadata.ltlToken || metadata.ltl_token || '').trim()
        const ltlTokenExpiresAt = String(
          metadata.ltlTokenExpiresAt || metadata.ltl_token_expires_at || '',
        ).trim()
        acc.delhivery = {
          provider: 'delhivery',
          apiBase: row.apiBase || 'https://track.delhivery.com',
          clientName: row.clientName || '',
          ltlApiBase,
          ltlUsername,
          hasApiKey: Boolean(apiKey.trim()),
          hasLtlUsername: Boolean(ltlUsername),
          hasLtlPassword: Boolean(ltlPassword),
          hasLtlToken: Boolean(ltlToken),
          ltlTokenMasked: maskCourierCredential(ltlToken),
          ltlTokenExpiresAt,
          apiKeyMasked: apiKey
            ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
            : '',
          webhookConfig: buildDelhiveryWebhookConfig(),
        }
      } else if (provider === 'ekart') {
        const hasPassword = Boolean((row.password || '').trim())
        const hasWebhookSecret = Boolean((row.webhookSecret || '').trim())
        acc.ekart = {
          provider: 'ekart',
          apiBase: row.apiBase || 'https://api.ekartlogistics.com',
          clientId: row.clientId || '',
          username: row.username || '',
          hasPassword,
          hasWebhookSecret,
        }
      } else if (provider === 'xpressbees') {
        const apiKey = row.apiKey || ''
        const hasPassword = Boolean((row.password || '').trim())
        const hasWebhookSecret = Boolean((row.webhookSecret || '').trim())
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const businessAccountName = String(
          metadata.businessAccountName || metadata.business_account_name || '',
        ).trim()
        const pickupVendorCode = String(
          metadata.pickupVendorCode || metadata.pickup_vendor_code || '',
        ).trim()
        acc.xpressbees = {
          provider: 'xpressbees',
          apiBase: row.apiBase || 'https://shipment.xpressbees.com',
          username: row.username || '',
          hasApiKey: Boolean(apiKey.trim()),
          apiKeyMasked: apiKey
            ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
            : '',
          hasPassword,
          hasAuthBearer: Boolean(
            String(
              metadata.authBearer || metadata.auth_bearer || metadata.authorizationBearer || '',
            ).trim(),
          ),
          hasSecretKey: Boolean(String(metadata.secretKey || metadata.secret_key || '').trim()),
          hasXbKey: Boolean(String(metadata.xbKey || metadata.xb_key || '').trim()),
          hasXbAccessKey: Boolean(
            String(metadata.xbAccessKey || metadata.xb_access_key || '').trim(),
          ),
          businessAccountName,
          pickupVendorCode,
          hasBusinessAccountName: Boolean(businessAccountName),
          hasPickupVendorCode: Boolean(pickupVendorCode),
          businessUnit: metadata.businessUnit || 'ECOM',
          businessFlow: metadata.businessFlow || 'FORWARD',
          businessService: metadata.businessService || '',
          businessServices: metadata.businessServices || 'SD,SDD,NDD,AIR,SFC,IntraSDD',
          manifestServiceType: metadata.manifestServiceType || 'SD',
          manifestPickupType: metadata.manifestPickupType || 'Vendor',
          hasWebhookSecret,
          pincodeBusinessUnit: metadata.pincodeBusinessUnit || 'eComm',
          pincodeBusinessFlow: metadata.pincodeBusinessFlow || 'Forward',
          pickupBusinessService: metadata.pickupBusinessService || 'PickUp',
          deliveryBusinessService: metadata.deliveryBusinessService || 'Delivery',
          serviceabilityVersion: metadata.serviceabilityVersion || 'v1',
          trackingVersion: metadata.trackingVersion || 'v1',
          manualAwb: xpressbeesManualAwb,
        }
      } else if (provider === 'shadowfax') {
        const apiKey = row.apiKey || ''
        const hasWebhookSecret = Boolean((row.webhookSecret || '').trim())
        acc.shadowfax = {
          provider: 'shadowfax',
          apiBase: row.apiBase || 'https://dale.staging.shadowfax.in/api',
          clientName: row.clientName || '',
          hasApiKey: Boolean(apiKey.trim()),
          apiKeyMasked: apiKey
            ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
            : '',
          hasWebhookSecret,
        }
      } else if (provider === 'velocity') {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
        const username = String(row.username || '').trim()
        const password = String(row.password || '').trim()
        acc.velocity = {
          provider: 'velocity',
          apiBase: row.apiBase || '',
          username,
          hasPassword: Boolean(password),
          hasAuthorizationToken: Boolean(String(metadata.lastToken || '').trim()),
          authorizationScheme:
            String(metadata.authorizationScheme || 'raw').toLowerCase() === 'bearer'
              ? 'bearer'
              : 'raw',
        }
      } else if (provider === AMAZON_CREDENTIALS_PROVIDER) {
        acc.amazon = buildAmazonCredentialResponse(row)
      } else if (provider === 'dilliking') {
        const email = String(row.username || '').trim()
        acc.dilliking = {
          provider: 'dilliking',
          apiBase: row.apiBase || 'https://api.dilliking.com',
          email,
          hasPassword: Boolean(String(row.password || '').trim()),
          configured: Boolean(email && String(row.password || '').trim()),
        }
      } else if (provider === 'icl') {
        const userId = String(row.username || '').trim()
        const customerCode = String(row.clientId || '').trim()
        acc.icl = {
          provider: 'icl',
          apiBase: 'https://cloud.iclinternational.in',
          userId,
          customerCode,
          hasPassword: Boolean(String(row.password || '').trim()),
          configured: Boolean(userId && customerCode && String(row.password || '').trim()),
        }
      }
      return acc
    }, { ...defaults })

    res.json({
      success: true,
      data,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch courier credentials' })
  }
}

export const updateXpressbeesAwbRangeController = async (req: any, res: Response) => {
  try {
    const result = await createXpressbeesManualAwbRange({
      startAwb: req.body?.startAwb ?? req.body?.awbStartNumber ?? req.body?.start,
      endAwb: req.body?.endAwb ?? req.body?.awbEndNumber ?? req.body?.end,
      createdBy: req.user?.sub || null,
    })

    res.json({
      success: true,
      message: 'Xpressbees manual AWB range updated successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to update Xpressbees manual AWB range:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to update Xpressbees manual AWB range',
    })
  }
}

export const updateVelocityCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, username, password } = req.body || {}

  try {
    const nextUsername = typeof username === 'string' ? username.trim() : ''
    const nextPassword = typeof password === 'string' ? password.trim() : ''
    if (!nextUsername) {
      return res.status(400).json({ success: false, message: 'Velocity username is required' })
    }
    const [existing] = await db
      .select({
        id: courier_credentials.id,
        apiBase: courier_credentials.apiBase,
        password: courier_credentials.password,
        metadata: courier_credentials.metadata,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'velocity'))
      .limit(1)
    const metadata = existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
    const requestedApiBase = typeof apiBase === 'string' ? apiBase.trim() : ''
    const nextApiBase = requestedApiBase || existing?.apiBase || process.env.VELOCITY_API_BASE || ''
    if (nextApiBase) {
      try {
        const parsed = new URL(nextApiBase)
        if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
          return res.status(400).json({ success: false, message: 'Velocity API base URL must use HTTPS in production' })
        }
      } catch {
        return res.status(400).json({ success: false, message: 'Velocity API base URL must be a valid URL' })
      }
    }
    const nextMetadata = {
      ...metadata,
      authorizationScheme: 'raw',
    }
    const values = {
      apiBase: nextApiBase,
      username: nextUsername,
      ...(nextPassword ? { password: nextPassword } : {}),
      metadata: nextMetadata,
      updatedAt: new Date(),
    }
    if (existing) {
      await db.update(courier_credentials).set(values as any).where(eq(courier_credentials.provider, 'velocity'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'velocity',
        apiBase: nextApiBase,
        clientName: '',
        apiKey: '',
        clientId: '',
        username: nextUsername,
        password: nextPassword,
        webhookSecret: '',
        metadata: nextMetadata,
      })
    }

    res.json({
      success: true,
      message: 'Velocity credentials updated successfully',
      data: {
        provider: 'velocity',
        username: nextUsername,
        hasPassword: Boolean(nextPassword || existing?.password),
      },
    })
  } catch (err: any) {
    console.error('Failed to update Velocity credentials:', err)
    res.status(500).json({ success: false, message: err?.message || 'Failed to update Velocity credentials' })
  }
}

export const testVelocityCredentialsController = async (_req: Request, res: Response) => {
  try {
    const result = await velocityGetToken(true)
    res.json({ success: true, message: 'Velocity authentication succeeded', data: { expiresAt: result.expiresAt } })
  } catch (err: any) {
    console.error('Velocity authentication test failed:', err)
    res.status(502).json({ success: false, message: err?.message || 'Velocity authentication failed' })
  }
}

export const loadVelocityCouriersController = async (req: Request, res: Response) => {
  const { from, to, payment_mode = 'prepaid', shipment_type = 'forward' } = req.body || {}
  if (!/^\d{6}$/.test(String(from || '')) || !/^\d{6}$/.test(String(to || ''))) {
    return res.status(400).json({ success: false, message: 'from and to must be valid six-digit pincodes' })
  }
  if (!['cod', 'prepaid'].includes(payment_mode) || !['forward', 'return'].includes(shipment_type)) {
    return res.status(400).json({ success: false, message: 'Invalid payment mode or shipment type' })
  }
  try {
    const response = await velocityServiceability({ from: String(from), to: String(to), payment_mode, shipment_type })
    const couriers = await upsertVelocityCouriers(response)
    res.json({ success: true, data: { response, couriers } })
  } catch (err: any) {
    console.error('Velocity courier sync failed:', err)
    res.status(502).json({ success: false, message: err?.message || 'Failed to load Velocity couriers' })
  }
}

export const velocityOperationController = async (req: Request, res: Response) => {
  const operation = req.params.operation as VelocityOperation
  if (!Object.prototype.hasOwnProperty.call(VELOCITY_ENDPOINTS, operation) || operation === 'authToken') {
    return res.status(400).json({ success: false, message: 'Unsupported Velocity operation' })
  }
  try {
    const data = await velocityOperation(operation, req.body && typeof req.body === 'object' ? req.body : {})
    res.json({ success: true, data })
  } catch (err: any) {
    console.error(`Velocity ${operation} failed:`, err)
    res.status(502).json({ success: false, message: err?.message || `Velocity ${operation} failed` })
  }
}

export const updateDelhiveryCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, clientName, apiKey, ltlApiBase, ltlUsername, ltlPassword } = req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextClientName = typeof clientName === 'string' ? clientName.trim() : undefined
    const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined
    const nextLtlApiBase = typeof ltlApiBase === 'string' ? ltlApiBase.trim() : undefined
    const nextLtlUsername = typeof ltlUsername === 'string' ? ltlUsername.trim() : undefined
    const nextLtlPassword = typeof ltlPassword === 'string' ? ltlPassword.trim() : undefined
    const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0
    const hasNewLtlPassword = typeof nextLtlPassword === 'string' && nextLtlPassword.length > 0

    const [existing] = await db
      .select({ id: courier_credentials.id, metadata: courier_credentials.metadata })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'delhivery'))
      .limit(1)

    if (existing) {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || 'https://track.delhivery.com'
      }
      if (nextClientName !== undefined) {
        updatePayload.clientName = nextClientName
      }
      if (hasNewApiKey) {
        updatePayload.apiKey = nextApiKey
      }
      if (nextLtlApiBase !== undefined || nextLtlUsername !== undefined || hasNewLtlPassword) {
        const existingMetadata =
          existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
        updatePayload.metadata = {
          ...existingMetadata,
          ...(nextLtlApiBase !== undefined
            ? { ltlApiBase: nextLtlApiBase || 'https://ltl-clients-api.delhivery.com' }
            : {}),
          ...(nextLtlUsername !== undefined ? { ltlUsername: nextLtlUsername } : {}),
          ...(hasNewLtlPassword ? { ltlPassword: nextLtlPassword } : {}),
        }
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'delhivery'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'delhivery',
        apiBase: nextApiBase || 'https://track.delhivery.com',
        clientName: nextClientName || '',
        apiKey: hasNewApiKey ? nextApiKey : '',
        metadata: {
          ltlApiBase: nextLtlApiBase || 'https://ltl-clients-api.delhivery.com',
          ltlUsername: nextLtlUsername || '',
          ...(hasNewLtlPassword ? { ltlPassword: nextLtlPassword } : {}),
        },
      })
    }

    const [saved] = await db
      .select({
        apiBase: courier_credentials.apiBase,
        clientName: courier_credentials.clientName,
        apiKey: courier_credentials.apiKey,
        metadata: courier_credentials.metadata,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'delhivery'))
      .limit(1)

    const savedMetadata =
      saved?.metadata && typeof saved.metadata === 'object' ? saved.metadata : {}
    const savedLtlApiBase = String(
      savedMetadata.ltlApiBase || savedMetadata.ltl_api_base || 'https://ltl-clients-api.delhivery.com',
    ).trim()
    const savedLtlUsername = String(savedMetadata.ltlUsername || savedMetadata.ltl_username || '').trim()
    const savedLtlPassword = String(savedMetadata.ltlPassword || savedMetadata.ltl_password || '').trim()
    const savedLtlToken = String(savedMetadata.ltlToken || savedMetadata.ltl_token || '').trim()
    const savedLtlTokenExpiresAt = String(
      savedMetadata.ltlTokenExpiresAt || savedMetadata.ltl_token_expires_at || '',
    ).trim()

    res.json({
      success: true,
      message: 'Delhivery credentials updated successfully',
      data: {
        provider: 'delhivery',
        apiBase: saved?.apiBase || 'https://track.delhivery.com',
        clientName: saved?.clientName || '',
        hasApiKey: Boolean((saved?.apiKey || '').trim()),
        ltlApiBase: savedLtlApiBase,
        ltlUsername: savedLtlUsername,
        hasLtlUsername: Boolean(savedLtlUsername),
        hasLtlPassword: Boolean(savedLtlPassword),
        hasLtlToken: Boolean(savedLtlToken),
        ltlTokenMasked: maskCourierCredential(savedLtlToken),
        ltlTokenExpiresAt: savedLtlTokenExpiresAt,
        webhookConfig: buildDelhiveryWebhookConfig(),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Delhivery credentials' })
  }
}

export const testDelhiveryCredentialsController = async (req: Request, res: Response) => {
  const pincode = String(req.query?.pincode || req.body?.pincode || '').trim()

  if (!/^\d{6}$/.test(pincode)) {
    return res.status(400).json({
      success: false,
      message: 'A valid 6-digit pincode is required',
    })
  }

  try {
    const delhivery = new DelhiveryService()
    const result = await delhivery.checkServiceability(pincode)

    return res.json({
      success: true,
      message: 'Delhivery B2C credentials are working',
      data: {
        pincode,
        serviceability: result,
      },
    })
  } catch (err: any) {
    console.error('Failed to test Delhivery B2C credentials:', err)
    return res.status(502).json({
      success: false,
      message: err?.message || 'Delhivery B2C credential test failed',
    })
  }
}

export const requestDelhiveryLtlPasswordResetController = async (req: Request, res: Response) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined
    const delhivery = new DelhiveryService()
    const result = await delhivery.requestLtlPasswordReset(username)

    res.json({
      success: true,
      message: 'Delhivery LTL password reset request submitted successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to trigger Delhivery LTL password reset:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to trigger Delhivery LTL password reset',
    })
  }
}

export const loginDelhiveryLtlController = async (req: Request, res: Response) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : undefined
    const password = typeof req.body?.password === 'string' ? req.body.password.trim() : undefined
    const delhivery = new DelhiveryService()
    const result = await delhivery.loginLtlAccount(username, password)

    res.json({
      success: true,
      message: 'Delhivery LTL login completed successfully',
      data: {
        username: result.username,
        hasLtlToken: Boolean(result.token),
        ltlTokenMasked: result.tokenMasked,
        ltlTokenExpiresAt: result.tokenExpiresAt,
        endpoint: result.endpoint,
      },
    })
  } catch (err: any) {
    console.error('Failed to log in to Delhivery LTL:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to log in to Delhivery LTL',
    })
  }
}

export const logoutDelhiveryLtlController = async (req: Request, res: Response) => {
  try {
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token.trim()
        : typeof req.headers?.authorization === 'string' &&
            req.headers.authorization.toLowerCase().startsWith('bearer ')
          ? req.headers.authorization.slice(7).trim()
          : undefined
    const delhivery = new DelhiveryService()
    const result = await delhivery.logoutLtlAccount(token)

    res.json({
      success: true,
      message: 'Delhivery LTL logout completed successfully',
      data: {
        hasLtlToken: false,
        ltlTokenMasked: '',
        ltlTokenExpiresAt: '',
        endpoint: result.endpoint,
      },
    })
  } catch (err: any) {
    console.error('Failed to log out of Delhivery LTL:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to log out of Delhivery LTL',
    })
  }
}

export const checkDelhiveryLtlServiceabilityController = async (req: Request, res: Response) => {
  try {
    const pincode =
      typeof req.query?.pincode === 'string'
        ? req.query.pincode.trim()
        : typeof req.body?.pincode === 'string'
          ? req.body.pincode.trim()
          : ''
    const rawWeight =
      typeof req.query?.weight === 'string'
        ? req.query.weight.trim()
        : typeof req.body?.weight === 'string' || typeof req.body?.weight === 'number'
          ? req.body.weight
          : undefined

    const delhivery = new DelhiveryService()
    const result = await delhivery.checkLtlServiceability(pincode, rawWeight)

    res.json({
      success: true,
      message: 'Delhivery LTL serviceability fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL serviceability:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL serviceability',
    })
  }
}

export const getDelhiveryLtlExpectedTatController = async (req: Request, res: Response) => {
  try {
    const originPin =
      typeof req.query?.origin_pin === 'string'
        ? req.query.origin_pin.trim()
        : typeof req.query?.originPin === 'string'
          ? req.query.originPin.trim()
          : typeof req.body?.origin_pin === 'string'
            ? req.body.origin_pin.trim()
            : typeof req.body?.originPin === 'string'
              ? req.body.originPin.trim()
              : ''
    const destinationPin =
      typeof req.query?.destination_pin === 'string'
        ? req.query.destination_pin.trim()
        : typeof req.query?.destinationPin === 'string'
          ? req.query.destinationPin.trim()
          : typeof req.body?.destination_pin === 'string'
            ? req.body.destination_pin.trim()
            : typeof req.body?.destinationPin === 'string'
              ? req.body.destinationPin.trim()
              : ''
    const requestId =
      typeof req.headers?.['x-request-id'] === 'string'
        ? req.headers['x-request-id'].trim()
        : typeof req.query?.requestId === 'string'
          ? req.query.requestId.trim()
          : typeof req.body?.requestId === 'string'
            ? req.body.requestId.trim()
            : undefined

    const delhivery = new DelhiveryService()
    const result = await delhivery.getLtlExpectedTat(originPin, destinationPin, requestId)

    res.json({
      success: true,
      message: 'Delhivery LTL expected TAT fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL expected TAT:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL expected TAT',
    })
  }
}

export const estimateDelhiveryLtlFreightController = async (req: Request, res: Response) => {
  try {
    const delhivery = new DelhiveryService()
    const result = await delhivery.estimateLtlFreight({
      dimensions: Array.isArray(req.body?.dimensions) ? req.body.dimensions : [],
      weight_g: req.body?.weight_g,
      cheque_payment: req.body?.cheque_payment === true,
      source_pin: String(req.body?.source_pin || '').trim(),
      consignee_pin: String(req.body?.consignee_pin || '').trim(),
      payment_mode: String(req.body?.payment_mode || '').trim(),
      cod_amount: req.body?.cod_amount,
      inv_amount: req.body?.inv_amount,
      freight_mode: req.body?.freight_mode,
      rov_insurance: req.body?.rov_insurance === true,
    })

    res.json({
      success: true,
      message: 'Delhivery LTL freight estimate fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL freight estimate:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL freight estimate',
    })
  }
}

export const getDelhiveryLtlFreightChargesController = async (req: Request, res: Response) => {
  try {
    const lrns =
      typeof req.query?.lrns === 'string'
        ? req.query.lrns.trim()
        : Array.isArray(req.query?.lrns)
          ? req.query.lrns.map(String)
          : typeof req.body?.lrns === 'string' || Array.isArray(req.body?.lrns)
            ? req.body.lrns
            : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.getLtlFreightCharges(lrns)

    res.json({
      success: true,
      message: 'Delhivery LTL freight charges fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL freight charges:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL freight charges',
    })
  }
}

export const createDelhiveryLtlClientWarehouseController = async (
  req: Request,
  res: Response,
) => {
  try {
    const delhivery = new DelhiveryService()
    const result = await delhivery.createLtlClientWarehouse(req.body || {})

    res.json({
      success: true,
      message: 'Delhivery LTL client warehouse created successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to create Delhivery LTL client warehouse:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to create Delhivery LTL client warehouse',
    })
  }
}

export const updateDelhiveryLtlClientWarehouseController = async (
  req: Request,
  res: Response,
) => {
  try {
    const delhivery = new DelhiveryService()
    const result = await delhivery.updateLtlClientWarehouse(req.body || {})

    res.json({
      success: true,
      message: 'Delhivery LTL client warehouse updated successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to update Delhivery LTL client warehouse:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to update Delhivery LTL client warehouse',
    })
  }
}

export const createDelhiveryLtlManifestController = async (req: Request, res: Response) => {
  try {
    const payload =
      typeof req.body?.payload === 'string' && req.body.payload.trim()
        ? parseCourierControllerJsonValue<Record<string, unknown>>(req.body.payload, {})
        : { ...(req.body || {}) }

    const parsedPayload = {
      ...payload,
      ...(payload.shipment_details === undefined && req.body?.shipment_details !== undefined
        ? {
            shipment_details: parseCourierControllerJsonValue(
              req.body.shipment_details,
              req.body.shipment_details,
            ),
          }
        : {}),
      ...(payload.invoices === undefined && req.body?.invoices !== undefined
        ? {
            invoices: parseCourierControllerJsonValue(req.body.invoices, req.body.invoices),
          }
        : {}),
      ...(payload.dropoff_location === undefined && req.body?.dropoff_location !== undefined
        ? {
            dropoff_location: parseCourierControllerJsonValue(
              req.body.dropoff_location,
              req.body.dropoff_location,
            ),
          }
        : {}),
      ...(payload.return_address === undefined && req.body?.return_address !== undefined
        ? {
            return_address: parseCourierControllerJsonValue(
              req.body.return_address,
              req.body.return_address,
            ),
          }
        : {}),
      ...(payload.dimensions === undefined && req.body?.dimensions !== undefined
        ? {
            dimensions: parseCourierControllerJsonValue(req.body.dimensions, req.body.dimensions),
          }
        : {}),
      ...(payload.callback === undefined && req.body?.callback !== undefined
        ? {
            callback: parseCourierControllerJsonValue(req.body.callback, req.body.callback),
          }
        : {}),
      ...(payload.doc_data === undefined && req.body?.doc_data !== undefined
        ? {
            doc_data: parseCourierControllerJsonValue(req.body.doc_data, req.body.doc_data),
          }
        : {}),
      ...(payload.billing_address === undefined && req.body?.billing_address !== undefined
        ? {
            billing_address: parseCourierControllerJsonValue(
              req.body.billing_address,
              req.body.billing_address,
            ),
          }
        : {}),
    }

    const files = Array.isArray(req.files) ? req.files : []
    const delhivery = new DelhiveryService()
    const result = await delhivery.createLtlManifest(
      parsedPayload as Record<string, unknown>,
      files as Express.Multer.File[],
    )

    res.json({
      success: true,
      message: 'Delhivery LTL shipment creation submitted successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to create Delhivery LTL shipment:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to create Delhivery LTL shipment',
    })
  }
}

export const getDelhiveryLtlManifestStatusController = async (
  req: Request,
  res: Response,
) => {
  try {
    const jobId =
      typeof req.query?.job_id === 'string'
        ? req.query.job_id.trim()
        : typeof req.query?.jobId === 'string'
          ? req.query.jobId.trim()
          : typeof req.query?.request_id === 'string'
            ? req.query.request_id.trim()
            : typeof req.body?.job_id === 'string'
              ? req.body.job_id.trim()
              : typeof req.body?.jobId === 'string'
                ? req.body.jobId.trim()
                : typeof req.body?.request_id === 'string'
                  ? req.body.request_id.trim()
                  : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.getLtlManifestStatus(jobId)

    res.json({
      success: true,
      message: 'Delhivery LTL shipment status fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL shipment status:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL shipment status',
    })
  }
}

export const updateDelhiveryLtlShipmentController = async (req: Request, res: Response) => {
  try {
    const lrn =
      typeof req.params?.lrn === 'string'
        ? req.params.lrn.trim()
        : typeof req.body?.lrn === 'string'
          ? req.body.lrn.trim()
          : ''

    const payload =
      typeof req.body?.payload === 'string' && req.body.payload.trim()
        ? parseCourierControllerJsonValue<Record<string, unknown>>(req.body.payload, {})
        : { ...(req.body || {}) }

    const parsedPayload = {
      ...payload,
      ...(payload.invoices === undefined && req.body?.invoices !== undefined
        ? {
            invoices: parseCourierControllerJsonValue(req.body.invoices, req.body.invoices),
          }
        : {}),
      ...(payload.dimensions === undefined && req.body?.dimensions !== undefined
        ? {
            dimensions: parseCourierControllerJsonValue(req.body.dimensions, req.body.dimensions),
          }
        : {}),
      ...((payload.invoice_files_meta === undefined ||
        payload.invoice_files_meta === null ||
        payload.invoice_files_meta === '') &&
      req.body?.invoice_files_meta !== undefined
        ? {
            invoice_files_meta: parseCourierControllerJsonValue(
              req.body.invoice_files_meta,
              req.body.invoice_files_meta,
            ),
          }
        : {}),
      ...(payload.callback === undefined && req.body?.callback !== undefined
        ? {
            callback: parseCourierControllerJsonValue(req.body.callback, req.body.callback),
          }
        : {}),
      ...(payload.cb === undefined && req.body?.cb !== undefined
        ? {
            cb: parseCourierControllerJsonValue(req.body.cb, req.body.cb),
          }
        : {}),
    }

    const files = Array.isArray(req.files) ? req.files : []
    const delhivery = new DelhiveryService()
    const result = await delhivery.updateLtlShipment(
      lrn,
      parsedPayload as Record<string, unknown>,
      files as Express.Multer.File[],
    )

    res.json({
      success: true,
      message: 'Delhivery LTL shipment updated successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to update Delhivery LTL shipment:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to update Delhivery LTL shipment',
    })
  }
}

export const getDelhiveryLtlShipmentUpdateStatusController = async (
  req: Request,
  res: Response,
) => {
  try {
    const jobId =
      typeof req.query?.job_id === 'string'
        ? req.query.job_id.trim()
        : typeof req.query?.jobId === 'string'
          ? req.query.jobId.trim()
          : typeof req.body?.job_id === 'string'
            ? req.body.job_id.trim()
            : typeof req.body?.jobId === 'string'
              ? req.body.jobId.trim()
              : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.getLtlShipmentUpdateStatus(jobId)

    res.json({
      success: true,
      message: 'Delhivery LTL shipment update status fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL shipment update status:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL shipment update status',
    })
  }
}

export const cancelDelhiveryLtlShipmentController = async (req: Request, res: Response) => {
  try {
    const lrn =
      typeof req.params?.lrn === 'string'
        ? req.params.lrn.trim()
        : typeof req.body?.lrn === 'string'
          ? req.body.lrn.trim()
          : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.cancelLtlShipment(lrn)

    res.json({
      success: true,
      message: 'Delhivery LTL shipment cancelled successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to cancel Delhivery LTL shipment:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to cancel Delhivery LTL shipment',
    })
  }
}

export const trackDelhiveryLtlShipmentController = async (req: Request, res: Response) => {
  try {
    const lrnum =
      typeof req.query?.lrnum === 'string'
        ? req.query.lrnum.trim()
        : typeof req.body?.lrnum === 'string'
          ? req.body.lrnum.trim()
          : ''
    const trackId =
      typeof req.query?.track_id === 'string'
        ? req.query.track_id.trim()
        : typeof req.query?.trackId === 'string'
          ? req.query.trackId.trim()
          : typeof req.body?.track_id === 'string'
            ? req.body.track_id.trim()
            : typeof req.body?.trackId === 'string'
              ? req.body.trackId.trim()
              : ''
    const allWbns =
      typeof req.query?.all_wbns === 'string'
        ? req.query.all_wbns.trim()
        : typeof req.body?.all_wbns === 'string' ||
            typeof req.body?.all_wbns === 'boolean' ||
            typeof req.body?.all_wbns === 'number'
          ? req.body.all_wbns
          : undefined

    const delhivery = new DelhiveryService()
    const result = await delhivery.trackLtlShipment({
      lrnum,
      track_id: trackId,
      all_wbns: allWbns,
    })

    res.json({
      success: true,
      message: 'Delhivery LTL shipment tracking fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL shipment tracking:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL shipment tracking',
    })
  }
}

export const getDelhiveryLtlShippingLabelUrlsController = async (
  req: Request,
  res: Response,
) => {
  try {
    const size =
      typeof req.params?.size === 'string'
        ? req.params.size.trim()
        : typeof req.query?.size === 'string'
          ? req.query.size.trim()
          : typeof req.body?.size === 'string'
            ? req.body.size.trim()
            : ''
    const lrn =
      typeof req.params?.lrn === 'string'
        ? req.params.lrn.trim()
        : typeof req.query?.lrn === 'string'
          ? req.query.lrn.trim()
          : typeof req.body?.lrn === 'string'
            ? req.body.lrn.trim()
            : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.getLtlShippingLabelUrls({ size, lrn })

    res.json({
      success: true,
      message: 'Delhivery LTL shipping label URLs fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL shipping label URLs:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL shipping label URLs',
    })
  }
}

export const getDelhiveryLtlLrCopyController = async (req: Request, res: Response) => {
  try {
    const lrn =
      typeof req.params?.lrn === 'string'
        ? req.params.lrn.trim()
        : typeof req.query?.lrn === 'string'
          ? req.query.lrn.trim()
          : typeof req.body?.lrn === 'string'
            ? req.body.lrn.trim()
            : ''
    const lrCopyType =
      typeof req.query?.lr_copy_type === 'string'
        ? req.query.lr_copy_type.trim()
        : Array.isArray(req.body?.lr_copy_type) || typeof req.body?.lr_copy_type === 'string'
          ? req.body.lr_copy_type
          : undefined
    const requestIdHeader = req.get('x-request-id')
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim()
        ? requestIdHeader.trim()
        : typeof req.body?.request_id === 'string'
          ? req.body.request_id.trim()
          : typeof req.body?.requestId === 'string'
            ? req.body.requestId.trim()
            : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.getLtlLrCopy({
      lrn,
      lr_copy_type: lrCopyType,
      requestId,
    })

    res.json({
      success: true,
      message: 'Delhivery LTL LR copy fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL LR copy:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL LR copy',
    })
  }
}

export const generateDelhiveryLtlDocumentsController = async (req: Request, res: Response) => {
  try {
    const docType =
      typeof req.params?.docType === 'string'
        ? req.params.docType.trim()
        : typeof req.body?.doc_type === 'string'
          ? req.body.doc_type.trim()
          : typeof req.body?.docType === 'string'
            ? req.body.docType.trim()
            : ''
    const requestIdHeader = req.get('x-request-id')
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim()
        ? requestIdHeader.trim()
        : typeof req.body?.request_id === 'string'
          ? req.body.request_id.trim()
          : typeof req.body?.requestId === 'string'
            ? req.body.requestId.trim()
            : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.generateLtlDocuments(docType, req.body || {}, requestId)

    res.json({
      success: true,
      message: 'Delhivery LTL documents generation submitted successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to generate Delhivery LTL documents:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to generate Delhivery LTL documents',
    })
  }
}

export const getDelhiveryLtlGeneratedDocumentStatusController = async (
  req: Request,
  res: Response,
) => {
  try {
    const docType =
      typeof req.params?.docType === 'string'
        ? req.params.docType.trim()
        : typeof req.query?.doc_type === 'string'
          ? req.query.doc_type.trim()
          : typeof req.query?.docType === 'string'
            ? req.query.docType.trim()
            : typeof req.body?.doc_type === 'string'
              ? req.body.doc_type.trim()
              : typeof req.body?.docType === 'string'
                ? req.body.docType.trim()
                : ''
    const jobId =
      typeof req.params?.jobId === 'string'
        ? req.params.jobId.trim()
        : typeof req.query?.job_id === 'string'
          ? req.query.job_id.trim()
          : typeof req.query?.jobId === 'string'
            ? req.query.jobId.trim()
            : typeof req.body?.job_id === 'string'
              ? req.body.job_id.trim()
              : typeof req.body?.jobId === 'string'
                ? req.body.jobId.trim()
                : ''
    const requestIdHeader = req.get('x-request-id')
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim()
        ? requestIdHeader.trim()
        : typeof req.body?.request_id === 'string'
          ? req.body.request_id.trim()
          : typeof req.body?.requestId === 'string'
            ? req.body.requestId.trim()
            : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.getLtlGeneratedDocumentStatus(docType, jobId, requestId)

    res.json({
      success: true,
      message: 'Delhivery LTL document status fetched successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to fetch Delhivery LTL document status:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to fetch Delhivery LTL document status',
    })
  }
}

export const bookDelhiveryLtlLastMileAppointmentController = async (
  req: Request,
  res: Response,
) => {
  try {
    const delhivery = new DelhiveryService()
    const result = await delhivery.bookLtlLastMileAppointment(req.body || {})

    res.json({
      success: true,
      message: 'Delhivery LTL last-mile appointment booked successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to book Delhivery LTL last-mile appointment:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to book Delhivery LTL last-mile appointment',
    })
  }
}

export const createDelhiveryLtlPickupRequestController = async (
  req: Request,
  res: Response,
) => {
  try {
    const requestIdHeader = req.get('x-request-id')
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim()
        ? requestIdHeader.trim()
        : typeof req.body?.request_id === 'string'
          ? req.body.request_id.trim()
          : typeof req.body?.requestId === 'string'
            ? req.body.requestId.trim()
            : undefined

    const delhivery = new DelhiveryService()
    const result = await delhivery.createLtlPickupRequest(req.body || {}, requestId)

    res.json({
      success: true,
      message: 'Delhivery LTL pickup request created successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to create Delhivery LTL pickup request:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to create Delhivery LTL pickup request',
    })
  }
}

export const cancelDelhiveryLtlPickupRequestController = async (
  req: Request,
  res: Response,
) => {
  try {
    const pickupId =
      typeof req.params?.pickupId === 'string'
        ? req.params.pickupId.trim()
        : typeof req.body?.pickup_id === 'string'
          ? req.body.pickup_id.trim()
          : typeof req.body?.pickupId === 'string'
            ? req.body.pickupId.trim()
            : ''
    const requestIdHeader = req.get('x-request-id')
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.trim()
        ? requestIdHeader.trim()
        : typeof req.body?.request_id === 'string'
          ? req.body.request_id.trim()
          : typeof req.body?.requestId === 'string'
            ? req.body.requestId.trim()
            : ''

    const delhivery = new DelhiveryService()
    const result = await delhivery.cancelLtlPickupRequest(pickupId, requestId)

    res.json({
      success: true,
      message: 'Delhivery LTL pickup request cancelled successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to cancel Delhivery LTL pickup request:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to cancel Delhivery LTL pickup request',
    })
  }
}

export const updateEkartCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, clientId, username, password, webhookSecret } = req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextClientId = typeof clientId === 'string' ? clientId.trim() : undefined
    const nextUsername = typeof username === 'string' ? username.trim() : undefined
    const nextPassword = typeof password === 'string' ? password.trim() : undefined
    const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0
    const hasWebhookSecret = typeof webhookSecret === 'string' && webhookSecret.length > 0

    const [existing] = await db
      .select({ id: courier_credentials.id })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'ekart'))
      .limit(1)

    if (existing) {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || 'https://api.ekartlogistics.com'
      }
      if (nextClientId !== undefined) {
        updatePayload.clientId = nextClientId
      }
      if (nextUsername !== undefined) {
        updatePayload.username = nextUsername
      }
      if (hasPassword) {
        updatePayload.password = nextPassword
      }
      if (hasWebhookSecret) {
        updatePayload.webhookSecret = webhookSecret
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'ekart'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'ekart',
        apiBase: nextApiBase || 'https://api.ekartlogistics.com',
        clientName: '',
        apiKey: '',
        clientId: nextClientId || '',
        username: nextUsername || '',
        password: hasPassword ? nextPassword : '',
        webhookSecret: hasWebhookSecret ? webhookSecret : '',
      })
    }

    const [saved] = await db
      .select({
        apiBase: courier_credentials.apiBase,
        clientId: courier_credentials.clientId,
        username: courier_credentials.username,
        password: courier_credentials.password,
        webhookSecret: courier_credentials.webhookSecret,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'ekart'))
      .limit(1)

    res.json({
      success: true,
      message: 'Ekart credentials updated successfully',
      data: {
        provider: 'ekart',
        apiBase: saved?.apiBase || 'https://api.ekartlogistics.com',
        clientId: saved?.clientId || '',
        username: saved?.username || '',
        hasPassword: Boolean((saved?.password || '').trim()),
        hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Ekart credentials' })
  }
}

export const updateXpressbeesCredentialsController = async (req: Request, res: Response) => {
  const {
    apiBase,
    username,
    password,
    apiKey,
    webhookSecret,
    authBearer,
    secretKey,
    xbKey,
    xbAccessKey,
    businessUnit,
    businessFlow,
    businessService,
    businessServices,
    businessAccountName,
    pickupVendorCode,
    manifestServiceType,
    manifestPickupType,
    pincodeBusinessUnit,
    pincodeBusinessFlow,
    pickupBusinessService,
    deliveryBusinessService,
    serviceabilityVersion,
    trackingVersion,
  } = req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextUsername = typeof username === 'string' ? username.trim() : undefined
    const nextPassword = typeof password === 'string' ? password.trim() : undefined
    const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined
    const nextWebhookSecret =
      typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined
    const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0
    const hasApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0
    const hasWebhookSecret =
      typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0
    const metadataInputs: Record<string, any> = {
      authBearer,
      secretKey,
      xbKey,
      xbAccessKey,
      businessUnit,
      businessFlow,
      businessService,
      businessServices,
      businessAccountName,
      pickupVendorCode,
      manifestServiceType,
      manifestPickupType,
      pincodeBusinessUnit,
      pincodeBusinessFlow,
      pickupBusinessService,
      deliveryBusinessService,
      serviceabilityVersion,
      trackingVersion,
    }
    const metadataUpdates = Object.entries(metadataInputs).reduce<Record<string, string>>(
      (acc, [key, value]) => {
        if (typeof value !== 'string') return acc
        const normalized = value.trim()
        if (!normalized && ['authBearer', 'secretKey', 'xbKey', 'xbAccessKey'].includes(key)) {
          return acc
        }
        acc[key] = normalized
        return acc
      },
      {},
    )

    const [existing] = await db
      .select({ id: courier_credentials.id, metadata: courier_credentials.metadata })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'xpressbees'))
      .limit(1)

    if (existing) {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || 'https://shipment.xpressbees.com'
      }
      if (nextUsername !== undefined) {
        updatePayload.username = nextUsername
      }
      if (hasPassword) {
        updatePayload.password = nextPassword
      }
      if (hasApiKey) {
        updatePayload.apiKey = nextApiKey
      }
      if (hasWebhookSecret) {
        updatePayload.webhookSecret = nextWebhookSecret
      }
      if (Object.keys(metadataUpdates).length) {
        const existingMetadata =
          existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
        updatePayload.metadata = {
          ...existingMetadata,
          ...metadataUpdates,
        }
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'xpressbees'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'xpressbees',
        apiBase: nextApiBase || 'https://shipment.xpressbees.com',
        clientName: '',
        apiKey: hasApiKey ? nextApiKey : '',
        clientId: '',
        username: nextUsername || '',
        password: hasPassword ? nextPassword : '',
        webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
        metadata: {
          pincodeBusinessUnit: 'eComm',
          pincodeBusinessFlow: 'Forward',
          pickupBusinessService: 'PickUp',
          deliveryBusinessService: 'Delivery',
          serviceabilityVersion: 'v1',
          trackingVersion: 'v1',
          ...metadataUpdates,
        },
      })
    }

    const [saved] = await db
      .select({
        apiBase: courier_credentials.apiBase,
        username: courier_credentials.username,
        password: courier_credentials.password,
        apiKey: courier_credentials.apiKey,
        webhookSecret: courier_credentials.webhookSecret,
        metadata: courier_credentials.metadata,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'xpressbees'))
      .limit(1)

    XpressbeesService.clearCachedConfig()

    res.json({
      success: true,
      message: 'Xpressbees credentials updated successfully',
      data: {
        provider: 'xpressbees',
        apiBase: saved?.apiBase || 'https://shipment.xpressbees.com',
        username: saved?.username || '',
        hasPassword: Boolean((saved?.password || '').trim()),
        hasApiKey: Boolean((saved?.apiKey || '').trim()),
        hasAuthBearer: Boolean(
          String(
            (saved?.metadata as any)?.authBearer ||
              (saved?.metadata as any)?.auth_bearer ||
              (saved?.metadata as any)?.authorizationBearer ||
              '',
          ).trim(),
        ),
        hasSecretKey: Boolean(
          String(
            (saved?.metadata as any)?.secretKey || (saved?.metadata as any)?.secret_key || '',
          ).trim(),
        ),
        hasXbKey: Boolean(
          String((saved?.metadata as any)?.xbKey || (saved?.metadata as any)?.xb_key || '').trim(),
        ),
        hasXbAccessKey: Boolean(
          String(
            (saved?.metadata as any)?.xbAccessKey ||
              (saved?.metadata as any)?.xb_access_key ||
              '',
          ).trim(),
        ),
        businessAccountName: String(
          (saved?.metadata as any)?.businessAccountName ||
            (saved?.metadata as any)?.business_account_name ||
            '',
        ).trim(),
        pickupVendorCode: String(
          (saved?.metadata as any)?.pickupVendorCode ||
            (saved?.metadata as any)?.pickup_vendor_code ||
            '',
        ).trim(),
        hasBusinessAccountName: Boolean(
          String(
            (saved?.metadata as any)?.businessAccountName ||
              (saved?.metadata as any)?.business_account_name ||
              '',
          ).trim(),
        ),
        hasPickupVendorCode: Boolean(
          String(
            (saved?.metadata as any)?.pickupVendorCode ||
              (saved?.metadata as any)?.pickup_vendor_code ||
            '',
          ).trim(),
        ),
        businessUnit: (saved?.metadata as any)?.businessUnit || 'ECOM',
        businessFlow: (saved?.metadata as any)?.businessFlow || 'FORWARD',
        businessService: (saved?.metadata as any)?.businessService || '',
        businessServices:
          (saved?.metadata as any)?.businessServices || 'SD,SDD,NDD,AIR,SFC,IntraSDD',
        manifestServiceType: (saved?.metadata as any)?.manifestServiceType || 'SD',
        manifestPickupType: (saved?.metadata as any)?.manifestPickupType || 'Vendor',
        hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
        pincodeBusinessUnit: (saved?.metadata as any)?.pincodeBusinessUnit || 'eComm',
        pincodeBusinessFlow: (saved?.metadata as any)?.pincodeBusinessFlow || 'Forward',
        pickupBusinessService: (saved?.metadata as any)?.pickupBusinessService || 'PickUp',
        deliveryBusinessService: (saved?.metadata as any)?.deliveryBusinessService || 'Delivery',
        serviceabilityVersion: (saved?.metadata as any)?.serviceabilityVersion || 'v1',
        trackingVersion: (saved?.metadata as any)?.trackingVersion || 'v1',
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Xpressbees credentials' })
  }
}

export const updateShadowfaxCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, clientName, apiKey, webhookSecret } = req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextClientName = typeof clientName === 'string' ? clientName.trim() : undefined
    const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined
    const nextWebhookSecret =
      typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined
    const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0
    const hasWebhookSecret =
      typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0

    const [existing] = await db
      .select({ id: courier_credentials.id })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'shadowfax'))
      .limit(1)

    if (existing) {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || 'https://dale.staging.shadowfax.in/api'
      }
      if (nextClientName !== undefined) {
        updatePayload.clientName = nextClientName
      }
      if (hasNewApiKey) {
        updatePayload.apiKey = nextApiKey
      }
      if (hasWebhookSecret) {
        updatePayload.webhookSecret = nextWebhookSecret
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'shadowfax'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'shadowfax',
        apiBase: nextApiBase || 'https://dale.staging.shadowfax.in/api',
        clientName: nextClientName || '',
        apiKey: hasNewApiKey ? nextApiKey : '',
        webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
      })
    }

    const [saved] = await db
      .select({
        apiBase: courier_credentials.apiBase,
        clientName: courier_credentials.clientName,
        apiKey: courier_credentials.apiKey,
        webhookSecret: courier_credentials.webhookSecret,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'shadowfax'))
      .limit(1)

    ShadowfaxService.clearCachedConfig()

    res.json({
      success: true,
      message: 'Shadowfax credentials updated successfully',
      data: {
        provider: 'shadowfax',
        apiBase: saved?.apiBase || 'https://dale.staging.shadowfax.in/api',
        clientName: saved?.clientName || '',
        hasApiKey: Boolean((saved?.apiKey || '').trim()),
        hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Shadowfax credentials' })
  }
}

export const updateAmazonCredentialsController = async (req: Request, res: Response) => {
  const {
    apiBase,
    endpoint,
    accessToken,
    refreshToken,
    lwaClientId,
    clientId,
    lwaClientSecret,
    clientSecret,
    shippingBusinessId,
    region,
    sandbox,
    lwaTokenUrl,
    tokenUrl,
  } = req.body || {}

  try {
    const [existing] = await db
      .select()
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, AMAZON_CREDENTIALS_PROVIDER))
      .limit(1)

    const nextCredentials = { ...buildAmazonShippingCredentialsFromRow(existing) }
    const nextEndpoint = optionalCredentialString(endpoint) ?? optionalCredentialString(apiBase)
    const nextAccessToken = optionalCredentialString(accessToken)
    const nextRefreshToken = optionalCredentialString(refreshToken)
    const nextLwaClientId = optionalCredentialString(lwaClientId) ?? optionalCredentialString(clientId)
    const nextLwaClientSecret =
      optionalCredentialString(lwaClientSecret) ?? optionalCredentialString(clientSecret)
    const nextShippingBusinessId = optionalCredentialString(shippingBusinessId)
    const nextRegion = optionalCredentialString(region)
    const nextLwaTokenUrl =
      optionalCredentialString(lwaTokenUrl) ?? optionalCredentialString(tokenUrl)

    if (nextEndpoint !== undefined) {
      nextCredentials.endpoint = nextEndpoint
    }
    if (nextAccessToken) {
      nextCredentials.accessToken = nextAccessToken
    }
    if (nextRefreshToken) {
      nextCredentials.refreshToken = nextRefreshToken
    }
    if (nextLwaClientId !== undefined) {
      nextCredentials.lwaClientId = nextLwaClientId
    }
    if (nextLwaClientSecret) {
      nextCredentials.lwaClientSecret = nextLwaClientSecret
    }
    if (nextShippingBusinessId !== undefined) {
      nextCredentials.shippingBusinessId = nextShippingBusinessId || AMAZON_DEFAULT_BUSINESS_ID
    }
    if (nextRegion !== undefined) {
      nextCredentials.region = nextRegion || AMAZON_DEFAULT_REGION
    }
    if (sandbox !== undefined) {
      nextCredentials.sandbox = parseAmazonSandboxFlag(sandbox)
    }
    if (nextLwaTokenUrl !== undefined) {
      nextCredentials.lwaTokenUrl = nextLwaTokenUrl
    }

    const normalizedTokens = normalizeAmazonCredentialTokens({
      accessToken: nextCredentials.accessToken,
      refreshToken: nextCredentials.refreshToken,
    })
    nextCredentials.accessToken = normalizedTokens.accessToken
    nextCredentials.refreshToken = normalizedTokens.refreshToken

    const metadata = {
      accessToken: normalizeAmazonCredentialValue(nextCredentials.accessToken),
      refreshToken: normalizeAmazonCredentialValue(nextCredentials.refreshToken),
      lwaClientId: normalizeAmazonCredentialValue(nextCredentials.lwaClientId),
      lwaClientSecret: normalizeAmazonCredentialValue(nextCredentials.lwaClientSecret),
      endpoint: normalizeAmazonCredentialValue(nextCredentials.endpoint),
      region: normalizeAmazonCredentialValue(nextCredentials.region) || AMAZON_DEFAULT_REGION,
      sandbox: Boolean(nextCredentials.sandbox),
      shippingBusinessId:
        normalizeAmazonCredentialValue(nextCredentials.shippingBusinessId) ||
        AMAZON_DEFAULT_BUSINESS_ID,
      lwaTokenUrl: normalizeAmazonCredentialValue(nextCredentials.lwaTokenUrl),
    }

    const values = {
      provider: AMAZON_CREDENTIALS_PROVIDER,
      apiBase: metadata.endpoint,
      clientName: metadata.shippingBusinessId,
      apiKey: metadata.refreshToken || metadata.accessToken,
      clientId: metadata.lwaClientId,
      username: metadata.region,
      password: metadata.lwaClientSecret,
      webhookSecret: String(metadata.sandbox),
      metadata,
      updatedAt: new Date(),
    }

    await db
      .insert(courier_credentials)
      .values(values)
      .onConflictDoUpdate({
        target: courier_credentials.provider,
        set: values,
      })

    applyAmazonShippingCredentialsToEnv(nextCredentials, { overwriteExisting: true })

    const [saved] = await db
      .select()
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, AMAZON_CREDENTIALS_PROVIDER))
      .limit(1)

    res.json({
      success: true,
      message: 'Amazon credentials updated successfully',
      data: buildAmazonCredentialResponse(saved),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Amazon credentials' })
  }
}

export interface RateType {
  forward?: string | number
  rto?: string | number
}

// Utility: convert numbers to string for decimal fields
export const numericToString = (val: string | number | null | undefined): string | null => {
  if (val === null || val === undefined || val === '') return null
  return String(val)
}

// ---------------- Controller ----------------
export const updateShippingRateController = async (req: Request, res: Response) => {
  try {
    const courierId = Number(req.params.id) // courier_id from params
    let planId: string | undefined = req.params.planId // plan_id from params

    // Fallback: try to get planId from query or body if not in params
    if (!planId || planId === 'undefined') {
      planId = (req.query.planId as string) || (req.body.planId as string) || undefined
    }

    if (!courierId || isNaN(courierId)) {
      return res.status(400).json({ success: false, message: 'Invalid courier ID' })
    }

    if (!planId || planId === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing plan ID. Please ensure a plan is selected.',
      })
    }

    const updates: ShippingRateUpdatePayload = req.body

    console.log(`[updateShippingRateController] courierId: ${courierId}, planId: ${planId}`)

    const updated = await updateShippingRate(courierId, updates, planId)
    if (!updated) return res.status(404).json({ success: false, message: 'Rate card not found' })

    res.json({ success: true, data: updated })
  } catch (err) {
    console.log('Error updating shipping rate:', err)
    const statusCode = isSlabValidationError(err) ? 400 : 500
    res.status(statusCode).json({
      success: false,
      message: isSlabValidationError(err)
        ? String((err as any)?.message || 'Invalid slab configuration')
        : 'Internal Server Error',
    })
  }
}

const isExcelRateCard = (file: any) => {
  const name = String(file?.originalname || '').toLowerCase()
  const mime = String(file?.mimetype || '').toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')
  )
}

const parseRateCardFile = (file: any) => {
  if (isExcelRateCard(file)) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return { data: [] as CSVRow[], errors: [{ message: 'Excel file has no sheets' }] }
    }

    const worksheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
      blankrows: false,
    })

    return { data: rows.map(normalizeRateCardRow), errors: [] as any[] }
  }

  return parseRateCardCsvText(file.buffer.toString('utf8'))
}

export const importShippingRatesController = async (req: any, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' })
    }

    const { planId: plan_id, businessType: business_type } = req.query
    if (!plan_id || !business_type) {
      return res.status(400).json({ success: false, message: 'Missing plan_id or business_type' })
    }

    const normalizedBusinessType = String(business_type).toLowerCase()
    if (normalizedBusinessType !== 'b2b' && normalizedBusinessType !== 'b2c') {
      return res.status(400).json({ success: false, message: 'Invalid business_type' })
    }

    const importScope = String(req.query.importScope || 'single').trim().toLowerCase()
    const isB2CAllCourierImport = normalizedBusinessType === 'b2c' && importScope === 'all'
    const b2cCourierScope: B2CImportCourierScope = isB2CAllCourierImport ? {} : {
      courierId: req.query.courierId ? String(req.query.courierId).trim() : '',
      courierName: req.query.courierName ? String(req.query.courierName).trim() : '',
      serviceProvider: req.query.serviceProvider ? String(req.query.serviceProvider).trim() : '',
    }
    if (normalizedBusinessType === 'b2c' && !isB2CAllCourierImport && !b2cCourierScope.courierId) {
      return res.status(400).json({
        success: false,
        message: 'Select one courier or choose all-courier import before importing a B2C rate card.',
      })
    }
    if (
      normalizedBusinessType === 'b2c' &&
      b2cCourierScope.serviceProvider &&
      !['delhivery', 'manual', 'velocity'].includes(b2cCourierScope.serviceProvider.toLowerCase())
    ) {
      return res.status(400).json({
        success: false,
        message: 'B2C rate-card import is allowed only for Delhivery, Velocity, and manual couriers.',
      })
    }

    const { data, errors } = parseRateCardFile(req.file)

    if (errors.length) {
      console.error('Rate card parse errors:', errors)
      return res.status(400).json({ success: false, message: 'Invalid rate card file', errors })
    }

    const zonesList = await getAllZones(normalizedBusinessType)

    // Detect format: new slab-per-row format has a "Slab Type" column
    const headers = data.length ? Object.keys(data[0]) : []
    const isSlabFormat = headers.some((h) => h.trim() === 'Slab Type')
    let savedRows = 0

    if (normalizedBusinessType === 'b2c' && isSlabFormat) {
      savedRows = await importB2CSlabFormat(
        data as CSVRow[],
        plan_id as string,
        zonesList,
        b2cCourierScope,
      )
    } else {
      savedRows = await importFlatFormat(data as CSVRow[], plan_id as string, normalizedBusinessType, zonesList)
    }

    if (savedRows === 0) {
      return res.status(400).json({
        success: false,
        message:
          'No rate rows were imported. Check the plan, courier, mode, zone column names, and rate values in the file.',
      })
    }

    res.json({
      success: true,
      message: `Shipping rates imported successfully. ${savedRows} rate rows saved.`,
      data: { savedRows },
    })
  } catch (err) {
    console.error('Error importing shipping rates:', err)
    const statusCode = isSlabValidationError(err) ? 400 : 500
    res.status(statusCode).json({
      success: false,
      message: isSlabValidationError(err)
        ? String((err as any)?.message || 'Invalid slab configuration')
        : 'Internal Server Error',
    })
  }
}

export const deleteShippingRateController = async (req: Request, res: Response) => {
  try {
    const courierId = Number(req.params.id)
    const planId = req.params.planId
    const businessType = req.query.businessType as 'b2b' | 'b2c'
    const zoneId = req.query.zoneId as string | undefined
    const serviceProvider = req.query.serviceProvider as string | undefined
    const mode = req.query.mode as string | undefined

    if (!courierId || !planId || !businessType) {
      return res
        .status(400)
        .json({ success: false, message: 'courierId, planId and businessType are required' })
    }

    const deleted = await deleteShippingRate(
      courierId,
      planId,
      businessType,
      zoneId,
      serviceProvider,
      mode,
    )

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'No matching rate found' })
    }

    res.json({ success: true, message: 'Rate(s) deleted successfully', data: deleted })
  } catch (err) {
    console.error('Error deleting shipping rate:', err)
    res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}

export const deleteCourierController = async (req: Request, res: Response) => {
  const { id } = req.params
  const { serviceProvider } = req.body

  try {
    if (!serviceProvider) {
      return res.status(400).json({ success: false, message: 'Service provider is required' })
    }
    await deleteCourierService(id, serviceProvider)
    res.json({ success: true, message: 'Courier deleted successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to delete courier' })
  }
}
