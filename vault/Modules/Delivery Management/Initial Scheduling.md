---
title: Initial Scheduling
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/initial"
status: partial
source: src/pages/screens.jsx (InitialSchedulingScreen)
---

# Initial Scheduling

> Entry point for new delivery scheduling: set the first date, then hand off to Service Request.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/initial` · **Source:** `src/pages/screens.jsx` (`InitialSchedulingScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]]

## What the live page has

- **Inner tabs:** All · From Dispatch · Ready to hand off · Handed off · Today · Upcoming · Not yet completed · Rescheduled
- **Buttons:** New schedule · Reschedule · Hand off

### Still missing from this page

- tab: From Dispatch
- tab: Ready to hand off
- tab: Handed off
- tab: Today
- tab: Upcoming
- tab: Not yet completed
- tab: Rescheduled
- button: New schedule
- button: Reschedule

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srHandOff]] | Hands a job from Initial Scheduling to Service Request. Needs an initial date. | [[DMS.INITIAL]] |
| [[srSetInitial]] | Sets or changes the initial delivery date, which anchors the scheduling engine's search. | [[DMS.INITIAL]] |
| [[srConfirmSite]] | Confirms the site with a method and notes. Both are required, and only a person can confirm. | [[DMS.CONFIRM]] |

## In the flow

Work arrives from: [[To Ship]]

Work goes on to: [[Service Request]]
