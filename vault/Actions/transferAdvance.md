---
title: transferAdvance
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:838"
---

# transferAdvance

Transfer Item: moves a request to Done, or a transfer through Dispatched to Received.

**Source:** `src/domain/actions.js:838`

## Offered on
- [[Transfer Item]] (Fulfillment)

## Rules
- [[XFER.DONE]]: A warehouse request goes Pending then Done. A warehouse transfer goes Pending Dispatch, Dispatched, then Received. Nothing moves past its last step.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
