---
title: truckChecklistAdvance
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:889"
---

# truckChecklistAdvance

Truck Maintenance: starts a checklist, then completes it with a signature.

**Source:** `src/domain/actions.js:889`

## Offered on
- [[Truck Maintenance]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[TRUCK.SIGN]]: A checklist cannot be completed without a signature. It goes Open, In Progress, Completed.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
