---
title: scheduleRequestCreate
tags: [action, domain]
module: Domain
source: "src/domain/actions.js:910"
---

# scheduleRequestCreate

Schedule Requests: records a client request to move a delivery date.

**Source:** `src/domain/actions.js:910`

## Creates records in
- [[scheduleRequests]]

## Rules
- [[SCHED.NEW]]: A schedule request needs a new date and a reason, and a delivery can have only one waiting for review.
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
