# Backend feature migrations

Feature-specific SQL migrations live in `migrations/features` and use an ordered name:

```text
YYYYMMDD_NNN_description.sql
```

Run every pending migration from `backend/`:

```bash
npm run migrate:features
```

The runner loads `backend/.env.production` when `NODE_ENV=production`, obtains a
PostgreSQL advisory lock, and records the filename and SHA-256 checksum in
`shipray_schema_migrations`. Each pending file and its ledger entry run in one
transaction. Applied files must never be edited; add a new ordered SQL file instead.

Useful commands:

```bash
npm run migrate:features -- --list
npm run migrate:manual-couriers
npm run migrate:employee-management
```

The VPS release script runs `migrate:features` automatically before building and
restarting the backend.
