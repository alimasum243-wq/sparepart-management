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
 SELECT 'accounting_periods' table_name UNION ALL SELECT 'accounting_period_guard' UNION ALL SELECT 'auth_sessions' UNION ALL SELECT 'owner_setup_guard'
 UNION ALL SELECT 'accounts' UNION ALL SELECT 'audit_logs'
 UNION ALL SELECT 'cash_accounts' UNION ALL SELECT 'cash_transactions'
 UNION ALL SELECT 'channel_cost_allocations' UNION ALL SELECT 'consignment_deliveries'
 UNION ALL SELECT 'consignment_delivery_items' UNION ALL SELECT 'consignment_delivery_print_logs'
 UNION ALL SELECT 'distributor_consignment_return_requests'
 UNION ALL SELECT 'distributor_consignment_return_request_items' UNION ALL SELECT 'cash_reconciliation_sessions'
 UNION ALL SELECT 'distributor_payment_allocations' UNION ALL SELECT 'distributor_payment_submissions'
 UNION ALL SELECT 'distributor_sales_report_items' UNION ALL SELECT 'distributor_sales_reports' UNION ALL SELECT 'distributor_sales_report_print_logs'
 UNION ALL SELECT 'distributor_sales_return_items' UNION ALL SELECT 'distributor_sales_returns'
 UNION ALL SELECT 'distributors' UNION ALL SELECT 'expenses' UNION ALL SELECT 'inventory_adjustments'
 UNION ALL SELECT 'inventory_adjustment_items' UNION ALL SELECT 'journal_entries' UNION ALL SELECT 'journal_lines'
 UNION ALL SELECT 'opening_balances' UNION ALL SELECT 'product_price_history' UNION ALL SELECT 'products'
 UNION ALL SELECT 'purchase_items' UNION ALL SELECT 'purchase_returns' UNION ALL SELECT 'purchase_return_items'
 UNION ALL SELECT 'purchases' UNION ALL SELECT 'retail_sale_items' UNION ALL SELECT 'retail_sale_print_logs' UNION ALL SELECT 'retail_sale_returns'
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
 'users','auth_sessions','owner_setup_guard','products','stock_locations','stock_movements','distributors','suppliers','supplier_payments','purchases','purchase_items',
 'consignment_deliveries','consignment_delivery_items','distributor_sales_reports',
 'distributor_sales_report_items','distributor_payment_submissions',
 'distributor_payment_allocations','distributor_sales_returns','distributor_sales_return_items','supplier_payment_allocations','purchase_returns','purchase_return_items',
 'accounts','cash_accounts','cash_transactions','expenses','channel_cost_allocations',
 'product_price_history','accounting_periods','accounting_period_guard',
 'inventory_adjustments','inventory_adjustment_items','consignment_delivery_print_logs',
 'distributor_consignment_return_requests','distributor_consignment_return_request_items','cash_reconciliation_sessions','distributor_sales_report_print_logs','retail_sales','retail_sale_items','retail_sale_print_logs','retail_sale_returns','retail_sale_return_items'
 )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Duplicate-value checks on legacy master tables expected to exist before migrations.
-- Conditional checks for purchase/report/allocation tables are listed in the audit handoff
-- and must be run only when information_schema confirms the table and columns exist.
SELECT 'products.sku' check_name,sku duplicate_value,COUNT(*) duplicate_count FROM products WHERE sku IS NOT NULL AND TRIM(sku)<>'' GROUP BY sku HAVING COUNT(*)>1
UNION ALL SELECT 'products.product_name',product_name,COUNT(*) FROM products WHERE product_name IS NOT NULL AND TRIM(product_name)<>'' GROUP BY product_name HAVING COUNT(*)>1
UNION ALL SELECT 'suppliers.supplier_code',supplier_code,COUNT(*) FROM suppliers WHERE supplier_code IS NOT NULL AND TRIM(supplier_code)<>'' GROUP BY supplier_code HAVING COUNT(*)>1
UNION ALL SELECT 'suppliers.supplier_name',supplier_name,COUNT(*) FROM suppliers WHERE supplier_name IS NOT NULL AND TRIM(supplier_name)<>'' GROUP BY supplier_name HAVING COUNT(*)>1
ORDER BY check_name,duplicate_value;

-- OPTIONAL DUPLICATE CHECKS: execute only when information_schema confirms each column exists.
-- Run username check after migration 001 if that column is not yet present.
SELECT username,COUNT(*) duplicate_count
FROM users WHERE username IS NOT NULL AND TRIM(username)<>''
GROUP BY username HAVING COUNT(*)>1;

-- Run distributor_id check after migration 001/003 and before migration 024.
SELECT distributor_id,COUNT(*) duplicate_count
FROM users WHERE distributor_id IS NOT NULL
GROUP BY distributor_id HAVING COUNT(*)>1;

-- Run email/phone duplicate checks after migration 004 adds these columns.
SELECT 'users.email' check_name,email duplicate_value,COUNT(*) duplicate_count
FROM users WHERE email IS NOT NULL AND TRIM(email)<>''
GROUP BY email HAVING COUNT(*)>1
UNION ALL
SELECT 'users.phone',phone,COUNT(*)
FROM users WHERE phone IS NOT NULL AND TRIM(phone)<>''
GROUP BY phone HAVING COUNT(*)>1
ORDER BY check_name,duplicate_value;

