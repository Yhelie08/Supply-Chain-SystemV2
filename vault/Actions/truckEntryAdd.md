---
title: truckEntryAdd
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:902"
---

# truckEntryAdd

Truck Maintenance: adds a fuel or service entry.

**Source:** `src/domain/actions.js:902`

## Offered on
- [[Truck Maintenance]] (Delivery Management)

## Creates records in
- [[truckEntries]]

## Rules
- [[GEN.FIELD]]: A required field is missing.
- [[TRUCK.ENTRY]]: A fuel or service entry needs a known truck, a date and a cost above zero.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
