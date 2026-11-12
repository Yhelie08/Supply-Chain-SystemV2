---
title: srSchedule
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:1235"
---

# srSchedule

Runs the scheduling engine: earliest team with room from the initial date, skipping Sundays and days off. Pick Up jobs skip the engine.

**Source:** `src/domain/actions.js:1235`

## Offered on
- [[Service Request]] (Delivery Management)
- [[Service Appointment]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[DMS.SITE]]: A delivery cannot be scheduled until the site is confirmed. Pick Up jobs are exempt.
- [[DMS.FULL]]: If no team has free capacity in the next 14 days, scheduling is refused rather than overbooking.
- [[DMS.PICKUP]]: A Pick Up job is scheduled without a team, because the customer collects it.
- [[DMS.ENGINE]]: The engine searches from the initial date (or today if that has passed), skips Sundays and days a team is off, and picks the least-loaded team with room.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
