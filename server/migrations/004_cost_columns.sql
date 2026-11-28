-- Migration 004: kolom HPP. ADD COLUMN IF NOT EXISTS agar aman jika sebagian sudah terpasang.
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_purchase_cost DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS average_cost DECIMAL(15,2) NOT NULL DEFAULT 0;
