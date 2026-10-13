import { sql } from 'drizzle-orm'
import { db } from '../client'
import { tracking_events } from '../schema/trackingEvents'

export async function logTrackingEvent(params: {
  orderId: string
  userId: string
  awbNumber?: string | null
  courier?: string | null
  statusCode?: string | null
  statusText?: string | null
  location?: string | null
  raw?: any
}) {
  const { orderId, userId, awbNumber, courier, statusCode, statusText, location, raw } = params
  const normalizedStatusCode = statusCode?.trim() || null
  const normalizedStatusText = statusText?.trim() || null
  const serializedRaw = raw == null ? null : JSON.stringify(raw)

  await db.execute(sql`
    insert into ${tracking_events} (
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
  `)
}
