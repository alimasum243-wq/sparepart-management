# Preliminary statement-level migration review (read-only audit; not execution approval)

This is a repository-SQL review only. The actual `sparepart_db` schema, unique-index state, duplicate rows, and TiDB DDL behavior have not been re-queried. Therefore every migration below remains **conditional** until preflight is reviewed against the user's live schema and a backup/restore plan is confirmed.

## Active server migration series

| File | Scope | Repository review | Main prerequisite / risk |
|---|---|---|---|
| 001_application_foundation.sql | Adds application foundation tables/columns/indexes | Additive; creates/extends users, purchases, purchase items, retail tables, expenses, journals, opening balances | Legacy tables must exist; unique indexes can fail on duplicate usernames/invoices/lines; duplicate retail table definitions overlap 005 |
| 003_distributor_accounting.sql | COA, cash accounts, distributors, audit log, consignment/report/payment tables, default account seeds | Additive table creation; seed accounts via WHERE NOT EXISTS | Existing account-code duplicates or partially-created table shape; compare 001 and actual schema |
| 004_cost_columns.sql | HPP columns on products | ADD COLUMN IF NOT EXISTS | Confirm product schema; additive |
| 004_user_login_identifiers.sql | email/phone columns and unique indexes | Additive, nullable unique fields | Existing duplicate non-NULL emails/phones can block unique indexes; preflight after columns exist |
| 005_retail_sales.sql | Retail sale tables | Mostly redundant with 001; CREATE IF NOT EXISTS will not reconcile existing table shape | Compare SHOW CREATE TABLE; skip/reconcile individually; don't assume the file upgrades 001 tables |
| 005_supplier_payment_allocations.sql | Supplier payment posted_at and allocations table/index | Additive; unique payment/purchase allocation pair | Duplicate allocation pairs can block unique index; compare table/columns |
| 006_returns_history_reports.sql | Purchase/retail/distributor return tables, return COA seed, unique indexes | Additive; seed is guarded by account code | Preflight duplicate return codes/line keys and account code; verify stock/journal logic in app tests |
| 007_auth_sessions.sql | Revocable auth sessions and owner setup guard | File EXISTS; additive CREATE IF NOT EXISTS and guard-row insert guarded by NOT EXISTS | Confirm guard row/table and session columns; test bootstrap concurrency in integration environment |
| 008_inventory_adjustments.sql | Adjustment tables, damaged location, adjustment COA seeds | Additive tables and guarded location/account seeds | Check duplicate location/account codes and existing table shape; seed may be skipped when code exists |
| 009_cash_management.sql | Ledger mapping columns, cash-account mapping UPDATE, cash transaction table | Additive; mapping UPDATE only where ledger_account_id is NULL, repeat-safe for same mapping | Check account codes/types and cash-account legacy data; review mapping results before/after |
| 010_receivables_price_history_periods.sql | Invoice/due/unapplied fields, indexes, advance liability COA, product-price snapshot, periods and guard | Additive; snapshot seed guarded by source/product; guard row insert guarded | Unique invoice code, duplicate indexes; verify product-price snapshots and period-guard row |
| 011_seed_products_min_stock.sql | min_stock column plus temporary supplier/product seed data and seed price-history | Seed INSERTs now guard both matching name and matching supplier code/product SKU; price-history seed guarded by product/source | **Master-data seed only; owner must review SKUs/prices.** Existing name/code/SKU collisions need inspection; not a routine blind run |
| 012_sales_audit_data_capture.sql | Sales area label | Additive column | Verify distributor_sales_reports exists |
| 013_audit_rule_settings.sql | Audit thresholds table and default row | Table create plus ON DUPLICATE KEY no-op update | Verify table/row values and TiDB syntax; repeated run intended |
| 014_retail_price_floor_audit.sql | Retail price snapshot/override reason columns | Additive columns | Verify retail_sale_items schema |
| 015_channel_cost_allocations.sql | Channel expense allocation table | Additive table with unique expense/channel | Existing allocation duplicate check and source-expense reconciliation needed |
| 016_sales_moq_controls.sql | Product MOQ and report-item snapshot columns | Additive columns | Verify product and report-item table shapes |
| 017_sales_note_print_audit.sql | Report print summary fields | Additive columns | Verify report table; legacy timestamps are summary-only |
| 018_distributor_consignment_returns.sql | Unsold return request/header/items | Additive tables/column; duplicate item key is constrained | Check existing table shape, duplicate request/item lines and location rules |
| 019_consignment_delivery_print_audit.sql | Consignment delivery print-event log | Additive table | Verify delivery IDs, print log table shape, application audit semantics |
| 020_cash_reconciliation_sessions.sql | Physical cash/bank count sessions | Additive table | Verify cash-account IDs, timezone interpretation, ledger-account mapping and session constraints |
| 021_retail_receipt_print_audit.sql | SKU snapshot and retail receipt print-event log | Additive column/table | Verify existing SKU snapshots and duplicate receipt logs |
| 022_cash_account_source_type.sql | Cash/bank source classification | Additive column default GENERAL | Review legacy account category assignments before owner reclassification; ensure no transactions block changes |
| 023_sales_report_print_event_audit.sql | Append-only sales-note print/reprint log | Additive table and unique report/print number | Check duplicate event keys and migration-017 summary values |
| 024_users_single_distributor_login.sql | Unique index on users.distributor_id (NULL owner/admin accounts allowed) | Additive unique index matching current app's one-login-per-distributor assumption | Duplicate non-NULL distributor IDs must be resolved first; confirm policy is one login per distributor |

