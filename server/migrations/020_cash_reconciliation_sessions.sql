-- 020: physical cash/bank count sessions. Reconciliation-only, never posts GL.
CREATE TABLE IF NOT EXISTS cash_reconciliation_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_code VARCHAR(60) NOT NULL,
  cash_account_id BIGINT NOT NULL,
  opened_at DATETIME NOT NULL,
  opening_count DECIMAL(18,2) NOT NULL,
  opened_by_user_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  closed_at DATETIME NULL,
  closing_count DECIMAL(18,2) NULL,
  expected_closing DECIMAL(18,2) NULL,
  variance DECIMAL(18,2) NULL,
  closed_by_user_id BIGINT NULL,
  notes VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cash_reconciliation_code (session_code),
  KEY idx_cash_reconciliation_account_status (cash_account_id,status,opened_at),
  KEY idx_cash_reconciliation_date (opened_at,status)
);
