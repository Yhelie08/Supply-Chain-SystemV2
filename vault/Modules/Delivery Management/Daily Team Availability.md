---
title: Daily Team Availability
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/availability"
status: partial
source: src/pages/screens.jsx (TeamsScreen)
---

# Daily Team Availability

> Which teams (installer, driver, vehicle) are available each day, and their capacity, before the scheduling engine runs.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/availability` · **Source:** `src/pages/screens.jsx` (`TeamsScreen`) · **Status:** built, not yet at parity

**Shows:** [[serviceRequests]], [[teams]]

## What the live page has

- **Inner tabs:** Upcoming · Today · All
- **Stat cards:** Teams Today · Full Day Today · Not Available Today · Upcoming Records
- **Buttons:** Generate Month · + Add Team Availability

### Still missing from this page

- tab: Upcoming
- tab: All
- stat card: Teams Today
- stat card: Full Day Today
- stat card: Not Available Today
- stat card: Upcoming Records
- button: Generate Month
- button: + Add Team Availability

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[teamCapacity]] | Sets how many jobs a team can take per day. | — |
| [[teamToggleOff]] | Marks a date as a day off for a team, or brings the team back if it was already off. | — |

