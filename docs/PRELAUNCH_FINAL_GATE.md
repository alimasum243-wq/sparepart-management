# Final Prelaunch Gate — Sparepart Management

**Status: BLOCKED — not approved for real transactions.** A checkbox is completed only after a test and evidence are recorded. Passing CI alone is not business acceptance.


## Current code-review findings (not test results)
- Cash/bank account balances are derived from posted GL journal lines. There is no external bank-statement reconciliation/matching workflow or reconciliation report yet; this remains a feature and acceptance-test blocker.
- Opening balances can be entered using manual journals and opening-stock adjustment, but there is no dedicated opening-balance wizard/guard for all account classes. Opening entries require owner-prepared balanced journals and duplicate-entry checks.
- Backup/restore is not implemented as an app feature. This must use TiDB provider backup/export and restore into an isolated target, with documented evidence.
- Actual TiDB migration, restore, integration, and concurrency results are pending; code/CI review does not prove those controls.

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

## 9. Two sales channels and margin rules (business requirement)

The application must support two separate price segments per product, with different margin structures:

### Direct retail (owner sells directly to end customer)
- [ ] Store a retail price per product (editable, with audit trail).
- [ ] Retail sale uses this price by default; no wholesale discount or sales commission is applied.
- [ ] Retail margin/profit reporting uses actual selling price minus applicable HPP and transaction costs, not a fixed assumed margin.
- [ ] Any price override/discount is permission-controlled, reason-recorded, and audited.
- [ ] Retail stock is deducted from the warehouse location at transaction posting; sales, cash/receivable, HPP, and inventory journal entries reconcile.

### Sales / wholesale / consignment
- [ ] Store a separate sales/distributor price per product, lower than retail by default; allow owner to set the relationship and validate or warn if sales price is not lower.
- [ ] Distributor/sales stock is tracked by person and location; consigned stock remains inventory owned by the business until sold (unless the contract/accounting policy explicitly defines otherwise).
- [ ] Sales/distributor reporting uses the agreed sales price for units sold; approval is required before posting stock, receivable/cash, or journals.
- [ ] Sales margin is computed separately from retail margin using HPP and the wholesale/sales price; do not add a sales commission by default.
- [ ] Record separately: stock delivered to sales, units sold, units returned/unsold, payment remitted, outstanding receivable, and advances/unapplied payments.
- [ ] Prevent unauthorized price edits and prevent applying retail pricing to sales channel or vice versa; record price snapshots on each transaction so later product-price changes do not rewrite history.
- [ ] Test partial sell-through, partial payment, returns, price changes between stock delivery and sales reporting, rejected reports, and duplicate approvals.

### Required product and transaction data
- [ ] Product has separate retail and sales/distributor prices (and HPP/cost basis); transactions snapshot channel, unit price, discount, HPP, and quantity.
- [ ] Reports show quantities, revenue, HPP, gross margin/profit and outstanding balance separately by channel and combined.
- [ ] Dashboard and exports reconcile to posted transactions and GL; margin must not count delivered consignment stock as a sale before it is reported sold and approved.

**Acceptance rule:** the two price channels and their distinct margin/reporting behavior are a prelaunch blocker. Existing code must be audited and tested for complete support before approval; this checklist is a requirement, not proof of implementation.


## 10. Margin leakage, price arbitrage, and wholesale eligibility (critical)

**Objective:** protect the higher retail margin from being bypassed by recording ordinary retail purchases under the sales/wholesale channel. Do not rely on AI guessing: implement deterministic, explainable server-side controls; AI may summarize patterns or flag anomalies but cannot override authorization or rule enforcement.

### Channel and identity checks
- [ ] Retail transactions at store/warehouse checkout default to retail price/channel; sales price cannot be selected by an ordinary cashier for walk-in retail.
- [ ] Sales channel requires a verified active Sales/Distributor account ID and an authorized transaction context. Do not accept a client-supplied role/channel alone as proof.
- [ ] Wholesale eligibility is validated server-side against account status, location, quantity threshold, applicable price list, and role/permissions.
- [ ] A low-quantity transaction using sales price (example: 1–2 pcs) without a valid sales/distributor account is blocked. With verified account but below MOQ, block or route to explicit owner approval based on configurable policy; never silently allow.
- [ ] Quantity threshold (MOQ) is configurable per SKU or product group, with an owner-managed rule and effective date. Support mixed-item orders by evaluating each SKU or an explicitly defined order-level MOQ policy.
- [ ] Split orders or repeated purchases near threshold within a configurable period are flagged for possible threshold circumvention; don't treat these signals alone as proof.
- [ ] Override requires owner/authorized approver, recorded reason, transaction evidence, and immutable audit trail; cashier cannot approve their own override.

