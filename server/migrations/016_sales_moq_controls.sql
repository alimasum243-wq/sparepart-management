-- 016: per-product minimum quantity for sales channel and historical MOQ snapshot.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sales_moq DECIMAL(18,3) NOT NULL DEFAULT 1;
ALTER TABLE distributor_sales_report_items
  ADD COLUMN IF NOT EXISTS sales_moq_snapshot DECIMAL(18,3) NOT NULL DEFAULT 1;
