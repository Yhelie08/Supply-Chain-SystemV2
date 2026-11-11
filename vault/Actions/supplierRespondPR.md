---
title: supplierRespondPR
tags: [action, tony-fan]
module: Tony Fan
source: "src/domain/actions.js:980"
---

# supplierRespondPR

Supplier portal: a supplier quotes a purchase request raised by hand. A PR that came from an inquiry is view-only, and a held or cancelled PR cannot be quoted.

**Source:** `src/domain/actions.js:980`

## Offered on
- [[Tony Fan - Purchase Request]] (Tony Fan)
- [[Fenteng Lighting - Purchase Request]] (Fenteng Lighting)

## Rules
- [[SUP.OWN]]: A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.
- [[SUP.PR_VIEW]]: A PR that came from an inquiry is view-only for the supplier, and a held or cancelled PR cannot be quoted.
- [[SUP.LOCKED]]: A response is locked once the buyer selected another supplier, once this supplier is selected (pricing locks, collateral opens), and for good when it is Completed.
- [[SUP.RESPONSE]]: A response needs an availability. Unless the supplier declines (Unavailable or Cannot Produce), it also needs an Initial Price above zero and a Lead Time.
- [[SUP.DECLINE]]: Declining (Unavailable or Cannot Produce) asks for confirmation, tells the buyer, and removes the line from the supplier's queue.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