### Margin controls and monitoring
- [ ] Do not require or display margin target percentages for now.
- [ ] Owner sets retail and sales prices directly per product; system preserves these separate price fields and transaction snapshots.
- [ ] Optional minimum permitted selling price per channel may be set as a nominal Rupiah amount (not percentage), if owner chooses to use this safeguard.
- [ ] Profit reporting may show actual Rupiah gross profit (selling price minus HPP) per unit and transaction, without percentage targets.
- [ ] Check transaction price against configured channel price and any nominal price floor. Unauthorized lower price blocks posting or requires owner approval; record reason and approver.
- [ ] Report margin by channel, product, cashier, sales/distributor, and time period; compare realized margin to target/floor and flag outliers, price overrides, repeated small orders, channel misclassification, and unusual discounts.
- [ ] Alerts should distinguish hard rule violations (blocked, ineligible identity/MOQ, below authorized floor) from statistical anomalies (review needed); AI/anomaly detection may not automatically accuse users or alter transactions.
- [ ] Validate margins on posted transactions and reconcile sales, HPP, inventory, receivable/cash, and GL; consignment stock delivery is not recognized as revenue until sell-through is approved under the accounting flow.

### Required test cases
- [ ] Walk-in retail 1–2 pcs tries sales price: block; retail price/channel remains available.
- [ ] Unverified/inactive sales account tries sales price: block.
- [ ] Verified sales account below MOQ: block or owner-approval queue per configured rule.
- [ ] Verified sales account meets MOQ and authorized price/margin: allow.
- [ ] Price override below margin floor: block or approval; audit reason and approver.
- [ ] Split/repeated orders to evade MOQ: flag for review and apply configured policy.
- [ ] Product cost changes after transaction: historical margin remains based on cost snapshot; verify separate policy for cost corrections.
- [ ] Cashier cannot approve own override; unauthorized API attempts are blocked server-side.
- [ ] Margin reports and alerts tie to posted transactions and ledger without counting pending/rejected orders.

**Acceptance rule:** these anti-margin-leakage controls are critical blockers before real sales. No AI label or client-side warning alone counts as protection; the server must enforce eligibility, pricing, approvals, and audit evidence.


## 11. Separate cash accountability: retail vs sales remittances (critical)

- [ ] Record cash receipts by source/channel: retail cash sales, distributor/sales remittances, and other receipts must have distinct ledger/accounting tags and report totals.
- [ ] Retail cash receipts must not be allocated to sales/distributor remittance balances; sales remittances must not be recorded as retail checkout receipts.
- [ ] Support cash drawer/session reconciliation by drawer, cashier, date/shift, and source category; optionally configure separate physical drawers/accounts where operationally used.
- [ ] Opening cash, receipts, refunds, cash expenses, cash transfers, and closing counted cash must reconcile for each drawer/session and source category; prevent double-counting transfers between cash drawers/accounts.
- [ ] Any variance (even small) is surfaced as a non-zero discrepancy with the specific source category, cashier/session, expected amount, counted amount, timestamp, and explanation/approval workflow. Do not silently net discrepancies between retail and sales categories.
- [ ] Distributor remittances reconcile against approved sales reports, allocations to receivables, and unapplied advances; retail receipts reconcile against posted retail transactions, refunds, and cash/GL.
- [ ] Use server-enforced transaction source tags and immutable audit entries; cashier cannot change receipt source after posting without authorized correction/void workflow.
- [ ] Dashboard and reports display separate expected/count totals and discrepancies for retail cash and sales remittances, plus combined total; all totals reconcile to GL.
- [ ] Test retail cash shortage with sales-remittance surplus and vice versa: discrepancies must remain separately visible and must not cancel each other out.

**Acceptance rule:** channel/source-specific cash accountability and discrepancy detection are critical prelaunch controls. AI may help explain or flag patterns, but deterministic ledger reconciliation is the source of truth.


## 12. Sales field accountability: consignment, sell-through, and remittance timing (critical)

**Objective:** sales-channel pricing is conditional on legitimate field selling and accountable consignment stock. These controls must be deterministic and server-enforced; AI is an assistant for pattern detection, not a source of proof or authority.

