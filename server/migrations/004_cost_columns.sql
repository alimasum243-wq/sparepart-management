-- Jalankan hanya bila kedua kolom belum ada pada products.
ALTER TABLE products ADD COLUMN last_purchase_cost DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN average_cost DECIMAL(15,2) NOT NULL DEFAULT 0;
