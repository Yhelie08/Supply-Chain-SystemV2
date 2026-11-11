---
title: prSetSrp
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:517"
---

# prSetSrp

Approves the SRP (PHP) for a PR. An approved SRP is the top-priority final price and what goes onto the Purchase Order.

**Source:** `src/domain/actions.js:517`

## Offered on
- [[Purchase Request]] (Procurement)

## Rules
- [[PR.LOCKED]]: A PR that has been converted to a PO is locked and cannot be held or cancelled.
- [[PR.SRP]]: Approving the SRP needs an amount above zero.
- [[PR.READY]]: A PR becomes Ready for PO by itself when four conditions pass: supplier selected, final price confirmed, shipping mode selected (Local needs none) and a target date. It goes back to For Sourcing if one stops passing.
- [[PR.PRICE]]: The final price comes from, in order: an approved SRP, a supplier quote, the SO reference rate, then the catalog rate. A PR from an inquiry, or whose item has a catalog rate, counts as confirmed on its own.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
