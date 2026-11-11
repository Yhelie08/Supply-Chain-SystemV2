---
title: prEdit
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:491"
---

# prEdit

Edits the supplier, shipping mode, priority, supplier price, target date or quantity of a PR that has not been converted. Choosing a supplier other than the recommended one needs an override reason. Recomputes whether the PR is Ready for PO.

**Source:** `src/domain/actions.js:491`

## Offered on
- [[Purchase Request]] (Procurement)

## Rules
- [[PR.LOCKED]]: A PR that has been converted to a PO is locked and cannot be held or cancelled.
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[GEN.FIELD]]: A required field is missing.
- [[PR.OVERRIDE]]: Choosing a supplier other than the recommended one needs an override reason.
- [[PR.READY]]: A PR becomes Ready for PO by itself when four conditions pass: supplier selected, final price confirmed, shipping mode selected (Local needs none) and a target date. It goes back to For Sourcing if one stops passing.
- [[PR.PRICE]]: The final price comes from, in order: an approved SRP, a supplier quote, the SO reference rate, then the catalog rate. A PR from an inquiry, or whose item has a catalog rate, counts as confirmed on its own.
- [[PR.RECOMMEND]]: The recommended supplier is the eligible one with the lowest price (Negotiated if entered, else Initial), with lead time breaking a tie. A supplier that has not quoted is never recommended.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
