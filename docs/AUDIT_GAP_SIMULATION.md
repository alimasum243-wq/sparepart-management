# Audit Gap Simulation & Design — Synthetic Data Only

## Scope
This package adds an additive schema proposal and pure domain simulations. It does **not** connect to TiDB, post journals, change inventory, or approve claims/matches automatically. It is not production-ready until API/UI integration and runtime DB tests are completed.

## Migration 025
- Formal shortage claim head and item rows, with evidence references, owner decision metadata, approved quantity, charge amount, and settlement tracking.
- Bank statement import batches and rows, duplicate fingerprints, manual match metadata.
- Matching/claim decisions are designed as audit records, not automatic postings. SQL must be reviewed/applied by the owner in TiDB.

## Synthetic simulation
- Shortage claim: claim 4 pcs; owner approves 3 pcs; example cost Rp25,000/pc; charge cap Rp75,000 (not auto-charged).
- Bank statement: credit Rp150,000 dated 2026-11-10; candidate remittance Rp150,000 on 2026-11-11; amount/date/description score can suggest a match, but owner confirms.
- Investor report: retail gross Rp500,000, return Rp20,000, COGS Rp260,000, allocated cost Rp45,000 => contribution Rp175,000. Distributor gross Rp1,000,000, return Rp50,000, COGS Rp600,000, allocated cost Rp100,000 => contribution Rp250,000. Combined contribution Rp425,000. All figures synthetic.
- 5,000 deterministic random trials check arithmetic identities; unit tests also reject invalid claim quantities, duplicate debit/credit sides, and mismatched bank amounts.

## Required before production
1. Integrate owner/distributor APIs with authentication and status transitions, transactional locking, audit logs and idempotency.
2. Implement bank CSV upload/parser with format preview, row validation, duplicate-import detection and manual/assisted matching against actual posted cash/bank journals.
3. Build owner UI and distributor claim UI, evidence storage policy, notification/pending badge and settlement handling.
4. Build investor report with transaction-level drilldown, channel HPP snapshots, returns, allocated costs, journals, and reconciled totals.
5. Add UI/API tests; runtime test in isolated DB with synthetic records; concurrency/rollback and restore tests.
