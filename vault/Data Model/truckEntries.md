---
title: truckEntries
tags: [entity]
label: Truck entry
---

# truckEntries

**Truck entry.** A fuel or service entry for a truck.

2 rows in the sample data.

## Created by
- [[truckEntryAdd]]

## Shown on
- [[Truck Maintenance]]

## Fields
- `id`
- `kind`
- `truck`
- `date`
- `cost`
- `liters`
- `note`

## A sample row

```json
{
  "id": "te412",
  "kind": "fuel",
  "truck": "Truck 1",
  "date": "2026-11-11",
  "cost": 3200,
  "liters": 52,
  "note": "Full tank"
}
```

Up: [[Data Model]].
