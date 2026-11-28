# Production Readiness Execution Plan

**Current gate:** BLOCKED — not approved for real transactions.
**Branch:** `prelaunch/hardening-and-audit`
**Scope:** Execute remaining prelaunch checks in evidence-based order. Do not merge, deploy, or use the live business database for test transactions.

## Verified baseline (reported/observed)
- User reports TiDB database and migrations 019–024 are complete (user-confirmed; no direct database connection or independent verification by this document).
- Latest branch CI/build/typecheck reported successful in the audit conversation. Re-check against exact head before final gate.
- Critical code audit and listed hardening changes are reviewed; this is code review, not proof of runtime transaction correctness.

## Test environment rules
1. Use a separate, isolated TiDB test database/instance or a sanitized clone. Never run test transactions against `sparepart_db` used as the business target.
2. No real credentials in Git, logs, screenshots, or test artifacts. Do not ask the assistant to connect to the user's DB.
3. Record exact commit SHA, TiDB version, schema/migration state, tester, timestamp/timezone, test case ID, expected and actual results, evidence reference, and cleanup confirmation.
4. Do not mark a case passed from static code review alone. Record `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`.
5. For failed cases, stop affected flow; do not continue with dependent tests until root cause and corrective action are documented.
6. Test data should be synthetic and tagged; test cleanup must be verified with read-only queries.

## Stage A — Integration and accounting transaction tests
Environment required: isolated TiDB-compatible test database and test credentials configured locally (not committed).

### A1. Opening balances and trial balance
- [ ] Set a documented opening date and source evidence.
- [ ] Enter synthetic opening cash/bank, inventory by location, receivables, payables, and other opening assets/liabilities.
- [ ] Ensure capital is derived only after source balances are verified.
- [ ] Trial balance debit equals credit.
- [ ] Inventory opening quantities, costs, locations, and inventory GL reconcile exactly.
- [ ] Duplicate opening entry is prevented/detected.

### A2. Transaction posting and rollback
Run each test with before/after ledger and stock snapshots:
- [ ] Purchase receipt increases stock and posts payable/cash, HPP, and journal as expected.
- [ ] Supplier payment reduces payable and cash/bank exactly once.
- [ ] Retail sale reduces warehouse stock, posts receipt, revenue, HPP and journal atomically.
- [ ] Retail return restores stock/valuation and reverses the correct sale/HPP/receipt impact.
- [ ] Purchase return reduces stock/payable correctly.
- [ ] Distributor consignment delivery moves stock location only; no revenue or receivable until approved sell-through.
- [ ] Distributor sell-through report submission remains pending and has no posted GL/stock effect until owner approval.
- [ ] Approval posts stock/receivable/revenue/HPP/journal once.
- [ ] Distributor payment submission is pending; verification/allocation posts cash/AR once.
- [ ] Unsold consignment return request remains pending; approval moves good/damaged quantities to correct locations once.
- [ ] Stock adjustment/damage/loss posts movement and accounting according to configured reason.
- [ ] Expense, capital, draw, transfer, manual journal, and period close reconcile.
- [ ] Injected mid-transaction failure rolls back all related writes (no partial stock, cash, receivable, or journal).

## Stage B — Concurrency and idempotency
Use simultaneous requests from separate sessions and compare ledger snapshots:
- [ ] Retail requests competing for same SKU cannot oversell.
- [ ] Distributor reports cannot claim the same available consignment stock twice.
- [ ] Duplicate/replayed approval cannot post twice.
- [ ] Simultaneous payment submit/verify cannot over-allocate or duplicate cash/AR.
- [ ] Cash/bank payments, expenses, refunds, and supplier payments cannot create unintended negative balances.
- [ ] Return requests cannot return already-sold or already-returned stock.
- [ ] Duplicate submission, retry, timeout-after-commit, rejection, cancellation, and partial payment/unapplied receipt behavior are explicit and safe.
- [ ] Moving-average cost, return cost, rounding, and price snapshots verified with hand-calculated cases.

