# Database adapter plan

Kowope currently runs on SQLite through `better-sqlite3`. The API was written
around its synchronous `prepare()`, `transaction()`, and `exec()` methods, so
PostgreSQL cannot be substituted by changing one import or one environment
variable.

The adapter boundary is defined in `server/db/adapter.js`:

- `DATABASE_CLIENT=sqlite` (current, supported runtime)
- `DATABASE_CLIENT=postgres` (validated configuration, intentionally blocked)
- `DATABASE_URL` (required for PostgreSQL)
- `SQLITE_DATABASE_PATH` (optional SQLite path, useful for Render disks)

Before enabling PostgreSQL, the API must be moved behind asynchronous
repositories implementing `query`, `one`, `maybeOne`, `many`, `execute`,
`transaction`, and `close`. The PostgreSQL implementation should use
parameterized queries and a pool. Migrations should then be split into
SQLite and PostgreSQL dialects because SQLite-specific statements currently
exist in the migration history (`PRAGMA`, `INSERT OR IGNORE`, `AUTOINCREMENT`,
and partial-index syntax).

This guard prevents a deployment from claiming to use PostgreSQL while still
opening or corrupting the SQLite database.
