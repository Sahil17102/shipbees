import { Response } from 'express'
import {
  getIncomingPickups,
  getPendingActions,
  getInvoiceStatus,
  getTopDestinations,
  getCourierDistribution,
  getMerchantDashboardStats,
} from '../models/services/dashboard.service'
import { getMerchantUserIdFromRequest, resolveMerchantUserId } from '../utils/merchantContext'

const parseDashboardDate = (value: unknown) => {
  const normalized = String(value || '').trim()
  if (!normalized) return undefined

  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const parsed = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return null

  const now = new Date()
  if (parsed.getTime() > now.getTime()) return null

  return parsed
}

export const getHomePickups = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub // assume JWT middleware sets this

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const pickups = await getIncomingPickups(userId)

    return res.json({ success: true, pickups })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: 'Failed to fetch pickups' })
  }
}

export const getDashboardPendingActions = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const pendingActions = await getPendingActions(userId)

    return res.json({ success: true, ...pendingActions })
  } catch (error) {
    console.error('Error fetching pending actions:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch pending actions' })
  }
}

export const getDashboardInvoiceStatus = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const invoiceStatus = await getInvoiceStatus(userId)

    return res.json({ success: true, status: invoiceStatus })
  } catch (error) {
    console.error('Error fetching invoice status:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch invoice status' })
  }
}

export const getDashboardTopDestinations = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const limit = parseInt((req.query.limit as string) || '10')

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const destinations = await getTopDestinations(userId, limit)

    return res.json({ success: true, destinations })
  } catch (error) {
    console.error('Error fetching top destinations:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch top destinations' })
  }
}

export const getDashboardCourierDistribution = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const distribution = await getCourierDistribution(userId)

    return res.json({ success: true, distribution })
  } catch (error) {
    console.error('Error fetching courier distribution:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch courier distribution' })
  }
}

export const getMerchantDashboardStatsController = async (req: any, res: Response) => {
  try {
    const sessionUserId = getMerchantUserIdFromRequest(req)

    if (!sessionUserId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const selectedDate = parseDashboardDate(req.query.date)
    const fromDate = parseDashboardDate(req.query.fromDate)
    const toDate = parseDashboardDate(req.query.toDate)
    if (selectedDate === null || fromDate === null || toDate === null) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid dashboard dates that are not in the future.',
      })
    }

    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'From date cannot be after the To date.',
      })
    }

    const userId = await resolveMerchantUserId(sessionUserId)
    const stats = await getMerchantDashboardStats(userId, selectedDate, {
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })

    return res.json(stats)
  } catch (error) {
    console.error('Error fetching merchant dashboard stats:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch merchant dashboard stats' })
  }
}
