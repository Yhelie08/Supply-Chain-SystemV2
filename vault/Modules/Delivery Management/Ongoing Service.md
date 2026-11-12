---
title: Ongoing Service
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/ongoing"
status: partial
source: src/pages/delivery/ (OngoingScreen)
---

# Ongoing Service

> Installation and site completion form for deliveries in the field.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/ongoing` · **Source:** `src/pages/delivery/` (`OngoingScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]], [[teams]]

## What the live page has

- **Inner tabs:** Today · All Ongoing · Not Started · Started · Installation Completed
- **Stat cards:** Ongoing Deliveries · Not Started · Started · Installation Completed
- **Buttons:** Save Field Work

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[srComplete]] | Completes an Ongoing job. | — |
| [[srFail]] | Marks an Ongoing job failed with a reason and sends it to the Exception Queue. | [[DMS.FAIL]] |

## In the flow

Work arrives from: [[Service Appointment]]

Work goes on to: [[DMS Exception Queue]]
