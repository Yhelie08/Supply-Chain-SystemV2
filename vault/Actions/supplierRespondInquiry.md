---
title: supplierRespondInquiry
tags: [action, tony-fan]
module: Tony Fan
source: "src/domain/actions.js:938"
---

# supplierRespondInquiry

Supplier portal: a supplier answers an inquiry line with availability, lead time and prices. Only while the line is Waiting or Submit Response. Unavailable or Cannot Produce declines it and removes it from the supplier queue.

**Source:** `src/domain/actions.js:938`

## Offered on
- [[Tony Fan - Inquiries]] (Tony Fan)
- [[Fenteng Lighting - Inquiries]] (Fenteng Lighting)

## Creates records in
- [[timeline]]

## Rules
- [[SUP.OWN]]: A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.
- [[SUP.LOCKED]]: A response is locked once the buyer selected another supplier, once this supplier is selected (pricing locks, collateral opens), and for good when it is Completed.
- [[SUP.RESPONSE]]: A response needs an availability. Unless the supplier declines (Unavailable or Cannot Produce), it also needs an Initial Price above zero and a Lead Time.
- [[GEN.FIELD]]: A required field is missing.
- [[INQ.PRICE]]: A Negotiated price can only be entered once there is an Initial price. The Final price is never typed: it is the Negotiated price if entered, otherwise the Initial price.
- [[SUP.DECLINE]]: Declining (Unavailable or Cannot Produce) asks for confirmation, tells the buyer, and removes the line from the supplier's queue.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
