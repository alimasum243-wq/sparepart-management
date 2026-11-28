# Distributor Portal — Required Workflow & Audit Controls

Status: **Requirement accepted; partial implementation is now on the hardening branch. This remains a blocker pending CI and end-to-end review.** This document is added to the prelaunch hardening branch and is a blocker before declaring the app ready.

## Distributor portal requirements

### 1. Nota / consignment delivery history
Distributor accounts must have a readable note/table for every warehouse handover, including date, unique note number, product/SKU, quantity, distributor price snapshot, line total, total note value, paid/allocated amount, remaining obligation, and payment state (Unpaid / Partially paid / Paid). Provide detail view and print/PDF. Price and quantities must be immutable snapshots. Handover itself is consignment, not a sale and not a receivable.

### 2. Sales report submission
Distributor can submit sold quantities per product, tied to available consignment stock (and ideally delivery batch/note where FIFO/batch tracking exists). Preview totals before submit. Server calculates totals from saved price snapshots, validates stock/reservations and prevents duplicate/overselling. Submission is pending until Owner approves; pending is clearly labeled and not posted to final stock/GL/receivable. Owner approval/rejection records actor, timestamp, reason and immutable before/after evidence. Distributor can see pending/approved/rejected history and rejection reasons.

### 3. Payments and obligation
Show approved sales obligation, verified payments allocated to individual sales notes/reports, unapplied verified amounts, pending payment submissions, and outstanding balance. Status labels: Unpaid, Partially Paid, Paid. Allocation must be explicit, traceable and never silently reassign an older unpaid balance to a newer note. Receipt/payment submission remains pending until Owner verification; only verified payments affect final accounting/cash.

### 4. Returns / goods back
Distributor can request return of unsold consignment stock, selecting product and quantity, with reason, condition (good/damaged), optional photo/evidence reference, and source handover note when available. Request is pending inspection/Owner approval and does not immediately change stock or obligation. Owner can approve/reject with reason and inspection notes. Approved return creates traceable stock movement into warehouse/returns/damaged location and reverses consignment balance only once. Returned goods cannot exceed eligible physical consignment stock; approved sold items cannot be returned as unsold consignment. Good vs damaged goods must be separated. Refund of already-paid transactions is a distinct controlled workflow and not implied by return approval.

### 5. Distributor dashboard
Display current consignment stock by item/unit, units handed over, approved sold, pending sales report, returned, expected remaining and stock-opname variance; approved obligation, verified payments, unapplied payments, pending payment, remaining balance; pending sales and return requests. Stock/ledger reconciliation must be drillable to the originating note/report/return.

### 6. Audit/reporting/exports
Every delivery, sales report, approval/rejection, payment submission/verification/allocation, return request/inspection/approval, stock adjustment and print/export action should record IDs, actor, timestamps, status transition, reason, source IDs and relevant snapshots. Owner/investor reports must reconcile distributor note → sales → returns → payments → stock ledger → journal. Provide date-range CSV and print/PDF where applicable; as-of reports must clearly be labeled as snapshots.

## Acceptance tests (required)
- Distributor A cannot access another distributor's notes, stock, reports, payments or returns.
- Handover note price/quantity/date snapshots remain unchanged after product master edits.
- No receivable/journal at handover.
- Distributor submits report: pending badge/history, no final posting; approval posts once only; rejection reason visible and no final stock/GL impact.
- Pending report stock reservations prevent overlapping reports/overselling; concurrent approval/submission cannot oversell.
- Payment submitted pending does not reduce final balance; verification is locked/idempotent, allocation explicit; no silent reallocation.
- Return request pending has no stock/GL impact; approved return posts once to correct condition/location; rejected reason visible; quantities cannot exceed eligible stock.
- Dashboard calculations reconcile to ledger and GL with drilldown and export.
- Print/PDF and CSV totals match source records and period filters.

## Current branch implementation status (latest code additions)

### Implemented in the branch; pending CI/end-to-end review
- Distributor-visible persistent delivery-note line history (date, delivery code, product, qty, price snapshot, line value).
- Distributor-visible sell-through report history with pending/approved/rejected status and rejection reason; grouped note totals and audited print/reprint count/time (migration 017).
- Distributor-visible payment history with submission amount/method/status, allocated amount and unapplied amount.\n- Per-note receivable summary with sales total, sales returns, verified allocated payments, outstanding, due date and Unpaid/Partial/Paid status; payment-allocation drill-down.
- Unsold consignment return request schema (migration 018), distributor request UI/API, history, Owner queue/detail, reject reason and approval posting.
- Return approval moves good items to the warehouse and damaged items to the damaged location; approval is single-transition and does not create automatic refunds. Return requests now snapshot HPP and weighted distributor-price snapshot.
- Server-side return input validation and unit tests for malformed item/quantity/condition and stock reservations. Pending return quantities/value are now reserved against new sell-through reports and their price snapshot calculations.

### Still incomplete / not yet certified
- Handover history now groups notes with totals and browser print/reprint; print requests are logged via migration 019. Sales report notes also support grouped reprint and print audit via migration 017. PDF is browser print-to-PDF, and audit log review still required.
- Payment history shows allocation/unapplied totals; note-level due/status and allocation detail are implemented in code, pending CI and reconciliation testing.
- Distributor dashboard reconciliation has been added; validate edge cases involving customer sales returns, stock adjustments, physical stock counts, and source-ledger reconciliation.
- Return request evidence/photo, inspection note, source delivery-note linkage and stronger per-batch traceability are not yet present.
- Investor/reporting drilldown and return movement-to-stock-card reconciliation must be tested.
- Integration/concurrency tests for return approval, overselling, duplicate posting, IDOR, and migration schema are still required.

Do not mark the distributor portal complete until all remaining items are addressed or explicitly accepted as a prelaunch limitation and latest CI is green.
