"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustWalletBalance = exports.getWalletTransactions = exports.getWallet = exports.exportWalletMisReportCsv = exports.getWalletMisReport = exports.listWallets = void 0;
const adminWallet_service_1 = require("../../models/services/adminWallet.service");
const wallet_service_1 = require("../../models/services/wallet.service");
const csv_1 = require("../../utils/csv");
const walletTransactionCategory_1 = require("../../utils/walletTransactionCategory");
const WALLET_MIS_HEADERS = [
    'Customer Name',
    'Customer id',
    'transaction Date',
    'wallet transaction Amount',
    'Transaction against',
    'transaction type',
    'AWB',
    'Courier partner name',
    'Weight',
];
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
const parseNumberParam = (value) => {
    if (value === undefined || value === null || value === '')
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const parseWalletMisQuery = (query) => {
    const queryType = query.type;
    const type = queryType === 'credit' || queryType === 'debit' ? queryType : undefined;
    const dateFrom = parseDateParam(query.dateFrom);
    const dateTo = endOfDay(parseDateParam(query.dateTo));
    return {
        page: parseInt(query.page || '1'),
        limit: parseInt(query.limit || '50'),
        search: query.search || undefined,
        customerId: query.customerId || undefined,
        type,
        transactionAgainst: query.transactionAgainst || undefined,
        dateFrom,
        dateTo,
        awb: query.awb || undefined,
        courier: query.courier || undefined,
        minWeight: parseNumberParam(query.minWeight),
        maxWeight: parseNumberParam(query.maxWeight),
        shipmentOnly: query.shipmentOnly === 'true',
    };
};
const listWallets = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search || '';
        const sortBy = req.query.sortBy ||
            'updatedAt';
        const sortOrder = req.query.sortOrder || 'desc';
        const result = await (0, adminWallet_service_1.getAllWallets)({
            page,
            limit,
            search,
            sortBy,
            sortOrder,
        });
        res.status(200).json({ success: true, ...result });
    }
    catch (error) {
        console.error('Error fetching wallets:', error);
        res.status(500).json({ success: false, message: 'Server error fetching wallets' });
    }
};
exports.listWallets = listWallets;
const getWalletMisReport = async (req, res) => {
    try {
        const result = await (0, adminWallet_service_1.getConsolidatedWalletMisReport)(parseWalletMisQuery(req.query));
        res.status(200).json({ success: true, ...result });
    }
    catch (error) {
        console.error('Error fetching wallet MIS report:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Server error fetching wallet MIS report',
        });
    }
};
exports.getWalletMisReport = getWalletMisReport;
const exportWalletMisReportCsv = async (req, res) => {
    try {
        const query = parseWalletMisQuery(req.query);
        const rows = await (0, adminWallet_service_1.getConsolidatedWalletMisExportRows)({
            ...query,
            limit: parseInt(req.query.limit || '5000'),
        });
        const csv = (0, csv_1.buildCsv)(WALLET_MIS_HEADERS, rows);
        const today = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="wallet_mis_${today}.csv"`);
        return res.status(200).send(csv);
    }
    catch (error) {
        console.error('Error exporting wallet MIS report:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Server error exporting wallet MIS report',
        });
    }
};
exports.exportWalletMisReportCsv = exportWalletMisReportCsv;
const getWallet = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const wallet = await (0, adminWallet_service_1.getWalletByUserId)(userId);
        res.status(200).json({ success: true, data: wallet });
    }
    catch (error) {
        console.error('Error fetching wallet:', error);
        if (error.message === 'Wallet not found for this user') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error fetching wallet' });
    }
};
exports.getWallet = getWallet;
const getWalletTransactions = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '50');
        const type = req.query.type;
        const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : undefined;
        const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : undefined;
        const category = (0, walletTransactionCategory_1.parseWalletTransactionCategory)(req.query.category);
        if (req.query.category && !category) {
            return res.status(400).json({ success: false, message: 'Invalid wallet transaction category' });
        }
        const result = await (0, adminWallet_service_1.getWalletTransactionsByUserId)({
            userId,
            page,
            limit,
            type,
            dateFrom,
            dateTo,
            category,
        });
        res.status(200).json({ success: true, ...result });
    }
    catch (error) {
        console.error('Error fetching wallet transactions:', error);
        if (error.message === 'Wallet not found for this user') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error fetching wallet transactions' });
    }
};
exports.getWalletTransactions = getWalletTransactions;
const adjustWalletBalance = async (req, res) => {
    try {
        const { userId } = req.params;
        const { type, amount, reason, notes } = req.body;
        if (!userId || !type || !amount || !reason) {
            return res.status(400).json({
                success: false,
                message: 'userId, type, amount, and reason are required',
            });
        }
        if (type !== 'credit' && type !== 'debit') {
            return res.status(400).json({
                success: false,
                message: 'type must be either "credit" or "debit"',
            });
        }
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({
                success: false,
                message: 'amount must be a positive number',
            });
        }
        // Get wallet
        const wallet = await (0, adminWallet_service_1.getWalletByUserId)(userId);
        // Create transaction
        await (0, wallet_service_1.createWalletTransaction)({
            walletId: wallet.id,
            amount: amountNum,
            type: type,
            reason: reason,
            ref: `admin_adjustment_${Date.now()}`,
            allowNegativeBalance: type === 'debit',
            meta: {
                adjustedBy: req.user?.sub,
                notes: notes || '',
                timestamp: new Date().toISOString(),
            },
        });
        // Get updated wallet
        const updatedWallet = await (0, adminWallet_service_1.getWalletByUserId)(userId);
        res.status(200).json({
            success: true,
            message: `Wallet ${type === 'credit' ? 'credited' : 'debited'} successfully`,
            data: updatedWallet,
        });
    }
    catch (error) {
        console.error('Error adjusting wallet balance:', error);
        if (error.message === 'Wallet not found for this user') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message === 'Insufficient wallet balance') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error adjusting wallet balance' });
    }
};
exports.adjustWalletBalance = adjustWalletBalance;
