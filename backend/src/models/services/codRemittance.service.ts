import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { billingInvoices, invoiceCodOffsets } from '../../schema/schema'
import { db } from '../client'
import { codRemittances } from '../schema/codRemittance'
import { codCycles, sellerCodCycles } from '../schema/codCycles'
import { wallets, walletTransactions } from '../schema/wallet'
import { bankAccounts } from '../schema/bankAccounts'
import { calculateCodRemittanceAmounts } from '../../utils/codRemittance'
import { getInvoiceStatement } from './invoiceStatement.service'
import { sendSellerCodSettledEmail } from './sellerTransactionalEmail.service'

/**
 * Create a COD remittance entry when an order is delivered with COD
 * DOES NOT automatically credit wallet - waits for actual courier settlement
 * Real-world flow: Order delivered → Create pending remittance → Wait for courier to settle
 */
export async function createCodRemittance(params: {
  orderId: string
  orderType: 'b2c' | 'b2b'
  userId: string
  orderNumber: string
  awbNumber?: string
  courierPartner?: string
  codAmount: number
  codCharges: number
  freightCharges: number
  collectedAt?: Date
}): Promise<{ remittance: any; created: boolean }> {
  const {
    orderId,
    orderType,
    userId,
    orderNumber,
    awbNumber,
    courierPartner,
    codAmount,
    codCharges,
    freightCharges,
    collectedAt,
  } = params

  const normalizedFreightCharges = Number(freightCharges)
  const { deductions, remittableAmount } = calculateCodRemittanceAmounts({
    codAmount,
    codCharges,
    freightCharges: normalizedFreightCharges,
  })

  // Idempotency guard: delivered webhooks can be retried.
  const [existingRemittance] = await db
    .select()
    .from(codRemittances)
    .where(
      and(
        eq(codRemittances.userId, userId),
        eq(codRemittances.orderId, orderId),
        eq(codRemittances.orderType, orderType),
      ),
    )
    .limit(1)

  if (existingRemittance) {
    console.log(
      `ℹ️ COD remittance already exists for order ${orderNumber} (status: ${existingRemittance.status})`,
    )
    return { remittance: existingRemittance, created: false }
  }

  // Create remittance entry with PENDING status
  const [assignment] = await db.select({ cycle: codCycles }).from(sellerCodCycles)
    .innerJoin(codCycles, eq(codCycles.id, sellerCodCycles.cycleId))
    .where(eq(sellerCodCycles.userId, userId))
  const cycle = assignment?.cycle
  const collectedDate = collectedAt || new Date()
  const [remittance] = await db
    .insert(codRemittances)
    .values({
      userId,
      orderId,
      orderType,
      orderNumber,
      awbNumber: awbNumber || null,
      courierPartner: courierPartner || null,
      codAmount: codAmount.toString(),
      codCharges: codCharges.toString(),
      // Retained for audit only; booking charges are already debited from the seller wallet.
      shippingCharges: normalizedFreightCharges.toString(),
      deductions: deductions.toString(),
      remittableAmount: remittableAmount.toString(),
      status: 'pending', // ✅ PENDING - waiting for courier settlement
      cycleName: cycle?.name || null,
      cycleDays: cycle?.days ?? null,
      cycleFee: cycle?.fee || '0',
      eligibleAt: cycle ? new Date(collectedDate.getTime() + cycle.days * 86400000) : null,
      collectedAt: collectedAt || new Date(),
      notes: `COD collected by ${
        courierPartner || 'courier'
      }. Awaiting settlement from courier partner.`,
    })
    .returning()

  console.log(
    `📦 COD Remittance created (PENDING): ₹${remittableAmount} for order ${orderNumber}. Waiting for courier settlement.`,
  )

  return { remittance, created: true }
}

/**
 * Mark COD remittance as settled when courier actually settles the payment.
 * This should not touch wallet balance or create wallet transactions.
 */
