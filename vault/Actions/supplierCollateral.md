---
title: supplierCollateral
tags: [action, tony-fan]
module: Tony Fan
source: "src/domain/actions.js:962"
---

# supplierCollateral

Supplier portal: the selected supplier confirms the product collateral (sample, 3D image, drawing, specification). When every item is Completed or N/A the response is Completed and locked for good.

**Source:** `src/domain/actions.js:962`

## Offered on
- [[Tony Fan - Inquiries]] (Tony Fan)
- [[Fenteng Lighting - Inquiries]] (Fenteng Lighting)

## Creates records in
- [[timeline]]

## Rules
- [[SUP.OWN]]: A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.
- [[SUP.LOCKED]]: A response is locked once the buyer selected another supplier, once this supplier is selected (pricing locks, collateral opens), and for good when it is Completed.
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
