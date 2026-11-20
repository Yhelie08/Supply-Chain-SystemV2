# Sales Returns and Archive

## 1. Sales Returns (and pull-outs)

**Purpose:** bring goods back from a customer (refused, wrong item, defective, swap, demo pull-out) and settle it in Books.

| # | Rule |
|---|---|
| RT-R1 | A return starts from a Service Request of type **pull_out** (manual, from a complaint, or from a refused line at delivery). It lists the lines and quantities to collect and the reason. |
| RT-R2 | The pull-out job uses the field app (collected quantities + photos). |
| RT-R3 | On arrival at the warehouse, the receiver confirms quantities and condition (good / damaged); damaged creates an exception with fault origin. |
| RT-R4 | The system creates a **draft credit note / sales return in Books** for accounting to approve **[DEFAULT: draft, not posted]**. The credit note reference and date sync back. |
| RT-R5 | If a replacement is owed, an RR or new package is created at once, category Broken. |
| RT-R6 | Status: requested → scheduled → picked up → received back → credit note issued → closed. |

Stamps: `return.requested`, `return.picked_up`, `return.received_back`, `return.credit_note_issued`.

## 2. Archive

| # | Rule |
|---|---|
| AR-R1 | A job is archived automatically `archive_after_days` **[DEFAULT: 7]** after done (complete), once Books write-back succeeded and no exception is open. |
| AR-R2 | Archived jobs are read-only and fully searchable (by SO, customer, date, team, outcome) with all proofs. |
| AR-R3 | Partial and failed jobs archive only after their redelivery job is done. |
| AR-R4 | Proof photos are kept `proof_retention_years` **[DEFAULT: 3 years]**. |

Stamp: `job.archived`.

## Acceptance checklist
- [ ] A refused line at delivery can be turned into a pull-out with the same lines pre-filled.
- [ ] Receiving a return creates a draft credit note in Books.
- [ ] An archived job shows all its photos and signatures and cannot be edited.