export async function markCodRemittanceSettled(params: {
  remittanceId: string
  settledDate?: Date
  utrNumber?: string
  settledAmount?: number
  notes?: string
  creditedBy?: string // admin user ID
}) {
  const { remittanceId, settledDate, utrNumber, settledAmount, notes, creditedBy } = params

  return await db
    .transaction(async (tx) => {
      // 1. Get the remittance
      const [remittance] = await tx
        .select()
        .from(codRemittances)
        .where(eq(codRemittances.id, remittanceId))
        .for('update')

      if (!remittance) {
        throw new Error(`Remittance not found: ${remittanceId}`)
      }

      if (remittance.status === 'credited') {
        throw new Error(`Remittance already credited: ${remittance.orderNumber}`)
      }

      const settlementTime = settledDate || new Date()
      if (!Number.isFinite(settlementTime.getTime()) || settlementTime.getTime() > Date.now() + 60000) throw new Error('Settlement date must be valid and cannot be in the future.')
      if (remittance.eligibleAt && settlementTime < remittance.eligibleAt) {
        throw new Error(`This remittance is eligible from ${remittance.eligibleAt.toISOString()} (${remittance.cycleName}).`)
      }
      // cycleFee stores the configured remittance fee percentage for the cycle.
      const feePercent = Number(remittance.cycleFee || 0)
      const amountToCredit =
        settledAmount !== undefined ? Number(settledAmount) : Number(remittance.remittableAmount)

      if (!Number.isFinite(amountToCredit) || amountToCredit <= 0) {
        throw new Error('Invalid settled amount. Amount to credit must be greater than 0.')
      }

      const fee = Number(((amountToCredit * feePercent) / 100).toFixed(2))
      let feeTransactionId: string | null = null
      if (fee > 0) {
        const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, remittance.userId)).for('update')
        if (!wallet || Number(wallet.balance) < fee) throw new Error(`Insufficient wallet balance for the remittance fee of Rs ${fee.toFixed(2)}.`)
        await tx.update(wallets).set({ balance: sql`${wallets.balance} - ${fee}`, updatedAt: new Date() }).where(eq(wallets.id, wallet.id))
        const [transaction] = await tx.insert(walletTransactions).values({
          wallet_id: wallet.id, amount: fee, type: 'debit', ref: `cod-fee:${remittance.id}`,
          reason: 'COD remittance cycle fee',
          meta: { remittanceId: remittance.id, orderNumber: remittance.orderNumber, awb: remittance.awbNumber, cycleName: remittance.cycleName, cycleDays: remittance.cycleDays, feePercent, feeAmount: fee, settlementAmount: amountToCredit, utrNumber, creditedBy, notes, balanceBefore: wallet.balance },
        }).returning()
        feeTransactionId = transaction.id
      }

      // 3. Update remittance status only. COD settlements stay in COD remittance flow,
      // not in wallet balance or wallet transactions.
      const adminNote = creditedBy
        ? `Marked settled by admin (ID: ${creditedBy}). `
        : 'Marked settled via settlement reconciliation. '
      const fullNotes = `${remittance.notes || ''}\n${adminNote}${notes || ''} ${utrNumber ? `UTR: ${utrNumber}` : ''} Cycle: ${remittance.cycleName || 'Legacy'}; wallet fee: ${feePercent.toFixed(2)}% = Rs ${fee.toFixed(2)}; settled: Rs ${amountToCredit.toFixed(2)}.`

      const [updatedRemittance] = await tx
        .update(codRemittances)
        .set({
          status: 'credited',
          creditedAt: settledDate || new Date(),
          walletTransactionId: null,
          feeTransactionId,
          settledAmount: amountToCredit.toFixed(2),
          notes: fullNotes.trim(),
          updatedAt: new Date(),
        })
        .where(eq(codRemittances.id, remittance.id))
        .returning()

      // 6. Auto-create COD offsets for pending invoices (optional automation)
      let autoOffsetInvoiceId: string | null = null
      try {
        const pendingInvoices = await tx
          .select()
          .from(billingInvoices)
          .where(
            and(
              eq(billingInvoices.sellerId, remittance.userId),
              eq(billingInvoices.status, 'pending' as any),
            ),
          )
          .orderBy(billingInvoices.createdAt) // oldest first

        // Check if any offset already exists for this remittance
        const [existingOffset] = await tx
          .select()
          .from(invoiceCodOffsets)
          .where(eq(invoiceCodOffsets.codRemittanceId, remittance.id))
          .limit(1)

        if (!existingOffset && pendingInvoices.length > 0) {
          // Auto-apply to oldest pending invoice
          const targetInvoice = pendingInvoices[0]
          await tx.insert(invoiceCodOffsets).values({
            invoiceId: targetInvoice.id,
            sellerId: remittance.userId,
            codRemittanceId: remittance.id,
            amount: amountToCredit.toString(),
          })
          autoOffsetInvoiceId = targetInvoice.id
          console.log(
            `💰 Auto-created COD offset: ₹${amountToCredit} for invoice ${targetInvoice.invoiceNo}`,
          )
        }
      } catch (offsetErr) {
        // Don't fail the credit transaction if offset creation fails
        console.error('Failed to auto-create COD offset:', offsetErr)
      }

      console.log(
        `✅ COD Remittance marked settled: ₹${amountToCredit} for order ${remittance.orderNumber}`,
      )

      return { updatedRemittance, autoOffsetInvoiceId }
    })
    .then(async (result) => {
      // After transaction commits, check if invoice should be auto-marked as paid
      if (result.autoOffsetInvoiceId) {
        try {
          const stmt = await getInvoiceStatement(result.autoOffsetInvoiceId)
          if (stmt.outstanding <= 0) {
            const [inv] = await db
              .select()
              .from(billingInvoices)
              .where(eq(billingInvoices.id, result.autoOffsetInvoiceId))
              .limit(1)
            if (inv && inv.status !== 'paid') {
              await db
                .update(billingInvoices)
                .set({ status: 'paid', updatedAt: new Date() })
                .where(eq(billingInvoices.id, result.autoOffsetInvoiceId))
              console.log(`✅ Auto-marked invoice ${inv.invoiceNo} as paid (outstanding = 0)`)
            }
          }
        } catch (err) {
          // Don't fail if auto-paid check fails
          console.error('Failed to auto-mark invoice as paid:', err)
        }
      }
      void sendSellerCodSettledEmail({
        userId: result.updatedRemittance.userId,
        orderNumber: result.updatedRemittance.orderNumber,
        awbNumber: result.updatedRemittance.awbNumber,
        courier: result.updatedRemittance.courierPartner,
        amount: Number(result.updatedRemittance.settledAmount || result.updatedRemittance.remittableAmount),
        utrNumber,
        cycleName: result.updatedRemittance.cycleName,
        cycleFee: Number(result.updatedRemittance.cycleFee || 0),
        settledAt: result.updatedRemittance.creditedAt,
      }).catch((error) => console.error('Failed to send COD settlement email:', error))
      return result.updatedRemittance
    })
}

