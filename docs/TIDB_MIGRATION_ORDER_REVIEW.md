# Migration inventory & proposed manual order (NOT EXECUTION INSTRUCTIONS YET)

The SQL files are manual migration scripts. **Do not run them until preflight is reviewed against actual TiDB schema.** The repository has duplicate numeric prefixes, a missing server migration prefix, legacy migration files in a separate directory, overlapping table definitions, and no migration ledger guaranteeing exactly-once application.

## Proposed dependency order

1. Inspect actual legacy schema first; migration 001 assumes legacy tables `products`, `suppliers`, `supplier_payments`, `stock_locations`, `stock_movements`, etc. already exist.
2. `server/migrations/001_application_foundation.sql`
3. `server/migrations/003_distributor_accounting.sql`
4. `server/migrations/004_cost_columns.sql`
5. `server/migrations/004_user_login_identifiers.sql`
6. `server/migrations/005_retail_sales.sql` — overlapping/mostly redundant because 001 already creates retail tables; compare live `SHOW CREATE TABLE` and skip statements/whole file if objects already exist.
7. `server/migrations/005_supplier_payment_allocations.sql`
8. `server/migrations/006_returns_history_reports.sql`
9. `server/migrations/007_auth_sessions.sql` — **file exists**; adds revocable sessions and owner-bootstrap guard.
10. `server/migrations/008_inventory_adjustments.sql`
11. `server/migrations/009_cash_management.sql`
12. `server/migrations/010_receivables_price_history_periods.sql`
13. `server/migrations/011_seed_products_min_stock.sql` — seed/master data; review against existing names/SKUs and separate from structural DDL.
14. `server/migrations/012_sales_audit_data_capture.sql`
15. `server/migrations/013_audit_rule_settings.sql`
16. `server/migrations/014_retail_price_floor_audit.sql`
17. `server/migrations/015_channel_cost_allocations.sql`
18. `server/migrations/016_sales_moq_controls.sql`
19. `server/migrations/017_sales_note_print_audit.sql`
20. `server/migrations/018_distributor_consignment_returns.sql`
21. `server/migrations/019_consignment_delivery_print_audit.sql`
22. `server/migrations/020_cash_reconciliation_sessions.sql`
23. `server/migrations/021_retail_receipt_print_audit.sql`
24. `server/migrations/022_cash_account_source_type.sql`
25. `server/migrations/023_sales_report_print_event_audit.sql`

This is a **provisional dependency order only**, not approval to execute. Each statement must be conditionally reconciled to the live schema before the user runs SQL.

## Prefix collisions, legacy file, and migration tracking

- Prefix 004 has two files; prefix 005 has two files. Do not rely on lexicographic ordering; use the dependency list above only after schema checks.
- **Server migration 002 is absent.** A separate file `database/migrations/002_distributor_accounting_foundation.sql` exists but is a legacy/alternate migration: it is not in the active `server/migrations` set, includes non-idempotent `ALTER TABLE` statements, and creates older table shapes/names (including `consignment_dispatches`) that differ from the current implementation. **Do not run it as a missing migration 002 and do not combine it with the active migration series.** Its objects/changes must only be considered after explicit comparison with actual schema.
- Migration 007 is present in `server/migrations`; it must not be mistaken as missing.
- 001 creates `retail_sales` and `retail_sale_items`; 005 retail-sales also defines these tables with overlapping but not identical columns/indexes. Since both use `CREATE TABLE IF NOT EXISTS`, running the later file does not reconcile an existing table's shape. Inspect table definitions; apply only missing columns/indexes conditionally.
- 001 and 003 also create/add several overlapping foundation objects; inspect each table and index before applying.
- Migration 020 adds physical cash/bank reconciliation sessions; review timestamp, timezone, and ledger-movement semantics before applying.
- Migration 021 adds SKU snapshots and retail receipt print audit; check existing rows safely default and table/index absence/presence.
- Migration 023 adds immutable distributor sales-note print/reprint event logs; include it in final postflight checks.
- Historical TiDB snapshot showed missing tables including `accounting_periods`, `accounting_period_guard`, `cash_transactions`, `channel_cost_allocations`, and `product_price_history`; repeat preflight because snapshot is not current.
- `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` do not guarantee the whole script is safe after partial execution. Review unique indexes, seed collisions, legacy table shapes, and TiDB syntax.
- DDL rollback is generally not transactional. Backup/restore is the recovery strategy; do not run ad-hoc DROP/DELETE rollback against the user's DB.

## Audit requirement

Before preparing an execution package, produce an exact migration-by-migration table: file, SQL statements, live existing/missing objects, re-run safety, dependencies, TiDB compatibility, data impact, and postflight query. Mark statements conditional based on schema. The current order is provisional and is not approval to execute.
