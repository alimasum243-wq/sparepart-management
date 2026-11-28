-- MIGRATION 001: Application foundation tables used by the current backend.
-- Additive/idempotent: CREATE IF NOT EXISTS for absent tables and ALTER IF NOT EXISTS for the known stock-movement column gap.
-- Inspect existing tables with SHOW CREATE TABLE before running; existing tables are not rebuilt or overwritten.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NULL,
  full_name VARCHAR(150) NULL,
  role VARCHAR(30) NULL,
  password_hash VARCHAR(255) NULL,
  distributor_id BIGINT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_active (role,is_active),
  KEY idx_users_distributor (distributor_id)
);

CREATE TABLE IF NOT EXISTS purchases (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  purchase_code VARCHAR(60) NOT NULL,
  supplier_invoice_no VARCHAR(100) NULL,
  supplier_id BIGINT NOT NULL,
  purchase_date DATE NOT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount DECIMAL(18,2) NOT NULL DEFAULT 0,
  shipping_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_purchase_code (purchase_code),
  UNIQUE KEY uq_supplier_invoice (supplier_id,supplier_invoice_no),
  KEY idx_purchase_supplier_date (supplier_id,purchase_date),
  KEY idx_purchase_date_status (purchase_date,status)
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  purchase_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL,
  line_total DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_purchase_item_purchase (purchase_id),
  KEY idx_purchase_item_product (product_id)
);

CREATE TABLE IF NOT EXISTS retail_sales (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sale_code VARCHAR(60) NOT NULL,
  sale_date DATE NOT NULL,
  cash_account_id BIGINT NOT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  total DECIMAL(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  created_by_user_id BIGINT NULL,
  journal_entry_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_retail_sale_code (sale_code),
  KEY idx_retail_sale_date_status (sale_date,status),
  KEY idx_retail_sale_cash_account (cash_account_id)
);

CREATE TABLE IF NOT EXISTS retail_sale_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sale_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,2) NOT NULL,
  cost_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_retail_sale_item_sale (sale_id),
  KEY idx_retail_sale_item_product (product_id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  expense_code VARCHAR(60) NOT NULL,
  expense_date DATE NOT NULL,
  category VARCHAR(100) NOT NULL,
  description VARCHAR(1000) NULL,
  amount DECIMAL(18,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH',
  posted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_expense_code (expense_code),
  KEY idx_expense_date (expense_date)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  journal_code VARCHAR(60) NOT NULL,
  journal_date DATE NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id BIGINT NULL,
  description VARCHAR(1000) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_journal_code (journal_code),
  KEY idx_journal_date_status (journal_date,status),
  KEY idx_journal_source (source_type,source_id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  journal_entry_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_journal_line_entry (journal_entry_id),
  KEY idx_journal_line_account (account_id)
);

CREATE TABLE IF NOT EXISTS opening_balances (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_id BIGINT NOT NULL,
  balance_date DATE NOT NULL,
  debit DECIMAL(18,2) NOT NULL DEFAULT 0,
  credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_opening_balance_account_date (account_id,balance_date)
);

-- Existing stock_movements has a legacy created_by text column; backend needs the user-ID column too.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS created_by_user_id BIGINT NULL;

-- Add missing auth fields only when absent. Existing rows remain inactive unless explicitly activated.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(150) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(30) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS distributor_id BIGINT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role,is_active);
CREATE INDEX IF NOT EXISTS idx_users_distributor ON users (distributor_id);
