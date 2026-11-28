-- MIGRATION 004 - schema history, transaction correction trail, accounting conventions
-- Additive only. No DROP/TRUNCATE/DELETE. Backup first.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(20) NOT NULL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checksum VARCHAR(128) NULL,
  notes TEXT NULL
);
CREATE TABLE IF NOT EXISTS transaction_corrections (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  correction_code VARCHAR(50) NOT NULL,
  source_table VARCHAR(80) NOT NULL,
  source_id BIGINT NOT NULL,
  correction_type VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL,
  reversal_reference_type VARCHAR(50) NULL,
  reversal_reference_id BIGINT NULL,
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transaction_correction_code (correction_code),
  KEY idx_transaction_correction_source (source_table, source_id),
  KEY idx_transaction_correction_created (created_at)
);
INSERT INTO schema_migrations (version,name,checksum,notes)
SELECT '004','schema_hardening',NULL,'IDR/rounding/correction policy'
WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version='004');
-- Accounting convention: IDR; money DECIMAL; quantity DECIMAL(15,3);
-- posted transactions are corrected by reversal/return, not direct edit/delete.
