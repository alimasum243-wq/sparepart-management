# Pre-launch Audit Snapshot

Branch: `prelaunch/hardening-and-audit`
Base: `main` at commit `685d1460d7d162ee38ea68c7f6249b7f7d50e091`
Scope: active hardening and code review. No TiDB migration, production deployment, or real transaction has been executed.

## Findings fixed in current branch (pending latest CI verification)

1. Core business API owner authentication/authorization; distributor APIs enforce owner or distributor identity separately. Health checks remain public.
2. Distributor payment submission/verification and sales approval use transaction locks; balances and stock reservations are protected from concurrent oversubscription.
3. Login/setup throttling per process; production multi-instance still needs edge/WAF rate limiting.
4. DB-backed revocable sessions; logout revokes sessions; middleware revalidates account status, role, username, distributor association and active state.
5. First-owner setup serialized using singleton guard and transaction.
6. Distributor portal sales reports/payments; owner can inspect line details before approval.
7. Account 4200 migration fixed with required account type.
8. Repeatable foundation and HPP migrations; additive changes, no rebuild of existing tables.
9. Supplier-payment allocations, invoice uniqueness, and return history support; blank invoice numbers normalized.
10. Returns cannot exceed open payable/receivable until refunds of settled transactions are implemented.
11. Return flows lock product rows during stock/HPP updates; stock transactions refuse unsupported multiple active warehouses.
12. Core transactions/master updates, authentication success/logout, password reset, and approvals are audit logged.
13. Amount/date/quantity precision and validation helpers strengthened; unit tests added for date, money, two-/three-decimal precision and outstanding balance.
14. Dashboard inventory valuation and monthly net profit; pending sales/payment approval badges.
15. Accounting COA, trial balance, journal register, balanced manual journals, accounting-period locks, as-of balance sheet, current earnings in equity, and print/PDF reports.
16. Distributor password reset revokes all previous sessions.
17. Aging piutang and unapplied receipts, product price history, stock cards per location with print-to-PDF, CSV aging export.\n18. Cash/bank physical reconciliation sessions: system opening, physical opening and variance, posted journal-line movement, expected closing, counted closing, closing variance; audited cancellation; no automatic journal (migration 020).

## Verification and remaining blockers

- **CI:** Latest branch-head CI/build status must be rechecked after current edits. Unit tests, static gate, typecheck and build have passed on earlier commits, not a final branch head. Cash reconciliation unit tests cover calculations/input validators; DB routes remain integration-test pending.
- **TiDB compatibility:** Actual schema has not been read by this audit. User must compare every migration with SHOW CREATE TABLE; preflight duplicate username/email/phone, supplier invoice and invoice codes. No migration executed.
- **Business integration:** Controlled acceptance testing needed for opening stock, purchase/HPP, retail, consignment, distributor approval/payment, returns, cash/bank, journal balance, balance sheet, concurrency, and rollback. No TiDB integration test.
- **Automated coverage:** Unit tests cover validation helpers only. Business routes and DB concurrency are not covered by automated integration tests.
- **Remaining product gaps:** cash/bank reconciliation, formal closing entries (period lock only), account/user/distributor deactivation lifecycle, opening balances (can be entered via balanced manual journal), owner-password recovery, scheduled backup/restore, PDF exports beyond stock card and balance sheet, multi-warehouse, refunds for fully settled purchase/distributor transactions, price-history UI validation, broader route tests.
- **Operations:** verify production secrets/TLS, deployment, monitoring, backup/restore, recovery and rollback.

## Constraints and branch hygiene

- Work remains in draft PR #3 and `prelaunch/hardening-and-audit`; do not merge/deploy yet.
- No TiDB migration, production deployment, or real transactions executed.
- Main branch history advanced during an accidental helper-file create/delete operation; the helper file is absent from `main`, and no net content change from that operation remains. Do not claim `main` history was untouched.
- No destructive SQL was introduced; never delete/rewrite posted transaction history.
- User action requested only after code checks and preparation of migration/acceptance steps.
