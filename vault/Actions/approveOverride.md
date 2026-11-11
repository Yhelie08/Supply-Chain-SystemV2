---
title: approveOverride
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:677"
---

# approveOverride

Lets an unpaid item through the gate and dispatch, with a reason and a valid-until date in the future.

**Source:** `src/domain/actions.js:677`

## Offered on
- [[Readiness Gate]] (Fulfillment)

## Rules
- [[GATE.OVERRIDE]]: An Approve Dispatch override needs a reason and a valid-until date in the future.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
