BEGIN;

-- Remove only the historical database-wide invoice number constraint. Other
-- unique constraints on invoices must remain untouched.
DO $$
DECLARE constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT constraint_entry.conname AS constraint_name
    FROM pg_constraint AS constraint_entry
    JOIN pg_class AS relation ON relation.oid = constraint_entry.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND relation.relname = 'invoices'
      AND constraint_entry.contype = 'u'
      AND constraint_entry.conkey = ARRAY[
        (SELECT attribute.attnum
         FROM pg_attribute AS attribute
         WHERE attribute.attrelid = relation.oid
           AND attribute.attname = 'number'
           AND NOT attribute.attisdropped)
      ]
  LOOP
    EXECUTE format('ALTER TABLE invoices DROP CONSTRAINT %I', constraint_record.constraint_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_business_number
  ON invoices (business_profile_id, number)
  WHERE business_profile_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_legacy_number
  ON invoices (number)
  WHERE business_profile_id IS NULL;

INSERT INTO postgres_schema_migrations (version, description)
VALUES (5, 'Scope invoice number uniqueness to business profiles')
ON CONFLICT (version) DO NOTHING;

COMMIT;
