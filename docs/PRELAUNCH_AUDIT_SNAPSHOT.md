# Pre-launch Audit Snapshot

Branch: `prelaunch/hardening-and-audit`
Base: `main` at commit `685d1460d7d162ee38ea68c7f6249b7f7d50e091`
Scope: read-only first pass over server routes, distributor workflows, schema migrations, client entry points, and CI. This is not yet a full audit.

## Critical/high-priority findings observed

1. **Distributor payment submission race (critical).** `POST /distributor/payments` computes approved sales less returns and sums `VERIFIED/PENDING` payments, then inserts a new `PENDING` row without a transaction or lock on the distributor/balance source. Parallel requests can each pass the same balance check and collectively exceed outstanding receivables.
2. **Payment verification and allocation concurrency (high).** Verification locks the individual pending submission and approved reports, but allocation/backfill logic and outstanding checks need a complete concurrency review against simultaneous submissions, verifications, returns, and approvals. Add deterministic distributor-level locking and recompute after lock.
3. **Login brute-force protection missing (high).** The login route has no visible rate limit, delay, lockout, or throttling. Add carefully bounded protection with generic responses and test reset behavior; avoid a memory-only control if deployment can run multiple instances.
4. **Logout is not token revocation (high).** The cookie is cleared, but signed bearer/cookie tokens remain valid until their 12-hour expiry. A session revocation mechanism is needed (database-backed or versioned, with TiDB SQL supplied separately).
5. **Login identity uniqueness needs DB validation.** Login queries username/email/phone and rejects if more than one row matches, but identity normalization, uniqueness constraints, phone normalization, and duplicate existing values must be verified.
6. **Account migration defect (high).** `server/migrations/006_returns_history_reports.sql` inserts account `4200` with `account_code, account_name, is_active`, while the foundation migration defines `accounts.account_type NOT NULL` without a default. This migration may fail on a fresh DB. Fix migration and verify actual TiDB schema before execution.
7. **Stock and costing concurrency (high).** Purchase/consignment/report paths use some product/location locks, but the audit must verify consistent lock ordering, stock checks and movement updates across all stock-changing endpoints, returns, and report approval/rejection. Aggregated movement queries alone do not protect concurrent writes unless an appropriate stable row is locked.
8. **Accounting mapping and reconciliation (high).** Account codes are embedded in transaction logic. Verify account existence, type, active status, mapping and journal balance for all sources, including purchases, retail sales/returns, distributor reports/returns, supplier payments, expenses and distributor payments.
9. **No automated business-logic tests visible in package scripts.** Existing scripts run lint/typecheck/build. Add tests for concurrency, state transitions, duplicate/retry, rollback, inventory/HPP, journals and role access.

## Medium/feature audit areas to complete

- Endpoint authentication/authorization coverage and least-privilege role behavior.
- Distributor approval/rejection state transitions, stock reservation release, audit trail and idempotency.
- Consignment and warehouse stock double-counting, stock valuation using cost (not sales price), movement-history reconciliation.
- Manual journal controls, COA and General Journal views, pending approval badges and inventory valuation cards.
- Frontend responsive/accessibility/usability review; feedback states, validation, filters, navigation and confirmation of sensitive actions.
- Production deployment settings, backup/recovery and rollback procedure.

## Constraints

- No TiDB access from this audit. Do not invent schema/columns or execute SQL.
- No production deployment.
- Do not reset, delete or rewrite historical transactions.
- Changes will be staged on this branch and reviewed through PR; merge/deploy only after tests and DB steps are verified.
- Network access from the local test environment was unavailable during the first pass, so local build/test execution is not yet confirmed.
