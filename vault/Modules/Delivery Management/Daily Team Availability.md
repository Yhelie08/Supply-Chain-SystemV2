---
title: Daily Team Availability
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/availability"
status: partial
source: src/pages/delivery/ (TeamsScreen)
---

# Daily Team Availability

> Which teams (installer, driver, vehicle) are available each day, and their capacity, before the scheduling engine runs.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/availability` · **Source:** `src/pages/delivery/` (`TeamsScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]], [[teams]]

## What the live page has

- **Inner tabs:** Upcoming · Today · All
- **Stat cards:** Teams Today · Full Day Today · Not Available Today · Upcoming Records
- **Buttons:** Generate Month · + Add Team Availability

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[teamCapacity]] | Sets how many jobs a team can take per day. | — |
| [[teamToggleOff]] | Marks a date as a day off for a team, or brings the team back if it was already off. | — |

