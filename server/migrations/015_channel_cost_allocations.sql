-- 015: nominal channel allocation of operating expenses for net contribution analysis.
-- Analytics only; this allocation does not create or modify GL journals.
CREATE TABLE IF NOT EXISTS channel_cost_allocations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  expense_id BIGINT NOT NULL,
  channel VARCHAR(20) NOT NULL,
  allocation_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  allocation_note VARCHAR(500) NULL,
  created_by_user_id BIGINT NULL,
  updated_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_channel_cost_expense_channel (expense_id,channel),
  KEY idx_channel_cost_channel (channel),
  CONSTRAINT chk_channel_cost_channel CHECK (channel IN ('RETAIL','SALES')),
  CONSTRAINT chk_channel_cost_amount CHECK (allocation_amount >= 0)
);
