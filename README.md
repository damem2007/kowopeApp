# Kowope — React + TypeScript application with SQLite / hosted PostgreSQL adapters

This is a consolidated source tree based on the supplied `kowope.zip` and
selected prior database changes. It uses **React components** for the frontend
instead of directly assigning HTML strings to `innerHTML`. The existing Express
HTTP endpoints, business features, styles, and encryption routines are retained.

## Local setup

Use Node.js 20.19+ and a development environment with npm access.

```bash
npm install
cp .env.example .env
```

For existing SQLite users, set:

```env
DATABASE_CLIENT=sqlite
SQLITE_DATABASE_PATH=./data/invoices.db
VAULT_KEY=<the current key used to encrypt existing records>
```

For a newly provisioned **hosted** PostgreSQL database, set:

```env
DATABASE_CLIENT=postgres
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:5432/DB?sslmode=require
VAULT_KEY=<the existing key if transferring data>
```

Initialize a **new, empty** remote PostgreSQL database **once**:

```bash
node scripts/init-remote-postgres.js
```

For an existing PostgreSQL database with baseline version 1 already applied,
back it up and apply each missing numbered migration in order:

```bash
node scripts/apply-remote-numbering-pg.js
node scripts/apply-remote-recurring-duration-pg.js
node scripts/apply-remote-payment-scope-pg.js
node scripts/apply-remote-invoice-number-scope-pg.js
```

The API verifies these PostgreSQL migration versions during startup and reports
the exact missing script if the hosted schema is behind the application.

Start the API and frontend in separate terminals:

```bash
npm run dev:api
npm run dev
```

Frontend: `http://localhost:5173`; Express API: `http://localhost:3001`.
The API requests use the Vite dev proxy. Run `npm run recurring` for the
scheduled-invoice worker; production cron can invoke `/internal/cron/run` with
`Authorization: Bearer $CRON_SECRET`.

## Architecture and ownership model

- `src/main.tsx` initializes React; `src/ui/render.tsx` owns one React root per
  `#root` container and safely reuses it during Vite module re-evaluation.
- `src/pages`, `src/modals`, and `src/ui/layout.tsx` return React elements rather
  than injecting HTML strings. Dedicated TSX components in `src/components`
  implement the invoice editor, preview, and business-numbering settings.
- `src/actions` retains the established fetch and state behavior. Components
  import action and rendering functions directly; there is no `window` action
  bridge or `legacy-globals.d.ts` compatibility layer.
- Personal records are scoped by `user_id` when `organization_id` is `NULL`.
  Organization records are scoped through the active organization, while the
  creating user ID remains available for audit purposes.
- `server/services/invoice-numbering.js` is the **only backend formatter and
  allocator**. Manual invoice creation and `server/services/recurrence.js` call
  it using the selected business profile.
- Invoice display numbers are unique within their issuing `business_profile_id`.
  Internal invoice UUIDs—not display numbers—identify invoice actions,
  payments, recurring sources, delivery, and downloads.
- `server/db/index.js` is the **only database initializer** for API and worker;
  `sqlite-async-adapter.js` and `postgres-adapter.js` implement the same contract.
- `server/db/migrations.js` remains the historical SQLite migration ledger;
  PostgreSQL has its own schema and migration SQL.
- `server/security/crypto.js` is unchanged. Always retain `VAULT_KEY` when
  transferring existing encrypted data.

## Invoice numbering

Each saved business profile has its own prefix, format, padding, sequence, and
uniqueness scope. Multiple businesses may therefore use the same visible
invoice number without colliding.

When adding a past invoice, an entered invoice number is authoritative—for
example, a number issued by an external system. It is rejected only if that
same business profile already uses it. Leaving the field blank uses the
selected business profile's configured automatic format and sequence.

## Reporting

The Reports page provides receivables, collections, aging, invoice and payment
registers, and recurring-service forecasts. Report data can be scoped to the
account/active organization, filtered by business profile or client, and—only
for platform owners—viewed at platform scope.

Amounts remain grouped by their transaction currency. Kowope intentionally does
not combine currencies unless ledger-grade exchange-rate data is introduced.
The UI retains a future accounting framework note: P&L, Balance Sheet, and Cash
Flow reports are not available until Kowope has ledger-grade accounting data.

## Theme support

Settings uses the shared light/dark theme tokens for its page background, cards,
forms, numbering controls, checkboxes, and business-logo controls. It no longer
forces light colors when the application is in dark mode.

## Preservation and migration cautions

Database migrations are data-preserving, but a release should still be
smoke-tested in staging. Check manual and recurring invoices, clients,
payments, authentication, integrations, and backups before deployment.

SQLite file backups remain implemented for SQLite through the unchanged backup
service. Hosted PostgreSQL cannot be backed up with a SQLite ZIP snapshot;
configure a provider backup and verified restores. The PostgreSQL API backup
endpoint explicitly reports unsupported rather than claiming success.

Migration SQL only backfills `business_profile_id` for historical records when
ownership is unambiguous. Records from multi-business organizations require a
manual ownership review. Existing invoice display numbers are never rewritten.
The invoice-number scope migration replaces the old global constraint with
business-profile-scoped uniqueness while retaining a legacy safeguard for
historical unassigned rows.

## Checks run

- `npm test` — access scoping, business-specific formats, invoice-number
  allocation, recurring behavior, rollback, and currency-preserving reporting.
- `npm run typecheck` — TypeScript validation across the React source.
- `npm run build` — production Vite build.

These are targeted checks and do not replace browser end-to-end tests or a
staging smoke test of external email providers.
