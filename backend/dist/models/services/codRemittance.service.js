"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCodRemittance = createCodRemittance;
exports.markCodRemittanceSettled = markCodRemittanceSettled;
exports.getCodRemittances = getCodRemittances;
exports.getCodRemittanceStats = getCodRemittanceStats;
exports.updateCodRemittanceNotes = updateCodRemittanceNotes;
exports.getCodDashboardSummary = getCodDashboardSummary;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../schema/schema");
const client_1 = require("../client");
const codRemittance_1 = require("../schema/codRemittance");
const codCycles_1 = require("../schema/codCycles");
const wallet_1 = require("../schema/wallet");
const bankAccounts_1 = require("../schema/bankAccounts");
const codRemittance_2 = require("../../utils/codRemittance");
const invoiceStatement_service_1 = require("./invoiceStatement.service");
const sellerTransactionalEmail_service_1 = require("./sellerTransactionalEmail.service");
/**
 * Create a COD remittance entry when an order is delivered with COD
 * DOES NOT automatically credit wallet - waits for actual courier settlement
 * Real-world flow: Order delivered → Create pending remittance → Wait for courier to settle
 */
async function createCodRemittance(params) {
    const { orderId, orderType, userId, orderNumber, awbNumber, courierPartner, codAmount, codCharges, freightCharges, collectedAt, } = params;
    const normalizedFreightCharges = Number(freightCharges);
    const { deductions, remittableAmount } = (0, codRemittance_2.calculateCodRemittanceAmounts)({
        codAmount,
        codCharges,
        freightCharges: normalizedFreightCharges,
    });
    // Idempotency guard: delivered webhooks can be retried.
    const [existingRemittance] = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.orderId, orderId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.orderType, orderType)))
        .limit(1);
    if (existingRemittance) {
        console.log(`ℹ️ COD remittance already exists for order ${orderNumber} (status: ${existingRemittance.status})`);
        return { remittance: existingRemittance, created: false };
    }
    // Create remittance entry with PENDING status
    const [assignment] = await client_1.db.select({ cycle: codCycles_1.codCycles }).from(codCycles_1.sellerCodCycles)
        .innerJoin(codCycles_1.codCycles, (0, drizzle_orm_1.eq)(codCycles_1.codCycles.id, codCycles_1.sellerCodCycles.cycleId))
        .where((0, drizzle_orm_1.eq)(codCycles_1.sellerCodCycles.userId, userId));
    const cycle = assignment?.cycle;
    const collectedDate = collectedAt || new Date();
    const [remittance] = await client_1.db
        .insert(codRemittance_1.codRemittances)
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
        notes: `COD collected by ${courierPartner || 'courier'}. Awaiting settlement from courier partner.`,
    })
        .returning();
    console.log(`📦 COD Remittance created (PENDING): ₹${remittableAmount} for order ${orderNumber}. Waiting for courier settlement.`);
    return { remittance, created: true };
}
/**
 * Mark COD remittance as settled when courier actually settles the payment.
 * This should not touch wallet balance or create wallet transactions.
 */
