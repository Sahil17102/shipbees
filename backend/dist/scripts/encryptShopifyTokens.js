"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const stores_1 = require("../models/schema/stores");
const shopifyTokenEncryption_1 = require("../utils/shopifyTokenEncryption");
const SHOPIFY_PLATFORM_ID = 1;
const run = async () => {
    const shopifyStores = await client_1.db.select().from(stores_1.stores).where((0, drizzle_orm_1.eq)(stores_1.stores.platformId, SHOPIFY_PLATFORM_ID));
    let updated = 0;
    for (const store of shopifyStores) {
        const accessToken = (0, shopifyTokenEncryption_1.encryptShopifyToken)(store.adminApiAccessToken);
        if (accessToken.length > 255) {
            throw new Error(`Encrypted Shopify access token exceeds the stores column limit for ${store.id}`);
        }
        const metadata = (0, shopifyTokenEncryption_1.encryptShopifyStoreMetadata)(store.metadata && typeof store.metadata === 'object' ? store.metadata : {});
        if (accessToken === store.adminApiAccessToken && JSON.stringify(metadata) === JSON.stringify(store.metadata)) {
            continue;
        }
        await client_1.db
            .update(stores_1.stores)
            .set({ adminApiAccessToken: accessToken, metadata, updatedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(stores_1.stores.id, store.id));
        updated += 1;
    }
    console.log(`Shopify token encryption migration complete: ${updated}/${shopifyStores.length} stores updated`);
};
run()
    .catch((error) => {
    console.error('Shopify token encryption migration failed:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end();
});
