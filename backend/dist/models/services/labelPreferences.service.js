"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelPreferencesService = exports.DEFAULT_PREFERENCES = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const labelPreferences_1 = require("../schema/labelPreferences");
exports.DEFAULT_PREFERENCES = {
    printer_type: 'thermal',
    char_limit: 30,
    max_items: 4,
    order_info: {
        customerPhone: true,
        alternatePhone: false,
        billingGstin: false,
        ewayBillNumber: false,
        middleBarcode: false,
        orderNumber: true,
        skuBarcode: true,
    },
    shipper_info: {
        brandLogo: true,
        shipperName: true,
        shipperAddress: true,
        shipperPhone: true,
        gstin: true,
        returnName: true,
        returnAddress: true,
        returnPhone: true,
    },
    product_info: {
        productCost: true,
    },
    brand_logo: null,
    powered_by: 'Shipray',
    created_at: new Date(),
    updated_at: new Date(),
};
exports.labelPreferencesService = {
    async getByUser(userId) {
        const [prefs] = await client_1.db
            .select()
            .from(labelPreferences_1.labelPreferences)
            .where((0, drizzle_orm_1.eq)(labelPreferences_1.labelPreferences.user_id, userId));
        if (prefs) {
            return prefs;
        }
        // Fallback defaults
        return {
            id: null,
            user_id: userId,
            ...exports.DEFAULT_PREFERENCES,
        };
    },
    async createOrUpdate(userId, data) {
        const [existing] = await client_1.db
            .select()
            .from(labelPreferences_1.labelPreferences)
            .where((0, drizzle_orm_1.eq)(labelPreferences_1.labelPreferences.user_id, userId));
        if (existing) {
            const [updated] = await client_1.db
                .update(labelPreferences_1.labelPreferences)
                .set({ ...data, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(labelPreferences_1.labelPreferences.user_id, userId))
                .returning();
            return updated;
        }
        else {
            const [created] = await client_1.db
                .insert(labelPreferences_1.labelPreferences)
                .values({ user_id: userId, ...exports.DEFAULT_PREFERENCES, ...data })
                .returning();
            return created;
        }
    },
};
