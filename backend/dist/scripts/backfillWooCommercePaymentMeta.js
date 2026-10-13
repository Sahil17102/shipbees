"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const stores_1 = require("../models/schema/stores");
const woocommerce_service_1 = require("../models/services/woocommerce.service");
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(process.cwd(), `.env.${env}`) });
const WOOCOMMERCE_PLATFORM_ID = 2;
const getArg = (name) => {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length).trim() : '';
};
const main = async () => {
    const userId = getArg('user-id');
    const storeId = getArg('store-id');
    const limit = Number(getArg('limit') || 1000);
    const storeRows = userId
        ? [{ userId, storeId }]
        : await client_1.db
            .select({ userId: stores_1.stores.userId, storeId: stores_1.stores.id })
            .from(stores_1.stores)
            .where((0, drizzle_orm_1.eq)(stores_1.stores.platformId, WOOCOMMERCE_PLATFORM_ID));
    const totals = { users: 0, checked: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
    for (const row of storeRows) {
        const result = await (0, woocommerce_service_1.syncExistingWooCommerceOrdersForUser)(row.userId, Number.isFinite(limit) ? limit : 1000, row.storeId || undefined);
        totals.users += 1;
        totals.checked += result.checked;
        totals.created += result.created;
        totals.updated += result.updated;
        totals.skipped += result.skipped;
        totals.failed += result.failed;
        console.log('WooCommerce existing payment refresh complete', {
            userId: row.userId,
            storeId: row.storeId || 'all',
            result,
        });
    }
    console.log('WooCommerce existing payment refresh totals', totals);
};
main().catch((error) => {
    console.error('WooCommerce existing payment refresh failed:', error);
    process.exit(1);
});
