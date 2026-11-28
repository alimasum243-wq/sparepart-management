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
- [ ] Confirm dependency sequence across migrations 001 and 003–017.
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
- [x] Code: retail price per product is editable; price, Sales price, and MOQ before/after values are recorded in product audit log. Acceptance testing still pending.
- [x] Code: retail cashier defaults to master retail price; no Sales-channel price selection or commission is applied. Test pending.
- [x] Code: channel report uses posted retail/sales price and HPP snapshots for gross profit; manual operating-cost allocations calculate net contribution. Full P&L/GL reconciliation pending.
- [x] Code: retail below-master price requires owner-authenticated override reason and audit log. Approval workflow and acceptance pending.
- [x] Code: retail sale posting updates warehouse stock, cash/journal, HPP and sales atomically. Integration/GL acceptance pending.

### Sales / wholesale / consignment
- [x] Code: separate Sales and retail prices per product; server rejects Sales price above retail when retail master is positive; product price/MOQ changes log before/after. Acceptance tests pending.
- [x] Code: stock is tracked by distributor/location; consignment delivery is not a sale; approved sell-through posts stock/receivable/journal. Acceptance pending.
- [x] Code: report price is derived from delivery price snapshots (weighted average), submitted reports await owner approval; approval posts ledger. Batch adjustment/acceptance pending.
- [x] Code: channel audit separates Ecer/Sales gross profit and net contribution; no Sales commission is auto-added. Reconciliation/acceptance pending.
- [x] Code: deliveries, approved reports, returns, remittances, allocations, receivable aging, and unapplied advances are separate records/views. Acceptance pending.
- [x] Code: separate price fields, server price relationship guard, price snapshots, retail floor/override audit, and weighted Sales snapshots. Full batch-price reconciliation pending.
- [x] Code implemented: retail cashier auto-fills master retail price; server requires a positive master retail price, rejects below-master prices without a 10-character reason, snapshots master price, and writes override audit-log entries. Migration 014 and CI/acceptance still pending.
- [ ] Test partial sell-through, partial payment, returns, multiple delivery batches with different price snapshots, weighted-average Sales price, stock adjustments, price changes between delivery and reporting, rejected reports, and duplicate approvals.
- [ ] Acceptance: apply migration 014 on isolated TiDB and test normal retail, zero master price, below-price no reason, below-price with reason, audit-log snapshot, and changed master price.
- [ ] Nominal operating-cost allocation by channel (migration 015) reconciles to each source expense, does not exceed source amount, and net contribution = gross profit less assigned costs; unallocated expenses remain visible. Confirm no journal entries are created by analytic allocation.
- [x] Code implemented: owner can set per-SKU Sales MOQ; Sales reports below MOQ are server-blocked; historical MOQ snapshot is stored; multiple same-day reports for same Sales/SKU are surfaced as review signal. Migration 016 and CI/acceptance still pending.

### Required product and transaction data
- [x] Code: product has separate channel prices and HPP; retail/distributor sale lines snapshot price/cost/qty. Discount policy and integration tests pending.
- [x] Code: channel performance report shows units/revenue/HPP/gross/net contribution; remittance audit shows Sales receivables. Export and reconciliation acceptance pending.
- [ ] Dashboard and exports reconcile to posted transactions and GL; margin must not count delivered consignment stock as a sale before it is reported sold and approved.

**Acceptance rule:** the two price channels and their distinct margin/reporting behavior are a prelaunch blocker. Existing code must be audited and tested for complete support before approval; this checklist is a requirement, not proof of implementation.


## 10. Margin leakage, price arbitrage, and wholesale eligibility (critical)

**Objective:** protect the higher retail margin from being bypassed by recording ordinary retail purchases under the sales/wholesale channel. Do not rely on AI guessing: implement deterministic, explainable server-side controls; AI may summarize patterns or flag anomalies but cannot override authorization or rule enforcement.

