# India Post Integration

Shipray integrates the India Post Bulk Customer APIs through the `indiapost` courier provider. Sandbox and production credentials are deployment secrets and must never be committed.

## Environment

```env
INDIAPOST_ENV=sandbox
INDIAPOST_API_BASE=https://test.cept.gov.in/beextcustomer
INDIAPOST_MASTERDATA_BASE=https://test.cept.gov.in/bemasterdata
INDIAPOST_USERNAME=
INDIAPOST_PASSWORD=
INDIAPOST_CUSTOMER_ID=
INDIAPOST_CONTRACT_ID=
INDIAPOST_DROPOFF_OFFICE_ID=
INDIAPOST_TIMEOUT_MS=30000
INDIAPOST_WEBHOOK_SECRET=
INDIAPOST_WEBHOOK_ALLOWED_IPS=
```

For production, replace both API bases and all credentials with the exact values issued by India Post after UAT approval. Do not assume that the sandbox hostname is valid for production.

## India Post APIs

| Name | Method and India Post path | Shipray admin endpoint |
| --- | --- | --- |
| Access token | `POST /v1/access/login` | `GET /api/admin/indiapost/credentials/test` |
| Refresh token | `POST /v1/access/TokenWithRtoken` | Managed internally |
| Speed Post tariff | `GET /v1/speed-post/tariffs` | `POST /api/admin/indiapost/tariffs/speed-post` |
| Business Parcel tariff | `GET /v1/business-parcel-tariff/calculate` | `POST /api/admin/indiapost/tariffs/business-parcel` |
| Pincode search | `GET /v1/offices/limited-details` | `GET /api/admin/indiapost/pincodes` |
| JSON article booking | `POST /process-articles/:customId` | `POST /api/admin/indiapost/bookings/:customId` |
| File article booking | `POST /process-articles-file/:customId` | `POST /api/admin/indiapost/bookings-file/:customId` |
| Domestic address label | `POST /v1/label/create/domestic` | `POST /api/admin/indiapost/labels/domestic` |
| Outbound event download | `POST /v1/event/download` | `POST /api/admin/indiapost/events/download` |
| Bulk tracking | `POST /v1/tracking/bulk` | `POST /api/admin/indiapost/tracking/bulk` |

All Shipray admin endpoints require an authenticated admin. Configure these public callbacks in the India Post portal:

```text
Booking Events Webhook URL:
https://api.shipraylogistics.in/api/webhooks/indiapost/booking

Other Events Webhook URL:
https://api.shipraylogistics.in/api/webhooks/indiapost/other
```

Both URLs expose `GET` health checks for provider-side test buttons and accept `POST` event payloads. The legacy generic callback remains available at `https://api.shipraylogistics.in/api/webhooks/indiapost/events`.

The callback validates the customer ID and optional secret/IP allowlist, updates matching B2C or B2B orders, writes tracking history, and queues events received before their order is committed.

## Important Booking Constraint

The document conflicts on `barcode_no`: its field table says optional, but its booking validation list says required. Shipray therefore requires an India Post barcode before booking to prevent chargeable requests with invalid identifiers. A contract ID is also required. India Post must confirm how barcode ranges are allocated to this customer before the courier is enabled for sellers.

The JSON endpoint is capped at 999 articles because the document explicitly says to use it for payloads below 1,000. The file endpoint supports JSON files up to 5,000 articles. The document's separate 100,000-item validation message is inconsistent and is not used as the client limit.

## Verification

Run the non-chargeable contract suite:

```bash
npm run check:indiapost-apis
```

This validates login, refresh, tariffs, pincode lookup, both booking transports, PDF labels, XML events, bulk tracking, authorization headers, query names, and payload envelopes against a local mock. A real UAT booking must only be run with an India Post-issued contract ID, drop-off office, and test barcode.
