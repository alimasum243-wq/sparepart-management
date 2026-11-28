-- RESET TEST DATA - SPAREPART MANAGEMENT
-- Gunakan hanya setelah memastikan database memang akan dikosongkan.
-- BACKUP database terlebih dahulu. Jalankan sebagai satu script di TiDB SQL Editor.
--
-- Dipertahankan:
--   akun OWNER/ADMIN, accounts, cash_accounts, dan lokasi gudang utama.
--   Struktur tabel, indeks, serta konfigurasi aplikasi tidak diubah.
--
-- Dihapus:
--   seluruh transaksi, jurnal, stok, produk, pemasok, distributor,
--   akun login distributor, lokasi distributor, dan audit log operasional.
--
-- Jangan jalankan pada database produksi yang sudah berisi transaksi riil.

START TRANSACTION;

-- Detail transaksi terlebih dahulu.
DELETE FROM journal_lines;
DELETE FROM purchase_return_items;
DELETE FROM supplier_payment_allocations;
DELETE FROM purchase_items;
DELETE FROM consignment_delivery_items;
DELETE FROM distributor_sales_return_items;
DELETE FROM distributor_sales_report_items;
DELETE FROM distributor_payment_allocations;
DELETE FROM retail_sale_return_items;
DELETE FROM retail_sale_items;

-- Header transaksi.
DELETE FROM journal_entries;
DELETE FROM purchase_returns;
DELETE FROM supplier_payments;
DELETE FROM purchases;
DELETE FROM consignment_deliveries;
DELETE FROM distributor_sales_returns;
DELETE FROM distributor_sales_reports;
DELETE FROM distributor_payment_submissions;
DELETE FROM retail_sale_returns;
DELETE FROM retail_sales;

-- Buku stok dan transaksi operasional lain.
DELETE FROM stock_movements;
DELETE FROM expenses;
DELETE FROM opening_balances;
DELETE FROM audit_logs;

-- Hapus akun distributor, tetapi pertahankan seluruh akun OWNER dan ADMIN.
DELETE FROM users WHERE role = 'DISTRIBUTOR';

-- Hapus lokasi distributor; lokasi gudang utama tetap dipertahankan.
DELETE FROM stock_locations WHERE location_type = 'DISTRIBUTOR';

-- Master data akan diinput ulang oleh pemilik.
DELETE FROM distributors;
DELETE FROM suppliers;
DELETE FROM products;

COMMIT;

-- Verifikasi: seluruh hitungan berikut harus 0.
SELECT 'consignment_deliveries' table_name, COUNT(*) row_count FROM consignment_deliveries
UNION ALL SELECT 'consignment_delivery_items', COUNT(*) FROM consignment_delivery_items
UNION ALL SELECT 'distributor_sales_reports', COUNT(*) FROM distributor_sales_reports
UNION ALL SELECT 'distributor_sales_report_items', COUNT(*) FROM distributor_sales_report_items
UNION ALL SELECT 'distributor_sales_returns', COUNT(*) FROM distributor_sales_returns
UNION ALL SELECT 'distributor_sales_return_items', COUNT(*) FROM distributor_sales_return_items
UNION ALL SELECT 'distributor_payment_submissions', COUNT(*) FROM distributor_payment_submissions
UNION ALL SELECT 'distributor_payment_allocations', COUNT(*) FROM distributor_payment_allocations
UNION ALL SELECT 'retail_sales', COUNT(*) FROM retail_sales
UNION ALL SELECT 'retail_sale_items', COUNT(*) FROM retail_sale_items
UNION ALL SELECT 'retail_sale_returns', COUNT(*) FROM retail_sale_returns
UNION ALL SELECT 'retail_sale_return_items', COUNT(*) FROM retail_sale_return_items
UNION ALL SELECT 'purchases', COUNT(*) FROM purchases
UNION ALL SELECT 'purchase_items', COUNT(*) FROM purchase_items
UNION ALL SELECT 'purchase_returns', COUNT(*) FROM purchase_returns
UNION ALL SELECT 'purchase_return_items', COUNT(*) FROM purchase_return_items
UNION ALL SELECT 'supplier_payments', COUNT(*) FROM supplier_payments
UNION ALL SELECT 'supplier_payment_allocations', COUNT(*) FROM supplier_payment_allocations
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'expenses', COUNT(*) FROM expenses
UNION ALL SELECT 'journal_entries', COUNT(*) FROM journal_entries
UNION ALL SELECT 'journal_lines', COUNT(*) FROM journal_lines
UNION ALL SELECT 'opening_balances', COUNT(*) FROM opening_balances
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'distributors', COUNT(*) FROM distributors
UNION ALL SELECT 'distributor_users', COUNT(*) FROM users WHERE role = 'DISTRIBUTOR';

-- Pastikan akun OWNER/ADMIN tetap ada dan lokasi gudang utama tetap tersedia.
SELECT id, username, role, is_active
FROM users
WHERE role IN ('OWNER','ADMIN')
ORDER BY id;

SELECT id, location_code, location_name, location_type, is_active
FROM stock_locations
WHERE location_type = 'WAREHOUSE'
ORDER BY id;
