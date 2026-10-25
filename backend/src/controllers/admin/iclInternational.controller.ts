import { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../../models/client'
import { courier_credentials } from '../../models/schema/courierCredentials'
import { IclInternationalService } from '../../models/services/couriers/iclInternational.service'
import { encryptSecret } from '../../utils/secretEncryption'

const PROVIDER = 'icl'
const API_BASE = 'https://cloud.iclinternational.in'

export const updateIclCredentialsController = async (req: Request, res: Response) => {
  try {
    const userId = String(req.body?.userId || '').trim()
    const customerCode = String(req.body?.customerCode || '').trim()
    const password = String(req.body?.password || '').trim()
    if (!userId) return res.status(400).json({ success: false, message: 'ICL User ID is required' })
    if (!customerCode) return res.status(400).json({ success: false, message: 'ICL customer code is required' })

    const [existing] = await db.select({ id: courier_credentials.id })
      .from(courier_credentials).where(eq(courier_credentials.provider, PROVIDER)).limit(1)
    if (!existing && !password) return res.status(400).json({ success: false, message: 'ICL password is required' })
    const values = {
      apiBase: API_BASE,
      clientName: 'ICL International',
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
        ...values,
        password: encryptSecret(password),
        apiKey: '',
        webhookSecret: '',
        metadata: {},
      })
    }
    return res.json({ success: true, data: { provider: PROVIDER, apiBase: API_BASE, userId, customerCode, hasPassword: true } })
  } catch (error: any) {
    console.error('[icl:credentials]', error)
    return res.status(500).json({ success: false, message: error?.message || 'Failed to save ICL credentials' })
  }
}

export const testIclCredentialsController = async (_req: Request, res: Response) => {
  try {
    const data = await new IclInternationalService().testConnection()
    return res.json({ success: true, message: 'ICL credentials accepted; no shipment was created', data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'ICL credential check failed' })
  }
}

export const createIclAwbController = async (req: Request, res: Response) => {
  try {
    const data = await new IclInternationalService().createAwb(req.body || {})
    return res.json({ success: true, data })
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error?.message || 'ICL AWB creation failed' })
  }
}
