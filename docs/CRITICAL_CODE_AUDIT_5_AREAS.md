# Critical Code Audit — Five Areas

Audit target: branch `prelaunch/hardening-and-audit`  
Scope: server transaction routes, distributor routes, validation helpers, session/authentication, moving-average inventory cost, CI.  
Database: `sparepart_db` (migrations are user-run; no database was changed by this audit).  
Deployment: no deployment or merge performed.

## 1. Transaction accounting and inventory

Reviewed purchase posting, retail sale, supplier payment, retail/purchase/distributor sale returns, distributor sales-report approval, distributor payment verification, consignment dispatch, consignment return approval, and inventory adjustment posting.

- Transactions use database transaction boundaries and rollback on failure.
- Journal helper and manual journal route validate debit-credit equality before posting.
- Distributor sales approval posts receivable/revenue and COGS/inventory together with stock movement and report status.
- Payment verification locks pending payment, serializes balance allocation by distributor, allocates payment to approved invoices, and records any excess as unapplied advance.
- Consignment return approval is status-locked, quantity checked, and stock movement is committed atomically; no automatic cash refund.
- Retail/purchase/distributor returns are bounded by the original item quantity less prior returns.

## 2. Amount validation and closed accounting periods

- Route-level numeric validation rejects non-finite values, negative/zero transaction quantities or prices where required, and precision beyond configured decimals.
- Posting routes call the shared accounting-period guard; the guard row is locked to serialize posting against period closure.
- Distributor sell-through submissions and distributor payment submissions were corrected to reject dates in closed periods.
- MOQ is validated server-side for distributor sell-through reports.
- Unit cost must now pass shared `validUnitCost`: finite, positive, at most Rp1,000,000,000 and at most two decimals. Applied to retail, inventory adjustment, consignment dispatch, sales report submission, and sales-report approval. Purchase line cost schema is also positive.

## 3. Authentication, sessions, and owner setup

- Token HMAC is verified using timing-safe comparison.
- Session ID is checked against `auth_sessions` and must be active, not revoked, and unexpired.
- User identity/role/distributor relationship is rechecked against database; distributor routes use session identity.
- Owner setup uses rate limiting, setup key comparison, one-time owner guard, and existing-user check. It is disabled when `OWNER_SETUP_ENABLED=false`.
- Production configuration enforces DB SSL and minimum auth secret length; setup key required unless owner setup is disabled.

## 4. Moving weighted average inventory cost

- Average cost is recalculated on purchase receipt only, using current inventory quantity/value plus incoming purchase.
- Stock transfers/consignment dispatch and sale postings use cost snapshots and do not update product average cost.
- Return and adjustment flows use snapshot/current cost accounting as appropriate. Damage transfer retains stock value; write-off/loss is journaled.
- Zero/invalid unit-cost inputs are now rejected in relevant routes to avoid zero-HPP postings.

## 5. TypeScript/build and automated tests

- CI workflows run unit tests, lint/static gate, typecheck and build.
- Shared positive unit-cost validation has automated tests for zero, negative, excess precision, non-finite, and upper-bound values.
- Latest CI for the head commit must be confirmed successful before merge.

## Remaining prelaunch validation (not code-audit claims)

These require actual TiDB/app environment evidence and owner review:
- Preflight/postflight all migrations against the intended database; schema/index/seed checks and duplicate checks.
- Verify opening stock quantities/costs and opening balances, with evidence; reconcile inventory subledger to GL and trial balance.
- Cash/bank reconciliation against GL and transaction subledgers, including advances, returns and supplier payments.
- Concurrent transaction tests (retail vs delivery vs adjustment, repeated approvals, payment allocation) in an isolated test environment.
- Backup/restore test, recovery runbook and access/retention review.
- Owner/distributor A/B isolation, browser/mobile acceptance, session revoke/reset, production CORS/cookie/TLS, monitoring.
- Final owner acceptance and sign-off. Do not merge/deploy or process real transactions until the gate is approved.