### Channel and identity checks
- [x] Code: retail cashier has no Sales price/channel selector, defaults to master retail price, and server enforces a positive retail price and price floor. Acceptance pending.
- [x] Code: Sales channel report requires authenticated distributor identity from active session/account; client cannot select distributor identity. Acceptance tests for inactive account/IDOR still pending.
- [x] Code: authenticated active distributor, per-SKU MOQ and delivery price snapshots server-validated; area is manual/transparent. Effective-date MOQ and location verification remain gaps.
- [x] Code: retail API is owner-only; Sales report requires authenticated distributor; below-MOQ reports are server-blocked. Policy-configurable owner approval is not implemented.
- [x] Code: MOQ configurable per product/SKU and enforced per report item. Effective date, product-group MOQ, and order-level mixed-item policy are not implemented; migration 016 and tests pending.
- [x] Code: multiple reports for the same distributor/date/SKU are flagged for review. Configurable lookback window, repeated orders across days, and false-positive acceptance tests remain pending.
- [x] Code: retail below-price override requires owner auth and reason with audit log. Sales-channel price/shortage exception approval and evidence workflow remain gaps.

### Margin controls and monitoring
- [x] Code: no product margin target/floor percentage; only contribution share percentage is reported, as requested.
- [x] Code: owner sets separate retail and Sales prices per product; server rejects Sales price above retail when retail master is positive. Historical transaction snapshots are implemented; CI/acceptance pending.
- [ ] Optional minimum permitted selling price per channel may be set as a nominal Rupiah amount (not percentage), if owner chooses to use this safeguard.
- [x] Code: actual Rupiah gross profit per channel is reported from price/HPP snapshots; per-product/per-cashier drill-down pending.
- [x] Code: retail price floor and owner override reason server-enforced/audited; Sales price relation and MOQ enforced. Nominal floor per channel and approver workflow pending.
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

- [x] Code: retail receipts/refunds and verified Sales remittances are separate source categories and compared with GL. Other receipts and physical drawer tagging need acceptance.
- [x] Code: retail and Sales receipt paths are separate and source audit cannot silently net one against the other. Acceptance pending.
- [x] Support cash/bank opening and closing count sessions per account, with expected closing from posted journal-line movement during session, and variance recorded without auto-journal (migration 020).
- [ ] Extend cashier/source-category attribution and validate multiple physical drawers and transfer edge cases.
- [ ] Acceptance test session expected movement includes receipts/refunds, cash expenses, purchases, supplier payments, transfers, verified distributor remittances, and opening journals; transfers must not double-count, and cashier/source categories must be traced separately.
- [ ] Any variance (even small) is surfaced as a non-zero discrepancy with the specific source category, cashier/session, expected amount, counted amount, timestamp, and explanation/approval workflow. Do not silently net discrepancies between retail and sales categories.
- [ ] Distributor remittances reconcile against approved sales reports, allocations to receivables, and unapplied advances; retail receipts reconcile against posted retail transactions, refunds, and cash/GL.
- [ ] Use server-enforced transaction source tags and immutable audit entries; cashier cannot change receipt source after posting without authorized correction/void workflow.
- [ ] Dashboard and reports display separate expected/count totals and discrepancies for retail cash and sales remittances, plus combined total; all totals reconcile to GL.
- [ ] Test retail cash shortage with sales-remittance surplus and vice versa: discrepancies must remain separately visible and must not cancel each other out.

**Acceptance rule:** channel/source-specific cash accountability and discrepancy detection are critical prelaunch controls. AI may help explain or flag patterns, but deterministic ledger reconciliation is the source of truth.


## 12. Sales field accountability: consignment, sell-through, and remittance timing (critical)

**Objective:** sales-channel pricing is conditional on legitimate field selling and accountable consignment stock. These controls must be deterministic and server-enforced; AI is an assistant for pattern detection, not a source of proof or authority.

