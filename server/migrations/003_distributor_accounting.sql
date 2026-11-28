-- MIGRATION 003: Foundation + login distributor, konsinyasi, laporan penjualan, verifikasi pembayaran.
-- Jalankan statement secara berurutan di TiDB SQL Editor.
-- Aman untuk data master yang sudah ada: tidak ada DROP/TRUNCATE/DELETE.

-- Foundation yang memang dipakai oleh backend saat ini.
CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_code VARCHAR(20) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  account_type VARCHAR(30) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_accounts_code (account_code),
  KEY idx_accounts_type (account_type, is_active)
);

CREATE TABLE IF NOT EXISTS cash_accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_code VARCHAR(30) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  account_type VARCHAR(20) NOT NULL DEFAULT 'CASH',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cash_accounts_code (account_code)
);

CREATE TABLE IF NOT EXISTS distributors (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  distributor_code VARCHAR(50) NOT NULL,
  distributor_name VARCHAR(150) NOT NULL,
  phone VARCHAR(50) NULL,
  address VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_distributor_code (distributor_code),
  KEY idx_distributor_name (distributor_name, is_active)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_user_date (user_id, created_at)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS distributor_id BIGINT NULL;

-- 1) Hubungkan akun login dengan satu distributor. Admin/pemilik: distributor_id NULL.
-- users.distributor_id sudah dibuat idempoten di bagian foundation.

-- 2) Pengiriman konsinyasi: header.
CREATE TABLE IF NOT EXISTS consignment_deliveries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  delivery_code VARCHAR(50) NOT NULL,
  distributor_id BIGINT NOT NULL,
  delivery_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  notes TEXT NULL,
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consignment_delivery_code (delivery_code),
  KEY idx_consignment_distributor_date (distributor_id, delivery_date),
  KEY idx_consignment_status (status)
);

-- 3) Rincian barang yang dibawa. Harga jual dan HPP dibekukan sebagai snapshot.
CREATE TABLE IF NOT EXISTS consignment_delivery_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  delivery_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_cost_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0,
  distributor_price_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consign_delivery_product (delivery_id,product_id),
  KEY idx_consign_item_product (product_id)
);

-- 4) Laporan penjualan dari distributor. Status SUBMITTED belum masuk jurnal/piutang.
CREATE TABLE IF NOT EXISTS distributor_sales_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_code VARCHAR(50) NOT NULL,
  distributor_id BIGINT NOT NULL,
  report_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
  notes TEXT NULL,
  submitted_by_user_id BIGINT NULL,
  reviewed_by_user_id BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_distributor_report_code (report_code),
  KEY idx_distributor_report_status (distributor_id, status, report_date)
);

CREATE TABLE IF NOT EXISTS distributor_sales_report_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity_sold DECIMAL(15,3) NOT NULL,
  unit_price_snapshot DECIMAL(15,2) NOT NULL,
  unit_cost_snapshot DECIMAL(15,2) NOT NULL,
  line_total DECIMAL(18,2) NOT NULL,
  cost_total DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_report_product (report_id,product_id),
  KEY idx_sales_report_item_product (product_id)
);

-- 5) Bukti pembayaran distributor. Tidak mengurangi piutang sebelum VERIFIED.
CREATE TABLE IF NOT EXISTS distributor_payment_submissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  submission_code VARCHAR(50) NOT NULL,
  distributor_id BIGINT NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'TRANSFER',
  destination_cash_account_id BIGINT NULL,
  proof_reference VARCHAR(500) NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  submitted_by_user_id BIGINT NULL,
  reviewed_by_user_id BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  journal_entry_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_distributor_payment_code (submission_code),
  KEY idx_distributor_payment_status (distributor_id, status, payment_date)
);

-- 6) Riwayat saldo piutang per distributor dari laporan penjualan dan pembayaran terverifikasi
-- diturunkan dari jurnal; tabel ini hanya menyimpan relasi alokasi pembayaran bila diperlukan.
CREATE TABLE IF NOT EXISTS distributor_payment_allocations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  payment_submission_id BIGINT NOT NULL,
  sales_report_id BIGINT NOT NULL,
  allocated_amount DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dist_payment_alloc_payment (payment_submission_id),
  UNIQUE KEY uq_dist_payment_report (payment_submission_id,sales_report_id),
  KEY idx_dist_payment_alloc_report (sales_report_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consign_delivery_product ON consignment_delivery_items (delivery_id,product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_report_product ON distributor_sales_report_items (report_id,product_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dist_payment_report ON distributor_payment_allocations (payment_submission_id,sales_report_id);

-- 7) Tambahkan indeks untuk pencarian jurnal sumber. Tidak mengubah jurnal lama.

-- 8) Akun default: masukkan hanya jika kode akun belum ada.
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '1100', 'Kas', 'ASSET', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='1100');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '1110', 'Bank', 'ASSET', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='1110');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '1200', 'Piutang Distributor', 'ASSET', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='1200');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '1300', 'Persediaan', 'ASSET', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='1300');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '2100', 'Utang Usaha', 'LIABILITY', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='2100');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '3100', 'Modal Pemilik', 'EQUITY', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='3100');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '3200', 'Prive', 'EQUITY', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='3200');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '4100', 'Penjualan', 'REVENUE', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='4100');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '5100', 'Harga Pokok Penjualan', 'EXPENSE', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='5100');
INSERT INTO accounts (account_code, account_name, account_type, is_active)
SELECT '6100', 'Beban Operasional', 'EXPENSE', 1 WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE account_code='6100');

-- CATATAN PENTING:
-- Sebelum aplikasi menerima transaksi, backend harus memastikan transaksi stok, jurnal,
-- dan status laporan/payment diproses atomik dalam satu DB transaction.
-- SUBMITTED/PENDING tidak boleh memengaruhi jurnal, piutang, kas, atau laba-rugi.

-- Akun kas default untuk menerima verifikasi pembayaran. Bank dapat ditambahkan terpisah.
INSERT INTO cash_accounts (account_code,account_name,account_type,is_active)
SELECT 'KAS-UTAMA','Kas Utama','CASH',1
WHERE NOT EXISTS (SELECT 1 FROM cash_accounts WHERE account_code='KAS-UTAMA');
