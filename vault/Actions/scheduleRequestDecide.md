---
title: scheduleRequestDecide
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:920"
---

# scheduleRequestDecide

Schedule Requests: confirms (the delivery starts from the new date) or declines with a reason.

**Source:** `src/domain/actions.js:920`

## Offered on
- [[Schedule Requests]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[GEN.FIELD]]: A required field is missing.
- [[SCHED.DECIDE]]: Declining needs a reason. Confirming moves the delivery's start date, and works only while the delivery is still in Initial Scheduling or Service Request.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
