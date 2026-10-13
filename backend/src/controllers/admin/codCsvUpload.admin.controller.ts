import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { Response } from 'express'
import Papa from 'papaparse'
import { db } from '../../models/client'
import { b2b_orders } from '../../models/schema/b2bOrders'
import { b2c_orders } from '../../models/schema/b2cOrders'
import { codRemittances } from '../../models/schema/codRemittance'
import {
  createCodRemittance,
  markCodRemittanceSettled,
} from '../../models/services/codRemittance.service'

/**
 * CSV Field Mappings for Different Couriers
 * Each courier has different column names in their settlement CSV
 */
const COURIER_CSV_MAPPINGS = {
  delhivery: {
    awb: ['Waybill', 'waybill', 'AWB', 'CN Number'],
    orderNumber: ['Order', 'order_id', 'Client Order ID', 'Reference Number'],
    codAmount: ['COD Amount', 'cod_amount', 'Total Amount'],
    remittableAmount: ['Net Payable', 'net_payable', 'Remittable Amount', 'Settlement Amount'],
    utr: ['Bank Transaction ID', 'utr_number', 'UTR', 'Transaction Reference'],
    settlementDate: ['Remittance Date', 'settlement_date', 'Date'],
  },
}

/**
 * Extract field value from CSV row using courier-specific mappings
 */
function extractField(
  row: Record<string, string>,
  fieldMappings: string[],
  courierPartner: string,
): string {
  for (const fieldName of fieldMappings) {
    if (row[fieldName] !== undefined && row[fieldName] !== null && row[fieldName] !== '') {
      return String(row[fieldName]).trim()
    }
  }
  return ''
}

