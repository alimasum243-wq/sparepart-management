# Migration inventory & proposed manual order (NOT EXECUTION INSTRUCTIONS YET)

The SQL files are manual migration scripts. **Do not run them until preflight is reviewed against actual TiDB schema.** Several prefixes are duplicated, and the repository does not yet have a migration ledger guaranteeing exactly-once application.

## Proposed dependency order
1. Inspect existing legacy schema first; 001 assumes legacy tables `products`, `suppliers`, `supplier_payments`, `stock_locations`, `stock_movements`, etc. are already present.
2. `001_application_foundation.sql`
3. `003_distributor_accounting.sql`
4. `004_cost_columns.sql`
5. `004_user_login_identifiers.sql`
6. `005_retail_sales.sql`
7. `005_supplier_payment_allocations.sql`
8. `006_returns_history_reports.sql`
9. `007_auth_sessions.sql`
10. `008_inventory_adjustments.sql`
11. `009_cash_management.sql`
12. `010_receivables_price_history_periods.sql`
13. `011_seed_products_min_stock.sql` (review seed contents and duplicates first; treat separately from structural DDL)
14. `012_sales_audit_data_capture.sql`
15. `013_audit_rule_settings.sql`
16. `014_retail_price_floor_audit.sql`
17. `015_channel_cost_allocations.sql`
18. `016_sales_moq_controls.sql`
19. `017_sales_note_print_audit.sql`
20. `018_distributor_consignment_returns.sql`
21. `019_consignment_delivery_print_audit.sql`\n22. `020_cash_reconciliation_sessions.sql`\n23. `021_retail_receipt_print_audit.sql`

## Prefix collisions / migration tracking
- Prefix 004 has two files; prefix 005 has two files. Do not assume filename sorting is sufficient; use the exact proposed order only after checking dependencies.
- Migration 002 is absent; legacy table creation is outside the currently numbered migration set and must be captured by schema preflight.
- Migration 020 adds physical cash/bank reconciliation session records; review timestamp and ledger mapping semantics before applying.\n- Migration 021 adds SKU snapshot to retail sale items and retail receipt print audit table; confirm pre-existing retail rows remain safely defaulted and the print log table is absent/present before applying.\n- The user-supplied TiDB table snapshot previously showed several expected tables missing, including accounting period guard/periods, cash transaction subledger, channel-cost allocations, and product price history. That snapshot is historical; repeat preflight.
- Migration files include `CREATE TABLE IF NOT EXISTS` and additive `ADD COLUMN IF NOT EXISTS`, but not every index/seed operation is guaranteed safe under partial execution. Inspect for already-present indexes, unique-key conflicts, duplicate seed rows, and TiDB syntax compatibility.
- DDL rollback is not generally transactional. Back up/restore is the recovery method; do not write ad-hoc DROP/DELETE rollback scripts against the user's database.

## Audit requirement
Before preparing an execution package, produce an exact migration-by-migration table: file, SQL statements, existing objects, missing objects, whether each statement is safe/re-run-safe, dependencies, TiDB compatibility, data impact, and postflight query. Mark statements conditional where object already exists. The current order is provisional and is not approval to execute.
