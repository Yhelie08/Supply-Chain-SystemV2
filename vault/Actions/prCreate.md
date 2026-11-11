---
title: prCreate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:385"
---

# prCreate

Creates a PR by hand from the New PR form, for an item that did not come through an inquiry. Needs item, target date, quantity, customer, customer type and sales owner. Local sourcing goes to HC System with no freight.

**Source:** `src/domain/actions.js:385`

## Offered on
- [[Purchase Request]] (Procurement)

## Creates records in
- [[prs]]

## Rules
- [[PR.NEW]]: A new PR needs an item, a target date, a quantity above zero, a customer, a customer type and a sales owner. Supplier, price and shipping mode are filled in later.
- [[GEN.FIELD]]: A required field is missing.
- [[PR.OVERRIDE]]: Choosing a supplier other than the recommended one needs an override reason.
- [[PR.READY]]: A PR becomes Ready for PO by itself when four conditions pass: supplier selected, final price confirmed, shipping mode selected (Local needs none) and a target date. It goes back to For Sourcing if one stops passing.
- [[PR.RECOMMEND]]: The recommended supplier is the eligible one with the lowest price (Negotiated if entered, else Initial), with lead time breaking a tie. A supplier that has not quoted is never recommended.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
