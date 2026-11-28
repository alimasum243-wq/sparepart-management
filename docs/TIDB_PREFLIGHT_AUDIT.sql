-- TiDB PRE-FLIGHT audit queries: READ ONLY; no DDL/DML.
-- Run in the sparepart_db SQL editor and copy/export all result sets for review.
SELECT DATABASE() AS current_database, VERSION() AS tidb_version, NOW() AS checked_at;

-- Tables currently present.
SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, CREATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- Expected application tables: report missing names without changing anything.
SELECT expected.table_name,
       CASE WHEN actual.TABLE_NAME IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM (
 SELECT 'accounting_periods' table_name UNION ALL SELECT 'accounting_period_guard'
 UNION ALL SELECT 'accounts' UNION ALL SELECT 'audit_logs'
 UNION ALL SELECT 'cash_accounts' UNION ALL SELECT 'cash_transactions'
 UNION ALL SELECT 'channel_cost_allocations' UNION ALL SELECT 'consignment_deliveries'
 UNION ALL SELECT 'consignment_delivery_items' UNION ALL SELECT 'consignment_delivery_print_logs'
 UNION ALL SELECT 'distributor_consignment_return_requests'
 UNION ALL SELECT 'distributor_consignment_return_request_items'
 UNION ALL SELECT 'distributor_payment_allocations' UNION ALL SELECT 'distributor_payment_submissions'
 UNION ALL SELECT 'distributor_sales_report_items' UNION ALL SELECT 'distributor_sales_reports'
 UNION ALL SELECT 'distributor_sales_return_items' UNION ALL SELECT 'distributor_sales_returns'
 UNION ALL SELECT 'distributors' UNION ALL SELECT 'expenses' UNION ALL SELECT 'inventory_adjustments'
 UNION ALL SELECT 'inventory_adjustment_items' UNION ALL SELECT 'journal_entries' UNION ALL SELECT 'journal_lines'
 UNION ALL SELECT 'opening_balances' UNION ALL SELECT 'product_price_history' UNION ALL SELECT 'products'
 UNION ALL SELECT 'purchase_items' UNION ALL SELECT 'purchase_returns' UNION ALL SELECT 'purchase_return_items'
 UNION ALL SELECT 'purchases' UNION ALL SELECT 'retail_sale_items' UNION ALL SELECT 'retail_sale_returns'
 UNION ALL SELECT 'retail_sale_return_items' UNION ALL SELECT 'retail_sales' UNION ALL SELECT 'stock_locations'
 UNION ALL SELECT 'stock_movements' UNION ALL SELECT 'supplier_payment_allocations'
 UNION ALL SELECT 'supplier_payments' UNION ALL SELECT 'suppliers' UNION ALL SELECT 'users'
) expected
LEFT JOIN information_schema.TABLES actual
 ON actual.TABLE_SCHEMA=DATABASE() AND actual.TABLE_NAME=expected.table_name
ORDER BY expected.table_name;

-- Inspect all columns for tables affected by the migrations/features.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME IN (
 'users','products','stock_locations','stock_movements','distributors',
 'consignment_deliveries','consignment_delivery_items','distributor_sales_reports',
 'distributor_sales_report_items','distributor_payment_submissions',
 'distributor_payment_allocations','distributor_sales_returns','distributor_sales_return_items',
 'accounts','cash_accounts','cash_transactions','expenses','channel_cost_allocations',
 'product_price_history','accounting_periods','accounting_period_guard',
 'inventory_adjustments','inventory_adjustment_items','consignment_delivery_print_logs',
 'distributor_consignment_return_requests','distributor_consignment_return_request_items'
 )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Index/unique-constraint inspection; identify duplicate indexes and missing uniqueness.
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA=DATABASE()
 AND TABLE_NAME IN (
 'users','products','stock_locations','stock_movements','distributors',
 'consignment_deliveries','consignment_delivery_items','distributor_sales_reports',
 'distributor_sales_report_items','distributor_payment_submissions',
 'distributor_payment_allocations','distributor_sales_returns','distributor_sales_return_items',
 'accounts','cash_accounts','cash_transactions','expenses','channel_cost_allocations',
 'product_price_history','accounting_periods','accounting_period_guard',
 'inventory_adjustments','inventory_adjustment_items','consignment_delivery_print_logs',
 'distributor_consignment_return_requests','distributor_consignment_return_request_items'
 )
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Read-only data counts for high-risk transaction/master tables.
SELECT 'users' table_name, COUNT(*) row_count FROM users
UNION ALL SELECT 'products',COUNT(*) FROM products
UNION ALL SELECT 'distributors',COUNT(*) FROM distributors
UNION ALL SELECT 'stock_locations',COUNT(*) FROM stock_locations
UNION ALL SELECT 'stock_movements',COUNT(*) FROM stock_movements
UNION ALL SELECT 'consignment_deliveries',COUNT(*) FROM consignment_deliveries
UNION ALL SELECT 'distributor_sales_reports',COUNT(*) FROM distributor_sales_reports
UNION ALL SELECT 'distributor_payment_submissions',COUNT(*) FROM distributor_payment_submissions
UNION ALL SELECT 'journal_entries',COUNT(*) FROM journal_entries
UNION ALL SELECT 'audit_logs',COUNT(*) FROM audit_logs
ORDER BY table_name;

-- Read-only check of expected single active warehouse and damaged-stock location.
SELECT location_type, is_active, COUNT(*) count_by_type
FROM stock_locations
GROUP BY location_type,is_active
ORDER BY location_type,is_active;