## Legacy alternate migration

`database/migrations/002_distributor_accounting_foundation.sql` is not part of the active `server/migrations` sequence. It is an older, non-idempotent alternate migration: it directly adds columns and creates older dispatch/review tables. **Do not run it as missing server migration 002.** It must be reconciled separately against live schema if its historical changes are relevant.

## Key partial-run/idempotency cautions

- `CREATE TABLE IF NOT EXISTS` does not upgrade an existing table to the new column/index shape.
- `ADD COLUMN IF NOT EXISTS` does not validate an existing column's type/default.
- `CREATE UNIQUE INDEX IF NOT EXISTS` may fail when duplicate rows exist and may create redundant indexes if the same columns already have a differently named index.
- Seed statements guarded by `WHERE NOT EXISTS` can skip a name/code conflict rather than resolve it; review resulting master data.
- Migration 011 is deliberately a seed file and should be reviewed separately from structural DDL.
- TiDB DDL is not a single atomic transaction across a file. If any statement fails, stop and capture the error and actual schema state; do not blindly restart the entire file.
- Do not use destructive rollback SQL. Recovery is by pre-migration backup and isolated restore/reconciliation.

## Required preflight checks

1. Confirm `DATABASE() = sparepart_db` and record TiDB version/time.
2. Export tables, columns, indexes and `SHOW CREATE TABLE` for all affected legacy tables.
3. Check duplicate SKU/name, supplier code/name, username, email/phone (after 004), distributor_id (before 024), invoice identifiers, report/payment/return codes, and allocation/print event keys only where columns exist.
4. Confirm migration-required base tables and their shape before each script.
5. Compare existing unique indexes by columns, not just index name; avoid redundant indexes.
6. Review seed supplier/product names, codes, SKUs, and COA accounts before 011/seed migrations.
7. Record pre-migration row counts and backup identifier.

## Required postflight checks

- Required tables/columns/indexes present with expected types/defaults.
- Migration 007 auth_sessions and owner_setup_guard exist and guard row id=1 is present.
- Migration 023 print log table exists; no duplicate report_id/print_number.
- Migration 024 unique index exists; no duplicate distributor login mappings.
- Seed products/suppliers/COA only as owner-approved; no unintended duplicate master data.
- Compare before/after row counts and master-data values; confirm no unexpected changes.
- Record exact statement/result/error and stop on any unexplained discrepancy.

**Status:** preliminary SQL review completed from repository files. Live TiDB compatibility and actual-schema reconciliation are still pending.
