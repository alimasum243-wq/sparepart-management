-- MIGRATION 005: Penjualan retail dengan harga jual manual per transaksi.
-- Jalankan satu statement setiap kali di TiDB SQL Editor.
-- Aman untuk data lama: hanya membuat tabel baru.

CREATE TABLE IF NOT EXISTS retail_sales (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sale_code VARCHAR(50) NOT NULL,
  sale_date DATE NOT NULL,
  cash_account_id BIGINT NOT NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  total DECIMAL(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  journal_entry_id BIGINT NULL,
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_retail_sale_code (sale_code),
  KEY idx_retail_sale_date (sale_date),
  KEY idx_retail_sale_status (status)
);

CREATE TABLE IF NOT EXISTS retail_sale_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sale_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_price DECIMAL(15,2) NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL,
  line_total DECIMAL(18,2) NOT NULL,
  cost_total DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_retail_sale_item_sale (sale_id),
  KEY idx_retail_sale_item_product (product_id)
);
