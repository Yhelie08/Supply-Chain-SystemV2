---
title: crateComplete
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1169"
---

# crateComplete

Moves a crated item on to Order Aggregation. Refused until Crating Status is Done.

**Source:** `src/domain/actions.js:1169`

## Offered on
- [[Crate]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[CRATE.DONE]]: Nothing moves on from Crate until Crating Status is Done.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
