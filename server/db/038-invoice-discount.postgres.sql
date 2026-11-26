BEGIN;

-- Store the entered discount and its mode with each invoice. The calculated
-- amount remains reproducible from these immutable invoice fields and lines.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS discount_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type TEXT NOT NULL DEFAULT '%'
    CHECK (discount_type IN ('%', '$'));

INSERT INTO postgres_schema_migrations (version, description)
VALUES (6, 'Persist invoice discount value and type')
ON CONFLICT (version) DO NOTHING;

COMMIT;
