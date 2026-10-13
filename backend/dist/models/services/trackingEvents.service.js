"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logTrackingEvent = logTrackingEvent;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const trackingEvents_1 = require("../schema/trackingEvents");
async function logTrackingEvent(params) {
    const { orderId, userId, awbNumber, courier, statusCode, statusText, location, raw } = params;
    const normalizedStatusCode = statusCode?.trim() || null;
    const normalizedStatusText = statusText?.trim() || null;
    const serializedRaw = raw == null ? null : JSON.stringify(raw);
    await client_1.db.execute((0, drizzle_orm_1.sql) `
    insert into ${trackingEvents_1.tracking_events} (
      order_id,
      user_id,
      awb_number,
      courier,
      status_code,
      status_text,
      location,
      raw,
      created_at,
      updated_at
    ) values (
      ${orderId},
      ${userId},
      ${awbNumber || null},
      ${courier || null},
      ${normalizedStatusCode},
      ${normalizedStatusText},
      ${location || null},
      ${serializedRaw}::jsonb,
      now(),
      now()
    )
    on conflict (
      order_id,
      lower(btrim(coalesce(status_code, ''))),
      lower(btrim(coalesce(status_text, '')))
    ) do update set
      user_id = excluded.user_id,
      awb_number = coalesce(excluded.awb_number, tracking_events.awb_number),
      courier = coalesce(excluded.courier, tracking_events.courier),
      location = coalesce(excluded.location, tracking_events.location),
      raw = coalesce(excluded.raw, tracking_events.raw),
      updated_at = now()
  `);
}
