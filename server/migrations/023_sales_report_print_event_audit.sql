-- 023: immutable distributor sales-note print/reprint event history.
-- Migration 017's report columns remain as last-print summary; this table captures each event.
CREATE TABLE IF NOT EXISTS distributor_sales_report_print_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  print_number INT NOT NULL,
  user_id BIGINT NULL,
  printed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_report_print_number (report_id,print_number),
  KEY idx_sales_report_print_report (report_id,printed_at),
  KEY idx_sales_report_print_user (user_id,printed_at)
);
