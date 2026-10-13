"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const plans_1 = require("../models/schema/plans");
const shippingRates_1 = require("../models/schema/shippingRates");
const zones_1 = require("../models/schema/zones");
const rateCardImport_service_1 = require("../models/services/rateCardImport.service");
const TARGET_PROVIDER_NAMES = new Set(['amazon', 'delhivery']);
const TARGET_COURIER_IDS = [1, 66, 92, 93, 99, 100];
const usage = () => [
    'Usage:',
    '  NODE_ENV=production ts-node src/scripts/syncBasicB2CAmazonDelhiveryRates.ts <basic-ratecard.csv> [plan-name]',
    '',
    'Defaults:',
    '  plan-name = Basic',
].join('\n');
const normalizeText = (value) => String(value ?? '')
    .trim()
    .toLowerCase();
const rowMatchesTargetProvider = (row) => {
    const provider = normalizeText((0, rateCardImport_service_1.cell)(row, 'Service Provider'));
    const courierName = normalizeText((0, rateCardImport_service_1.cell)(row, 'Courier') || (0, rateCardImport_service_1.cell)(row, 'Courier Name'));
    const courierId = Number((0, rateCardImport_service_1.cell)(row, 'Courier ID'));
    if (TARGET_PROVIDER_NAMES.has(provider))
        return true;
    if (courierName.includes('amazon') || courierName.includes('delhivery'))
        return true;
    return Number.isFinite(courierId) && TARGET_COURIER_IDS.includes(courierId);
};
async function main() {
    const csvPathArg = process.argv[2];
    const planName = process.argv[3] || 'Basic';
    if (!csvPathArg) {
        throw new Error(usage());
    }
    const csvPath = path_1.default.resolve(csvPathArg);
    if (!fs_1.default.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
    }
    const [plan] = await client_1.db
        .select()
        .from(plans_1.plans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `lower(${plans_1.plans.name}) = ${planName.toLowerCase()}`, (0, drizzle_orm_1.eq)(plans_1.plans.business_type, 'b2c')))
        .limit(1);
    if (!plan) {
        throw new Error(`Plan not found: ${planName}`);
    }
    const b2cZones = await client_1.db
        .select({
        id: zones_1.zones.id,
        name: zones_1.zones.name,
        code: zones_1.zones.code,
        region: zones_1.zones.region,
    })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.sql) `lower(${zones_1.zones.business_type}) = 'b2c'`);
    if (!b2cZones.length) {
        throw new Error('No B2C zones found. Cannot import B2C rate cards.');
    }
    const csvText = fs_1.default.readFileSync(csvPath, 'utf8');
    const parsed = (0, rateCardImport_service_1.parseRateCardCsvText)(csvText);
    if (parsed.errors.length) {
        throw new Error(`CSV parse failed: ${parsed.errors
            .map((error) => `${error.code || 'parse'}: ${error.message}`)
            .join('; ')}`);
    }
    const targetRows = parsed.data.filter(rowMatchesTargetProvider);
    if (!targetRows.length) {
        throw new Error('No Amazon or Delhivery rows found in the supplied Basic CSV.');
    }
    const existingRows = await client_1.db
        .select({ id: shippingRates_1.shippingRates.id })
        .from(shippingRates_1.shippingRates)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, plan.id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c'), (0, drizzle_orm_1.inArray)(shippingRates_1.shippingRates.courier_id, TARGET_COURIER_IDS)));
    if (existingRows.length) {
        await client_1.db
            .delete(shippingRates_1.shippingRates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, plan.id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c'), (0, drizzle_orm_1.inArray)(shippingRates_1.shippingRates.courier_id, TARGET_COURIER_IDS)));
    }
    const savedRows = await (0, rateCardImport_service_1.importB2CSlabFormat)(targetRows, plan.id, b2cZones);
    console.log(JSON.stringify({
        plan: plan.name,
        csv: csvPath,
        targetRows: targetRows.length,
        deletedRows: existingRows.length,
        savedRows,
        zones: b2cZones.map((zone) => zone.code),
    }, null, 2));
}
main()
    .catch((err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end().catch(() => undefined);
});
