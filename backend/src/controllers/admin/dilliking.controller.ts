import { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../../models/client'
import { courier_credentials } from '../../models/schema/courierCredentials'
import {
  clearDilliKingTokenCache,
  DilliKingService,
} from '../../models/services/couriers/dilliking.service'
import { encryptSecret } from '../../utils/secretEncryption'

const PROVIDER = 'dilliking'
const DEFAULT_API_BASE = 'https://cloud.iclinternational.in'

export const updateDilliKingCredentialsController = async (req: Request, res: Response) => {
  try {
    const apiBase = String(req.body?.apiBase || DEFAULT_API_BASE).trim().replace(/\/+$/, '')
    const userId = String(req.body?.userId || '').trim()
    const customerCode = String(req.body?.customerCode || '').trim()
    const password = String(req.body?.password || '').trim()
    if (!apiBase.startsWith('https://')) return res.status(400).json({ success: false, message: 'ICL API must use HTTPS' })
    if (apiBase !== DEFAULT_API_BASE) return res.status(400).json({ success: false, message: 'Use the approved ICL production API URL' })
    if (!userId) return res.status(400).json({ success: false, message: 'ICL User ID is required' })
    if (!customerCode) return res.status(400).json({ success: false, message: 'ICL customer code is required' })

    const [existing] = await db
      .select({ id: courier_credentials.id, password: courier_credentials.password })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, PROVIDER))
      .limit(1)
    if (!existing && !password) return res.status(400).json({ success: false, message: 'DilliKing password is required' })

    const values = {
      apiBase,
      username: userId,
      clientId: customerCode,
      ...(password ? { password: encryptSecret(password) } : {}),
      updatedAt: new Date(),
    }
    if (existing) {
      await db.update(courier_credentials).set(values).where(eq(courier_credentials.provider, PROVIDER))
    } else {
      await db.insert(courier_credentials).values({
        provider: PROVIDER,
        apiBase,
        clientName: 'ICL International',
        apiKey: '',
        clientId: customerCode,
        username: userId,
        password: encryptSecret(password),
        webhookSecret: '',
        metadata: {},
      })
    }
    clearDilliKingTokenCache()
    return res.json({ success: true, data: { provider: PROVIDER, apiBase, userId, customerCode, hasPassword: true } })
  } catch (error: any) {
    console.error('[dilliking:credentials]', error)
    return res.status(500).json({ success: false, message: error?.message || 'Failed to save ICL credentials' })
  }
}

export const testDilliKingCredentialsController = async (_req: Request, res: Response) => {
  try {
    const data = await new DilliKingService().testConnection()
    return res.json({ success: true, message: 'ICL production credentials accepted; no shipment was created', data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'ICL credential check failed' })
  }
}

export const createDilliKingAwbController = async (req: Request, res: Response) => {
  try {
    const data = await new DilliKingService().createAwb(req.body || {})
    return res.json({ success: true, data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'ICL AWB creation failed' })
  }
}

export const trackDilliKingShipmentController = async (req: Request, res: Response) => {
  try {
    const data = await new DilliKingService().track(String(req.query?.airway_bill || ''))
    return res.json({ success: true, data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'ICL tracking failed' })
  }
}
