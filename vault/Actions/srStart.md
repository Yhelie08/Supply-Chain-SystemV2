---
title: srStart
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:1253"
---

# srStart

Starts a Scheduled job, moving it to Ongoing.

**Source:** `src/domain/actions.js:1253`

## Offered on
- [[Service Appointment]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
