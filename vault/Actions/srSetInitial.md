---
title: srSetInitial
tags: [action, delivery]
module: Delivery
source: "src/domain/actions.js:785"
---

# srSetInitial

Sets or changes the initial delivery date, which anchors the scheduling engine's search.

**Source:** `src/domain/actions.js:785`

## Offered on
- [[Initial Scheduling]] (Delivery)
- [[Service Request]] (Delivery)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[DMS.INITIAL]]: The initial delivery date must be set before the job is handed off to Service Request.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