function normalizeAwb(input: string): string {
  return String(input || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function parseAmount(raw: string): number | null {
  const cleaned = String(raw || '').replace(/[^0-9.-]/g, '')
  if (!cleaned) return null
  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : null
}

function normalizeOrderNumber(input: string): string {
  return String(input || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/^#/, '')
    .toUpperCase()
}

function parseSettlementDate(raw: string): Date | undefined {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return undefined

  const serial = Number(trimmed)
  if (Number.isFinite(serial) && serial > 25569) {
    return new Date((serial - 25569) * 86400 * 1000)
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

const activeCodOrderCondition = (orderTypeColumn: any, orderStatusColumn: any) =>
  and(
    sql`LOWER(COALESCE(${orderTypeColumn}, '')) = 'cod'`,
    sql`LOWER(COALESCE(${orderStatusColumn}, '')) NOT IN ('cancelled', 'canceled', 'rto', 'rto_in_transit', 'rto_delivered', 'lost')`,
  )

async function findB2cCodOrderForSettlement(awbNumber: string, orderNumber: string) {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber)
  const matchConditions = []

  if (awbNumber) {
    matchConditions.push(
      sql`UPPER(REGEXP_REPLACE(COALESCE(${b2c_orders.awb_number}, ''), '\s+', '', 'g')) = ${awbNumber}`,
    )
  }

  if (orderNumber) {
    matchConditions.push(ilike(b2c_orders.order_number, orderNumber))
  }

  if (normalizedOrderNumber) {
    matchConditions.push(
      sql`UPPER(REGEXP_REPLACE(REPLACE(COALESCE(${b2c_orders.order_number}, ''), '#', ''), '\s+', '', 'g')) = ${normalizedOrderNumber}`,
    )
  }

  if (matchConditions.length === 0) return null

  const [order] = await db
    .select()
    .from(b2c_orders)
    .where(
      and(
        activeCodOrderCondition(b2c_orders.order_type, b2c_orders.order_status),
        or(...matchConditions),
      ),
    )
    .limit(1)

  return order || null
}

async function findB2bCodOrderForSettlement(awbNumber: string, orderNumber: string) {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber)
  const matchConditions = []

  if (awbNumber) {
    matchConditions.push(
      sql`UPPER(REGEXP_REPLACE(COALESCE(${b2b_orders.awb_number}, ''), '\s+', '', 'g')) = ${awbNumber}`,
    )
  }

  if (orderNumber) {
    matchConditions.push(ilike(b2b_orders.order_number, orderNumber))
  }

  if (normalizedOrderNumber) {
    matchConditions.push(
      sql`UPPER(REGEXP_REPLACE(REPLACE(COALESCE(${b2b_orders.order_number}, ''), '#', ''), '\s+', '', 'g')) = ${normalizedOrderNumber}`,
    )
  }

  if (matchConditions.length === 0) return null

  const [order] = await db
    .select()
    .from(b2b_orders)
    .where(
      and(
        activeCodOrderCondition(b2b_orders.order_type, b2b_orders.order_status),
        or(...matchConditions),
      ),
    )
    .limit(1)

  return order || null
}

async function createMissingRemittanceFromOrder(params: {
  awbNumber: string
  orderNumber: string
  collectedAt?: Date
}) {
  const b2cOrder = await findB2cCodOrderForSettlement(params.awbNumber, params.orderNumber)
  if (b2cOrder) {
    return {
      ...(await createCodRemittance({
        orderId: b2cOrder.id,
        orderType: 'b2c',
        userId: b2cOrder.user_id,
        orderNumber: b2cOrder.order_number,
        awbNumber: b2cOrder.awb_number || params.awbNumber || undefined,
        courierPartner: b2cOrder.courier_partner || b2cOrder.integration_type || 'Courier',
        codAmount: Number(b2cOrder.order_amount || 0),
        codCharges: Number(b2cOrder.cod_charges || 0),
        freightCharges: Number(b2cOrder.freight_charges ?? b2cOrder.shipping_charges ?? 0),
        collectedAt: params.collectedAt,
      })),
      sourceOrderStatus: b2cOrder.order_status || '',
    }
  }

  const b2bOrder = await findB2bCodOrderForSettlement(params.awbNumber, params.orderNumber)
  if (b2bOrder) {
    return {
      ...(await createCodRemittance({
        orderId: b2bOrder.id,
        orderType: 'b2b',
        userId: b2bOrder.user_id,
        orderNumber: b2bOrder.order_number,
        awbNumber: b2bOrder.awb_number || params.awbNumber || undefined,
        courierPartner: b2bOrder.courier_partner || b2bOrder.integration_type || 'Courier',
        codAmount: Number(b2bOrder.order_amount || 0),
        codCharges: Number(b2bOrder.cod_charges || 0),
        freightCharges: Number(b2bOrder.freight_charges ?? b2bOrder.shipping_charges ?? 0),
        collectedAt: params.collectedAt,
      })),
      sourceOrderStatus: b2bOrder.order_status || '',
    }
  }

  return null
}

/**
 * Admin: Parse and Preview Courier Settlement CSV
 * Step 1: Upload CSV and show preview for review
 */
export const previewCourierSettlementCsv = async (req: any, res: Response): Promise<any> => {
  try {
    const { courierPartner, csvData } = req.body

    if (!courierPartner || !csvData) {
      return res.status(400).json({
        success: false,
        message: 'courierPartner and csvData are required',
      })
    }

    // Parse CSV
    const { data: records, errors } = Papa.parse<Record<string, string>>(csvData, {
      header: true,
      skipEmptyLines: true,
    })

    if (errors && errors.length > 0) {
      console.error('CSV Parse errors:', errors)
      return res.status(400).json({
        success: false,
        message: 'Failed to parse CSV file',
        errors: errors.map((e: any) => e.message),
      })
    }

    console.log(`📊 Parsing ${records.length} records from ${courierPartner} CSV...`)

    // DEBUG: Log CSV column names
    if (records.length > 0) {
      const sampleRow = records[0]
      console.log('📋 CSV Column Names:', Object.keys(sampleRow))
      console.log('📄 Sample Row:', sampleRow)
    }

    const results = {
      total: records.length,
      matched: [] as any[],
      notFound: [] as any[],
      alreadyCredited: [] as any[],
      discrepancies: [] as any[],
      errors: [] as any[],
    }

    // Get courier-specific field mappings
    const mappings = COURIER_CSV_MAPPINGS[courierPartner as keyof typeof COURIER_CSV_MAPPINGS]
    if (!mappings) {
      return res.status(400).json({
        success: false,
        message: `Unsupported courier partner: ${courierPartner}`,
      })
    }

    console.log(`🔍 Using mappings for ${courierPartner}:`, mappings)

    // Process each row
    for (let i = 0; i < records.length; i++) {
      const row = records[i]
      try {
        // Extract AWB using courier-specific mapping
        const awbRaw = extractField(row, mappings.awb, courierPartner)
        const awbNumber = normalizeAwb(awbRaw)

        if (!awbNumber) {
          // DEBUG: Show which row failed and why
          console.log(`❌ Row ${i + 1}: No AWB found. Available columns:`, Object.keys(row))
          results.errors.push({ row, error: 'No AWB number found' })
          continue
        }

        // DEBUG: Log first 3 AWBs to verify extraction
        if (i < 3) {
          console.log(`✅ Row ${i + 1}: Extracted AWB = "${awbNumber}"`)
        }

        // Extract amounts using courier-specific mapping
        const remittableAmountStr = extractField(row, mappings.remittableAmount, courierPartner)
        const courierRemittableAmount = parseAmount(remittableAmountStr)

        // Extract UTR (optional in CSV, can be entered manually later)
        const utr = extractField(row, mappings.utr, courierPartner)
        const csvOrderNumber = extractField(row, mappings.orderNumber, courierPartner)
        const settlementDate = parseSettlementDate(
          extractField(row, mappings.settlementDate, courierPartner),
        )
        let autoCreated = false
        let sourceOrderStatus = ''

        // Find in our database
        let [remittance] = await db
          .select()
          .from(codRemittances)
          .where(
            or(
              eq(codRemittances.awbNumber, awbRaw),
              ilike(codRemittances.awbNumber, awbRaw),
              sql`UPPER(REPLACE(COALESCE(${codRemittances.awbNumber}, ''), ' ', '')) = ${awbNumber}`,
            ),
          )
          .limit(1)

        // Fallback by order number if AWB match fails
        if (!remittance && csvOrderNumber) {
          ;[remittance] = await db
            .select()
            .from(codRemittances)
            .where(ilike(codRemittances.orderNumber, csvOrderNumber))
            .limit(1)
        }

        if (!remittance) {
          const recovered = await createMissingRemittanceFromOrder({
            awbNumber,
            orderNumber: csvOrderNumber,
            collectedAt: settlementDate,
          })

          if (recovered?.remittance) {
            remittance = recovered.remittance
            autoCreated = recovered.created
            sourceOrderStatus = recovered.sourceOrderStatus
          }
        }

        if (!remittance) {
          // DEBUG: Log why not found
          if (i < 3) {
            console.log(`❌ AWB "${awbNumber}" not found in database`)
          }
          results.notFound.push({
            awb: awbNumber,
            orderNumber: csvOrderNumber || 'Unknown',
            courierAmount: courierRemittableAmount ?? 0,
            utr,
          })
          continue
        }

        // DEBUG: Log found remittances
        if (i < 3) {
          console.log(`✅ Found remittance for AWB "${awbNumber}":`, {
            id: remittance.id,
            orderNumber: remittance.orderNumber,
            status: remittance.status,
            ourAmount: remittance.remittableAmount,
          })
        }

        // Check if already credited
        if (remittance.status === 'credited') {
          results.alreadyCredited.push({
            remittanceId: remittance.id,
            awb: awbNumber,
            orderNumber: remittance.orderNumber,
            creditedAt: remittance.creditedAt,
            creditedAmount: remittance.remittableAmount,
          })
          continue
        }

        const ourAmount = parseFloat(remittance.remittableAmount)
        const difference =
          courierRemittableAmount !== null ? courierRemittableAmount - ourAmount : null

        // Create match object
        const matchData = {
          remittanceId: remittance.id,
          awb: awbNumber,
          orderNumber: remittance.orderNumber,
          userId: remittance.userId,
          courierAmount: courierRemittableAmount,
          ourAmount,
          difference,
          matched: difference !== null && Math.abs(difference) < 1, // Within ₹1
          utr,
          courierPartner,
          settlementDate: settlementDate?.toISOString(),
          amountMissing: courierRemittableAmount === null,
          autoCreated,
          sourceOrderStatus,
        }

        if (difference !== null && Math.abs(difference) < 1) {
          results.matched.push(matchData)
        } else {
          results.discrepancies.push(matchData)
        }
      } catch (error: any) {
        results.errors.push({
          row,
          error: error.message,
        })
      }
    }

    // Summary
    const summary = {
      totalRecords: results.total,
      matched: results.matched.length,
      discrepancies: results.discrepancies.length,
      notFound: results.notFound.length,
      alreadyCredited: results.alreadyCredited.length,
      errors: results.errors.length,
      totalMatchedAmount: results.matched.reduce((sum, r) => sum + Number(r.courierAmount || 0), 0),
      totalDiscrepancyAmount: results.discrepancies.reduce(
        (sum, r) => sum + Number(r.courierAmount || 0),
        0,
      ),
    }

    console.log(`
    📊 CSV Preview Ready:
    ───────────────────────────────────────
    Total Records:       ${summary.totalRecords}
    Matched:             ${summary.matched} (₹${summary.totalMatchedAmount})
    Discrepancies:       ${summary.discrepancies}
    Already Credited:    ${summary.alreadyCredited}
    Not Found:           ${summary.notFound}
    Errors:              ${summary.errors}
    ───────────────────────────────────────
    `)

    return res.json({
      success: true,
      message: `Parsed ${summary.totalRecords} records. Ready for review.`,
      data: {
        summary,
        results,
      },
    })
  } catch (error: any) {
    console.error('[uploadCourierSettlementCsv] Error:', error)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process CSV',
    })
  }
}

/**
 * Admin: Confirm and mark selected remittances as settled
 * Step 2: After review, bulk settle selected orders
 */
export const confirmCourierSettlement = async (req: any, res: Response): Promise<any> => {
  try {
    const { remittances, utrNumber, settlementDate, courierPartner, settlementNotes } = req.body

    if (!remittances || !Array.isArray(remittances) || remittances.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'remittances array is required',
      })
    }

    if (!utrNumber) {
      return res.status(400).json({
        success: false,
        message: 'UTR number is required',
      })
    }

    console.log(`💳 Confirming ${remittances.length} remittances...`)

    const results = {
      total: remittances.length,
      credited: [] as any[],
      failed: [] as any[],
    }

    // Process each remittance
    const seenRemittances = new Set<string>()

    for (const item of remittances) {
      try {
        const { remittanceId, awb, courierAmount, orderNumber } = item

        if (!remittanceId) {
          results.failed.push({
            awb,
            orderNumber,
            error: 'Missing remittanceId',
          })
          continue
        }

        if (seenRemittances.has(remittanceId)) {
          results.failed.push({
            awb,
            orderNumber,
            error: 'Duplicate remittance in selection',
          })
          continue
        }
        seenRemittances.add(remittanceId)

        const parsedDate = settlementDate ? new Date(settlementDate) : new Date()
        const validSettledDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
        const parsedCourierAmount = Number(courierAmount)
        const settledAmount =
          Number.isFinite(parsedCourierAmount) && parsedCourierAmount > 0
            ? parsedCourierAmount
            : undefined
        const resolvedNotes = String(settlementNotes || '').trim()
        const rowNotes = String(item?.notes || '').trim()
        const finalNotes = [resolvedNotes, rowNotes].filter(Boolean).join(' | ')
        const creditNotes =
          finalNotes || `Settlement marked from ${courierPartner || 'Courier'} CSV upload via admin panel`

        // Mark remittance settled without touching wallet
        await markCodRemittanceSettled({
          remittanceId,
          settledDate: validSettledDate,
          utrNumber,
          settledAmount,
          notes: creditNotes,
          creditedBy: req.user?.sub || 'admin',
        })

        results.credited.push({
          remittanceId,
          awb,
          orderNumber,
          amount: settledAmount,
        })

        console.log(`✅ Settled ${awb}: ₹${settledAmount ?? 'system_amount'}`)
      } catch (error: any) {
        results.failed.push({
          awb: item.awb,
          orderNumber: item.orderNumber,
          error: error.message,
        })
        console.error(`❌ Failed to settle ${item.awb}:`, error.message)
      }
    }

    const totalCredited = results.credited.reduce((sum, r) => sum + r.amount, 0)

    console.log(`
    ✅ Settlement Confirmed:
    ───────────────────────────────────────
    Total Processed:     ${results.total}
    Successfully Settled: ${results.credited.length}
    Failed:              ${results.failed.length}
    Total Amount:        ₹${totalCredited}
    UTR:                 ${utrNumber}
    ───────────────────────────────────────
    `)

    return res.json({
      success: true,
      message: `Successfully settled ${results.credited.length} out of ${results.total} remittances`,
      data: {
        credited: results.credited.length,
        failed: results.failed.length,
        totalAmount: totalCredited,
        utrNumber,
        results,
      },
    })
  } catch (error: any) {
    console.error('[confirmCourierSettlement] Error:', error)
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to confirm settlement',
    })
  }
}

