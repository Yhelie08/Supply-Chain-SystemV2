---
title: Ongoing Service
tags: [page, delivery]
module: Delivery
route: "#/delivery/ongoing"
source: src/pages/screens.jsx (OngoingScreen)
---

# Ongoing Service

> Jobs in the field, and the ones just finished.

**Module:** [[Delivery]] · **Route:** `#/delivery/ongoing` · **Source:** `src/pages/screens.jsx` (`OngoingScreen`)

**Shows:** [[serviceRequests]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srComplete]] | Completes an Ongoing job. | — |
| [[srFail]] | Marks an Ongoing job failed with a reason and sends it to the Exception Queue. | [[DMS.FAIL]] |

## In the flow

Work arrives from: [[Appointments]]

Work goes on to: [[Exception Queue]]
