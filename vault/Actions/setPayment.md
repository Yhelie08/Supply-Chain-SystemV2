---
title: setPayment
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1078"
---

# setPayment

Sets the item's payment to Paid, Unpaid or Credit.

**Source:** `src/domain/actions.js:1078`

## Offered on
- [[Order Readiness]] (Fulfillment)
- [[To Ship]] (Fulfillment)

## Rules
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
