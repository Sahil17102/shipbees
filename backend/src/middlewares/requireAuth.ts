import { and, eq } from 'drizzle-orm'
import { NextFunction, Request, Response } from 'express'
import { db } from '../models/client'
import { employees } from '../models/schema/employees'
import { stores } from '../models/schema/stores'
import {
  normalizeShopifyDomain,
  verifyShopifySessionToken,
} from '../models/services/shopify.service'
import { verifyAccessToken } from '../utils/jwt'

const readHeader = (value: string | string[] | undefined) =>
  Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim()

const readBearerToken = (value: string) =>
  value.startsWith('Bearer ') ? value.slice('Bearer '.length).trim() : ''

type AuthenticatedRequest = Request & {
  user?: Awaited<ReturnType<typeof verifyAccessToken>> & {
    actorSub?: string
    merchantSub?: string
    employeeId?: string | null
    employeeRole?: string | null
    moduleAccess?: unknown
  }
  userId?: string
  actorUserId?: string
  merchantUserId?: string
  shopifySession?: { shop: string }
}

type EmployeeModule =
  | 'overview'
  | 'dashboard'
  | 'orders'
  | 'exceptions'
  | 'finance'
  | 'audits'
  | 'utilities'
  | 'reports'
  | 'channels'
  | 'workspace'
  | 'support'

const normalizeModuleAccess = (moduleAccess: unknown) => {
  if (!moduleAccess) return {}
  if (typeof moduleAccess === 'string') {
    try {
      return JSON.parse(moduleAccess)
    } catch {
      return {}
    }
  }
  return typeof moduleAccess === 'object' ? (moduleAccess as Record<string, any>) : {}
}

const getEmployeeModulesForRequest = (originalUrl: string): EmployeeModule[] => {
  const pathname = originalUrl.split('?')[0] || ''

  if (
    pathname.startsWith('/api/profile') ||
    pathname.startsWith('/api/user/user-info') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/notifications')
  ) {
    return []
  }

  if (pathname.startsWith('/api/dashboard')) return ['dashboard', 'overview']
  if (pathname.startsWith('/api/orders') || pathname.startsWith('/api/shipments/cancel')) {
    return ['orders']
  }
  if (
    pathname.startsWith('/api/ndr') ||
    pathname.startsWith('/api/rto') ||
    pathname.startsWith('/api/returns')
  ) {
    return ['exceptions']
  }
  if (
    pathname.startsWith('/api/payments') ||
    pathname.startsWith('/api/wallet') ||
    pathname.startsWith('/api/billing') ||
    pathname.startsWith('/api/invoices') ||
    pathname.startsWith('/api/cod-remittance')
  ) {
    return ['finance']
  }
  if (pathname.startsWith('/api/weight-reconciliation')) return ['audits']
  if (
    pathname.startsWith('/api/couriers') ||
    pathname.startsWith('/api/courier') ||
    pathname.startsWith('/api/serviceability') ||
    pathname.startsWith('/api/plans')
  ) {
    return ['utilities', 'orders', 'workspace']
  }
  if (pathname.startsWith('/api/reports')) return ['reports']
  if (pathname.startsWith('/api/integrations') || pathname.startsWith('/api/v1')) return ['channels']
  if (
    pathname.startsWith('/api/user-management') ||
    pathname.startsWith('/api/label-preference') ||
    pathname.startsWith('/api/invoice-preferences') ||
    pathname.startsWith('/api/bank-account')
  ) {
    return ['workspace']
  }
  if (
    pathname.startsWith('/api/pickup-addresses') ||
    pathname.startsWith('/api/pickup') ||
    pathname.startsWith('/api/uploads')
  ) {
    return ['workspace', 'orders']
  }
  if (pathname.startsWith('/api/support')) return ['support']

  return []
}

