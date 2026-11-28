-- 017: record in-app print request for distributor sales notes.
-- This timestamp records the user invoking print, not printer-confirmed physical output.
ALTER TABLE distributor_sales_reports
  ADD COLUMN IF NOT EXISTS print_requested_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS print_requested_by_user_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS print_request_count INT NOT NULL DEFAULT 0;
