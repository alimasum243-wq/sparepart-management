-- MIGRATION 022: classify cash/bank accounts by operational cash source.
-- Additive only. Existing accounts default to GENERAL until the owner assigns
-- RETAIL or SALES after reviewing the account's history and use.
ALTER TABLE cash_accounts ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'GENERAL';
