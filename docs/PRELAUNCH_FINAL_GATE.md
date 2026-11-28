# Final Prelaunch Gate — Sparepart Management

**Status: BLOCKED — not approved for real transactions.** A checkbox is completed only after a test and evidence are recorded. Passing CI alone is not business acceptance.

## 1. Cash, bank, and journal reconciliation
- [ ] Verify cash/bank subledger opening balances against GL accounts.
- [ ] Reconcile cash/bank transaction totals against journal lines by account/date.
- [ ] Verify balance = opening + receipts - payments, including transfers.
- [ ] Verify transfers are balanced and excluded from revenue/expense.
- [ ] Reconcile verified distributor receipts to allocations + unapplied advances.
- [ ] Reconcile supplier payments, retail receipts/refunds, expenses, owner draws, capital.
- [ ] Record reconciliation difference; it must be zero.

## 2. Opening balances and capital
- [ ] Define opening date and source evidence.
- [ ] Enter opening cash/bank, inventory, receivables, payables, and assets/liabilities using balanced journals.
- [ ] Determine opening capital only after source balances are confirmed.
- [ ] Verify opening trial balance debit = credit.
- [ ] Reconcile opening stock quantity, cost, stock locations, and inventory GL value.
- [ ] Check that opening entries and seed transactions are not duplicated.

## 3. Backup and recovery
- [ ] Document TiDB backup method, schedule, retention, access, and encryption.
- [ ] Take pre-migration backup and record timestamp/identifier.
- [ ] Restore into an isolated environment.
- [ ] Verify schema, row counts, inventory/cash/AR/AP/journal totals, and app connection.
- [ ] Document recovery owner, RPO/RTO, and restore steps.
- [ ] Never restore-test by overwriting the live database.

## 4. Migration against actual TiDB
- [ ] Confirm target environment; use isolated clone/test database.
- [ ] Record existing schema via SHOW CREATE TABLE.
- [ ] Run duplicate/preflight checks and resolve findings.
- [ ] Apply migrations in documented order on clone; record statement/result/version/errors.
- [ ] Verify schema, indexes, constraints as supported, seeds, and data preservation.
- [ ] Test reruns only for migrations explicitly designed to be repeatable.
- [ ] Confirm no destructive statements or duplicated seeds/master rows.
- [ ] Finalize SQL runbook and stop/recovery instructions.

## 5. Concurrency and transaction simulations
- [ ] Concurrent retail sales of same SKU cannot oversell.
- [ ] Concurrent distributor reports cannot reserve/sell the same stock twice.
- [ ] Concurrent approvals cannot double-post stock, receivables, or journals.
- [ ] Concurrent payment submit/verify cannot overallocate or duplicate cash/AR changes.
- [ ] Concurrent supplier payments, refunds, and expenses cannot overspend cash/bank.
- [ ] Purchase, transfer, sale, return, adjustment, damage/loss/write-off preserve stock and valuation.
- [ ] Test partial payments, overpayments/unapplied receipts, rejection, cancellation, duplicate requests, and rollback.
- [ ] Verify weighted-average HPP, return HPP, and rounding with manual cases.

## 6. Security, access, and end-to-end audit
- [ ] Test no-auth, owner, admin (if enabled), and distributor access for all API routes.
- [ ] Distributor A cannot access B data through altered IDs, URLs, or bodies.
- [ ] Verify session revocation on logout, reset, deactivation, role/distributor changes.
- [ ] Bootstrap setup is one-time, rate-limited, and disabled after owner setup.
- [ ] Verify validation, parameterized SQL, safe errors, and sensitive-data redaction.
- [ ] Verify secrets are absent from repository; production TLS/secure cookies configured.
- [ ] Audit logs exist for create/edit/approve/reject/post/void/adjust and are protected.
- [ ] Walk purchase, retail, distributor delivery/report/approval/payment, supplier payment, expenses, returns, capital, draws, transfer, adjustment, journal, and period close; reconcile stock/subledger/GL/log.

## 7. Migration SQL finalization
- [ ] Validate preconditions and duplicates before unique indexes.
- [ ] Check every migration statement for TiDB compatibility.
- [ ] Confirm dependency sequence across migrations 001 and 003–011.
- [ ] Produce final runbook: preflight, order, postflight queries, stop/recovery guidance.
- [ ] No migration executed against the user's TiDB until backup and runbook are approved.

## 8. Application acceptance
- [ ] CI unit tests, lint, typecheck, build pass on exact final commit.
- [ ] Integration tests pass on TiDB-compatible test environment.
- [ ] Transaction tests pass with no unexplained discrepancies.
- [ ] Owner/distributor flows tested on desktop and mobile.
- [ ] CSV/PDF exports, filters, stock cards, dashboard, trial balance, balance sheet, P&L tie to source.
- [ ] Deployment, domain, CORS, cookies, TLS, monitoring, and backup verified.
- [ ] Owner signs off evidence; only then consider merge/deploy and real use.

## Evidence log
Record date/time, tester, commit SHA, environment/TiDB version, steps or SQL, expected/actual results, and evidence. Do not mark complete based on code inspection alone.
