---
title: Service Request
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/requests"
status: partial
source: src/pages/screens.jsx (ServiceRequestScreen)
---

# Service Request

> Service requests: confirm the site, then the scheduling engine books the slot.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/requests` · **Source:** `src/pages/screens.jsx` (`ServiceRequestScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]]

## What the live page has

- **Inner tabs:** Active · Walang appointment · Needs site confirmation · Waiting for a slot · Suggestion to approve · Scheduled · Flagged · Pull out · High priority
- **Buttons:** New request · Mark site confirmed

### Still missing from this page

- tab: Active
- tab: Walang appointment
- tab: Needs site confirmation
- tab: Waiting for a slot
- tab: Suggestion to approve
- tab: Flagged
- tab: Pull out
- tab: High priority
- button: New request
- button: Mark site confirmed

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srSchedule]] | Runs the scheduling engine: earliest team with room from the initial date, skipping Sundays and days off. Pick Up jobs skip the engine. | [[DMS.SITE]], [[DMS.FULL]], [[DMS.PICKUP]], [[DMS.ENGINE]] |
| [[srConfirmSite]] | Confirms the site with a method and notes. Both are required, and only a person can confirm. | [[DMS.CONFIRM]] |
| [[srSetInitial]] | Sets or changes the initial delivery date, which anchors the scheduling engine's search. | [[DMS.INITIAL]] |

## In the flow

Work arrives from: [[Initial Scheduling]], [[DMS Exception Queue]]

Work goes on to: [[Service Appointment]]
