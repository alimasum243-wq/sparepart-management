-- MIGRATION 009: cash account subledger, owner capital/prive and internal transfers.
-- Additive; existing cash accounts are linked to their current general-ledger account by type.

ALTER TABLE cash_accounts ADD COLUMN IF NOT EXISTS ledger_account_id BIGINT NULL;

UPDATE cash_accounts ca
JOIN accounts a ON a.account_code=CASE WHEN UPPER(ca.account_type)='BANK' THEN '1110' ELSE '1100' END
SET ca.ledger_account_id=a.id
WHERE ca.ledger_account_id IS NULL AND a.is_active=1;

CREATE INDEX IF NOT EXISTS idx_cash_accounts_ledger_account ON cash_accounts (ledger_account_id);

CREATE TABLE IF NOT EXISTS cash_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  transaction_code VARCHAR(60) NOT NULL,
  transaction_type VARCHAR(20) NOT NULL,
  transaction_date DATE NOT NULL,
  from_cash_account_id BIGINT NULL,
  to_cash_account_id BIGINT NULL,
  amount DECIMAL(18,2) NOT NULL,
  reason VARCHAR(1000) NOT NULL,
  journal_entry_id BIGINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  created_by_user_id BIGINT NULL,
  posted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cash_transaction_code (transaction_code),
  KEY idx_cash_transaction_date_type (transaction_date,transaction_type),
  KEY idx_cash_transaction_from (from_cash_account_id),
  KEY idx_cash_transaction_to (to_cash_account_id)
);
