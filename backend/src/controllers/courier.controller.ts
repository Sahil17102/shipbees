import { Response } from 'express'
import { getUserShippingRates } from '../models/services/courierIntegration.service'
import { ShippingRateFilters } from './admin/courier.controller'

export const getShippingRatesForUserController = async (req: any, res: Response) => {
  try {
    const userId = req.user.sub
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
      business_type: requestedBusinessType,
    }

    const rates = await getUserShippingRates(userId, filters)
    res.json({ success: true, data: rates })
  } catch (err) {
    console.error('Error fetching shipping rates:', err)
    res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}