async function markCodRemittanceSettled(params) {
    const { remittanceId, settledDate, utrNumber, settledAmount, notes, creditedBy } = params;
    return await client_1.db
        .transaction(async (tx) => {
        // 1. Get the remittance
        const [remittance] = await tx
            .select()
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittanceId))
            .for('update');
        if (!remittance) {
            throw new Error(`Remittance not found: ${remittanceId}`);
        }
        if (remittance.status === 'credited') {
            throw new Error(`Remittance already credited: ${remittance.orderNumber}`);
        }
        const settlementTime = settledDate || new Date();
        if (!Number.isFinite(settlementTime.getTime()) || settlementTime.getTime() > Date.now() + 60000)
            throw new Error('Settlement date must be valid and cannot be in the future.');
        if (remittance.eligibleAt && settlementTime < remittance.eligibleAt) {
            throw new Error(`This remittance is eligible from ${remittance.eligibleAt.toISOString()} (${remittance.cycleName}).`);
        }
        // cycleFee stores the configured remittance fee percentage for the cycle.
        const feePercent = Number(remittance.cycleFee || 0);
        const amountToCredit = settledAmount !== undefined ? Number(settledAmount) : Number(remittance.remittableAmount);
        if (!Number.isFinite(amountToCredit) || amountToCredit <= 0) {
            throw new Error('Invalid settled amount. Amount to credit must be greater than 0.');
        }
        const fee = Number(((amountToCredit * feePercent) / 100).toFixed(2));
        let feeTransactionId = null;
        if (fee > 0) {
            const [wallet] = await tx.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, remittance.userId)).for('update');
            if (!wallet || Number(wallet.balance) < fee)
                throw new Error(`Insufficient wallet balance for the remittance fee of Rs ${fee.toFixed(2)}.`);
            await tx.update(wallet_1.wallets).set({ balance: (0, drizzle_orm_1.sql) `${wallet_1.wallets.balance} - ${fee}`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(wallet_1.wallets.id, wallet.id));
            const [transaction] = await tx.insert(wallet_1.walletTransactions).values({
                wallet_id: wallet.id, amount: fee, type: 'debit', ref: `cod-fee:${remittance.id}`,
                reason: 'COD remittance cycle fee',
                meta: { remittanceId: remittance.id, orderNumber: remittance.orderNumber, awb: remittance.awbNumber, cycleName: remittance.cycleName, cycleDays: remittance.cycleDays, feePercent, feeAmount: fee, settlementAmount: amountToCredit, utrNumber, creditedBy, notes, balanceBefore: wallet.balance },
            }).returning();
            feeTransactionId = transaction.id;
        }
        // 3. Update remittance status only. COD settlements stay in COD remittance flow,
        // not in wallet balance or wallet transactions.
        const adminNote = creditedBy
            ? `Marked settled by admin (ID: ${creditedBy}). `
            : 'Marked settled via settlement reconciliation. ';
        const fullNotes = `${remittance.notes || ''}\n${adminNote}${notes || ''} ${utrNumber ? `UTR: ${utrNumber}` : ''} Cycle: ${remittance.cycleName || 'Legacy'}; wallet fee: ${feePercent.toFixed(2)}% = Rs ${fee.toFixed(2)}; settled: Rs ${amountToCredit.toFixed(2)}.`;
        const [updatedRemittance] = await tx
            .update(codRemittance_1.codRemittances)
            .set({
            status: 'credited',
            creditedAt: settledDate || new Date(),
            walletTransactionId: null,
            feeTransactionId,
            settledAmount: amountToCredit.toFixed(2),
            notes: fullNotes.trim(),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittance.id))
            .returning();
        // 6. Auto-create COD offsets for pending invoices (optional automation)
        let autoOffsetInvoiceId = null;
        try {
            const pendingInvoices = await tx
                .select()
                .from(schema_1.billingInvoices)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.billingInvoices.sellerId, remittance.userId), (0, drizzle_orm_1.eq)(schema_1.billingInvoices.status, 'pending')))
                .orderBy(schema_1.billingInvoices.createdAt); // oldest first
            // Check if any offset already exists for this remittance
            const [existingOffset] = await tx
                .select()
                .from(schema_1.invoiceCodOffsets)
                .where((0, drizzle_orm_1.eq)(schema_1.invoiceCodOffsets.codRemittanceId, remittance.id))
                .limit(1);
            if (!existingOffset && pendingInvoices.length > 0) {
                // Auto-apply to oldest pending invoice
                const targetInvoice = pendingInvoices[0];
                await tx.insert(schema_1.invoiceCodOffsets).values({
                    invoiceId: targetInvoice.id,
                    sellerId: remittance.userId,
                    codRemittanceId: remittance.id,
                    amount: amountToCredit.toString(),
                });
                autoOffsetInvoiceId = targetInvoice.id;
                console.log(`💰 Auto-created COD offset: ₹${amountToCredit} for invoice ${targetInvoice.invoiceNo}`);
            }
        }
        catch (offsetErr) {
            // Don't fail the credit transaction if offset creation fails
            console.error('Failed to auto-create COD offset:', offsetErr);
        }
        console.log(`✅ COD Remittance marked settled: ₹${amountToCredit} for order ${remittance.orderNumber}`);
        return { updatedRemittance, autoOffsetInvoiceId };
    })
        .then(async (result) => {
        // After transaction commits, check if invoice should be auto-marked as paid
        if (result.autoOffsetInvoiceId) {
            try {
                const stmt = await (0, invoiceStatement_service_1.getInvoiceStatement)(result.autoOffsetInvoiceId);
                if (stmt.outstanding <= 0) {
                    const [inv] = await client_1.db
                        .select()
                        .from(schema_1.billingInvoices)
                        .where((0, drizzle_orm_1.eq)(schema_1.billingInvoices.id, result.autoOffsetInvoiceId))
                        .limit(1);
                    if (inv && inv.status !== 'paid') {
                        await client_1.db
                            .update(schema_1.billingInvoices)
                            .set({ status: 'paid', updatedAt: new Date() })
                            .where((0, drizzle_orm_1.eq)(schema_1.billingInvoices.id, result.autoOffsetInvoiceId));
                        console.log(`✅ Auto-marked invoice ${inv.invoiceNo} as paid (outstanding = 0)`);
                    }
                }
            }
            catch (err) {
                // Don't fail if auto-paid check fails
                console.error('Failed to auto-mark invoice as paid:', err);
            }
        }
        void (0, sellerTransactionalEmail_service_1.sendSellerCodSettledEmail)({
            userId: result.updatedRemittance.userId,
            orderNumber: result.updatedRemittance.orderNumber,
            awbNumber: result.updatedRemittance.awbNumber,
            courier: result.updatedRemittance.courierPartner,
            amount: Number(result.updatedRemittance.settledAmount || result.updatedRemittance.remittableAmount),
            utrNumber,
            cycleName: result.updatedRemittance.cycleName,
            cycleFee: Number(result.updatedRemittance.cycleFee || 0),
            settledAt: result.updatedRemittance.creditedAt,
        }).catch((error) => console.error('Failed to send COD settlement email:', error));
        return result.updatedRemittance;
    });
}
/**
 * Get all COD remittances for a user with filters
 */
