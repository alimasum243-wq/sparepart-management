-- MIGRATION 010: receivables due dates/unapplied receipts, price history and accounting-period close.
-- Additive; historical transactions remain intact.

ALTER TABLE distributor_sales_reports ADD COLUMN IF NOT EXISTS invoice_code VARCHAR(60) NULL;
ALTER TABLE distributor_sales_reports ADD COLUMN IF NOT EXISTS due_date DATE NULL;
ALTER TABLE distributor_payment_submissions ADD COLUMN IF NOT EXISTS unapplied_amount DECIMAL(18,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_distributor_report_due_date ON distributor_sales_reports (due_date,status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_distributor_invoice_code ON distributor_sales_reports (invoice_code);

INSERT INTO accounts (account_code,account_name,account_type,is_active)
SELECT '2200','Uang Muka / Penerimaan Distributor Belum Dialokasikan','LIABILITY',1
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='2200');

CREATE TABLE IF NOT EXISTS product_price_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  effective_date DATE NOT NULL,
  purchase_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  last_purchase_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  average_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  distributor_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  retail_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  changed_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_product_price_history_product_date (product_id,effective_date),
  KEY idx_product_price_history_source (source)
);

INSERT INTO product_price_history (product_id,effective_date,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,source)
SELECT p.id,CURRENT_DATE,p.purchase_cost,p.last_purchase_cost,p.average_cost,p.distributor_price,p.retail_price,'MIGRATION_SNAPSHOT'
FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_price_history h WHERE h.product_id=p.id AND h.source='MIGRATION_SNAPSHOT');

CREATE TABLE IF NOT EXISTS accounting_periods (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  closed_by_user_id BIGINT NULL,
  closed_at TIMESTAMP NULL,
  note VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accounting_period_start (period_start),
  KEY idx_accounting_period_status_end (status,period_end)
);
