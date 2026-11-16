BEGIN;

ALTER TABLE recurring_schedules
  ADD COLUMN IF NOT EXISTS end_at TEXT;

INSERT INTO postgres_schema_migrations (version, description)
VALUES (3, 'Finite recurring schedules with an optional end date')
ON CONFLICT (version) DO NOTHING;

COMMIT;