### Field activity and suspicious immediate sales
- [ ] Record each sales stock handover with sales/distributor identity, timestamp, items/quantities, agreed sales price snapshots, and accountable stock location (vehicle/bag/assigned stock).
- [ ] Record sales-note creation/printing time, customer or outlet identity where practical, sale location where lawfully collected and enabled, item/quantity, and evidence/verification status.
- [ ] Flag suspicious patterns for review: a sales note shortly after stock pickup, transaction location near the owner's store/warehouse, walk-in-like customer patterns, small/repeated transactions, or repeated overlap with retail customer activity.
- [ ] Use configurable risk signals/thresholds; avoid declaring misconduct from a single signal. Provide the timeline, reason(s) for flag, and review outcome.
- [ ] Do not collect location data secretly; provide appropriate notice and restrict access/retention.

### Consignment-stock reconciliation and missing-stock charge
- [ ] Reconcile per sales person and handover: stock carried = stock taken minus validated sell-through minus returns to warehouse minus authorized stock adjustments; physical count of remaining stock must match calculated balance.
- [ ] Only approved/validated sales notes count as sell-through. A printed note alone is not conclusive proof; retain audit trail and validation/evidence appropriate to the policy.
- [ ] Count returned/unsold stock at handover, and record return timestamp, quantity, condition, and warehouse receiving confirmation.
- [ ] Any unexplained shortage is a separate exception with SKU/quantity, expected vs counted balance, handover, sales identity, and evidence; never silently write it off.
- [ ] Contract/policy may make missing units chargeable at the agreed sales price. Calculate proposed charge as missing quantity × applicable sales-price snapshot, show it separately from ordinary sales receivables, and require documented review/approval or dispute handling before final posting.
- [ ] Damaged, lost, disputed, or adjusted units require reason, evidence where available, authorized approval, and stock/accounting correction entry; no self-approval by sales or cashier.
- [ ] Support partial returns, partial sell-through, multiple handovers, and clear stock ownership/location cards.

### Sales-note proceeds and remittance deadline (lapping prevention)
- [ ] Every validated sales note creates a traceable remittance obligation according to the agreed payment terms (due date/time, grace period, and recipient/account).
- [ ] Record cash actually collected by sales from customers separately from sales-notes that are unpaid by customers (if customer credit is permitted); do not assume printed note equals cash collected.
- [ ] Record remittance deposits/payments with timestamp, amount, bank/cash destination, proof/reference, submitter, and verifier; allocate against specific notes/obligations, not merely aggregate balances.
- [ ] Show per sales person and per note: amount due, amount remitted, allocation, unapplied remittance, overdue amount, and age of outstanding balance.
- [ ] Alert before due, at due, and after overdue using configurable terms; escalation/hold on additional stock can be policy-configured and owner-authorized.
- [ ] Detect lapping-risk patterns such as oldest notes left unpaid while newer remittances are allocated to newer notes, unexplained allocation changes, delayed posting, repeated partial deposits, deposit-reference reuse, and discrepancies between sales-note chronology, customer cash collection, and bank/cash receipt timestamps.
- [ ] Remittance allocation must preserve history and require authorized reversal/correction; never allow silent reallocation or let new money automatically conceal older overdue obligations.
- [ ] Sales cannot verify their own remittance or approve their own shortage/price exceptions; maintain immutable audit log for submit, approve, allocate, reverse, and investigate.
- [ ] Reports reconcile sales notes, customer collections (if recorded), remittances, outstanding receivables, consignment stock, proposed missing-stock charges, cash/bank, and GL.

### Required acceptance tests
- [ ] Sales picks up stock and creates a suspiciously immediate note near store: alert shows explainable signals, but no automatic accusation or penalty.
- [ ] Handover 100 units, validated sell-through 35, returned 50, physical count 12: shortage of 3 is identified; proposed charge uses agreed sales-price snapshot and remains reviewable.
- [ ] Printed/invalid/unapproved note does not reduce accountable stock or create final posted receivable.
- [ ] Sales note with collection/remittance due terms: due-date reminders and overdue alert work; receipt can be allocated to specific note(s).
- [ ] New remittance cannot silently cover a newer note while older note remains overdue; allocation changes are authorized and logged, lapping-risk flags visible.
- [ ] Partial sales, partial returns, partial remittances, advances/unapplied amounts, disputed shortage, and authorized corrections reconcile without duplicate stock/receivable/cash/journal postings.
- [ ] Sales account cannot self-approve notes, deposits, stock adjustments, shortages, or exceptions; unauthorized requests are blocked server-side.