const canAccessEmployeeModules = (moduleAccess: unknown, modules: EmployeeModule[]) => {
  if (!modules.length) return true

  const access = normalizeModuleAccess(moduleAccess)
  const configuredModules = access.modules
  if (!configuredModules || typeof configuredModules !== 'object') return true

  return modules.some((module) => configuredModules[module] === true)
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authenticatedRequest = req as AuthenticatedRequest
  const authorization = readHeader(req.headers.authorization)
  const shiprayAccessToken = readHeader(req.headers['x-shipray-access-token'])
  const token = shiprayAccessToken || readBearerToken(authorization)

  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  let decoded: Awaited<ReturnType<typeof verifyAccessToken>>
  try {
    decoded = await verifyAccessToken(token)

    if (!decoded || typeof decoded !== 'object') {
      return res.status(401).json({ error: 'Invalid token payload' })
    }
  } catch (error: any) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      })
    }

    console.error('Token verification error:', error?.name || error?.message || error)
    return res.status(401).json({
      error: 'Token invalid or expired',
      code: error?.name || 'TOKEN_INVALID',
    })
  }

  if (shiprayAccessToken) {
    const shopifySessionToken = readBearerToken(authorization)
    if (!shopifySessionToken) {
      return res.status(401).set('Cache-Control', 'no-store').json({
        error: 'Shopify session token is required',
        code: 'SHOPIFY_SESSION_MISSING',
      })
    }

    let shop: string
    try {
      const shopifySession = verifyShopifySessionToken(shopifySessionToken)
      shop = normalizeShopifyDomain(new URL(shopifySession.dest).hostname)
    } catch {
      return res.status(401).set('Cache-Control', 'no-store').json({
        error: 'Shopify session expired or is invalid',
        code: 'SHOPIFY_SESSION_INVALID',
      })
    }

    let binding: { id: string } | undefined
    try {
      const bindings = await db
        .select({ id: stores.id })
        .from(stores)
        .where(and(eq(stores.userId, decoded.sub), eq(stores.domain, shop)))
        .limit(1)
      binding = bindings[0]
    } catch (error: any) {
      console.error('Shopify session binding check failed:', error?.message || error)
      return res.status(503).json({
        error: 'Unable to verify the Shopify session right now',
        code: 'SHOPIFY_SESSION_CHECK_UNAVAILABLE',
      })
    }

    if (!binding) {
      return res.status(403).set('Cache-Control', 'no-store').json({
        error: 'Shopify store is not connected to this account',
        code: 'SHOPIFY_SESSION_STORE_MISMATCH',
      })
    }

    authenticatedRequest.shopifySession = { shop }
  }

  const actorUserId = decoded.sub
  let merchantUserId = decoded.sub
  let employeeContext:
    | {
        id: string
        adminId: string
        role: string
        isActive: boolean | null
        moduleAccess: unknown
      }
    | null = null

  const [employeeRecord] = await db
    .select({
      id: employees.id,
      adminId: employees.adminId,
      role: employees.role,
      isActive: employees.isActive,
      moduleAccess: employees.moduleAccess,
    })
    .from(employees)
    .where(eq(employees.userId, decoded.sub))
    .limit(1)

  if (employeeRecord || decoded.role === 'employee') {
    if (!employeeRecord) {
      return res.status(403).json({
        error: 'Employee access is not configured for this account',
        code: 'EMPLOYEE_ACCESS_MISSING',
      })
    }

    if (!employeeRecord.isActive) {
      return res.status(403).json({
        error: 'Your account is temporarily suspended by your administrator.',
        code: 'EMPLOYEE_INACTIVE',
      })
    }

    const requiredModules = getEmployeeModulesForRequest(req.originalUrl || req.url)
    if (!canAccessEmployeeModules(employeeRecord.moduleAccess, requiredModules)) {
      return res.status(403).json({
        error: 'You do not have access to this module',
        code: 'EMPLOYEE_MODULE_FORBIDDEN',
        requiredModules,
      })
    }

    merchantUserId = employeeRecord.adminId
    employeeContext = employeeRecord
  }

  authenticatedRequest.actorUserId = actorUserId
  authenticatedRequest.merchantUserId = merchantUserId
  authenticatedRequest.userId = merchantUserId
  authenticatedRequest.user = {
    ...decoded,
    actorSub: actorUserId,
    merchantSub: merchantUserId,
    sub: merchantUserId,
    employeeId: employeeContext?.id ?? null,
    employeeRole: employeeContext?.role ?? null,
    moduleAccess: employeeContext?.moduleAccess ?? null,
  }

  next()
}
