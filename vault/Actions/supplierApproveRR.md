---
title: supplierApproveRR
tags: [action, tony-fan]
module: Tony Fan
source: "src/domain/actions.js:1032"
---

# supplierApproveRR

Supplier portal: the supplier approves a replacement request with a mode, expected ship date and ETA. It becomes Acknowledged and the replacement shipment is created.

**Source:** `src/domain/actions.js:1032`

## Offered on
- [[Tony Fan - Replacement Request]] (Tony Fan)
- [[Fenteng Lighting - Replacement Request]] (Fenteng Lighting)

## Creates records in
- [[shipments]]
- [[receivings]]

## Rules
- [[SUP.OWN]]: A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.
- [[RR.DATES]]: Approving a replacement needs both an Expected Ship Date and an ETA.
- [[RR.ONCE]]: A replacement can be approved only once.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
