---
title: Service Appointment
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/appointments"
status: partial
source: src/pages/delivery/ (AppointmentScreen)
---

# Service Appointment

> Approve or override the engine's schedule, then dispatch one package at a time when the checklist passes.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/appointments` · **Source:** `src/pages/delivery/` (`AppointmentScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]], [[teams]]

## What the live page has

- **Inner tabs:** Awaiting approval · Scheduled appointments · Calendar
- **Stat cards:** Awaiting approval · Scheduled appointments · Ready to dispatch · Blocked by the gate · Packages still here
- **Buttons:** Review

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srStart]] | Starts a Scheduled job, moving it to Ongoing. | — |
| [[srSchedule]] | Runs the scheduling engine: earliest team with room from the initial date, skipping Sundays and days off. Pick Up jobs skip the engine. | [[DMS.SITE]], [[DMS.FULL]], [[DMS.PICKUP]], [[DMS.ENGINE]] |
| [[srSetInitial]] | Sets or changes the initial delivery date, which anchors the scheduling engine's search. | [[DMS.INITIAL]] |

## In the flow

Work arrives from: [[Service Request]]

Work goes on to: [[Ongoing Service]]
