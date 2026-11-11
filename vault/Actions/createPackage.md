---
title: createPackage
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:655"
---

# createPackage

Assigns a PAC number to a received item. Refused while the item is still on order.

**Source:** `src/domain/actions.js:655`

## Offered on
- [[Readiness Gate]] (Fulfillment)

## Rules
- [[GATE.RECEIVED]]: A package cannot be created for an item that has not been received into the warehouse.
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
