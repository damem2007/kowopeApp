# Kowope — React application with SQLite / hosted PostgreSQL adapters

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
back it up and apply only the numbered migration:

```bash
node scripts/apply-remote-numbering-pg.js
```

Start the API and frontend in separate terminals:

```bash
npm run dev:api
npm run dev
```

Frontend: `http://localhost:5173`; Express API: `http://localhost:3001`.
The API requests use the Vite dev proxy. Run `npm run recurring` for the
scheduled-invoice worker; production cron can invoke `/internal/cron/run` with
`Authorization: Bearer $CRON_SECRET`.

## Architectural and source consolidation

- `src/main.jsx` initializes React; `src/ui/render.js` uses `createRoot`.
- `src/pages`, `src/modals`, and `src/ui/layout.js` return React elements rather
  than injecting HTML strings. Dedicated JSX components in `src/components`
  implement the invoice editor, preview, and business-numbering settings.
- `src/actions` still handles existing fetch requests and legacy app state so
  feature behavior stays recognizable; a state-management rewrite was not part
  of this compatibility change.
- `server/services/invoice-numbering.js` is the **only backend formatter and
  allocator**. Manual invoice creation and `server/services/recurrence.js` call
  it using the selected business profile.
- `server/db/index.js` is the **only database initializer** for API and worker;
  `sqlite-async-adapter.js` and `postgres-adapter.js` implement the same contract.
- `server/db/migrations.js` remains the historical SQLite migration ledger;
  PostgreSQL has its own schema and migration SQL.
- `server/security/crypto.js` is unchanged. Always retain `VAULT_KEY` when
  transferring existing encrypted data.

## Preservation and migration cautions

**This is a source integration, not a verified production deployment.** No live
PostgreSQL server, existing SQLite file, external email provider, or browser E2E
suite was available for this run. Check the manual invoice, recurring invoice,
client, payments, authentication, integration and backup workflows in staging
before deploying. Do not overwrite the running application until smoke-tested.

SQLite file backups remain implemented for SQLite through the unchanged backup
service. Hosted PostgreSQL cannot be backed up with a SQLite ZIP snapshot;
configure a provider backup and verified restores. The PostgreSQL API backup
endpoint explicitly reports unsupported rather than claiming success.

Migration SQL only backfills `business_profile_id` for historical records when
ownership is unambiguous. Records from multi-business organizations require a
manual ownership review. Existing invoice identifiers are never rewritten.
The old globally unique `invoices.number` constraint remains for compatibility,
so different businesses choosing identical number formats can cause numbering
gaps. This does not change the displayed business format.

## Checks run

- `node --test tests/*.test.js` — business-specific formats, transaction
  rollback, encrypted invoice snapshots and cross-business collision handling.
- TypeScript parser-based syntax checks across the React source files.
- Static import/export audit of relative imports.
- Mock React component-render smoke tests across fourteen UI route states.

These are targeted checks, **not** substitutes for `npm run build`, tests using
real React in a browser, or tests against a live PostgreSQL instance.