**Acceptance rule:** field-sales accountability, validated sell-through, missing-stock handling, and remittance/lapping controls are critical prelaunch blockers. Checklist items are requirements only until code implementation and test evidence are verified.

## 13. Weekly/monthly profit contribution and retail-sales cannibalization audit (critical)

**Objective:** transparently compare the business contribution of direct retail and field sales/consignment, and detect possible retail customer cannibalization. Use actual posted transaction data and explainable signals; AI summarizes and flags, but calculations and controls are deterministic.

### Profit and volume comparison
- [ ] Provide weekly and monthly comparison, with custom date range, for retail vs sales channel.
- [ ] Show units sold, revenue, HPP of units sold (using historical cost snapshots), gross profit in Rupiah, direct/transaction costs, allocated shared operating costs (allocation basis clearly disclosed), and net contribution in Rupiah.
- [ ] Show each channel's share of combined contribution profit as a percentage only for contribution reporting; this is not a product margin target or pricing rule. If total contribution is zero/negative, clearly explain that percentages are undefined or misleading and show Rupiah amounts.
- [ ] Show channel contribution alongside units and revenue so high-volume, low-profit sales are not mistaken for higher profitability.
- [ ] Explain how costs are categorized: direct channel costs, shared costs, unallocated costs. Never silently allocate shared costs; owner-configured allocation method and its basis must be visible, auditable, and reproducible.
- [ ] Exclude pending, rejected, voided, and unposted transactions from official results; handle refunds/returns and corrections consistently and traceably.
- [ ] Reconcile contribution calculations to transaction records, inventory/HPP, cash/receivables, and GL. Reports/export must agree with source data.

### Possible retail cannibalization / channel conflict
- [ ] Monitor retail sales trend and nearby field-sales transactions by units, revenue, and contribution over comparable periods; account for day-of-week, seasonality, product mix, promotions, stock availability, price changes, and unusual closures where data is available.
- [ ] Flag material sudden drops in retail activity coinciding with increased sales-channel activity near the store/warehouse or within owner-configured zones, time windows, and thresholds.
- [ ] Use location only when lawfully collected, transparent to the sales staff, and enabled with access/retention controls. If location is absent, state the limitation and use less-specific evidence.
- [ ] Alerts must display measured change, comparison window, nearby/overlap evidence if available, data coverage, and alternative explanations. Do not automatically infer intent or accuse sales staff from correlation alone.
- [ ] Provide investigation workflow: review alert, add notes/evidence, mark confirmed/false-positive/inconclusive, and record owner decision. Preserve audit trail.
- [ ] Alert thresholds and zones are owner-configurable and changes are audited. No automatic punishment, price change, or transaction alteration based on an AI alert.

### Acceptance tests
- [ ] Weekly/monthly report calculates channel volume, revenue, HPP, gross profit, direct costs, allocated costs, net contribution, and contribution share correctly using manual verified test cases.
- [ ] Verify returned goods, discounts/overrides, cost snapshots, shared-cost allocation, and pending/voided transactions are treated correctly.
- [ ] Retail drop with nearby sales increase triggers an explainable review alert only when configured threshold/data conditions are met.
- [ ] Retail drop without nearby sales increase does not produce a cannibalization claim; sales increase without retail drop is not automatically a claim either.
- [ ] Missing/inaccurate location or incomplete data is disclosed and reduces confidence; verify no secret tracking or AI accusation.
- [ ] Report totals reconcile to the GL and transaction source; export matches on-screen values.

**Acceptance rule:** channel profit-contribution reporting and possible-cannibalization monitoring are required audit controls. This section is a requirement until code implementation, test evidence, and environment verification prove it.

## 14. Auditability and required data capture (foundation for all owner-defined audits)

**Requirement:** every audit rule previously defined by the owner must be supported by application data capture, traceable records, reports, and evidence. A rule cannot be considered auditable merely because it appears in documentation or an AI prompt.

