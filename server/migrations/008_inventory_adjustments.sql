-- MIGRATION 008: inventory adjustment, damaged stock, stock opname and write-off support.
-- Additive only; no existing movement or master data is deleted.

CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  adjustment_code VARCHAR(60) NOT NULL,
  adjustment_type VARCHAR(20) NOT NULL,
  adjustment_date DATE NOT NULL,
  location_id BIGINT NOT NULL,
  damaged_location_id BIGINT NULL,
  reason VARCHAR(1000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_by_user_id BIGINT NULL,
  approved_by_user_id BIGINT NULL,
  posted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inventory_adjustment_code (adjustment_code),
  KEY idx_inventory_adjustment_date_status (adjustment_date,status),
  KEY idx_inventory_adjustment_location (location_id)
);

CREATE TABLE IF NOT EXISTS inventory_adjustment_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  adjustment_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  system_qty DECIMAL(15,3) NOT NULL DEFAULT 0,
  counted_qty DECIMAL(15,3) NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inventory_adjustment_product (adjustment_id,product_id),
  KEY idx_inventory_adjustment_item_product (product_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_adjustment_product ON inventory_adjustment_items (adjustment_id,product_id);

INSERT INTO stock_locations (location_code,location_name,location_type,is_active)
SELECT 'DAMAGED-STORE','Gudang Barang Rusak','DAMAGED',1
WHERE NOT EXISTS (SELECT 1 FROM stock_locations WHERE location_code='DAMAGED-STORE');

INSERT INTO accounts (account_code,account_name,account_type,is_active)
SELECT '4900','Keuntungan Penyesuaian Persediaan','REVENUE',1
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='4900');
INSERT INTO accounts (account_code,account_name,account_type,is_active)
SELECT '6500','Kerugian Persediaan / Barang Hilang','EXPENSE',1
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='6500');