### Field activity and suspicious immediate sales
- [x] Code: consignment delivery records distributor/location, date/time, quantities, HPP and Sales price snapshot; vehicle/bag assignment not captured. Acceptance pending.
- [x] Code: report creation time, in-app print-request timestamp/count, area label, items/qty and status captured. Actual printer output, customer/outlet identity, GPS and evidence attachment remain gaps.
- [x] Code: rapid print request after matching handover, repeated same-day SKU reports and area/cannibalization signals are surfaced. Walk-in/customer identity/GPS overlap unavailable.
- [x] Code: rapid-print threshold configurable; area/cannibalization thresholds configurable; flags explain source records and state that they are not proof. Full investigation workflow pending.
- [x] Code: no secret GPS tracking; area label is manually entered. Notice/access/retention policy still needs owner acceptance.

### Consignment-stock reconciliation and missing-stock charge
- [x] Code: audit shows delivered, approved sales, customer returns, pending reports, ledger balance, expected physical (ledger minus pending), and latest stock-opname variance. Dedicated return-to-warehouse workflow and shortage charge remain gaps.
- [x] Code: submitted report is pending/reserved; only owner-approved report posts stock, receivable, and journals. Print request alone is not posted sale. Evidence attachment/acceptance pending.
- [ ] Count returned/unsold stock at handover, and record return timestamp, quantity, condition, and warehouse receiving confirmation.
- [x] Code: stock audit shows expected vs latest opname variance per distributor/SKU; dedicated exception case, evidence and decision workflow not yet implemented.
- [ ] Contract/policy may make missing units chargeable at the agreed sales price. Calculate proposed charge as missing quantity × applicable sales-price snapshot, show it separately from ordinary sales receivables, and require documented review/approval or dispute handling before final posting.
- [x] Code: owner-only stock adjustment/opname drafts require reason and approval/posting; evidence attachment and shortage dispute workflow pending.
- [x] Code: partial sales/returns, multiple consignments and distributor stock cards supported. Dedicated return-to-warehouse handover flow and acceptance pending.

### Sales-note proceeds and remittance deadline (lapping prevention)
- [x] Code: approved report creates invoice/receivable and due date; due date is owner-configurable at approval. Grace period and reminder notifications pending.
- [ ] Record cash actually collected by sales from customers separately from sales-notes that are unpaid by customers (if customer credit is permitted); do not assume printed note equals cash collected.
- [x] Code: payment submission/verification, timestamp, reference, destination, note allocations and unapplied amount are recorded. Acceptance pending.
- [x] Code: remittance audit view shows per-note due/allocated/outstanding/age and payment history. Acceptance pending.
- [ ] Alert before due, at due, and after overdue using configurable terms; escalation/hold on additional stock can be policy-configured and owner-authorized.
- [x] Code: older unpaid notes with newer-note allocations are flagged. Collection-time, deposit-reference reuse, delayed posting and full lapping analytics remain gaps.
- [x] Code: remittance allocations and audit logs exist; lapping signal flags older open notes. Formal allocation-reversal/correction history workflow and acceptance pending.
- [x] Code: distributor submits payment; owner-only verification/approval routes and audit logs. Shortage/price-exception approval workflow not implemented; acceptance pending.
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
- [x] Code: custom date range supports weekly/monthly periods; owner selects dates.
- [x] Code: channel report shows units, revenue, HPP, gross profit and net contribution after owner-entered nominal expense allocations; direct/shared categories and basis are not formalized, unallocated expenses remain visible.
- [x] Code: net contribution shares reported; if total net contribution is non-positive, shares are null and Rupiah totals remain. Acceptance pending.
- [x] Code: report displays unit volume, omzet, gross profit, allocated costs, net contribution and share together.
- [ ] Explain how costs are categorized: direct channel costs, shared costs, unallocated costs. Never silently allocate shared costs; owner-configured allocation method and its basis must be visible, auditable, and reproducible.
- [x] Code: official channel performance uses posted retail, approved Sales reports, posted returns and posted expenses; pending reports excluded from posted profit, but acceptance pending.
- [ ] Reconcile contribution calculations to transaction records, inventory/HPP, cash/receivables, and GL. Reports/export must agree with source data.

