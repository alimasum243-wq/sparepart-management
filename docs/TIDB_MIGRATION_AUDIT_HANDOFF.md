# Pre-Migration TiDB Audit Handoff

## Purpose
This document is the handoff gate between application hardening and the user's manual TiDB migration audit. No SQL in this repository has been executed against the user's TiDB instance by the coding agent.

## User's current database facts (reported / snapshot supplied by user)
- Database: `sparepart_db`
- Engine: TiDB Cloud Starter, MySQL-compatible
- Snapshot previously supplied by user: 31 tables; 25/30 required table checks were present, five tables were missing at that time:
  - `accounting_periods`
  - `accounting_period_guard`
  - `cash_transactions`
  - `channel_cost_allocations`
  - `product_price_history`
- User reported only exploratory setup, no production usage or real business transactions.
- These are historical snapshot facts, not a fresh live inspection. Re-audit current schema before migration.

## Gate before asking user to run SQL
- [ ] All application-code blockers found in audit have either been fixed or explicitly listed as not implemented. (Current partial distributor return/history implementation and remaining gaps are documented.)
- [ ] Build, type-check, and CI pass on the hardening branch's latest commit.
- [ ] Migrations are consolidated, numbered, and checked for TiDB compatibility and safe re-run/partial-run behavior.
- [ ] Migration SQL does not drop or truncate user data.
- [ ] Every required table/column/index/constraint is compared against the actual database, not assumed.
- [ ] Seed SQL is separated from schema changes and reviewed for duplicates/unique-key behavior.
- [ ] Migration order/dependencies and rollback/recovery strategy are documented (where rollback is feasible; destructive DDL generally requires backup/restore plan).
- [ ] SQL is presented as a single ordered package with preflight checks, migration scripts, postflight verification, and recovery notes.
- [ ] Explicitly mark which SQL is safe to execute and which is conditional based on schema inspection.
- [ ] Final application-vs-database schema mapping and required-table checklist are reviewed.

## Audit outputs to produce for the user
1. **Preflight SQL**: database name, TiDB version, tables, columns, indexes, constraints, row counts, and migration-relevant schema checks. Updated preflight includes duplicate distributor-login checks and migration-023 table/columns.
2. **Migration package**: ordered scripts with exact filenames, purpose, prerequisites, and dependencies. Preliminary statement-level repository review is in `TIDB_MIGRATION_STATEMENT_REVIEW.md`.
3. **Conditional SQL**: instructions for only the missing columns/tables/indexes, avoiding duplicate DDL.
4. **Seed package**: product/COA/location/account seeds and idempotency review, separated from structural migration.
5. **Postflight SQL**: verify table/column/index presence, seed counts, references, and no accidental duplicate records.
6. **App compatibility report**: endpoint/UI feature mapped to required schema.
7. **Operational safety**: backup confirmation, credentials safety, transaction limitations for DDL, and how to stop if a statement fails.

## Additional migrations created during hardening
- `018_distributor_consignment_returns.sql`: unsold consignment return request tables. Pending requests do not post stock; owner approval posts movement.
- `019_consignment_delivery_print_audit.sql`: audited print/reprint requests for distributor delivery notes.
- `020_cash_reconciliation_sessions.sql`: cash/bank physical opening/closing count sessions; stores system opening and opening variance, then expected closing calculated from posted GL movement during the session.
- `021_retail_receipt_print_audit.sql`: retail sale item SKU snapshot and persistent receipt print/reprint audit log.
- `022_cash_account_source_type.sql`: cash/bank source classification (`RETAIL`, `SALES`, `GENERAL`); existing accounts default `GENERAL`, and owner can reclassify only before any journal/cash transaction history.
- `023_sales_report_print_event_audit.sql`: append-only print/reprint event log for distributor sales notes; rapid-print audit uses the first logged print timestamp. Legacy reports without event logs fall back to the migration-017 last-print timestamp and are labelled as legacy. Migration 023 is included in the migration-order review.
- `024_users_single_distributor_login.sql`: unique index enforcing one distributor login per distributor, matching current reset-password and distributor-creation logic; preflight duplicate check required.
- All are additive; review schema dependencies against TiDB before running.

## Cash reconciliation sessions (migration 020)
- Owner-only opening/closing count sessions per cash/bank account.
- Opening physical count and system GL opening are recorded separately, with opening variance. Expected close = system opening + posted journal-line movements created during the session window; closing count and closing variance are recorded.
- No automatic journal or loss/charge is posted.
- Pending code review/CI/acceptance: validate time zone conversion, accounts mapped to active ASSET ledger accounts, transfers, cash receipts/refunds, expenses, purchases, supplier payments, distributor remittances, and bank reconciliation.
- Cashier-level attribution and physical drawer identity are not yet separate from cash-account/session attribution.

## Remaining acceptance and integration checks before the gate

- Cash/bank subledger tie-out against GL and bank statements; all inflows/outflows/transfers and distributor payment allocations/unapplied amounts.
- Distributor portal: verify note-level totals, sales/payment/return histories, pending/approved/rejected states, and durable print/reprint logs end-to-end.
- Distributor consignment-return workflow: verify request, approval/rejection, stock reservation/validation, mixed-condition handling, movement posting, accounting-period checks, and no automatic refund.
- Distributor stock-custody reconciliation: handover minus approved sell-through minus approved returns, physical count, and variance proposal; no automatic distributor charge.
- Audit/security: authorization/IDOR isolation, duplicate/idempotency and concurrency safety, actor/timestamp/reason auditability; session expiry/revocation/logout and bootstrap controls.
- Investor reporting: source drill-down, pending vs posted, channel contribution, inventory valuation, liabilities/receivables, cash-source and physical reconciliation, trial balance/balance sheet consistency.
- Retail below-master-price exception approval workflow (reason and audit trail) and all pricing/HPP snapshot rules.
- Complete unit, integration, and E2E coverage; CI on exact latest head SHA.

## Critical accounting rules
- Consignment delivery is custody transfer only, not a sale, revenue, or receivable.
- Distributor sell-through is pending until owner approval; approved posting is exactly once.
- Payments are not silently reallocated. Allocation is explicit and traceable.
- Return of unsold consignment does not automatically create a refund or reduce an approved sale. It is a stock-custody return workflow.
- Good and damaged returned stock go to distinct controlled locations/statuses.
- Any stock/financial variance is a review item; no automatic distributor debt is created.
- Ecer and distributor channel revenue, costs, remittances, and cash sources must stay separately traceable.

## Current state
This is a preparation/checklist document. It does not certify application readiness, schema readiness, or migration safety. The migration audit starts only after the remaining implementation and tests are completed and the latest branch is checked.