- [ ] Create a requirement-to-data-to-screen/report-to-test traceability matrix for all audit sections (1–13 and subsequent additions).
- [ ] Identify required data fields/events for each rule; implement missing fields and durable event/transaction records, not just UI text.
- [ ] Record actor, role, timestamp, transaction/approval state, before/after values for edits, reason, approver, source/channel, related entity IDs, and evidence/reference where applicable.
- [ ] Capture timestamps for stock handover, note creation/printing/submission/approval, customer collection (when recorded), remittance submission/verification, allocation, return, physical count, and reconciliation.
- [ ] Capture retail and sales channel separately, including transaction location/zone only when transparent, lawful, and enabled; disclose when location or other evidence is unavailable.
- [ ] Capture per-SKU stock movement and accountable location/holder, per-note receivable/remittance allocations, cash source, drawer/shift, and nominal retail/sales price and HPP snapshots.
- [ ] Preserve data integrity: prevent silent edits/deletions to posted records; corrections/voids/reversals must link to original, require proper authorization, and retain audit history.
- [ ] Build audit views/reports with drill-down from alert/aggregate to individual source records and event chronology; allow evidence export where practical.
- [ ] AI-generated audit results must state the underlying data, rule/signal, comparison period, data completeness, confidence/limitations, and link to supporting records; AI must not fabricate missing evidence.
- [ ] Maintain a coverage matrix: requirement, data availability, implementation location, authorization enforcement, test scenario, evidence, status, gap/risk, and remediation. Mark unsupported rules as not auditable/blocked—not passed.
- [ ] Validate that every audit report reconciles to operational source records, inventory subledgers, receivables, cash/bank, and GL as applicable.

**Acceptance rule:** auditability is a core product requirement. Before prelaunch, prove that each owner-defined audit can be run using captured data and traceable source evidence; otherwise implement the missing data capture/reporting or document the unresolved blocker for owner decision.

## 15. Implementation progress against owner audit baseline (live code work; not acceptance)

### Implemented in development branch — pending CI and database migration validation
- [ ] CI/build/typecheck evidence is not yet recorded as passed for the latest implementation commit.
- [x] Added migration 012 to capture optional transparent sales-area labels on distributor sales reports; no GPS collection is introduced.
- [x] Sales/distributor portal form supports optional area label for audit context.
- [x] Added owner-only channel-performance API and screen comparing posted retail sales with approved sales-channel reports, using HPP snapshots and netting posted returns.
- [x] Added weekly/custom-range comparison with a previous equal-length period, nominal gross profit, channel contribution share, units/revenue changes, and configurable in-code threshold currently 20% for paired retail decline/sales rise signal.
- [x] Added timing-risk query to flag reports created within 10 minutes after the latest stock handover record for the same sales account.
- [x] Added owner-only remittance audit API and UI showing approved-note balances, allocations, due/overdue age, payment submissions and unapplied amounts; flags older unpaid notes when newer notes have allocations.
- [ ] Net channel contribution after direct/shared operating-cost allocation is not implemented; current channel report is gross profit (net sales returns minus cost snapshots). This is a known blocker/gap, not completed profit-contribution analysis.
- [ ] Sales area label is manually entered and optional; no verified geographic proximity to store/warehouse, GPS or retail customer location data. Cannibalization signal is disabled unless the owner filters by an exact sales-area label; with a label, it compares store-wide retail trends to sales reports in that label. Correlation remains a review signal, not proof.
- [ ] Lapping audit cannot compare cash-collection timestamp at end-customer level because the system does not yet capture when sales receives customer cash separately. Current allocation pattern is a limited risk signal only.
- [ ] Migration 012 must be reviewed and owner-run in a test/isolated TiDB database before these endpoints can operate; do not execute in live database yet.
- [ ] Add unit/integration tests for return netting, channel contribution, thresholds, report-to-handover timing, remittance allocation/lapping signals, and TiDB query compatibility.

**Implementation status rule:** this section tracks code work only. No requirement in sections 1–14 is considered fully accepted by these changes. External DB migration, integration, security, reconciliation, and business acceptance evidence remain required.

### Additional audit implementation
- [x] Added migration 013 for persisted owner-configurable thresholds: retail decline percentage, sales-channel rise percentage, and rapid-note time window.
- [x] Added owner-only GET/PUT endpoints and UI controls to update audit thresholds; changes are written to audit_logs.
- [ ] Verify settings migration and endpoint query behavior against isolated TiDB; settings persistence is not yet environment-tested.

### SQL migration order update
- [ ] On an isolated TiDB test database, review and apply server/migrations/012_sales_audit_data_capture.sql after existing migrations 001 and 003–011 (verify actual prior migration history first; do not assume it is complete).
- [ ] Apply server/migrations/013_audit_rule_settings.sql after 012. These migrations are manual and are not automatically executed by app startup.
- [ ] Verify SHOW CREATE TABLE distributor_sales_reports includes sales_area_label and audit_rule_settings has row id=1; test GET/PUT settings and channel/remittance audit endpoints.
