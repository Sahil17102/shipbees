"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportAllCodRemittances = exports.updateRemittanceNotes = exports.manualMarkSettlement = exports.getUserCodRemittances = exports.getCodPlatformStats = exports.getCodPayableReportController = exports.getAllCodRemittances = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const csv_1 = require("../../utils/csv");
const client_1 = require("../../models/client");
const codRemittance_1 = require("../../models/schema/codRemittance");
const users_1 = require("../../models/schema/users");
const wallet_1 = require("../../models/schema/wallet");
const bankAccounts_1 = require("../../models/schema/bankAccounts");
const codPayableReport_service_1 = require("../../models/services/codPayableReport.service");
const codRemittance_service_1 = require("../../models/services/codRemittance.service");
const parseDateParam = (value) => {
    if (!value)
        return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
};
const endOfDay = (date) => {
    if (!date)
        return undefined;
    const out = new Date(date);
    out.setHours(23, 59, 59, 999);
    return out;
};
const parseCodPayableQuery = (query) => {
    const rawStatus = String(query.status || 'pending');
    const status = rawStatus === 'credited' || rawStatus === 'all' || rawStatus === 'pending'
        ? rawStatus
        : 'pending';
    return {
        status,
        fromDate: parseDateParam(query.fromDate),
        toDate: endOfDay(parseDateParam(query.toDate)),
        search: query.search || undefined,
        courierPartner: query.courierPartner || undefined,
        customerId: query.customerId || undefined,
        limit: query.limit ? Number(query.limit) : undefined,
    };
};
/**
 * Admin: Get all COD remittances across all users
 */
const getAllCodRemittances = async (req, res) => {
    try {
        const { status, fromDate, toDate, search, page = 1, limit = 50 } = req.query;
        const dateColumn = status === 'credited' ? codRemittance_1.codRemittances.creditedAt : codRemittance_1.codRemittances.collectedAt;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const conditions = [];
        if (req.query.userId)
            conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, String(req.query.userId)));
        if (req.query.courierPartner)
            conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.courierPartner, String(req.query.courierPartner)));
        if (status) {
            conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, status));
        }
        if (fromDate) {
            conditions.push((0, drizzle_orm_1.gte)(dateColumn, new Date(fromDate)));
        }
        if (toDate) {
            const inclusiveToDate = new Date(toDate);
            inclusiveToDate.setHours(23, 59, 59, 999);
            conditions.push((0, drizzle_orm_1.lte)(dateColumn, inclusiveToDate));
        }
        if (search) {
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(codRemittance_1.codRemittances.orderNumber, `%${search}%`), (0, drizzle_orm_1.like)(codRemittance_1.codRemittances.awbNumber, `%${search}%`), (0, drizzle_orm_1.like)(users_1.users.email, `%${search}%`)));
        }
        // Fetch remittances with user info
        const remittances = await client_1.db
            .select({
            id: codRemittance_1.codRemittances.id,
            cycleName: codRemittance_1.codRemittances.cycleName,
            cycleFee: codRemittance_1.codRemittances.cycleFee,
            eligibleAt: codRemittance_1.codRemittances.eligibleAt,
            settledAmount: codRemittance_1.codRemittances.settledAmount,
            feeTransactionId: codRemittance_1.codRemittances.feeTransactionId,
            userId: codRemittance_1.codRemittances.userId,
            userEmail: users_1.users.email,
            // userName: users.name,
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
            createdAt: codRemittance_1.codRemittances.createdAt,
            bankHolderName: bankAccounts_1.bankAccounts.accountHolder,
        })
            .from(codRemittance_1.codRemittances)
            .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, users_1.users.id))
            .leftJoin(bankAccounts_1.bankAccounts, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, codRemittance_1.codRemittances.userId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.isPrimary, true)))
            .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.createdAt))
            .limit(parseInt(limit))
            .offset(offset);
        const [countResult] = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(codRemittance_1.codRemittances)
            .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, users_1.users.id))
            .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined);
        return res.json({
            success: true,
            data: {
                remittances: remittances.map((remittance) => ({
                    ...remittance,
                    referenceId: remittance.walletTransactionId || remittance.id,
                    bankHolderName: remittance.bankHolderName || 'N/A',
                    amount: Number(remittance.settledAmount || remittance.remittableAmount || 0),
                    dateTime: remittance.creditedAt || remittance.collectedAt || remittance.createdAt,
                })),
                totalCount: Number(countResult?.count || 0),
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(Number(countResult?.count || 0) / parseInt(limit)),
            },
        });
    }
    catch (error) {
        console.error('[getAllCodRemittances] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch remittances' });
    }
};
exports.getAllCodRemittances = getAllCodRemittances;
/**
 * Admin: COD payable/receivables report for delivered COD orders.
 */
const getCodPayableReportController = async (req, res) => {
    try {
        const data = await (0, codPayableReport_service_1.getCodPayableReport)(parseCodPayableQuery(req.query));
        return res.json({ success: true, data });
    }
    catch (error) {
        console.error('[getCodPayableReportController] Error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to fetch COD payable report',
        });
    }
};
exports.getCodPayableReportController = getCodPayableReportController;
/**
 * Admin: Get platform-wide COD statistics
 */
