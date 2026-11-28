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
 UNION ALL SELECT 'distributor_consignment_return_request_items' UNION ALL SELECT 'cash_reconciliation_sessions'
 UNION ALL SELECT 'distributor_payment_allocations' UNION ALL SELECT 'distributor_payment_submissions'
 UNION ALL SELECT 'distributor_sales_report_items' UNION ALL SELECT 'distributor_sales_reports'
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
 'users','products','stock_locations','stock_movements','distributors','suppliers','supplier_payments','purchases','purchase_items',
 'consignment_deliveries','consignment_delivery_items','distributor_sales_reports',
 'distributor_sales_report_items','distributor_payment_submissions',
 'distributor_payment_allocations','distributor_sales_returns','distributor_sales_return_items','supplier_payment_allocations','purchase_returns','purchase_return_items',
 'accounts','cash_accounts','cash_transactions','expenses','channel_cost_allocations',
 'product_price_history','accounting_periods','accounting_period_guard',
 'inventory_adjustments','inventory_adjustment_items','consignment_delivery_print_logs',
 'distributor_consignment_return_requests','distributor_consignment_return_request_items','cash_reconciliation_sessions','retail_sales','retail_sale_items','retail_sale_print_logs','retail_sale_returns','retail_sale_return_items'
 )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Duplicate-value checks: review before adding unique indexes or running seed statements.
-- Run this block only when all legacy source tables named below are present.
SELECT 'products.sku' check_name,sku duplicate_value,COUNT(*) duplicate_count FROM products WHERE sku IS NOT NULL AND TRIM(sku)<>'' GROUP BY sku HAVING COUNT(*)>1
UNION ALL SELECT 'products.product_name',product_name,COUNT(*) FROM products WHERE product_name IS NOT NULL AND TRIM(product_name)<>'' GROUP BY product_name HAVING COUNT(*)>1
UNION ALL SELECT 'suppliers.supplier_code',supplier_code,COUNT(*) FROM suppliers WHERE supplier_code IS NOT NULL AND TRIM(supplier_code)<>'' GROUP BY supplier_code HAVING COUNT(*)>1
UNION ALL SELECT 'suppliers.supplier_name',supplier_name,COUNT(*) FROM suppliers WHERE supplier_name IS NOT NULL AND TRIM(supplier_name)<>'' GROUP BY supplier_name HAVING COUNT(*)>1
UNION ALL SELECT 'accounts.account_code',account_code,COUNT(*) FROM accounts WHERE account_code IS NOT NULL AND TRIM(account_code)<>'' GROUP BY account_code HAVING COUNT(*)>1
UNION ALL SELECT 'cash_accounts.account_code',account_code,COUNT(*) FROM cash_accounts WHERE account_code IS NOT NULL AND TRIM(account_code)<>'' GROUP BY account_code HAVING COUNT(*)>1
UNION ALL SELECT 'users.username',username,COUNT(*) FROM users WHERE username IS NOT NULL AND TRIM(username)<>'' GROUP BY username HAVING COUNT(*)>1
UNION ALL SELECT 'users.email',email,COUNT(*) FROM users WHERE email IS NOT NULL AND TRIM(email)<>'' GROUP BY email HAVING COUNT(*)>1
UNION ALL SELECT 'users.phone',phone,COUNT(*) FROM users WHERE phone IS NOT NULL AND TRIM(phone)<>'' GROUP BY phone HAVING COUNT(*)>1
UNION ALL SELECT 'purchases.supplier_invoice_no',CONCAT(supplier_id,':',supplier_invoice_no),COUNT(*) FROM purchases WHERE supplier_invoice_no IS NOT NULL AND TRIM(supplier_invoice_no)<>'' GROUP BY supplier_id,supplier_invoice_no HAVING COUNT(*)>1
UNION ALL SELECT 'distributor_sales_reports.invoice_code',invoice_code,COUNT(*) FROM distributor_sales_reports WHERE invoice_code IS NOT NULL AND TRIM(invoice_code)<>'' GROUP BY invoice_code HAVING COUNT(*)>1
UNION ALL SELECT 'consignment_delivery_items.delivery_product',CONCAT(delivery_id,':',product_id),COUNT(*) FROM consignment_delivery_items GROUP BY delivery_id,product_id HAVING COUNT(*)>1
UNION ALL SELECT 'distributor_sales_report_items.report_product',CONCAT(report_id,':',product_id),COUNT(*) FROM distributor_sales_report_items GROUP BY report_id,product_id HAVING COUNT(*)>1
UNION ALL SELECT 'distributor_payment_allocations.payment_report',CONCAT(payment_submission_id,':',sales_report_id),COUNT(*) FROM distributor_payment_allocations GROUP BY payment_submission_id,sales_report_id HAVING COUNT(*)>1
UNION ALL SELECT 'supplier_payment_allocations.payment_purchase',CONCAT(supplier_payment_id,':',purchase_id),COUNT(*) FROM supplier_payment_allocations GROUP BY supplier_payment_id,purchase_id HAVING COUNT(*)>1
UNION ALL SELECT 'retail_sale_items.sale_product',CONCAT(sale_id,':',product_id),COUNT(*) FROM retail_sale_items GROUP BY sale_id,product_id HAVING COUNT(*)>1
ORDER BY check_name,duplicate_value;

-- Required additive columns introduced by migrations 017-021; reports missing column names.
SELECT expected.table_name,expected.column_name,
       CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM (
 SELECT 'distributor_sales_reports' table_name,'print_requested_at' column_name UNION ALL
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
 SELECT 'retail_sale_items','sku_snapshot' UNION ALL
 SELECT 'retail_sale_print_logs','sale_id' UNION ALL
 SELECT 'retail_sale_print_logs','user_id' UNION ALL
 SELECT 'retail_sale_print_logs','printed_at' UNION ALL
 SELECT 'consignment_delivery_print_logs','delivery_id' UNION ALL
 SELECT 'consignment_delivery_print_logs','distributor_id' UNION ALL
 SELECT 'consignment_delivery_print_logs','user_id' UNION ALL
 SELECT 'consignment_delivery_print_logs','printed_at'
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
