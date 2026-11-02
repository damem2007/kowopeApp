# Kowope Upgrade Plan

## Database foundation

- Move SQLite connection, schema creation, and migrations out of `server/index.js`.
- Add a dedicated database module with explicit `initializeDatabase()` and `runMigrations()` responsibilities.
- Preserve existing local data and make migrations idempotent.
- Verify the migration path against the existing `data/invoices.db`.

## Product phases

- Establish shared design tokens and reusable layout components.
- Complete invoice, client, payment, and integration workflows.
- Add business-profile defaults, richer invoice calculations, and live preview.
- Add recurring invoice schedules and an idempotent recurring runner.
- Add settings, tests, documentation, and environment configuration.
