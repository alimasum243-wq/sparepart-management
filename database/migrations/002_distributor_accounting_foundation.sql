-- MIGRASI 002 - fondasi konsinyasi, akun distributor, dan biaya persediaan
-- Jalankan SATU STATEMENT PER KALI di TiDB SQL Editor.
-- Tidak menghapus tabel maupun data yang sudah ada.

-- 1. Hubungkan akun login distributor ke satu distributor.
ALTER TABLE users ADD COLUMN distributor_id BIGINT NULL;

-- 2. Indeks agar satu distributor tidak dipasangkan ke beberapa akun login.
CREATE UNIQUE INDEX uq_users_distributor ON users (distributor_id);

-- 3. Simpan biaya beli terakhir dan biaya rata-rata tertimbang secara terpisah.
ALTER TABLE products ADD COLUMN last_purchase_cost DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE products ADD COLUMN average_cost DECIMAL(15,2) NOT NULL DEFAULT 0;

-- 4. Dokumen pengiriman konsinyasi: pengiriman bukan penjualan.
CREATE TABLE IF NOT EXISTS consignment_dispatches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dispatch_code VARCHAR(50) NOT NULL,
  distributor_id BIGINT NOT NULL,
  dispatch_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
  notes TEXT NULL,
  created_by_user_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_consignment_dispatch_code (dispatch_code),
  KEY idx_dispatch_distributor_date (distributor_id, dispatch_date)
);

CREATE TABLE IF NOT EXISTS consignment_dispatch_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  dispatch_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity DECIMAL(15,3) NOT NULL,
  unit_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
  distributor_price DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dispatch_item_dispatch (dispatch_id),
  KEY idx_dispatch_item_product (product_id)
);

-- 5. Laporan penjualan yang dikirim distributor. Belum sah sampai direview pemilik.
CREATE TABLE IF NOT EXISTS distributor_sales_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_code VARCHAR(50) NOT NULL,
  distributor_id BIGINT NOT NULL,
  report_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  submitted_by_user_id BIGINT NULL,
  reviewed_by_user_id BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_distributor_report_code (report_code),
  KEY idx_sales_report_distributor_date (distributor_id, report_date, status)
);

CREATE TABLE IF NOT EXISTS distributor_sales_report_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  product_name_snapshot VARCHAR(150) NOT NULL,
  quantity_sold DECIMAL(15,3) NOT NULL,
  selling_price DECIMAL(15,2) NOT NULL,
  unit_cost_snapshot DECIMAL(15,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sales_report_item_report (report_id),
  KEY idx_sales_report_item_product (product_id)
);

-- 6. Bukti pembayaran dari distributor. Status PENDING tidak boleh masuk kas/jurnal.
CREATE TABLE IF NOT EXISTS distributor_payment_submissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  submission_code VARCHAR(50) NOT NULL,
  distributor_id BIGINT NOT NULL,
  submitted_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(30) NOT NULL,
  proof_reference VARCHAR(500) NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  submitted_by_user_id BIGINT NULL,
  reviewed_by_user_id BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  confirmed_payment_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payment_submission_code (submission_code),
  KEY idx_payment_submission_distributor (distributor_id, status, submitted_date)
);

-- 7. Audit jejak peninjauan laporan dan pembayaran.
CREATE TABLE IF NOT EXISTS distributor_review_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  distributor_id BIGINT NOT NULL,
  record_type VARCHAR(30) NOT NULL,
  record_id BIGINT NOT NULL,
  action VARCHAR(20) NOT NULL,
  actor_user_id BIGINT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_distributor_review_record (record_type, record_id),
  KEY idx_distributor_review_actor (actor_user_id)
);

-- CATATAN PENTING:
-- Jangan input modal awal Rp40 juta sebelum saldo kas dan bank aktual dipisah.
-- Jangan mengaktifkan laporan laba-rugi sampai transaksi penjualan, HPP,
-- pembayaran, pengeluaran, dan jurnal otomatis sudah diuji seimbang.