async function getCodRemittances(userId, filters = {}) {
    const { status, fromDate, toDate, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;
    const conditions = [(0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId)];
    if (status) {
        conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, status));
    }
    if (fromDate) {
        conditions.push((0, drizzle_orm_1.gte)(codRemittance_1.codRemittances.collectedAt, fromDate));
    }
    if (toDate) {
        conditions.push((0, drizzle_orm_1.lte)(codRemittance_1.codRemittances.collectedAt, toDate));
    }
    const remittances = await client_1.db
        .select({
        id: codRemittance_1.codRemittances.id,
        userId: codRemittance_1.codRemittances.userId,
        orderId: codRemittance_1.codRemittances.orderId,
        orderType: codRemittance_1.codRemittances.orderType,
        orderNumber: codRemittance_1.codRemittances.orderNumber,
        awbNumber: codRemittance_1.codRemittances.awbNumber,
        courierPartner: codRemittance_1.codRemittances.courierPartner,
        codAmount: codRemittance_1.codRemittances.codAmount,
        codCharges: codRemittance_1.codRemittances.codCharges,
        shippingCharges: codRemittance_1.codRemittances.shippingCharges,
        deductions: codRemittance_1.codRemittances.deductions,
        remittableAmount: codRemittance_1.codRemittances.remittableAmount,
        status: codRemittance_1.codRemittances.status,
        collectedAt: codRemittance_1.codRemittances.collectedAt,
        creditedAt: codRemittance_1.codRemittances.creditedAt,
        walletTransactionId: codRemittance_1.codRemittances.walletTransactionId,
        notes: codRemittance_1.codRemittances.notes,
        cycleName: codRemittance_1.codRemittances.cycleName,
        cycleDays: codRemittance_1.codRemittances.cycleDays,
        cycleFee: codRemittance_1.codRemittances.cycleFee,
        eligibleAt: codRemittance_1.codRemittances.eligibleAt,
        settledAmount: codRemittance_1.codRemittances.settledAmount,
        feeTransactionId: codRemittance_1.codRemittances.feeTransactionId,
        createdAt: codRemittance_1.codRemittances.createdAt,
        bankHolderName: bankAccounts_1.bankAccounts.accountHolder,
    })
        .from(codRemittance_1.codRemittances)
        .leftJoin(bankAccounts_1.bankAccounts, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, codRemittance_1.codRemittances.userId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.isPrimary, true)))
        .where((0, drizzle_orm_1.and)(...conditions))
        .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.createdAt))
        .limit(limit)
        .offset(offset);
    const [countResult] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)(...conditions));
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
    };
}
/**
 * Get COD remittance statistics for a user
 */
async function getCodRemittanceStats(userId) {
    // Total credited remittances (Remitted Till Date)
    const [creditedStats] = await client_1.db
        .select({
        count: (0, drizzle_orm_1.sql) `count(*)`,
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
    })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited')));
    // Total pending remittances (Next Remittance/Total Due)
    const [pendingStats] = await client_1.db
        .select({
        count: (0, drizzle_orm_1.sql) `count(*)`,
        totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
    })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'pending')));
    // Get last credited remittance
    const [lastRemittance] = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited')))
        .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.creditedAt))
        .limit(1);
    return {
        remittedTillDate: Number(creditedStats?.totalAmount || 0),
        lastRemittance: lastRemittance ? Number(lastRemittance.remittableAmount) : 0,
        nextRemittance: Number(pendingStats?.totalAmount || 0),
        totalDue: Number(pendingStats?.totalAmount || 0),
        // Additional info
        creditedCount: Number(creditedStats?.count || 0),
        pendingCount: Number(pendingStats?.count || 0),
    };
}
/**
 * Update remittance notes (status is auto-managed)
 */
async function updateCodRemittanceNotes(remittanceId, notes) {
    const [updated] = await client_1.db
        .update(codRemittance_1.codRemittances)
        .set({
        notes,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittanceId))
        .returning();
    return updated;
}
/**
 * Get COD dashboard summary
 */
async function getCodDashboardSummary(userId) {
    const stats = await getCodRemittanceStats(userId);
    // Get recent remittances
    const recentRemittances = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId))
        .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.createdAt))
        .limit(10);
    return {
        stats,
        recentRemittances,
    };
}
