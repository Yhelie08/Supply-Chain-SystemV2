---
title: srResolve
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:1278"
---

# srResolve

Resolves a failed delivery by Rescheduling (new date, priority job) or Reverting to System (engine starts over).

**Source:** `src/domain/actions.js:1278`

## Offered on
- [[DMS Exception Queue]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[DMS.RESOLVE]]: Resolving an exception needs a Resolution Action. Reschedule also needs a new date. Revert to System hands the job back to the engine.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
