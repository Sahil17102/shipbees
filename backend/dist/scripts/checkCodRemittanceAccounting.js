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
const assert_1 = __importDefault(require("assert"));
const path_1 = __importDefault(require("path"));
const codRemittance_1 = require("../utils/codRemittance");
const fullCod = (0, codRemittance_1.calculateCodRemittanceAmounts)({
    codAmount: 599,
    codCharges: 22,
    freightCharges: 33,
});
assert_1.default.deepStrictEqual(fullCod, {
    deductions: 0,
    remittableAmount: 599,
});
assert_1.default.deepStrictEqual((0, codRemittance_1.calculateCodRemittanceAmounts)({
    codAmount: 1399,
    codCharges: 500,
    freightCharges: 750,
}), {
    deductions: 0,
    remittableAmount: 1399,
});
assert_1.default.deepStrictEqual((0, codRemittance_1.calculateCodRemittanceAmounts)({ codAmount: 510.126 }), {
    deductions: 0,
    remittableAmount: 510.13,
});
assert_1.default.throws(() => (0, codRemittance_1.calculateCodRemittanceAmounts)({ codAmount: -1 }), /COD amount must be a non-negative number/);
const verifyDatabase = process.argv.includes('--database');
const verifyPendingDatabaseRows = async () => {
    const dotenv = await Promise.resolve().then(() => __importStar(require('dotenv')));
    const { Client } = await Promise.resolve().then(() => __importStar(require('pg')));
    dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.production') });
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required for the COD remittance database check');
    }
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    try {
        await client.connect();
        const result = await client.query(`
      SELECT
        COUNT(*)::int AS pending_count,
        COUNT(*) FILTER (
          WHERE deductions IS DISTINCT FROM 0::numeric
             OR remittable_amount IS DISTINCT FROM cod_amount
        )::int AS invalid_pending_count,
        COALESCE(SUM(cod_amount), 0)::numeric(14, 2)::text AS pending_cod_total,
        COALESCE(SUM(remittable_amount), 0)::numeric(14, 2)::text AS pending_remittable_total
      FROM cod_remittances
      WHERE status = 'pending'
    `);
        const row = result.rows[0];
        assert_1.default.strictEqual(row.invalid_pending_count, 0, `${row.invalid_pending_count} pending COD remittances still contain booking-charge deductions`);
        console.log('Pending COD remittance database check passed', row);
    }
    finally {
        await client.end().catch(() => undefined);
    }
};
if (verifyDatabase) {
    verifyPendingDatabaseRows().catch((error) => {
        console.error('COD remittance accounting check failed:', error);
        process.exit(1);
    });
}
else {
    console.log('COD remittance accounting checks passed');
}
