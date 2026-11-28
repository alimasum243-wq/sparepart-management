-- 021: retail receipt SKU snapshot and audited reprint history.
ALTER TABLE retail_sale_items ADD COLUMN IF NOT EXISTS sku_snapshot VARCHAR(50) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS retail_sale_print_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  sale_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  printed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_retail_receipt_print_sale (sale_id,printed_at),
  KEY idx_retail_receipt_print_user (user_id,printed_at)
);
