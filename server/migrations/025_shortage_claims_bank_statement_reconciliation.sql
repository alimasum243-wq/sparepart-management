-- 025: Formal distributor shortage claims and external bank statement reconciliation.
-- Additive schema. Claim approval does not automatically create a charge or stock/journal posting.
-- Bank statement matching is informational until a separate owner-confirmed posting workflow exists.
CREATE TABLE IF NOT EXISTS distributor_shortage_claims (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  claim_code VARCHAR(60) NOT NULL,
  distributor_id BIGINT NOT NULL,
  delivery_id BIGINT NULL,
  claim_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  notes VARCHAR(1000) NULL,
  evidence_reference VARCHAR(1000) NULL,
  submitted_by_user_id BIGINT NULL,
  reviewed_by_user_id BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason VARCHAR(1000) NULL,
  approved_charge_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  settlement_status VARCHAR(20) NOT NULL DEFAULT 'UNSETTLED',
  settled_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shortage_claim_code (claim_code),
  KEY idx_shortage_claim_distributor_status (distributor_id,status,claim_date),
  KEY idx_shortage_claim_delivery (delivery_id,status)
);
CREATE TABLE IF NOT EXISTS distributor_shortage_claim_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  claim_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity_claimed DECIMAL(15,3) NOT NULL,
  quantity_approved DECIMAL(15,3) NOT NULL DEFAULT 0,
  unit_cost_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0,
  charge_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  decision_note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_shortage_claim_item_claim (claim_id),
  KEY idx_shortage_claim_item_product (product_id)
);
CREATE TABLE IF NOT EXISTS bank_statement_imports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  import_code VARCHAR(60) NOT NULL,
  cash_account_id BIGINT NOT NULL,
  statement_period_start DATE NOT NULL,
  statement_period_end DATE NOT NULL,
  source_file_name VARCHAR(255) NULL,
  file_fingerprint CHAR(64) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'IMPORTED',
  imported_by_user_id BIGINT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bank_statement_import_code (import_code),
  UNIQUE KEY uq_bank_statement_file_fingerprint (file_fingerprint),
  KEY idx_bank_statement_import_account_period (cash_account_id,statement_period_start,statement_period_end)
);
CREATE TABLE IF NOT EXISTS bank_statement_rows (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  import_id BIGINT NOT NULL,
  row_number INT NOT NULL,
  transaction_date DATE NOT NULL,
  external_reference VARCHAR(190) NULL,
  description VARCHAR(1000) NOT NULL,
  debit DECIMAL(15,2) NOT NULL DEFAULT 0,
  credit DECIMAL(15,2) NOT NULL DEFAULT 0,
  running_balance DECIMAL(15,2) NULL,
  row_fingerprint CHAR(64) NOT NULL,
  match_status VARCHAR(20) NOT NULL DEFAULT 'UNMATCHED',
  matched_source_type VARCHAR(60) NULL,
  matched_source_id BIGINT NULL,
  matched_journal_entry_id BIGINT NULL,
  matched_by_user_id BIGINT NULL,
  matched_at TIMESTAMP NULL,
  match_note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bank_statement_row_fingerprint (import_id,row_fingerprint),
  UNIQUE KEY uq_bank_statement_row_number (import_id,row_number),
  KEY idx_bank_statement_rows_status_date (import_id,match_status,transaction_date),
  KEY idx_bank_statement_rows_source (matched_source_type,matched_source_id),
  UNIQUE KEY uq_bank_statement_journal_match (matched_journal_entry_id)
);
