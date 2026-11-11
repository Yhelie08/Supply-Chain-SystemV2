---
title: srFail
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:1269"
---

# srFail

Marks an Ongoing job failed with a reason and sends it to the Exception Queue.

**Source:** `src/domain/actions.js:1269`

## Offered on
- [[Ongoing Service]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[DMS.FAIL]]: Marking a delivery failed needs a reason, and sends it to the Exception Queue.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