const getCodPlatformStats = async (req, res) => {
    try {
        // Total credited remittances
        const [creditedStats] = await client_1.db
            .select({
            count: (0, drizzle_orm_1.sql) `count(*)`,
            totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
        })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited'));
        // Total pending remittances
        const [pendingStats] = await client_1.db
            .select({
            count: (0, drizzle_orm_1.sql) `count(*)`,
            totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
        })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'pending'));
        // Unique users with pending remittances
        const [usersWithPending] = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `COUNT(DISTINCT ${codRemittance_1.codRemittances.userId})` })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'pending'));
        // Today's credited remittances
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [todayStats] = await client_1.db
            .select({
            count: (0, drizzle_orm_1.sql) `count(*)`,
            totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
        })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited'), (0, drizzle_orm_1.gte)(codRemittance_1.codRemittances.creditedAt, today)));
        return res.json({
            success: true,
            data: {
                totalCredited: {
                    count: Number(creditedStats?.count || 0),
                    amount: Number(creditedStats?.totalAmount || 0),
                },
                totalPending: {
                    count: Number(pendingStats?.count || 0),
                    amount: Number(pendingStats?.totalAmount || 0),
                },
                usersWithPending: Number(usersWithPending?.count || 0),
                todayCredited: {
                    count: Number(todayStats?.count || 0),
                    amount: Number(todayStats?.totalAmount || 0),
                },
            },
        });
    }
    catch (error) {
        console.error('[getCodPlatformStats] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch platform stats' });
    }
};
exports.getCodPlatformStats = getCodPlatformStats;
/**
 * Admin: Get user-specific COD remittances
 */
const getUserCodRemittances = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID required' });
        }
        // Get user details
        const [user] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        // Get remittances
        const remittances = await client_1.db
            .select()
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId))
            .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.createdAt))
            .limit(50);
        // Get stats
        const [creditedStats] = await client_1.db
            .select({
            count: (0, drizzle_orm_1.sql) `count(*)`,
            totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
        })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'credited')));
        const [pendingStats] = await client_1.db
            .select({
            count: (0, drizzle_orm_1.sql) `count(*)`,
            totalAmount: (0, drizzle_orm_1.sql) `COALESCE(SUM(${codRemittance_1.codRemittances.remittableAmount}), 0)`,
        })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, userId), (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, 'pending')));
        // Get wallet balance
        const [wallet] = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId));
        return res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    // name: user.name,
                },
                stats: {
                    credited: {
                        count: Number(creditedStats?.count || 0),
                        amount: Number(creditedStats?.totalAmount || 0),
                    },
                    pending: {
                        count: Number(pendingStats?.count || 0),
                        amount: Number(pendingStats?.totalAmount || 0),
                    },
                    walletBalance: Number(wallet?.balance || 0),
                },
                remittances,
            },
        });
    }
    catch (error) {
        console.error('[getUserCodRemittances] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch user remittances' });
    }
};
exports.getUserCodRemittances = getUserCodRemittances;
/**
 * Admin: Mark COD remittance settled when courier settles
 * Real-world flow: Courier sends money → Admin receives it → Admin marks settlement here
 */
const manualMarkSettlement = async (req, res) => {
    try {
        const { remittanceId } = req.params;
        const { settledDate, utrNumber, settledAmount, notes } = req.body || {};
        const numericSettledAmount = settledAmount !== undefined ? Number(settledAmount) : undefined;
        if (!remittanceId) {
            return res.status(400).json({ success: false, message: 'Remittance ID required' });
        }
        if (numericSettledAmount !== undefined && (!Number.isFinite(numericSettledAmount) || numericSettledAmount <= 0)) {
            return res.status(400).json({ success: false, message: 'Invalid settled amount. Must be greater than 0.' });
        }
        // Mark settlement using the service function
        const updated = await (0, codRemittance_service_1.markCodRemittanceSettled)({
            remittanceId,
            settledDate: settledDate ? new Date(settledDate) : new Date(), // Default to now
            utrNumber: utrNumber || `MANUAL-${Date.now()}`, // Auto-generate if not provided
            settledAmount: numericSettledAmount,
            notes: notes || 'Settlement marked by admin',
            creditedBy: req.user?.sub || 'admin',
        });
        return res.json({
            success: true,
            message: 'COD remittance marked settled successfully',
            data: updated,
        });
    }
    catch (error) {
        console.error('[manualMarkSettlement] Error:', error);
        return res.status(400).json({
            success: false,
            message: error.message || 'Failed to mark settlement',
        });
    }
};
exports.manualMarkSettlement = manualMarkSettlement;
/**
 * Admin: Update remittance notes
 */
