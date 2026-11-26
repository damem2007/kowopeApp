BEGIN;

-- Financial values on an invoice are a snapshot captured at save time. They
-- are read by delivery and PDF rendering and must not be recalculated later.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS subtotal_amount DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS discount_amount DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tax_name TEXT,
  ADD COLUMN IF NOT EXISTS tax_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tax_amount DOUBLE PRECISION;

-- Backfill only what historical rows prove. A saved total below the line-item
-- subtotal represents a known prior reduction; preserve it as a fixed amount
-- without changing the already-authoritative final total. Historical tax data
-- was not stored, so it remains zero rather than being invented.
WITH line_totals AS (
  SELECT invoice_id, SUM(quantity * unit_price) AS subtotal_amount
  FROM line_items
  GROUP BY invoice_id
), snapshots AS (
  SELECT invoice.id,
         COALESCE(line_totals.subtotal_amount, invoice.amount) AS subtotal_amount,
         invoice.amount,
         COALESCE(invoice.discount_value, 0) AS discount_value,
         COALESCE(invoice.discount_type, '%') AS discount_type
  FROM invoices AS invoice
  LEFT JOIN line_totals ON line_totals.invoice_id = invoice.id
)
UPDATE invoices AS invoice
SET subtotal_amount = snapshots.subtotal_amount,
    discount_amount = CASE
      WHEN snapshots.discount_value > 0 THEN LEAST(
        snapshots.subtotal_amount,
        CASE WHEN snapshots.discount_type = '%'
          THEN snapshots.subtotal_amount * snapshots.discount_value / 100
          ELSE snapshots.discount_value END
      )
      WHEN snapshots.amount < snapshots.subtotal_amount
        THEN snapshots.subtotal_amount - snapshots.amount
      ELSE 0 END,
    discount_value = CASE
      WHEN snapshots.discount_value > 0 THEN snapshots.discount_value
      WHEN snapshots.amount < snapshots.subtotal_amount
        THEN snapshots.subtotal_amount - snapshots.amount
      ELSE 0 END,
    discount_type = CASE
      WHEN snapshots.discount_value > 0 THEN snapshots.discount_type
      WHEN snapshots.amount < snapshots.subtotal_amount THEN '$'
      ELSE '%' END,
    tax_name = COALESCE(NULLIF(invoice.tax_name, ''), 'Tax'),
    tax_rate = COALESCE(invoice.tax_rate, 0),
    tax_amount = COALESCE(invoice.tax_amount, 0)
FROM snapshots
WHERE invoice.id = snapshots.id
  AND invoice.subtotal_amount IS NULL;

INSERT INTO postgres_schema_migrations (version, description)
VALUES (7, 'Persist invoice financial snapshots and backfill known discounts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