## Stage C — Access control and security
- [ ] Test unauthenticated, owner, admin (if configured), and distributor permissions on each route.
- [ ] Distributor A cannot access Distributor B's data by modifying IDs, URL parameters, query strings, or request bodies.
- [ ] Sessions revoked on logout, password reset, deactivation, and role/distributor reassignment.
- [ ] Owner bootstrap is one-time, rate-limited, disabled after setup, and produces audit evidence.
- [ ] Validation rejects malformed, negative, non-finite, over-limit, and unauthorized values.
- [ ] SQL uses parameters; server errors are sanitized; secrets are not exposed.
- [ ] Production TLS, secure cookie settings, CORS allowlist, rate limits, and secret configuration reviewed.
- [ ] Audit trail for create/edit/approve/reject/post/void/adjust/export is protected and complete.

## Stage D — Reconciliation and reporting
- [ ] Cash/bank opening and closing, receipts, refunds, expenses, purchases, supplier payments, transfers, and distributor remittances reconcile by account/date/source.
- [ ] Transfers are balanced and do not become income/expense or double count movements.
- [ ] Distributor receipts = allocations + unapplied advances; AR balances reconcile to ledger.
- [ ] Supplier AP/payments, retail receipts/refunds, expenses, capital/draw reconcile.
- [ ] Stock cards, warehouse/consignment/damaged quantities and inventory value reconcile to inventory GL.
- [ ] Dashboard, channel comparison, P&L, balance sheet, trial balance, AR/AP, stock reports and audit reports use correct posted/pending/voided status.
- [ ] Ecer vs Sales reports use historical price/HPP snapshots and allocated operating cost; no consignment delivery is counted as sales.
- [ ] CSV/PDF totals equal on-screen reports and source transactions; filters/date boundaries/timezone, pagination, and large exports tested.
- [ ] All discrepancies zero or individually documented, approved, and corrected; no unexplained balancing plugs.

## Stage E — Backup and recovery
- [ ] Confirm TiDB backup/export schedule, retention, access, encryption, and backup identifier/timestamp.
- [ ] Restore backup into isolated target (never overwrite the live database).
- [ ] Verify schema, indexes, key table counts, inventory/cash/AR/AP/journal totals, and application connectivity.
- [ ] Document responsible recovery person, RPO/RTO, restore instructions, and recovery decision points.

## Stage F — Owner and distributor UAT
Owner flows:
- [ ] Products/prices/MOQ, purchases, supplier payment, retail sale/return/refund, expense, capital/draw, cash-bank transfer, stock adjustment/opname, journal, period close.
- [ ] Approve/reject distributor reports, verify payments, approve/reject consignment returns.
- [ ] Check dashboard, stock card, cash-source reconciliation, aging, P&L, balance sheet, trial balance, exports, print slips, and audit log.

Distributor flows:
- [ ] Login/reset, own stock and handover notes, sales report submission, rejection/approval status.
- [ ] Payment submission, allocated/unapplied/paid/partial status.
- [ ] Unsold return request, inspection evidence, good/damaged classification, return status.
- [ ] Transaction notes, print/reprint, stock history, and cross-distributor denial.

- [ ] Desktop and mobile browser tests complete; print/PDF layouts readable.
- [ ] UAT evidence and owner sign-off recorded.

## Remaining feature gaps (not equivalent to test failures)
- External bank-statement matching/reconciliation workflow.
- Dedicated opening-balance wizard/guards for all account classes.
- Complete standard PDF/print slips for all transaction types and audited reprints.
- Unified investor report and drill-down across all modules.
- Margin-control enhancements: optional nominal channel floors, approvals/alerts and repeated small-order patterns.
- Cashier/physical drawer/shift attribution and edge-case reconciliation.
- Return evidence/inspection/source delivery traceability.
- Verify deployment configuration, monitoring, backup, TLS, domain/CORS/cookies, rollback.

## Evidence template
For every test:
- Case ID:
- Commit SHA:
- TiDB version / isolated environment:
- Tester and timestamp (timezone):
- Setup/data:
- Steps:
- Expected:
- Actual:
- Result (PASS/FAIL/BLOCKED/NOT RUN):
- Evidence reference:
- Difference/root cause:
- Corrective commit or follow-up:
- Cleanup verified:

## Final gate
Only approve merge/deployment/real use when exact final-head CI is green, integration and concurrency tests pass in isolated TiDB, reconciliation differences are zero/explained, backup restore is proven, security/E2E and desktop/mobile UAT are signed off, remaining feature gaps are closed or formally accepted with risk, and owner signs the evidence log.
