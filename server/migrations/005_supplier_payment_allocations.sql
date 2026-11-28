-- MIGRATION 005: Supplier payment posting metadata and allocation table.
-- Additive/idempotent; compatible with the supplier_payments table created earlier.
ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP NULL;

CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  supplier_payment_id BIGINT NOT NULL,
  purchase_id BIGINT NOT NULL,
  allocated_amount DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_supplier_payment_alloc_payment (supplier_payment_id),
  KEY idx_supplier_payment_alloc_purchase (purchase_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payment_purchase ON supplier_payment_allocations (supplier_payment_id,purchase_id);
