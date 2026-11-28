# Pre-launch Audit Snapshot

Branch: `prelaunch/hardening-and-audit`
Base: `main` at commit `685d1460d7d162ee38ea68c7f6249b7f7d50e091`
Scope: continuing code/migration review. This remains a pre-launch audit; no TiDB migration, deployment, or real transaction has been executed.

## Findings fixed in the current branch (still awaiting build/CI verification)

1. Distributor payment submissions now run in a transaction and lock the distributor row before checking verified/pending payments against sales less returns.
2. Distributor payment verification serializes balance processing with the same distributor lock.
3. Auth endpoints have basic per-process login/setup throttling. Multi-instance production deployments still need edge/WAF rate limiting.
4. Auth tokens now require DB-backed sessions; logout revokes the session. Middleware revalidates account active status, role, username, distributor association and active distributor status.
5. First-owner bootstrap uses a singleton guard row, transaction, and row lock to prevent concurrent first-owner creation.
6. Account 4200 migration includes required `account_type='REVENUE'`.
7. HPP columns migration uses `ADD COLUMN IF NOT EXISTS`.
8. Supplier-payment migration adds missing `posted_at` and ensures allocation table exists.
9. Purchase/distributor returns are blocked from posting refunds/credits beyond open payable/receivable because refund workflows for already-settled transactions are not yet implemented.
10. Return flows lock product rows during stock/HPP recalculation.
11. Core posted purchase, retail, expense, supplier-payment and return flows now write audit-log records in their transaction.

## Open verification and audit work

- **Build/CI:** GitHub Actions checks for the newest commits are not currently surfaced by the connected GitHub status/run interface. Do not claim green checks until verified.
- **Database compatibility:** compare every migration with the actual TiDB schema (`SHOW CREATE TABLE`, column/index checks and duplicate email/phone preflight). No database access was used in this audit.
- **Accounting:** validate opening balances, COA mappings, account types, trial balance, balance sheet, P&L, transaction journals and cash/bank reconciliation using controlled test data.
- **Stock/HPP:** complete concurrency review for all stock flows and verify warehouse/distributor/retail location balances against movement history and physical counts.
- **Authentication:** test session revocation, role separation, owner setup one-time behavior, login throttling, cookies/CORS and production secrets.
- **Automated tests:** repository currently has no business-logic test script visible; lint/typecheck/build workflows are static checks/build only. Add or execute tests for concurrency, duplicate/retry, rollback, state transitions, return restrictions and authorization.
- **Front-end review:** verify responsive layout, validation, error states, retry safety and sensitive-action confirmations.
- **Operations:** backup/restore, migration rollback/forward recovery, production deployment environment, monitoring and access controls.

## Constraints

- Main branch remains unchanged; changes stay in draft PR.
- No database migration has been executed.
- No real transactions or production deployment.
- Do not reset/delete/rewrite historical transactions.
- The user should only be asked to take action after the code, migration sequence, tests and acceptance checklist are ready.