/**
 * Get CSV template for manual entry
 */
export const getSettlementCsvTemplate = async (req: any, res: Response): Promise<any> => {
  const template = `AWB,Order Number,COD Amount,Remittable Amount,Settlement Date,UTR Number
AWB123456,ORD001,1500,1420,2025-01-15,NEFT12345
AWB123457,ORD002,2000,1910,2025-01-15,NEFT12345`

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename=settlement_template.csv')
  return res.send('\uFEFF' + template)
}

/**
 * DEBUG: Check COD remittances in database
 * Helps diagnose why CSV matching isn't working
 */
export const debugCodRemittances = async (req: any, res: Response): Promise<any> => {
  try {
    // Get sample of pending COD remittances
    const sampleRemittances = await db
      .select()
      .from(codRemittances)
      .where(eq(codRemittances.status, 'pending'))
      .limit(10)

    // Get total counts
    const allRemittances = await db.select().from(codRemittances).limit(100)

    const stats = {
      total: allRemittances.length,
      pending: allRemittances.filter((r) => r.status === 'pending').length,
      credited: allRemittances.filter((r) => r.status === 'credited').length,
      withAwb: allRemittances.filter((r) => r.awbNumber && r.awbNumber.trim() !== '').length,
      withoutAwb: allRemittances.filter((r) => !r.awbNumber || r.awbNumber.trim() === '').length,
    }

    const sampleAwbs = sampleRemittances.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      awbNumber: r.awbNumber,
      status: r.status,
      amount: r.remittableAmount,
    }))

    return res.json({
      success: true,
      message: 'Database diagnostic complete',
      stats,
      samplePendingRemittances: sampleAwbs,
      tip: 'Check if AWB numbers exist and match your CSV format',
    })
  } catch (error: any) {
    console.error('[debugCodRemittances] Error:', error)
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}
