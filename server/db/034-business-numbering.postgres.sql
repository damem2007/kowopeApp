-- Apply to the existing remote PostgreSQL database AFTER baseline v1.
-- Idempotent; preserves current invoices/schedules and does not invent their owner.
BEGIN;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS business_profile_id INTEGER REFERENCES business_profile(id);
ALTER TABLE recurring_schedules
  ADD COLUMN IF NOT EXISTS business_profile_id INTEGER REFERENCES business_profile(id);

CREATE TABLE IF NOT EXISTS invoice_sequences (
  business_profile_id INTEGER PRIMARY KEY REFERENCES business_profile(id) ON DELETE CASCADE,
  next_value BIGINT NOT NULL DEFAULT 1 CHECK (next_value >= 1)
);

-- Only backfill rows whose user/org can see exactly ONE business profile.
-- Ambiguous historical records stay NULL for manual review.
UPDATE invoices AS invoice
SET business_profile_id = profile.id
FROM business_profile AS profile
WHERE invoice.business_profile_id IS NULL
  AND (profile.organization_id = invoice.organization_id
       OR (profile.organization_id IS NULL AND profile.user_id = invoice.user_id))
  AND (
    SELECT COUNT(*) FROM business_profile AS candidate
    WHERE candidate.organization_id = invoice.organization_id
       OR (candidate.organization_id IS NULL AND candidate.user_id = invoice.user_id)
  ) = 1;

UPDATE recurring_schedules AS schedule
SET business_profile_id = profile.id
FROM business_profile AS profile
WHERE schedule.business_profile_id IS NULL
  AND (profile.organization_id = schedule.organization_id
       OR (profile.organization_id IS NULL AND profile.user_id = schedule.user_id))
  AND (
    SELECT COUNT(*) FROM business_profile AS candidate
    WHERE candidate.organization_id = schedule.organization_id
       OR (candidate.organization_id IS NULL AND candidate.user_id = schedule.user_id)
  ) = 1;

CREATE INDEX IF NOT EXISTS idx_invoices_business_profile_id
  ON invoices(business_profile_id);
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_business_profile_id
  ON recurring_schedules(business_profile_id);

INSERT INTO invoice_sequences(business_profile_id, next_value)
SELECT profile.id, COUNT(invoice.id) + 1
FROM business_profile AS profile
LEFT JOIN invoices AS invoice ON invoice.business_profile_id = profile.id
GROUP BY profile.id
ON CONFLICT(business_profile_id) DO UPDATE
SET next_value = GREATEST(invoice_sequences.next_value, excluded.next_value);

INSERT INTO postgres_schema_migrations (version, description)
VALUES (2, 'Per-business invoice sequence and business profile ownership')
ON CONFLICT (version) DO NOTHING;

INSERT INTO integrations (provider, status, account_label, config_json, connected_at, last_error, organization_id, user_id)
VALUES ('mailjet','connected','Mailjet account','kowope:v1:CFuIl4XE4ANy6yNo:xF3YExL4nHtvEOKPbDLPdg==:QLcEbd29iMYUTjJJEQ7uK3oEFci+6hefgh3IGwkTXfp/46RR3Dw6cGyDB2OeGfeZmQCPyPI0jHM5ZmFg81GMtsK7aTdpbgIx1HpCvP9T7zbnmX/jidvfwRRgic58j8Vg+nPbSvrja0XSKI0khCh4/4elOntCPLF57rnNpc9HH1RaJI47fHHLxo49j8Mmx7Cb+Uy2s4iA9BBota9Qsdqs1vx4099BlwDItGxutVjdHMV3Pu0ySoOKjuM/weHbKFcBePxEHHGq6BtYSmcc30WG4zOnqiC2A3eTxLUwjW1OMmz9Xm5OM0FEZc+1wYmQljHi3SR+SUmXEC8X1yMHdFeCnO4rmBQT21h6lEAtnh0lFBNElRLlTO/PkhY4MorCom6O9fygOCKpMZIV6Onf8M3qQIQFZvZX6pFxtL2119kgM/iYxHmR3/zR+nUjqI2uzi2u4ju/uLNB8g==',CURRENT_TIMESTAMP,NULL,NULL,NULL);
COMMIT;

-- Historical invoices.number remains UNIQUE globally, for compatibility.
-- Two businesses choosing the same template will receive distinct generated
-- numbers, but the second business may skip a sequence value. Removing the
-- global UNIQUE constraint also requires an audited SQLite table rebuild.
