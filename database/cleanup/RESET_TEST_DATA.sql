-- RESET TEST DATA - SPAREPART MANAGEMENT
-- PURPOSE: remove all known TEST/transaction data while retaining master/configuration data.
-- RUN ONLY AFTER CONFIRMING THE DATABASE IS IN TEST-ONLY STATE.
-- BACKUP FIRST. Execute as one script in TiDB SQL Editor.
--
-- Retained:
--   products, suppliers, distributors, stock_locations, accounts, cash_accounts,
--   users (except explicit test user id=2 below), audit_logs, schema_migrations.
--
-- Cleared:
--   all operational transactions, stock movements, journals, payments, returns,
--   expenses and opening balances.
--
-- Do NOT run this against a live/production database containing real transactions.

START TRANSACTION;

-- Children/detail rows first.
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

-- Transaction headers.
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

-- Stock ledger and other transaction tables.
DELETE FROM stock_movements;
DELETE FROM expenses;
DELETE FROM opening_balances;
DELETE FROM transaction_corrections;

-- Derived product costing must not retain values from deleted transactions.
UPDATE products
SET average_cost = 0,
    last_purchase_cost = 0;

-- Test login account. This is intentionally explicit; change/remove this line
-- if user id 2 is no longer the designated test account.
DELETE FROM users WHERE id = 2;

COMMIT;

-- Verification after reset. All should be 0 except master/audit tables.
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
UNION ALL SELECT 'transaction_corrections', COUNT(*) FROM transaction_corrections;

SELECT id, username, role, distributor_id, is_active
FROM users
ORDER BY id;
