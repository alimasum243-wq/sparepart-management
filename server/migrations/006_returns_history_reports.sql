-- MIGRATION 006: Retur pembelian, retur penjualan retail, histori dan laporan.
-- Jalankan satu per satu di TiDB SQL Editor. Tidak mengubah transaksi lama.

CREATE TABLE IF NOT EXISTS purchase_returns (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  return_code VARCHAR(60) NOT NULL,
  purchase_id BIGINT NOT NULL,
  return_date DATE NOT NULL,
  total DECIMAL(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_purchase_return_code (return_code),
  KEY idx_purchase_return_purchase (purchase_id),
  KEY idx_purchase_return_date (return_date)
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  purchase_return_id BIGINT NOT NULL,
  purchase_item_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL,
  line_total DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_purchase_return_item_return (purchase_return_id),
  KEY idx_purchase_return_item_purchase_item (purchase_item_id)
);

CREATE TABLE IF NOT EXISTS retail_sale_returns (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  return_code VARCHAR(60) NOT NULL,
  retail_sale_id BIGINT NOT NULL,
  return_date DATE NOT NULL,
  refund_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  cost_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_retail_sale_return_code (return_code),
  KEY idx_retail_sale_return_sale (retail_sale_id),
  KEY idx_retail_sale_return_date (return_date)
);

CREATE TABLE IF NOT EXISTS retail_sale_return_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  retail_sale_return_id BIGINT NOT NULL,
  retail_sale_item_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL,
  refund_total DECIMAL(18,2) NOT NULL,
  cost_total DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_retail_sale_return_item_return (retail_sale_return_id),
  KEY idx_retail_sale_return_item_sale_item (retail_sale_item_id)
);

INSERT INTO accounts (account_code,account_name,is_active)
SELECT '4200','Retur Penjualan',1
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='4200');
