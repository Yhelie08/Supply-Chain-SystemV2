---
title: transferCreate
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:829"
---

# transferCreate

Transfer Item: creates a warehouse request or a warehouse-to-warehouse transfer.

**Source:** `src/domain/actions.js:829`

## Offered on
- [[Transfer Item]] (Fulfillment)

## Creates records in
- [[transfers]]

## Rules
- [[GEN.FIELD]]: A required field is missing.
- [[XFER.NEW]]: A transfer or warehouse request needs an item, a quantity above zero and two different warehouses.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
