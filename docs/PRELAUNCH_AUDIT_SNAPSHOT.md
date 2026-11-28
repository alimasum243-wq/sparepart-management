# Pre-launch Audit Snapshot

Branch: `prelaunch/hardening-and-audit`
Base: `main` at commit `685d1460d7d162ee38ea68c7f6249b7f7d50e091`
Scope: active hardening and code review. No TiDB migration, production deployment, or real transaction has been executed.

## Findings fixed in the current branch (awaiting final CI/test verification)

1. All core business APIs are now protected by owner authentication/authorization; health checks remain public. Distributor API routes enforce owner or distributor identity separately.
2. Distributor payment submissions and verification use transaction locks; submitted/verified balances are checked against sales, returns, and pending payments.
3. Login/setup throttling added per process; production multi-instance still needs edge/WAF rate limiting.
4. Auth uses DB-backed revocable sessions; logout revokes; middleware revalidates account status, role, username, distributor association and distributor active state.
5. First-owner setup is serialized using a singleton guard row and transaction.
6. Distributor portal now supports submitting sales reports and payments; owner review can open report item detail before approval.
7. Account 4200 migration includes required `account_type='REVENUE'`.
8. HPP cost columns migration is repeatable; foundation migration creates missing user/purchase/retail/expense/journal tables and adds the required movement creator ID column, without rebuilding existing tables.
9. Supplier-payment migration adds `posted_at` and ensures allocations table; supplier invoice number is normalized to NULL when blank and uniqueness is prepared.
10. Purchase/distributor returns are blocked from exceeding open payable/receivable until refund workflow for settled transactions exists.
11. Return flows lock product rows during stock/HPP updates; stock transactions use the active warehouse lookup and refuse unsupported multiple active warehouses.
12. Core transactions and master create/update/status operations write audit logs transactionally.
13. Currency/quantity precision, date validation, transaction line-count and amount limits added.

## Verification still required

- **CI:** Build and Type Check passed on the latest verified commit before the current queued run; CI/static gate is in progress. Wait for both latest checks to complete before claiming final green.
- **TiDB compatibility:** compare every migration with actual schema using `SHOW CREATE TABLE`; preflight duplicate username/email/phone and supplier invoice numbers. DB schema has not been read by this audit.
- **Stock/HPP/accounting:** test opening stock, purchase, retail sale, consignment, distributor sales, payments, returns, rollback, concurrent requests, journal balancing, cash/bank, P&L, and reconciliation with controlled test data.
- **Automated tests:** repository workflows currently lint/typecheck/build; no verified business-logic/integration test suite is present. Add or run acceptance tests.
- **Feature gaps:** balance sheet, manual journal, opening-balance entry UI, cash/bank reconciliation, stock opname, multi-warehouse, refund of settled purchase/distributor transactions, password change/reset, and user/distributor lifecycle management remain unfinished or need specification.
- **Operations:** test backup/restore, production secrets, monitoring, deployment, and recovery plan.

## Constraints

- `main` unchanged; work stays in draft PR.
- No migration run and no deployment.
- No real transaction data posted.
- No destructive SQL; never delete/rewrite transaction history.
- User action will be requested only when code/migrations/acceptance checks are ready.
