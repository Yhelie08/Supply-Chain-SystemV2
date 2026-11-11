---
title: srHandOff
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:1227"
---

# srHandOff

Hands a job from Initial Scheduling to Service Request. Needs an initial date.

**Source:** `src/domain/actions.js:1227`

## Offered on
- [[Initial Scheduling]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[DMS.INITIAL]]: The initial delivery date must be set before the job is handed off to Service Request.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
