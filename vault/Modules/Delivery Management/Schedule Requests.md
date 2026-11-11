---
title: Schedule Requests
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/schedule-requests"
status: partial
source: src/pages/extras.jsx (ScheduleRequests)
---

# Schedule Requests

> Client requests to change a delivery schedule.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/schedule-requests` · **Source:** `src/pages/extras.jsx` (`ScheduleRequests`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]]

## What the live page has

- **Inner tabs:** All · Pending Review · Confirmed · Declined
- **Buttons:** Confirm · Decline

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[scheduleRequestDecide]] | Schedule Requests: confirms (the delivery starts from the new date) or declines with a reason. | [[SCHED.DECIDE]] |
| [[scheduleRequestCreate]] | Schedule Requests: records a client request to move a delivery date. | [[SCHED.NEW]] |

