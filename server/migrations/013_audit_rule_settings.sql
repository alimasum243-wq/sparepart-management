-- 013: owner-configurable audit signal thresholds
CREATE TABLE IF NOT EXISTS audit_rule_settings (
  id TINYINT PRIMARY KEY,
  retail_drop_threshold_percent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  sales_rise_threshold_percent DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  rapid_sales_note_minutes INT NOT NULL DEFAULT 10,
  updated_by_user_id BIGINT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
INSERT INTO audit_rule_settings (id,retail_drop_threshold_percent,sales_rise_threshold_percent,rapid_sales_note_minutes)
VALUES (1,20.00,20.00,10)
ON DUPLICATE KEY UPDATE id=VALUES(id);
