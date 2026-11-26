BEGIN;

UPDATE payments AS payment
SET organization_id = invoice.organization_id,
    user_id = invoice.user_id
FROM invoices AS invoice
WHERE invoice.id = payment.invoice_id;

INSERT INTO postgres_schema_migrations (version, description)
VALUES (4, 'Align payment ownership with linked invoice scope')
ON CONFLICT (version) DO NOTHING;

COMMIT;
