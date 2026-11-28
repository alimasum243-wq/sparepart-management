# Audit Traceability Matrix — Sparepart Management

**Purpose:** trace owner-defined audit requirements to captured data, implementation, evidence, and gaps. This is a code-review inventory; status is not acceptance evidence.

| Audit requirement | Captured data / current implementation | Status | Remaining blocker / test |
|---|---|---|---|
| Retail vs Sales channel performance | Retail posted sale/return item snapshots; approved distributor sales/returns; channel-performance API/UI; nominal allocations from posted expenses | Partial | Allocated net contribution now available in code; unallocated expenses still excluded, and report/GL reconciliation acceptance pending |
| Profit contribution share by channel | Manual nominal allocations from posted expenses by channel; report computes net contribution and net share | Implemented in branch; test pending | Unallocated operating costs excluded from net contribution and shown separately; allocation/report/GL reconciliation tests required |
| Retail default price | Product retail price; cashier auto-fills master price; server blocks missing master price and below-master price without reason; snapshots and audit logs overrides | Implemented in branch | Apply migration 014; test zero master price, normal price, override reason, snapshot and price change |
| Retail below-master price exception | Server-side price-floor validation; reason 10–500 chars; master price snapshot; audit log | Implemented in branch | Apply migration 014; test reject without reason, accept with reason and inspect audit record |
| Sales price and price snapshot | Distributor report item price/cost snapshots and approval flow; server rejects Sales price above retail when retail price is set | Code present; acceptance pending | Verify price changes after stock handover and before report, historical snapshot, returns |
| Sales stock handover | Consignment delivery records and stock movements, distributor/location holder | Code present; acceptance pending | Test handover, partial return, stock balance and physical count |
| Rapid note after handover | Distributor has print-ready note; in-app print request time/count stored; audit compares print request to latest matching posted handover; configurable minutes; unprinted reports listed | Partial | Print request is not printer-confirmed physical output; test matching, time boundaries, print-request permission, repeated print and unprinted signals |
| Sales near owner store / area | Optional transparent sales-area label; owner area filter; signal disabled without area filter | Partial | Area is manually entered, no verified location; no retail customer location; area data completeness test |
| Stock reconciliation: carried - sold - returned | Stock movement ledger, reports, return records | Partial | Add/verify physical stock count for distributor carried stock and variance workflow; test formula/approval |
| Missing stock charge proposal | Stock adjustments and consignment cost/price data | Partial | Dedicated shortage-to-sales-price charge proposal, approval, dispute/evidence workflow not fully implemented |
| Remittance timing and overdue | Due dates, verified payment submission, allocations, aging report | Code present; acceptance pending | Capture cash received by sales timestamp separately from payment submission; test schedule/overdue |
| Lapping signal | Older unpaid note + newer allocated note chronology | Review signal implemented | Not proof; customer-cash receipt timestamp and allocation history evidence are limited; test false positives |
| Retail vs sales cash-source reconciliation | Receipts/refunds and verified remittances compared to journal per cash/bank account | Partial | Physical cash drawer/shift opening, expected, counted close and source variance missing; cash expenses/transfers excluded |
| Cash source separation | Retail receipt/refund and sales remittance categories remain separate in source report | Partial | Do not net one source against another; implement separate cash session reconciliation and test cross-source mismatch |
| Audit drill-down and source evidence | Report codes, IDs, timestamps, allocation/return data and logs on existing views | Partial | Complete alert-to-record chronology and evidence attachment/export |
| AI audit transparency | Current signals are deterministic server rules, not AI-generated forensic conclusions | Not AI yet | Add AI explanation only after grounded structured evidence; never invent or automatically accuse |
| Security and audit trail | Authenticated owner routes, session controls, transactional posting and audit logs | Code review only | Full role/IDOR/security and acceptance testing required |

| Nominal operating-cost allocation | `channel_cost_allocations` table; owner assigns expense amount to RETAIL or SALES; API validates total allocations do not exceed source expense; audit log | Implemented in branch | Apply migration 015; test update, zero allocation, source-limit, audit log, and no GL journal side effects |
| Sales MOQ / report splitting | Owner configures per-SKU MOQ; server blocks below-MOQ report quantity and stores MOQ snapshot; audit API flags repeated same-day Sales/SKU reports | Implemented in branch | Apply migration 016; test below/at MOQ, snapshot after MOQ change, split-signal false positives and cross-day boundary |
| Sales price relationship | Owner-editable retail and Sales prices; server rejects Sales price above retail when retail master is positive | Implemented in branch | Test zero retail setup, valid relationship, rejected higher Sales price, audit log/history |

## Required acceptance evidence

For every requirement marked partial or code-present, attach:
- exact commit SHA and environment/TiDB version;
- migration/schema evidence;
- test steps and expected/actual result;
- source record IDs and reconciliation query/report;
- evidence file or screenshot;
- unresolved limitations and owner decision.

**No audit requirement is passed solely because its code or checklist item exists.**
