---
title: dispatch
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1177"
---

# dispatch

Dispatches an item from Order Aggregation. Blocked on payment, once only, and creates the Service Request in Delivery Management.

**Source:** `src/domain/actions.js:1177`

## Offered on
- [[To Ship]] (Fulfillment)

## Creates records in
- [[serviceRequests]]

## Rules
- [[OA.DEDUP]]: An item that has already been dispatched cannot create a second Service Request.
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[OA.PAYMENT]]: Dispatch is blocked on payment, with the same credit and override exceptions as the Readiness Gate.
- [[OA.DMS]]: Dispatch creates the Service Request in Delivery Management, at Initial Scheduling.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
