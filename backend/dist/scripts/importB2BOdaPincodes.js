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
const fs = __importStar(require("fs"));
const papaparse_1 = __importDefault(require("papaparse"));
const path = __importStar(require("path"));
const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'y']);
const FALSEY_VALUES = new Set(['0', 'false', 'no', 'n']);
const normalizeBoolean = (value) => {
    const normalized = String(value ?? '')
        .trim()
        .toLowerCase();
    if (!normalized)
        return undefined;
    if (TRUTHY_VALUES.has(normalized))
        return true;
    if (FALSEY_VALUES.has(normalized))
        return false;
    return undefined;
};
const normalizePincode = (value) => String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 6);
const resolveCsvValue = (row, keys) => {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};
const parseArgs = (args) => {
    const dryRun = args.includes('--dry-run');
    const csvPathArg = args.find((value) => !value.startsWith('--'));
    if (!csvPathArg) {
        throw new Error('CSV path is required. Usage: npm run import:b2b-oda -- "<path-to-csv>" [--dry-run]');
    }
    return {
        csvPath: path.resolve(process.cwd(), csvPathArg),
        dryRun,
    };
};
const parseCsv = (csvPath) => {
    if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
    }
    const csv = fs.readFileSync(csvPath, 'utf8');
    const parsed = papaparse_1.default.parse(csv, {
        header: true,
        skipEmptyLines: true,
    });
    if (parsed.errors?.length) {
        throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
    }
    const truePincodeSet = new Set();
    const invalidPincodes = [];
    let trueRows = 0;
    let falseRows = 0;
    let ignoredRows = 0;
    let duplicateTrueRows = 0;
    for (const row of parsed.data) {
        const pincode = normalizePincode(resolveCsvValue(row, ['Pin', 'PIN', 'Pincode', 'pincode']));
        const odaValue = normalizeBoolean(resolveCsvValue(row, ['ODA', 'oda', 'is_oda', 'isOda']));
        if (!/^\d{6}$/.test(pincode)) {
            invalidPincodes.push(resolveCsvValue(row, ['Pin', 'PIN', 'Pincode', 'pincode']) || '<blank>');
            continue;
        }
        if (odaValue === true) {
            trueRows += 1;
            if (truePincodeSet.has(pincode)) {
                duplicateTrueRows += 1;
            }
            truePincodeSet.add(pincode);
            continue;
        }
        if (odaValue === false) {
            falseRows += 1;
            continue;
        }
        ignoredRows += 1;
    }
    return {
        totalRows: parsed.data.length,
        trueRows,
        falseRows,
        ignoredRows,
        invalidPincodes,
        duplicateTrueRows,
        truePincodes: Array.from(truePincodeSet).sort(),
    };
};
const loadBackendEnv = () => {
    const env = process.env.NODE_ENV || 'development';
    const envFilePath = path.resolve(__dirname, `../../.env.${env}`);
    dotenv.config({ path: envFilePath });
    if (!process.env.DATABASE_URL) {
        throw new Error(`DATABASE_URL is missing. Expected it in ${envFilePath}`);
    }
    return { env, envFilePath };
};
const applyUpdates = async (truePincodes) => {
    const { envFilePath } = loadBackendEnv();
    console.log(`Using backend env: ${envFilePath}`);
    const [{ markExistingB2BPincodesAsOda }, { pool }] = await Promise.all([
        Promise.resolve().then(() => __importStar(require('../models/services/b2bAdmin.service'))),
        Promise.resolve().then(() => __importStar(require('../models/client'))),
    ]);
    try {
        return await markExistingB2BPincodesAsOda(truePincodes);
    }
    finally {
        await pool.end();
    }
};
async function main() {
    const { csvPath, dryRun } = parseArgs(process.argv.slice(2));
    const summary = parseCsv(csvPath);
    console.log(`CSV: ${csvPath}`);
    console.log(`Total rows read: ${summary.totalRows}`);
    console.log(`TRUE ODA rows to apply: ${summary.trueRows}`);
    console.log(`Unique TRUE pincodes: ${summary.truePincodes.length}`);
    console.log(`FALSE rows ignored: ${summary.falseRows}`);
    console.log(`Blank/unknown ODA rows ignored: ${summary.ignoredRows}`);
    console.log(`Duplicate TRUE rows collapsed: ${summary.duplicateTrueRows}`);
    console.log(`Invalid pincodes skipped: ${summary.invalidPincodes.length}`);
    if (summary.invalidPincodes.length) {
        console.log(`Invalid pincode sample: ${summary.invalidPincodes.slice(0, 10).join(', ')}`);
    }
    if (!summary.truePincodes.length) {
        console.log('No TRUE ODA pincodes found, so nothing will be updated.');
        return;
    }
    console.log(`TRUE pincode sample: ${summary.truePincodes.slice(0, 10).join(', ')}`);
    if (dryRun) {
        console.log('Dry run only. Database was not touched.');
        return;
    }
    const result = await applyUpdates(summary.truePincodes);
    console.log(`Requested unique pincodes: ${result.requestedPincodes}`);
    console.log(`Matched pincodes in DB: ${result.matchedPincodes}`);
    console.log(`Rows updated to ODA: ${result.updatedRows}`);
    console.log(`Missing pincodes in DB: ${result.missingPincodes.length}`);
    if (result.missingPincodes.length) {
        console.log(`Missing pincode sample: ${result.missingPincodes.slice(0, 20).join(', ')}`);
    }
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
