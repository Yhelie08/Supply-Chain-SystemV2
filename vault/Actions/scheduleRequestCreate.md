---
title: scheduleRequestCreate
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:910"
---

# scheduleRequestCreate

Schedule Requests: records a client request to move a delivery date.

**Source:** `src/domain/actions.js:910`

## Offered on
- [[Schedule Requests]] (Delivery Management)

## Creates records in
- [[scheduleRequests]]

## Rules
- [[SCHED.NEW]]: A schedule request needs a new date and a reason, and a delivery can have only one waiting for review.
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
