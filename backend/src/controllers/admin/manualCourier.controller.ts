import { Response } from 'express'
import Papa from 'papaparse'
import {
  addManualTrackingEvent,
  appendManualCourierPincodes,
  attachProviderAwbForReconciliation,
  createManualCourier,
  failProviderBookingAttempt,
  getManualCourier,
  getManualShipmentAdminDetail,
  getManualShipmentStats,
  getProviderOptionsForManualShipment,
  listManualCouriers,
  listManualShipmentsForAdmin,
  removeManualCourierPincode,
  releaseProviderBookingAttempt,
  replaceManualCourierPincodes,
  setManualFulfilmentMode,
  startProviderBookingAttempt,
  updateManualCourier,
} from '../../models/services/manualCourier.service'
import { createB2CShipmentService } from '../../models/services/shiprocket.service'
import { HttpError } from '../../utils/classes'

const getAdminUserId = (req: any) => {
  const userId = String(req.user?.sub || '').trim()
  if (!userId) throw new HttpError(401, 'Unauthorized')
  return userId
}

const sendError = (res: Response, error: any) => {
  console.error('[ManualCourierAdmin]', error)
  const status = Number(error?.statusCode || error?.status || 500)
  return res.status(Number.isFinite(status) ? status : 500).json({
    success: false,
    message: error?.message || 'Manual courier operation failed',
  })
}

const parsePincodeInput = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  return value
    .split(/[\s,;\r\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const parseCsvPincodes = (file?: Express.Multer.File) => {
  if (!file?.buffer?.length) throw new HttpError(400, 'CSV file is required')
  const text = file.buffer.toString('utf8').replace(/^\uFEFF/, '')
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  })
  if (parsed.errors.length && !parsed.data.length) {
    throw new HttpError(400, parsed.errors[0]?.message || 'Invalid CSV file')
  }
  return parsed.data.flatMap((row) => row)
}

export const listManualCouriersController = async (_req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await listManualCouriers() })
  } catch (error) {
    return sendError(res, error)
  }
}

export const getManualCourierController = async (req: any, res: Response) => {
  try {
    return res.json({
      success: true,
      data: await getManualCourier(req.params.id, {
        pincodePage: Number(req.query.pincodePage || 1),
        pincodeLimit: Number(req.query.pincodeLimit || 100),
        pincodeSearch: req.query.pincodeSearch,
      }),
    })
  } catch (error) {
    return sendError(res, error)
  }
}

export const createManualCourierController = async (req: any, res: Response) => {
  try {
    const data = await createManualCourier(
      {
        ...req.body,
        pincodes: parsePincodeInput(req.body?.pincodes),
      },
      getAdminUserId(req),
    )
    return res.status(201).json({ success: true, data })
  } catch (error) {
    return sendError(res, error)
  }
}

export const updateManualCourierController = async (req: any, res: Response) => {
  try {
    const data = await updateManualCourier(req.params.id, req.body || {}, getAdminUserId(req))
    return res.json({ success: true, data })
  } catch (error) {
    return sendError(res, error)
  }
}

export const replaceManualCourierPincodesController = async (req: any, res: Response) => {
  try {
    const values = parsePincodeInput(req.body?.pincodes)
    const data = await replaceManualCourierPincodes(req.params.id, values)
    return res.json({ success: true, data })
  } catch (error) {
    return sendError(res, error)
  }
}

export const importManualCourierPincodesController = async (req: any, res: Response) => {
  try {
    const values = parseCsvPincodes(req.file)
    const replace = String(req.body?.mode || '').toLowerCase() === 'replace'
    const data = replace
      ? await replaceManualCourierPincodes(req.params.id, values)
      : await appendManualCourierPincodes(req.params.id, values)
    return res.json({
      success: true,
      message: `${data.count} pincodes ${replace ? 'replaced' : 'imported'}`,
      data,
    })
  } catch (error) {
    return sendError(res, error)
  }
}

