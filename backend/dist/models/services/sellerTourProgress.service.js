"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSellerTourProgress = exports.getSellerTourProgress = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const sellerTourProgress_1 = require("../schema/sellerTourProgress");
const sellerTourProgress_logic_1 = require("./sellerTourProgress.logic");
const getSellerTourProgress = async (userId) => {
    const [row] = await client_1.db.select().from(sellerTourProgress_1.sellerTourProgress).where((0, drizzle_orm_1.eq)(sellerTourProgress_1.sellerTourProgress.userId, userId)).limit(1);
    if (!row || row.version !== sellerTourProgress_logic_1.SELLER_TOUR_VERSION)
        return (0, sellerTourProgress_logic_1.emptyTourProgress)();
    return {
        version: sellerTourProgress_logic_1.SELLER_TOUR_VERSION,
        status: row.status,
        completedPages: Array.isArray(row.completedPages) ? row.completedPages : [],
    };
};
exports.getSellerTourProgress = getSellerTourProgress;
const updateSellerTourProgress = async (userId, action, page) => {
    const current = await (0, exports.getSellerTourProgress)(userId);
    const next = (0, sellerTourProgress_logic_1.applyTourAction)(current, action, page);
    await client_1.db.insert(sellerTourProgress_1.sellerTourProgress).values({ userId, ...next, updatedAt: new Date() })
        .onConflictDoUpdate({
        target: sellerTourProgress_1.sellerTourProgress.userId,
        set: { ...next, updatedAt: new Date() },
    });
    return next;
};
exports.updateSellerTourProgress = updateSellerTourProgress;
