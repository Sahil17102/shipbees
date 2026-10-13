import { Request, Response } from 'express'
import { IndiaPostService } from '../../models/services/couriers/indiaPost.service'

const service = () => new IndiaPostService()

const fail = (res: Response, error: any) => {
  const status = Number(error?.statusCode || error?.status || 500)
  return res.status(status).json({ success: false, message: error?.message || 'India Post request failed' })
}

export const testIndiaPostCredentialsController = async (_req: Request, res: Response) => {
  try {
    const result = await service().login()
    return res.json({
      success: true,
      message: 'India Post credentials are working',
      tokenIssued: Boolean(result.accessToken),
      expiresIn: result.response?.data?.expires_in ?? null,
      refreshExpiresIn: result.response?.data?.refresh_expires_in ?? null,
    })
  } catch (error) {
    return fail(res, error)
  }
}

export const speedPostTariffController = async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await service().speedPostTariff(req.body) })
  } catch (error) {
    return fail(res, error)
  }
}

export const businessParcelTariffController = async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await service().businessParcelTariff(req.body) })
  } catch (error) {
    return fail(res, error)
  }
}

export const indiaPostPincodeController = async (req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      data: await service().searchPincode(String(req.query.pincode || ''), Number(req.query.limit || 50)),
    })
  } catch (error) {
    return fail(res, error)
  }
}

export const indiaPostBookArticlesController = async (req: Request, res: Response) => {
  try {
    const api = service()
    return res.json({
      success: true,
      data: await api.bookArticles(req.body?.articles, String(req.params.customId || api.customerId)),
    })
  } catch (error) {
    return fail(res, error)
  }
}

export const indiaPostBookArticlesFileController = async (req: Request, res: Response) => {
  const file = req.file
  if (!file?.buffer) return res.status(400).json({ success: false, message: 'JSON file is required' })
  try {
    const api = service()
    return res.json({
      success: true,
      data: await api.bookArticlesFileBuffer(
        file.buffer,
        file.originalname,
        String(req.params.customId || api.customerId),
      ),
    })
  } catch (error) {
    return fail(res, error)
  }
}

export const indiaPostLabelController = async (req: Request, res: Response) => {
  try {
    const pdf = await service().generateDomesticLabel(req.body)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="indiapost-${String(req.body?.barcode_no || 'label')}.pdf"`)
    return res.send(Buffer.from(pdf))
  } catch (error) {
    return fail(res, error)
  }
}

export const indiaPostEventsController = async (req: Request, res: Response) => {
  try {
    const xml = await service().downloadEvents({
      customerId: req.body?.customerId,
      eventCode: req.body?.eventCode,
      eventDate: req.body?.eventDate,
    })
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    return res.send(xml)
  } catch (error) {
    return fail(res, error)
  }
}

export const indiaPostTrackingController = async (req: Request, res: Response) => {
  try {
    return res.json({ success: true, data: await service().trackBulk(req.body?.bulk || []) })
  } catch (error) {
    return fail(res, error)
  }
}
