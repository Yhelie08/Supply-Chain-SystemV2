---
title: Initial Scheduling
tags: [page, delivery]
module: Delivery
route: "#/delivery/initial"
source: src/pages/screens.jsx (InitialSchedulingScreen)
---

# Initial Scheduling

> Everything dispatched from Order Aggregation lands here. Set the first date, confirm the site, then hand off.

**Module:** [[Delivery]] · **Route:** `#/delivery/initial` · **Source:** `src/pages/screens.jsx` (`InitialSchedulingScreen`)

**Shows:** [[serviceRequests]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srHandOff]] | Hands a job from Initial Scheduling to Service Request. Needs an initial date. | [[DMS.INITIAL]] |
| [[srSetInitial]] | Sets or changes the initial delivery date, which anchors the scheduling engine's search. | [[DMS.INITIAL]] |
| [[srConfirmSite]] | Confirms the site with a method and notes. Both are required, and only a person can confirm. | [[DMS.CONFIRM]] |

## In the flow

Work arrives from: [[Order Aggregation]]

Work goes on to: [[Service Request]]
