-- 014: retail price floor and auditable owner price overrides
-- Additive only; retail channel price is snapshotted for each posted line.
ALTER TABLE retail_sale_items
  ADD COLUMN IF NOT EXISTS retail_price_snapshot DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE retail_sale_items
  ADD COLUMN IF NOT EXISTS price_override_reason VARCHAR(500) NULL;
