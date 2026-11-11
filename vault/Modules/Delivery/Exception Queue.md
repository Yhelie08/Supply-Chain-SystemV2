---
title: Exception Queue
tags: [page, delivery]
module: Delivery
route: "#/delivery/exceptions"
source: src/pages/screens.jsx (DmsExceptionScreen)
---

# Exception Queue

> Failed deliveries wait here for a decision.

**Module:** [[Delivery]] · **Route:** `#/delivery/exceptions` · **Source:** `src/pages/screens.jsx` (`DmsExceptionScreen`)

**Shows:** [[serviceRequests]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srResolve]] | Resolves a failed delivery by Rescheduling (new date, priority job) or Reverting to System (engine starts over). | [[DMS.RESOLVE]] |

## In the flow

Work arrives from: [[Ongoing Service]]

Work goes on to: [[Service Request]]
