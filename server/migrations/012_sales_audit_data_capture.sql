-- 012: owner audit data capture for sales area/zone
-- Optional, transparent area label; no precise GPS tracking is collected.
ALTER TABLE distributor_sales_reports
  ADD COLUMN IF NOT EXISTS sales_area_label VARCHAR(120) NULL;