/**
 * Get all COD remittances for a user with filters
 */
export async function getCodRemittances(
  userId: string,
  filters: {
    status?: string
    fromDate?: Date
    toDate?: Date
    page?: number
    limit?: number
  } = {},
) {
  const { status, fromDate, toDate, page = 1, limit = 20 } = filters
  const offset = (page - 1) * limit

  const conditions = [eq(codRemittances.userId, userId)]

  if (status) {
    conditions.push(eq(codRemittances.status, status as any))
  }

  if (fromDate) {
    conditions.push(gte(codRemittances.collectedAt, fromDate))
  }

  if (toDate) {
    conditions.push(lte(codRemittances.collectedAt, toDate))
  }

  const remittances = await db
    .select({
      id: codRemittances.id,
      userId: codRemittances.userId,
      orderId: codRemittances.orderId,
      orderType: codRemittances.orderType,
      orderNumber: codRemittances.orderNumber,
      awbNumber: codRemittances.awbNumber,
      courierPartner: codRemittances.courierPartner,
      codAmount: codRemittances.codAmount,
      codCharges: codRemittances.codCharges,
      shippingCharges: codRemittances.shippingCharges,
      deductions: codRemittances.deductions,
      remittableAmount: codRemittances.remittableAmount,
      status: codRemittances.status,
      collectedAt: codRemittances.collectedAt,
      creditedAt: codRemittances.creditedAt,
      walletTransactionId: codRemittances.walletTransactionId,
      notes: codRemittances.notes,
      cycleName: codRemittances.cycleName,
      cycleDays: codRemittances.cycleDays,
      cycleFee: codRemittances.cycleFee,
      eligibleAt: codRemittances.eligibleAt,
      settledAmount: codRemittances.settledAmount,
      feeTransactionId: codRemittances.feeTransactionId,
      createdAt: codRemittances.createdAt,
      bankHolderName: bankAccounts.accountHolder,
    })
    .from(codRemittances)
    .leftJoin(
      bankAccounts,
      and(
        eq(bankAccounts.userId, codRemittances.userId),
        eq(bankAccounts.isPrimary, true),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(codRemittances.createdAt))
    .limit(limit)
    .offset(offset)

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(codRemittances)
    .where(and(...conditions))

  return {
    remittances: remittances.map((remittance) => ({
      ...remittance,
      referenceId: remittance.walletTransactionId || remittance.id,
      bankHolderName: remittance.bankHolderName || 'N/A',
      amount: Number(remittance.settledAmount || remittance.remittableAmount || 0),
      dateTime: remittance.creditedAt || remittance.collectedAt || remittance.createdAt,
    })),
    totalCount: Number(countResult?.count || 0),
    page,
    limit,
    totalPages: Math.ceil(Number(countResult?.count || 0) / limit),
  }
}

/**
 * Get COD remittance statistics for a user
 */
export async function getCodRemittanceStats(userId: string) {
  // Total credited remittances (Remitted Till Date)
  const [creditedStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
    })
    .from(codRemittances)
    .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'credited')))

  // Total pending remittances (Next Remittance/Total Due)
  const [pendingStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
    })
    .from(codRemittances)
    .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'pending')))

  // Get last credited remittance
  const [lastRemittance] = await db
    .select()
    .from(codRemittances)
    .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'credited')))
    .orderBy(desc(codRemittances.creditedAt))
    .limit(1)

  return {
    remittedTillDate: Number(creditedStats?.totalAmount || 0),
    lastRemittance: lastRemittance ? Number(lastRemittance.remittableAmount) : 0,
    nextRemittance: Number(pendingStats?.totalAmount || 0),
    totalDue: Number(pendingStats?.totalAmount || 0),
    // Additional info
    creditedCount: Number(creditedStats?.count || 0),
    pendingCount: Number(pendingStats?.count || 0),
  }
}

/**
 * Update remittance notes (status is auto-managed)
 */
export async function updateCodRemittanceNotes(remittanceId: string, notes: string) {
  const [updated] = await db
    .update(codRemittances)
    .set({
      notes,
      updatedAt: new Date(),
    })
    .where(eq(codRemittances.id, remittanceId))
    .returning()

  return updated
}

/**
 * Get COD dashboard summary
 */
export async function getCodDashboardSummary(userId: string) {
  const stats = await getCodRemittanceStats(userId)

  // Get recent remittances
  const recentRemittances = await db
    .select()
    .from(codRemittances)
    .where(eq(codRemittances.userId, userId))
    .orderBy(desc(codRemittances.createdAt))
    .limit(10)

  return {
    stats,
    recentRemittances,
  }
}
