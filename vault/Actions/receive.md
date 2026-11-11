---
title: receive
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:564"
---

# receive

Counts goods off the truck: accepted, damaged, missing. Totals may not exceed expected. Damage or shortage raises an exception; a full accept frees the waiting Sales Order items.

**Source:** `src/domain/actions.js:564`

## Offered on
- [[Receiving]] (Procurement)

## Creates records in
- [[exceptions]]

## Rules
- [[RCV.ARRIVED]]: Goods can be received only after the shipment has arrived.
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[RCV.NUMBERS]]: Quantities must be whole numbers, zero or more, and at least one must be above zero.
- [[RCV.TOTAL]]: Accepted + Damaged + Missing may not exceed Expected. Partial receipts are allowed.
- [[RCV.EXCEPTION]]: Any damaged or missing quantity raises a Procurement Exception with its context.
- [[RCV.STOCK]]: When a Receiving is fully accepted, the Sales Order items waiting on it become available to Fulfillment.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