export const removeManualCourierPincodeController = async (req: any, res: Response) => {
  try {
    await removeManualCourierPincode(req.params.id, req.params.pincode)
    return res.json({ success: true })
  } catch (error) {
    return sendError(res, error)
  }
}

export const listManualShipmentsController = async (req: any, res: Response) => {
  try {
    const data = await listManualShipmentsForAdmin({
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
      search: req.query.search,
      status: req.query.status,
      courierId: req.query.courierId,
      fulfilmentMode: req.query.fulfilmentMode,
    })
    return res.json({ success: true, ...data })
  } catch (error) {
    return sendError(res, error)
  }
}

export const getManualShipmentStatsController = async (_req: any, res: Response) => {
  try {
    return res.json({ success: true, data: await getManualShipmentStats() })
  } catch (error) {
    return sendError(res, error)
  }
}

export const getManualShipmentController = async (req: any, res: Response) => {
  try {
    return res.json({
      success: true,
      data: await getManualShipmentAdminDetail(req.params.id),
    })
  } catch (error) {
    return sendError(res, error)
  }
}

export const setManualShipmentModeController = async (req: any, res: Response) => {
  try {
    await setManualFulfilmentMode(req.params.id, getAdminUserId(req))
    return res.json({ success: true, message: 'Shipment assigned for manual fulfilment' })
  } catch (error) {
    return sendError(res, error)
  }
}

export const addManualTrackingEventController = async (req: any, res: Response) => {
  try {
    const data = await addManualTrackingEvent(req.params.id, req.body || {}, getAdminUserId(req))
    return res.status(201).json({ success: true, data })
  } catch (error) {
    return sendError(res, error)
  }
}

export const getManualProviderOptionsController = async (req: any, res: Response) => {
  try {
    const data = await getProviderOptionsForManualShipment(req.params.id, req.body || {})
    return res.json({ success: true, data })
  } catch (error) {
    return sendError(res, error)
  }
}

export const rebookManualShipmentController = async (req: any, res: Response) => {
  let attempt:
    | Awaited<ReturnType<typeof startProviderBookingAttempt>>
    | undefined
  try {
    const adminUserId = getAdminUserId(req)
    attempt = await startProviderBookingAttempt(req.params.id, req.body || {}, adminUserId)
    if (attempt.completed) {
      return res.json({
        success: true,
        message: 'Provider AWB was already linked for this request',
        data: { providerLeg: attempt.attempt },
      })
    }
    const result = await createB2CShipmentService(
      attempt.providerParams as any,
      attempt.detail.shipment.userId,
      false,
      {
        manualRebookShipmentId: attempt.detail.shipment.id,
        manualRebookAttemptId: attempt.attempt.id,
      },
    )
    return res.json({
      success: true,
      message: 'Provider AWB linked to the customer shipment',
      data: result,
    })
  } catch (error) {
    if (attempt) {
      await failProviderBookingAttempt(
        attempt.detail.shipment.id,
        attempt.attempt.id,
        error,
      ).catch((markError) => {
        console.error('[ManualCourierAdmin] Failed to mark provider attempt', markError)
      })
    }
    return sendError(res, error)
  }
}

export const reconcileManualProviderAwbController = async (req: any, res: Response) => {
  try {
    const data = await attachProviderAwbForReconciliation(
      req.params.id,
      req.body || {},
      getAdminUserId(req),
    )
    return res.status(201).json({
      success: true,
      message: 'Provider AWB linked for reconciliation',
      data,
    })
  } catch (error) {
    return sendError(res, error)
  }
}

export const releaseManualProviderBookingController = async (req: any, res: Response) => {
  try {
    const data = await releaseProviderBookingAttempt(
      req.params.id,
      getAdminUserId(req),
      req.body?.reason,
    )
    return res.json({
      success: true,
      message: 'Provider booking state released for review',
      data,
    })
  } catch (error) {
    return sendError(res, error)
  }
}