### Possible retail cannibalization / channel conflict
- [ ] Monitor retail sales trend and nearby field-sales transactions by units, revenue, and contribution over comparable periods; account for day-of-week, seasonality, product mix, promotions, stock availability, price changes, and unusual closures where data is available.
- [x] Code: paired retail-drop/Sales-rise signal only when manual area label/filter is selected. No verified location or zone mapping; tests pending.
- [ ] Use location only when lawfully collected, transparent to the sales staff, and enabled with access/retention controls. If location is absent, state the limitation and use less-specific evidence.
- [x] Code: alert displays changes, selected period/area, threshold, and limitation; it states correlation is not proof. Alternative explanations and review workflow are not automated.
- [ ] Provide investigation workflow: review alert, add notes/evidence, mark confirmed/false-positive/inconclusive, and record owner decision. Preserve audit trail.
- [x] Code: thresholds/settings are owner-configurable and audited; area is a manual label/filter, not a configured geographic zone. No automatic penalty/transaction change.

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

- [x] Create and maintain a requirement-to-data-to-screen/report-to-test traceability matrix for owner-defined audit requirements. See `docs/AUDIT_TRACEABILITY_MATRIX.md` (status is code-review inventory, not test evidence).
- [ ] Identify required data fields/events for each rule; implement missing fields and durable event/transaction records, not just UI text.
- [ ] Record actor, role, timestamp, transaction/approval state, before/after values for edits, reason, approver, source/channel, related entity IDs, and evidence/reference where applicable.
- [ ] Capture timestamps for stock handover, note creation/printing/submission/approval, customer collection (when recorded), remittance submission/verification, allocation, return, physical count, and reconciliation.
- [ ] Capture retail and sales channel separately, including transaction location/zone only when transparent, lawful, and enabled; disclose when location or other evidence is unavailable.
- [x] Code: owner stock audit shows per-distributor/SKU delivered, approved sales, customer returns, pending reports, ledger balance, expected physical (ledger minus pending), and latest stock-opname snapshot variance.
- [ ] Capture per-SKU stock movement and accountable location/holder, per-note receivable/remittance allocations, cash source, drawer/shift, and nominal retail/sales price and HPP snapshots. Dedicated missing-stock charge proposal by Sales price, dispute/evidence, and approval workflow remains not implemented.
- [ ] Preserve data integrity: prevent silent edits/deletions to posted records; corrections/voids/reversals must link to original, require proper authorization, and retain audit history.
- [ ] Build audit views/reports with drill-down from alert/aggregate to individual source records and event chronology; allow evidence export where practical.
- [ ] AI-generated audit results must state the underlying data, rule/signal, comparison period, data completeness, confidence/limitations, and link to supporting records; AI must not fabricate missing evidence.
- [ ] Maintain a coverage matrix: requirement, data availability, implementation location, authorization enforcement, test scenario, evidence, status, gap/risk, and remediation. Mark unsupported rules as not auditable/blocked—not passed.
- [ ] Validate that every audit report reconciles to operational source records, inventory subledgers, receivables, cash/bank, and GL as applicable.

**Acceptance rule:** auditability is a core product requirement. Before prelaunch, prove that each owner-defined audit can be run using captured data and traceable source evidence; otherwise implement the missing data capture/reporting or document the unresolved blocker for owner decision.

## 15. Implementation progress against owner audit baseline (live code work; not acceptance)

### Implemented in development branch — pending CI and database migration validation
- [x] CI/build/typecheck evidence recorded: GitHub latest branch checks succeeded (build-and-check and build); local/isolated TiDB integration is still pending.
- [x] Added migration 012 to capture optional transparent sales-area labels on distributor sales reports; no GPS collection is introduced.
- [x] Sales/distributor portal form supports optional area label for audit context.
- [x] Added owner-only channel-performance API and screen comparing posted retail sales with approved sales-channel reports, using HPP snapshots and netting posted returns.
- [x] Added weekly/custom-range comparison with a previous equal-length period, nominal gross profit, channel contribution share, units/revenue changes, and configurable in-code threshold currently 20% for paired retail decline/sales rise signal.
- [x] Added timing-risk query to flag reports created within 10 minutes after the latest stock handover record for the same sales account.
- [x] Added owner-only remittance audit API and UI showing approved-note balances, allocations, due/overdue age, payment submissions and unapplied amounts; flags older unpaid notes when newer notes have allocations.
- [x] Implemented in branch: owner can allocate nominal amounts from posted expenses to Ecer/Sales; the report computes net contribution and contribution share, shows unallocated expense, and does not create extra journals. Migration 015 required; CI and acceptance are pending.
- [ ] Validate allocated channel contribution against posted expense source, report calculations, returns, negative/zero totals, and GL; unallocated costs must remain visible and not be silently assigned.
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
- [ ] Apply server/migrations/013_audit_rule_settings.sql after 012.
- [ ] Review/apply server/migrations/014_retail_price_floor_audit.sql after 013; confirm retail_sale_items has retail_price_snapshot and price_override_reason columns. These migrations are manual and are not automatically executed by app startup.
- [ ] Verify SHOW CREATE TABLE distributor_sales_reports includes sales_area_label and audit_rule_settings has row id=1; test GET/PUT settings and channel/remittance audit endpoints.

