---
title: Truck Maintenance
tags: [page, delivery-management, built]
module: Delivery Management
route: "#/delivery/trucks"
status: partial
source: src/pages/delivery/ (TruckMaintenance)
---

# Truck Maintenance

> Daily vehicle checklist, fuel entries and service entries.

**Section:** [[Delivery Management]] · **Route:** `#/delivery/trucks` · **Source:** `src/pages/delivery/` (`TruckMaintenance`) · **Status:** built, not yet at parity

**Shows:** [[truckChecks]], [[truckEntries]]

## What the live page has

- **Inner tabs:** Track Maintenance · Fuel Entries · Service Entries
- **Stat cards:** Total Checklists · Open · In Progress · Completed · Issues Found
- **Buttons:** Add Checklist

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[truckEntryAdd]] | Truck Maintenance: adds a fuel or service entry. | [[TRUCK.ENTRY]] |
| [[truckChecklistAdvance]] | Truck Maintenance: starts a checklist, then completes it with a signature. | [[TRUCK.SIGN]] |

