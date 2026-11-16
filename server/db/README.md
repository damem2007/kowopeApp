# Kowope database adapters (SQLite and PostgreSQL)

The API and recurring worker call `await initializeDatabase()` in `server/db/index.js`.
`DATABASE_CLIENT=sqlite` returns an asynchronous wrapper around `better-sqlite3`;
`DATABASE_CLIENT=postgres` returns a `pg` pool adapter using the **remote** `DATABASE_URL`.
Both expose `prepare().get/all/run`, `query`, `one`, `maybeOne`, `many`,
`execute`, `transaction(callback)` (returns an async function),
`lockInvoiceNumbering`, `lockRecurring`, `getDueRecurringSchedules`, and `close`.

Never use a raw synchronous `better-sqlite3` instance as an async adapter. SQLite
migrations run on that raw instance *before* the async adapter is returned.
The one remaining native SQLite user is the existing file-backup service,
which receives `legacyBackupDatabase` only on the SQLite runtime.

## Hosted PostgreSQL

1. Provision a new empty PostgreSQL database. Set `DATABASE_URL` in `.env`.
2. Run `node scripts/init-remote-postgres.js` to initialize baseline and
   per-business invoice numbering. This refuses an existing application schema.
3. For an **existing** Kowope PostgreSQL database already initialized to
   baseline v1, use `node scripts/apply-remote-numbering-pg.js` after a backup.
4. Set `DATABASE_CLIENT=postgres`. No local PostgreSQL service is necessary.

## Existing SQLite

Set `DATABASE_CLIENT=sqlite` and `SQLITE_DATABASE_PATH` to the existing database.
Back up the DB and its encryption secret before launching. The initializer runs
SQLite migration 34 as a versioned, data-preserving extension, adding
`business_profile_id` and the `invoice_sequences` table.

Both backends preserve existing encrypted fields; the same `VAULT_KEY` must be
provided. PostgreSQL backups use provider-managed backups or `pg_dump` outside
the SQLite ZIP-backup service, whose HTTP endpoint returns 501 in PG mode.

**Limitations:** The source code here is not a complete data migration from an
existing SQLite file into a hosted PostgreSQL instance. The baseline creates an
empty PostgreSQL application; existing user, invoice and organization data must
be transferred separately with foreign-key checks, identity-sequence repairs,
and encryption-key continuity before any production cutover.