### Cash-source audit implementation progress
- [x] Added owner-only cash-source reconciliation API and screen: retail receipts/refunds and verified sales remittances are compared to their posted cash/bank journal source per account and date.
- [x] Physical cash/bank sessions added (migration 020): opening count, posted journal-line movement during session, expected closing, counted closing, variance; no automatic journal. Pending latest CI and acceptance review.
- [ ] Cashier/source-category-specific drawer attribution and edge-case validation for transfers, expense/purchase/supplier payment, refunds, and verified remittances remain outstanding.

### Retail price floor audit implementation progress
- [x] Retail checkout now initializes unit price from the product master retail price (not blank/manual-only); API requires a configured positive master retail price.
- [x] Retail price below master is blocked unless an override reason of at least 10 characters is supplied; reason is limited to 500 characters and logged to audit_logs.
- [x] Retail line stores the retail master price snapshot and override reason in additive migration 014.
- [ ] Migration 014 must be reviewed/applied in isolated TiDB; test normal price, above-master price, below-master with/without reason, changed master price after transaction, and audit trail drill-down.
- [ ] This is a price-exception audit control, not a full owner-approval workflow. Override reasons are recorded, but approval gate remains a separate gap.

### Latest CI evidence
- [x] Previous implementation commit checks succeeded (build-and-check and build).
- [ ] Documentation update commit checks are currently queued; re-check before reporting latest commit CI as passed.
- [ ] CI success does not replace TiDB migration/integration tests, restore test, security/IDOR review, reconciliation, or acceptance.


## 16. Mandatory printing and investor reporting/export (NEW REQUIREMENT — PRELAUNCH BLOCKER)

### Transaction and stock documents
- [x] Retail direct-sale receipt print/PDF and reprint from transaction history, including sale code/date, SKU snapshot, quantity, price, subtotal, cash account, total, override reason when applicable, and print-request count/time audit (migration 021).
- [x] Sales sell-through report note print/PDF and reprint from report history, report ID/status, area label, items/qty/price, total, and print-request count/time audit (migration 017).
- [ ] Warehouse-to-Sales consignment handover receipt print/PDF is available for the latest note; history-based reprint and print count/time UI need completion/acceptance. It clearly states **NOT A SALE — CONSIGNMENT STOCK**.
- [ ] Returns, stock opname/adjustments, supplier purchases/payments, distributor payments/remittances, and expense/owner capital/draw/transfer documents should have print/PDF detail slips where relevant, with unique reference and audit status.
- [ ] All print views must be usable on mobile and desktop; paper/PDF layout must exclude navigation and unrelated controls; reprints are recorded and preserve original transaction data.

