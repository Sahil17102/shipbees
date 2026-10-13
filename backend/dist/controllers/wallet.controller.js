"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalletTransactionsController = exports.getUserWalletBalance = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const users_1 = require("../models/schema/users");
const wallet_1 = require("../models/schema/wallet");
const wallet_service_1 = require("../models/services/wallet.service");
const walletTopupService_1 = require("../models/services/walletTopupService");
const merchantContext_1 = require("../utils/merchantContext");
const walletTransactionCategory_1 = require("../utils/walletTransactionCategory");
const getUserWalletBalance = async (req, res) => {
    try {
        const sessionUserId = (0, merchantContext_1.getMerchantUserIdFromRequest)(req);
        if (!sessionUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        const userId = await (0, merchantContext_1.resolveMerchantUserId)(sessionUserId);
        const [userRecord] = await client_1.db.select({ id: users_1.users.id }).from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId)).limit(1);
        const [walletRecord] = await client_1.db
            .select({ id: wallet_1.wallets.id, userId: wallet_1.wallets.userId, balance: wallet_1.wallets.balance })
            .from(wallet_1.wallets)
            .where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId))
            .limit(1);
        if (!userRecord) {
            return res.status(401).json({ error: 'User not found for this session. Please log in again.' });
        }
        console.log('Wallet balance lookup debug:', {
            tokenSub: req.user?.actorSub || req.user?.sub || null,
            merchantUserId: userId,
            userExists: Boolean(userRecord),
            walletExistsForMerchant: Boolean(walletRecord),
            walletId: walletRecord?.id ?? null,
        });
        const balance = await (0, walletTopupService_1.getOrCreateWalletOfUser)(userId);
        res.status(200).json({ message: 'success', data: { ...balance } });
    }
    catch (error) {
        if (String(error?.message || '').includes('User not found for wallet lookup')) {
            return res.status(401).json({ error: 'User not found for this session. Please log in again.' });
        }
        console.error('Wallet balance error:', error);
        res.status(404).json({ error: 'Wallet not found' });
    }
};
exports.getUserWalletBalance = getUserWalletBalance;
const getWalletTransactionsController = async (req, res) => {
    try {
        const sessionUserId = (0, merchantContext_1.getMerchantUserIdFromRequest)(req);
        if (!sessionUserId)
            return res.status(401).json({ message: 'Unauthorized' });
        const userId = await (0, merchantContext_1.resolveMerchantUserId)(sessionUserId);
        const { limit = 50, page = 1, type, // 'credit' | 'debit'
        dateFrom, // ISO string
        dateTo, // ISO string
        category, search, } = req.query;
        const parsedCategory = (0, walletTransactionCategory_1.parseWalletTransactionCategory)(category);
        if (category && !parsedCategory) {
            return res.status(400).json({ message: 'Invalid wallet transaction category' });
        }
        const offset = (Number(page) - 1) * Number(limit);
        const transactions = await (0, wallet_service_1.getUserWalletTransactions)({
            userId,
            limit: Number(limit),
            offset,
            type: type,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
            category: parsedCategory,
            search: typeof search === 'string' ? search : undefined,
        });
        return res.status(200).json(transactions);
    }
    catch (err) {
        console.error('Error fetching wallet transactions:', err);
        return res.status(500).json({ message: 'Something went wrong', error: err.message });
    }
};
exports.getWalletTransactionsController = getWalletTransactionsController;