-- Required columns from migrations 007 and 017-023; reports missing column names.
SELECT expected.table_name,expected.column_name,
       CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM (
 SELECT 'auth_sessions' table_name,'session_id' column_name UNION ALL SELECT 'auth_sessions','user_id' UNION ALL SELECT 'auth_sessions','expires_at' UNION ALL SELECT 'auth_sessions','revoked_at' UNION ALL SELECT 'owner_setup_guard','id' UNION ALL SELECT 'distributor_sales_reports','print_requested_at' column_name UNION ALL
 SELECT 'distributor_sales_reports','print_requested_by_user_id' UNION ALL
 SELECT 'distributor_sales_reports','print_request_count' UNION ALL
 SELECT 'distributor_consignment_return_requests','request_code' UNION ALL
 SELECT 'distributor_consignment_return_requests','status' UNION ALL
 SELECT 'distributor_consignment_return_requests','reviewed_by_user_id' UNION ALL
 SELECT 'distributor_consignment_return_requests','posted_at' UNION ALL
 SELECT 'distributor_consignment_return_request_items','item_condition' UNION ALL
 SELECT 'distributor_consignment_return_request_items','unit_cost_snapshot' UNION ALL
 SELECT 'distributor_consignment_return_request_items','distributor_price_snapshot' UNION ALL
 SELECT 'cash_reconciliation_sessions','session_code' UNION ALL
 SELECT 'cash_reconciliation_sessions','cash_account_id' UNION ALL
 SELECT 'cash_reconciliation_sessions','opening_count' UNION ALL
 SELECT 'cash_reconciliation_sessions','system_opening' UNION ALL
 SELECT 'cash_reconciliation_sessions','opening_variance' UNION ALL
 SELECT 'cash_reconciliation_sessions','expected_closing' UNION ALL
 SELECT 'cash_reconciliation_sessions','variance' UNION ALL
 SELECT 'cash_accounts','source_type' UNION ALL
 SELECT 'retail_sale_items','sku_snapshot' UNION ALL
 SELECT 'retail_sale_print_logs','sale_id' UNION ALL
 SELECT 'retail_sale_print_logs','user_id' UNION ALL
 SELECT 'retail_sale_print_logs','printed_at' UNION ALL
 SELECT 'consignment_delivery_print_logs','delivery_id' UNION ALL
 SELECT 'consignment_delivery_print_logs','distributor_id' UNION ALL
 SELECT 'consignment_delivery_print_logs','user_id' UNION ALL
 SELECT 'consignment_delivery_print_logs','printed_at' UNION ALL
 SELECT 'distributor_sales_report_print_logs','report_id' UNION ALL
 SELECT 'distributor_sales_report_print_logs','print_number' UNION ALL
 SELECT 'distributor_sales_report_print_logs','user_id' UNION ALL
 SELECT 'distributor_sales_report_print_logs','printed_at'
) expected
LEFT JOIN information_schema.COLUMNS actual
 ON actual.TABLE_SCHEMA=DATABASE()
 AND actual.TABLE_NAME=expected.table_name
 AND actual.COLUMN_NAME=expected.column_name
ORDER BY expected.table_name,expected.column_name;

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
 'distributor_consignment_return_requests','distributor_consignment_return_request_items','cash_reconciliation_sessions',
 'retail_sales','retail_sale_items','retail_sale_print_logs','retail_sale_returns','retail_sale_return_items'
 )
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- Expected indexes for migrations 007 and 024 (read-only check).
SELECT expected.table_name,expected.index_name,
       CASE WHEN actual.INDEX_NAME IS NULL THEN 'MISSING' ELSE 'PRESENT' END status,
       actual.NON_UNIQUE
FROM (
 SELECT 'auth_sessions' table_name,'PRIMARY' index_name UNION ALL
 SELECT 'auth_sessions','idx_auth_sessions_user' UNION ALL
 SELECT 'auth_sessions','idx_auth_sessions_expiry' UNION ALL
 SELECT 'auth_sessions','idx_auth_sessions_revoked' UNION ALL
 SELECT 'owner_setup_guard','PRIMARY' UNION ALL
 SELECT 'users','uq_users_single_distributor_login'
) expected
LEFT JOIN information_schema.STATISTICS actual
 ON actual.TABLE_SCHEMA=DATABASE()
 AND actual.TABLE_NAME=expected.table_name
 AND actual.INDEX_NAME=expected.index_name
GROUP BY expected.table_name,expected.index_name,actual.INDEX_NAME,actual.NON_UNIQUE
ORDER BY expected.table_name,expected.index_name;

-- Read-only counts for core tables reported as existing in the initial DB snapshot.
-- If any of these are absent, skip the corresponding count statement.
SELECT 'users' table_name, COUNT(*) row_count FROM users
UNION ALL SELECT 'products',COUNT(*) FROM products
UNION ALL SELECT 'stock_locations',COUNT(*) FROM stock_locations
UNION ALL SELECT 'stock_movements',COUNT(*) FROM stock_movements
UNION ALL SELECT 'suppliers',COUNT(*) FROM suppliers
UNION ALL SELECT 'distributors',COUNT(*) FROM distributors
ORDER BY table_name;

-- CONDITIONAL POSTFLIGHT: run only after migration 007 created owner_setup_guard.
SELECT id,COUNT(*) guard_rows FROM owner_setup_guard WHERE id=1 GROUP BY id;

-- Read-only check of expected single active warehouse and damaged-stock location.
SELECT location_type, is_active, COUNT(*) count_by_type
FROM stock_locations
GROUP BY location_type,is_active
ORDER BY location_type,is_active;
