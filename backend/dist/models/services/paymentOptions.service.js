"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentOptions = getPaymentOptions;
exports.updatePaymentOptions = updatePaymentOptions;
const client_1 = require("../client");
const paymentOptions_1 = require("../schema/paymentOptions");
const gst_1 = require("../../utils/gst");
const drizzle_orm_1 = require("drizzle-orm");
let paymentOptionsSchemaReady = null;
const ensurePaymentOptionsSchema = () => {
    if (!paymentOptionsSchemaReady) {
        paymentOptionsSchemaReady = client_1.db
            .execute((0, drizzle_orm_1.sql) `
        ALTER TABLE payment_options
          ADD COLUMN IF NOT EXISTS gst_percent NUMERIC(6, 2) DEFAULT '0'
      `)
            .then(() => client_1.db.execute((0, drizzle_orm_1.sql) `
          UPDATE payment_options
          SET gst_percent = '0'
          WHERE gst_percent IS NULL
        `))
            .then(() => client_1.db.execute((0, drizzle_orm_1.sql) `
          ALTER TABLE payment_options
            ALTER COLUMN gst_percent SET DEFAULT '0',
            ALTER COLUMN gst_percent SET NOT NULL
        `))
            .then(() => undefined)
            .catch((err) => {
            paymentOptionsSchemaReady = null;
            throw err;
        });
    }
    return paymentOptionsSchemaReady;
};
/**
 * Get payment options settings
 * Returns the first (and only) row, or creates default if none exists
 */
async function getPaymentOptions() {
    await ensurePaymentOptionsSchema();
    const [settings] = await client_1.db.select().from(paymentOptions_1.paymentOptions).limit(1);
    if (settings) {
        return settings;
    }
    // Create default settings (both enabled by default)
    const [newSettings] = await client_1.db
        .insert(paymentOptions_1.paymentOptions)
        .values({
        codEnabled: true,
        prepaidEnabled: true,
        minWalletRecharge: 0,
        gstPercent: 0,
    })
        .returning();
    return newSettings;
}
/**
 * Update payment options settings
 */
async function updatePaymentOptions(updates) {
    // Ensure settings exist
    await getPaymentOptions();
    const updateData = { updatedAt: new Date() };
    if (updates.codEnabled !== undefined) {
        updateData.codEnabled = updates.codEnabled;
    }
    if (updates.prepaidEnabled !== undefined) {
        updateData.prepaidEnabled = updates.prepaidEnabled;
    }
    if (updates.minWalletRecharge !== undefined) {
        const value = Number(updates.minWalletRecharge);
        updateData.minWalletRecharge = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    }
    if (updates.gstPercent !== undefined) {
        updateData.gstPercent = (0, gst_1.normalizeGstPercent)(updates.gstPercent);
    }
    // Update the first (and only) row
    const [updated] = await client_1.db.update(paymentOptions_1.paymentOptions).set(updateData).returning();
    // If no rows exist, create one
    if (!updated) {
        const [newSettings] = await client_1.db
            .insert(paymentOptions_1.paymentOptions)
            .values({
            codEnabled: updates.codEnabled ?? true,
            prepaidEnabled: updates.prepaidEnabled ?? true,
            minWalletRecharge: updates.minWalletRecharge !== undefined && !isNaN(Number(updates.minWalletRecharge))
                ? Math.max(0, Math.floor(Number(updates.minWalletRecharge)))
                : 0,
            gstPercent: updates.gstPercent !== undefined && !isNaN(Number(updates.gstPercent))
                ? (0, gst_1.normalizeGstPercent)(updates.gstPercent)
                : 0,
        })
            .returning();
        return newSettings;
    }
    return updated;
}