### Date-range reports for investor/owner
- [x] P&L/operational report: custom date range CSV and browser print/PDF with selected period, generated timestamp, P&L, channel nominal contribution, transaction summary and GL summary.
- [x] Transaction history: custom range CSV and print/PDF with source IDs/types; currently API limit 1,000 rows.
- [x] Distributor receivable aging: CSV and print/PDF, as-of snapshot (not a date-range sales report).
- [x] Cash reconciliation session history: custom date range and CSV export; no PDF report yet.
- [ ] Every applicable owner report supports a custom date range (start/end), plus useful presets (today, this week, this month, previous month, custom), and clearly states the selected period, generated timestamp, and filter scope.
- [ ] CSV export and PDF print/export for reports, including at minimum: summary/dashboard; channel comparison (Retail vs Sales: units, revenue, HPP, gross profit, direct/allocated expenses, nominal net contribution and contribution share); inventory/stock movement and stock valuation by warehouse and Sales consignment; purchases and supplier payables/payments; retail transactions/returns/refunds; Sales reports, consignment balances, Sales receivables, remittance/payment allocations, aging and overdue; expenses; cash/bank/source reconciliation and variances; journal entries/ledger, trial balance, profit & loss, balance sheet, and audit log/approvals.
- [ ] CSV must be machine-readable (UTF-8, consistent column headers, stable IDs, currency/quantity as numeric values, explicit date/time and status); no totals or pending/voided rows silently omitted. Include filters/period and source identifiers; distinguish posted, pending, rejected, voided, and returned/corrected states.
- [ ] PDF investor reports must be readable, have title, period, generated timestamp, filters, summary totals, page numbers, and detail/drill-down references; show opening/closing figures and reconciliations when relevant. No fabricated/AI-estimated figures in financial totals.
- [ ] Exported totals must reconcile with on-screen report, underlying posted transaction/subledger and GL; pending items must be visibly separated from posted totals. CSV/PDF export generation and download/print are owner-authorized; distributor access only to their own permitted documents/reports.
- [ ] Export actions and report parameters (who, when, type, period, filters, format) are audit logged where they expose financial/accountability information; sensitive data must be minimized.
- [ ] Investor summary should be a transparent factual report, not marketing: capital/opening balance, period revenue by channel, HPP, gross profit, operating/direct costs, net contribution/profit as supported by reconciled accounting, inventory and consignment value, receivables/payables, cash/bank, overdue amounts, stock discrepancies, pending approvals, and reconciliation differences. Explain any unallocated costs, excluded/unposted transactions, and data limitations; AI may summarize but calculations come from deterministic records.
- [ ] Acceptance tests: range boundaries/timezone; empty period; one-day and cross-month ranges; returns/refunds; pending vs posted; void/reversal; CSV encoding/headers and row totals; PDF pagination; large report; unauthorized export; repeated/reprint audit; export totals tie to ledger.

**Acceptance rule:** missing receipt, handover note, date-range CSV/PDF report, or investor summary is a prelaunch blocker. Do not approve real transactions until implemented and tested against actual data and GL.

### Current code-review baseline for print/export (checked on branch)
- [x] Code currently has CSV export for transaction history, a combined profit/loss + operational report (CSV), and distributor receivables aging (CSV). These existing exports are limited implementations and do not satisfy the full investor-report standard above.
- [x] Code currently offers browser print/Save-as-PDF for stock cards and balance sheet, and Sales portal note printing via browser print. This is browser print output, not a standardized generated PDF report engine.
- [ ] A unified investor report spanning all modules with complete custom-period CSV/PDF, stock valuation, payables, receivables aging, cash sessions, balance sheet/trial balance, approvals/audit, consistent permissions/filters and source-to-GL reconciliation remains incomplete.
- [ ] Retail receipt and warehouse-to-Sales handover note print/PDF remain missing per code review.


## 17. Implementation update — receipt and investor exports (implemented; acceptance pending)

