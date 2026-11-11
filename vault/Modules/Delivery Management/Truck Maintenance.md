---
title: Truck Maintenance
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/trucks"
status: partial
source: src/pages/extras.jsx (TruckMaintenance)
---

# Truck Maintenance

> Daily vehicle checklist, fuel entries and service entries.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/trucks` · **Source:** `src/pages/extras.jsx` (`TruckMaintenance`) · **Status:** built, not yet at parity

## What the live page has

- **Inner tabs:** Track Maintenance · Fuel Entries · Service Entries
- **Stat cards:** Total Checklists · Open · In Progress · Completed · Issues Found
- **Buttons:** Add Checklist

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[truckChecklistAdvance]] | Truck Maintenance: starts a checklist, then completes it with a signature. | [[TRUCK.SIGN]] |
| [[truckChecklistCreate]] | Truck Maintenance: opens a daily vehicle checklist. | [[TRUCK.NEW]] |

