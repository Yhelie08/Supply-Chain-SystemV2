---
title: DMS Exception Queue
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/exceptions"
status: partial
source: src/pages/screens.jsx (DmsExceptionScreen)
---

# DMS Exception Queue

> Failed deliveries and reschedule requests waiting for a decision.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/exceptions` · **Source:** `src/pages/screens.jsx` (`DmsExceptionScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]]

## What the live page has

- **Inner tabs:** Open · In Progress · Resolved · All
- **Stat cards:** Open Exceptions · Open — High Severity · Past Resolve-By · Resolved
- **Buttons:** Start · Resolve · Dismiss

### Still missing from this page

- tab: Open
- tab: In Progress
- tab: Resolved
- tab: All
- stat card: Open Exceptions
- stat card: Open — High Severity
- stat card: Past Resolve-By
- stat card: Resolved
- button: Start
- button: Dismiss

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srResolve]] | Resolves a failed delivery by Rescheduling (new date, priority job) or Reverting to System (engine starts over). | [[DMS.RESOLVE]] |

## In the flow

Work arrives from: [[Ongoing Service]]

Work goes on to: [[Service Request]]
