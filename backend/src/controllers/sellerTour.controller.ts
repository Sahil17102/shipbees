import type { Response } from 'express'
import { getSellerTourProgress, updateSellerTourProgress } from '../models/services/sellerTourProgress.service'

export const getSellerTourController = async (req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await getSellerTourProgress(req.user.sub) })
  } catch (error) {
    console.error('Could not load seller tour progress:', error)
    return res.status(500).json({ success: false, message: 'Could not load guide progress' })
  }
}

export const updateSellerTourController = async (req: any, res: Response) => {
  const { action, page } = req.body || {}
  if (!['start', 'dismiss', 'complete-page', 'finish', 'reset'].includes(action)) {
    return res.status(400).json({ success: false, message: 'Invalid guide action' })
  }
  if (action === 'complete-page' && (typeof page !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(page))) {
    return res.status(400).json({ success: false, message: 'Invalid guide page' })
  }
  try {
    return res.json({ success: true, data: await updateSellerTourProgress(req.user.sub, action, page) })
  } catch (error) {
    console.error('Could not save seller tour progress:', error)
    return res.status(500).json({ success: false, message: 'Could not save guide progress' })
  }
}