- [x] Retail checkout now presents a receipt preview after a successful sale and a print/Save-as-PDF action. The receipt includes transaction code/date, item/SKU, quantity, unit price, subtotal, cash/bank account and total.
- [x] Warehouse-to-Sales handover now presents the latest consignment slip and print/Save-as-PDF action, with clear **NOT A SALE — CONSIGNMENT STOCK** notice, Sales, handover code/date, items, quantity, Sales-price estimate, total units, notes, and sender/receiver signature lines.
- [x] Profit & Loss / operational report now supports period-filtered CSV and investor-style browser print/Save-as-PDF. Includes P&L, channel nominal contribution comparison, operational transaction summary, GL summary, selected period and generated timestamp.
- [x] Retail receipt reprint from transaction history is implemented with source ID, SKU snapshot, and print-request audit (migration 021). Sales report note reprint is audited (migration 017); handover note history reprint remains incomplete (migration 019 logs print requests, but owner/distributor history detail still needs acceptance).
- [x] Investor P&L/operational report supports custom date range CSV and browser print/Save-as-PDF, including P&L, channel nominal contribution, operational transaction summary, GL summary, period and generated timestamp.
- [ ] These are browser-generated print/PDF dialogs, not a server-side PDF renderer; verify mobile/desktop, layout, reprint history, and audit evidence.
- [ ] Unified investor report coverage remains partial: inventory valuation/card, payables/receivables aging, cash-source/session reconciliation, balance sheet/trial balance and detailed audit/approval drill-down are separate modules or incomplete in the unified export. Pending/posted separation and source-to-GL reconciliation require acceptance.
- [x] Latest CI, typecheck and build evidence exists on commit 5814218; later retail-reprint changes require latest-head verification. No deployment or TiDB changes.

- [x] Histori transaksi: custom range CSV and browser print/Save-as-PDF now include period, generated timestamp, and transaction rows. API is currently capped at 1,000 rows; this cap must be addressed before reliable export for high volume.

- [x] Aging piutang distributor: CSV and browser print/Save-as-PDF now include bucket summary, open invoice details, due date, overdue age, and report timestamp. Aging is an as-of snapshot, not a date-range sales report.


## 18. Distributor portal — current implementation and remaining blockers

Recent branch work adds distributor delivery line history, sell-through report status/rejection history, payment submission history (allocated/unapplied summary), and unsold consignment return request + Owner approval/rejection with good/damaged stock movement. These changes are pending CI and end-to-end review.
- [x] Distributor-visible consignment delivery line history: date, delivery code, item, quantity, distributor-price snapshot, line value.
- [x] Persistent sell-through report history with status and rejection reason.
- [x] Payment submission history with status and aggregate allocated/unapplied amounts.
- [x] Unsold consignment return request workflow and owner queue/detail; approve/reject routes.
- [x] Approval posts stock movements per request item; good stock returns to warehouse, damaged stock to damaged location; no automatic refund. Return lines snapshot HPP/distributor price.
- [x] Pending unsold returns reserve quantities and nominal distributor-price value against new sell-through submissions; pending/approved return value adjusts price snapshot calculations.
- [x] Note-level grouping/totals, note financial status (unpaid/partial/paid), verified allocation drill-down, delivery note browser print/reprint with audit log (pending CI and reconciliation review).
- [x] Distributor stock-custody reconciliation dashboard (handover − approved sales − approved unsold returns; pending reports/returns and ledger stock/variance shown). Validate edge cases involving customer sales returns and adjustments.
- [ ] Return evidence, inspection note, source delivery note, and better traceability.
- [ ] Investor report drill-down and stock card reconciliation of return movements.
- [ ] Integration/concurrency tests for IDOR, stock reservations, duplicate posting, and return approvals.

Acceptance tests include two distributors (cross-account access denied), price master edits after handover (historical snapshots stable), partial and full payments, payment pending vs verified, partial return, damaged return, rejected return, sold qty cannot be returned as unsold, concurrency/duplicate requests, pending status has no accounting impact, approved return posts exactly once, and report totals tie to inventory/receivable/GL.

**Current status:** partial implementation committed; CI/end-to-end verification and remaining listed blockers are still outstanding. Do not mark app production-ready. See `docs/DISTRIBUTOR_PORTAL_REQUIREMENTS.md`.


## 19. TiDB Migration Audit Handoff

The user requested code hardening to continue until the next user action is a manual TiDB migration audit. The migration audit checklist and expected preflight/migration/postflight deliverables are documented in `docs/TIDB_MIGRATION_AUDIT_HANDOFF.md`. This is a handoff checklist only; it does not indicate migration readiness. All remaining application blockers must be fixed or explicitly documented, and latest CI must pass before requesting the user to inspect or execute SQL.
