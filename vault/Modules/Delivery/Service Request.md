---
title: Service Request
tags: [page, delivery]
module: Delivery
route: "#/delivery/requests"
source: src/pages/screens.jsx (ServiceRequestScreen)
---

# Service Request

> The scheduling engine books the earliest team with room, starting from the initial date.

**Module:** [[Delivery]] · **Route:** `#/delivery/requests` · **Source:** `src/pages/screens.jsx` (`ServiceRequestScreen`)

**Shows:** [[serviceRequests]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srSchedule]] | Runs the scheduling engine: earliest team with room from the initial date, skipping Sundays and days off. Pick Up jobs skip the engine. | [[DMS.SITE]], [[DMS.FULL]], [[DMS.PICKUP]], [[DMS.ENGINE]] |
| [[srConfirmSite]] | Confirms the site with a method and notes. Both are required, and only a person can confirm. | [[DMS.CONFIRM]] |
| [[srSetInitial]] | Sets or changes the initial delivery date, which anchors the scheduling engine's search. | [[DMS.INITIAL]] |

## In the flow

Work arrives from: [[Initial Scheduling]], [[Exception Queue]]

Work goes on to: [[Appointments]]
