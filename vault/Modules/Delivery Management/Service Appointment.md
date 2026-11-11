---
title: Service Appointment
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/appointments"
status: partial
source: src/pages/screens.jsx (AppointmentScreen)
---

# Service Appointment

> Approve or override the engine's schedule, then dispatch one package at a time when the checklist passes.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/appointments` · **Source:** `src/pages/screens.jsx` (`AppointmentScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]]

## What the live page has

- **Inner tabs:** Awaiting approval · Scheduled appointments · Calendar
- **Stat cards:** Awaiting approval · Scheduled appointments · Ready to dispatch · Blocked by the gate · Packages still here
- **Buttons:** Review

### Still missing from this page

- tab: Awaiting approval
- tab: Scheduled appointments
- tab: Calendar
- stat card: Awaiting approval
- stat card: Scheduled appointments
- stat card: Ready to dispatch
- stat card: Blocked by the gate
- stat card: Packages still here
- button: Review

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srStart]] | Starts a Scheduled job, moving it to Ongoing. | — |

## In the flow

Work arrives from: [[Service Request]]

Work goes on to: [[Ongoing Service]]