const updateRemittanceNotes = async (req, res) => {
    try {
        const { remittanceId } = req.params;
        const { notes } = req.body;
        if (!remittanceId) {
            return res.status(400).json({ success: false, message: 'Remittance ID required' });
        }
        const [updated] = await client_1.db
            .update(codRemittance_1.codRemittances)
            .set({
            notes,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittanceId))
            .returning();
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        console.error('[updateRemittanceNotes] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update notes' });
    }
};
exports.updateRemittanceNotes = updateRemittanceNotes;
/**
 * Admin: Export all COD remittances as CSV
 */
const exportAllCodRemittances = async (req, res) => {
    try {
        const { status, fromDate, toDate } = req.query;
        const dateColumn = status === 'credited' ? codRemittance_1.codRemittances.creditedAt : codRemittance_1.codRemittances.collectedAt;
        const conditions = [];
        if (req.query.userId)
            conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, String(req.query.userId)));
        if (req.query.courierPartner)
            conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.courierPartner, String(req.query.courierPartner)));
        if (req.query.search)
            conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.like)(codRemittance_1.codRemittances.orderNumber, `%${req.query.search}%`), (0, drizzle_orm_1.like)(codRemittance_1.codRemittances.awbNumber, `%${req.query.search}%`), (0, drizzle_orm_1.like)(users_1.users.email, `%${req.query.search}%`)));
        if (status) {
            conditions.push((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.status, status));
        }
        if (fromDate) {
            conditions.push((0, drizzle_orm_1.gte)(dateColumn, new Date(fromDate)));
        }
        if (toDate) {
            const inclusiveToDate = new Date(toDate);
            inclusiveToDate.setHours(23, 59, 59, 999);
            conditions.push((0, drizzle_orm_1.lte)(dateColumn, inclusiveToDate));
        }
        const remittances = await client_1.db
            .select({
            id: codRemittance_1.codRemittances.id,
            orderNumber: codRemittance_1.codRemittances.orderNumber,
            awbNumber: codRemittance_1.codRemittances.awbNumber,
            userEmail: users_1.users.email,
            cycleName: codRemittance_1.codRemittances.cycleName,
            cycleFee: codRemittance_1.codRemittances.cycleFee,
            eligibleAt: codRemittance_1.codRemittances.eligibleAt,
            settledAmount: codRemittance_1.codRemittances.settledAmount,
            feeTransactionId: codRemittance_1.codRemittances.feeTransactionId,
            walletTransactionId: codRemittance_1.codRemittances.walletTransactionId,
            notes: codRemittance_1.codRemittances.notes,
            createdAt: codRemittance_1.codRemittances.createdAt,
            bankHolderName: bankAccounts_1.bankAccounts.accountHolder,
            // userName: users.name,
            courierPartner: codRemittance_1.codRemittances.courierPartner,
            codAmount: codRemittance_1.codRemittances.codAmount,
            deductions: codRemittance_1.codRemittances.deductions,
            remittableAmount: codRemittance_1.codRemittances.remittableAmount,
            status: codRemittance_1.codRemittances.status,
            collectedAt: codRemittance_1.codRemittances.collectedAt,
            creditedAt: codRemittance_1.codRemittances.creditedAt,
        })
            .from(codRemittance_1.codRemittances)
            .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.userId, users_1.users.id))
            .leftJoin(bankAccounts_1.bankAccounts, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, codRemittance_1.codRemittances.userId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.isPrimary, true)))
            .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(codRemittance_1.codRemittances.createdAt))
            .limit(10000);
        const headers = [
            'Reference ID',
            'Bank Holder Name',
            'Amount',
            'Date & Time',
            'Status',
            'Order Number',
            'AWB',
            'User Email',
            'User Name',
            'Courier',
            'COD Amount',
            'Settlement Adjustments',
            'Remittable',
            'Status',
            'Collected At',
            'Credited At',
            'Cycle', 'Wallet Fee', 'Eligible At', 'Settled Amount', 'Fee Transaction', 'Notes',
        ];
        const rows = remittances.map((r) => [
            r.walletTransactionId || r.id || '',
            r.bankHolderName || 'N/A',
            r.settledAmount || r.remittableAmount || 0,
            r.creditedAt || r.collectedAt
                ? new Date(r.creditedAt || r.collectedAt).toISOString()
                : r.createdAt
                    ? new Date(r.createdAt).toISOString()
                    : '',
            r.status,
            r.orderNumber,
            r.awbNumber || 'N/A',
            r.userEmail || 'N/A',
            r.userName || 'N/A',
            r.courierPartner || 'N/A',
            r.codAmount,
            r.deductions,
            r.remittableAmount,
            r.status,
            r.collectedAt ? new Date(r.collectedAt).toISOString() : 'N/A',
            r.creditedAt ? new Date(r.creditedAt).toISOString() : 'N/A',
            r.cycleName || '', r.cycleFee, r.eligibleAt || '', r.settledAmount || '', r.feeTransactionId || '', r.notes || '',
        ]);
        const csv = (0, csv_1.buildCsv)(headers, rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=admin_cod_remittances.csv');
        return res.send(csv);
    }
    catch (error) {
        console.error('[exportAllCodRemittances] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to export remittances' });
    }
};
exports.exportAllCodRemittances = exportAllCodRemittances;
