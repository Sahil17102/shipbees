"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDelhiveryCredentials = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const courierCredentials_1 = require("../schema/courierCredentials");
const DEFAULT_DELHIVERY_API_BASE = 'https://track.delhivery.com';
const DEFAULT_DELHIVERY_LTL_API_BASE = 'https://ltl-clients-api.delhivery.com';
const getDelhiveryCredentials = async () => {
    const [credentials] = await client_1.db
        .select({
        apiBase: courierCredentials_1.courier_credentials.apiBase,
        clientName: courierCredentials_1.courier_credentials.clientName,
        apiKey: courierCredentials_1.courier_credentials.apiKey,
        metadata: courierCredentials_1.courier_credentials.metadata,
    })
        .from(courierCredentials_1.courier_credentials)
        .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'))
        .limit(1);
    const metadata = credentials?.metadata && typeof credentials.metadata === 'object' ? credentials.metadata : {};
    return {
        apiBase: credentials?.apiBase || DEFAULT_DELHIVERY_API_BASE,
        clientName: credentials?.clientName || '',
        apiKey: credentials?.apiKey || '',
        ltlApiBase: String(metadata?.ltlApiBase || metadata?.ltl_api_base || '').trim() ||
            DEFAULT_DELHIVERY_LTL_API_BASE,
        ltlUsername: String(metadata?.ltlUsername || metadata?.ltl_username || '').trim(),
        ltlToken: String(metadata?.ltlToken || metadata?.ltl_token || '').trim(),
        ltlTokenExpiresAt: String(metadata?.ltlTokenExpiresAt ||
            metadata?.ltl_token_expires_at ||
            '').trim(),
        ltlEmail: String(metadata?.ltlEmail || metadata?.ltl_email || '').trim(),
        ltlPassword: String(metadata?.ltlPassword || metadata?.ltl_password || '').trim(),
    };
};
exports.getDelhiveryCredentials = getDelhiveryCredentials;
