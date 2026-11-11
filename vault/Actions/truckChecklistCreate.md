---
title: truckChecklistCreate
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:880"
---

# truckChecklistCreate

Truck Maintenance: opens a daily vehicle checklist.

**Source:** `src/domain/actions.js:880`

## Offered on
- [[Truck Maintenance]] (Delivery Management)

## Creates records in
- [[truckChecks]]

## Rules
- [[TRUCK.NEW]]: A checklist needs a known truck and a date.
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
