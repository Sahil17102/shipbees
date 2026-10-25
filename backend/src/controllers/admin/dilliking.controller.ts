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
const DEFAULT_API_BASE = 'https://api.dilliking.com'

export const updateDilliKingCredentialsController = async (req: Request, res: Response) => {
  try {
    const apiBase = String(req.body?.apiBase || DEFAULT_API_BASE).trim().replace(/\/+$/, '')
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '').trim()
    if (!apiBase.startsWith('https://')) return res.status(400).json({ success: false, message: 'DilliKing API must use HTTPS' })
    if (!email) return res.status(400).json({ success: false, message: 'DilliKing email is required' })

    const [existing] = await db
      .select({ id: courier_credentials.id, password: courier_credentials.password })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, PROVIDER))
      .limit(1)
    if (!existing && !password) return res.status(400).json({ success: false, message: 'DilliKing password is required' })

    const values = {
      apiBase,
      username: email,
      ...(password ? { password: encryptSecret(password) } : {}),
      updatedAt: new Date(),
    }
    if (existing) {
      await db.update(courier_credentials).set(values).where(eq(courier_credentials.provider, PROVIDER))
    } else {
      await db.insert(courier_credentials).values({
        provider: PROVIDER,
        apiBase,
        clientName: 'DilliKing International',
        apiKey: '',
        clientId: '',
        username: email,
        password: encryptSecret(password),
        webhookSecret: '',
        metadata: {},
      })
    }
    clearDilliKingTokenCache()
    return res.json({ success: true, data: { provider: PROVIDER, apiBase, email, hasPassword: true } })
  } catch (error: any) {
    console.error('[dilliking:credentials]', error)
    return res.status(500).json({ success: false, message: error?.message || 'Failed to save DilliKing credentials' })
  }
}

export const testDilliKingCredentialsController = async (_req: Request, res: Response) => {
  try {
    const data = await new DilliKingService().testConnection()
    return res.json({ success: true, message: 'DilliKing authentication successful', data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'DilliKing authentication failed' })
  }
}

export const createDilliKingAwbController = async (req: Request, res: Response) => {
  try {
    const data = await new DilliKingService().createAwb(req.body || {})
    return res.json({ success: true, data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'DilliKing AWB creation failed' })
  }
}

export const trackDilliKingShipmentController = async (req: Request, res: Response) => {
  try {
    const data = await new DilliKingService().track(String(req.query?.airway_bill || ''))
    return res.json({ success: true, data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'DilliKing tracking failed' })
  }
}
