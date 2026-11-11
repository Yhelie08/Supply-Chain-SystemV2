---
title: truckChecks
tags: [entity]
label: Truck checklist
---

# truckChecks

**Truck checklist.** A daily vehicle checklist: Open, In Progress, Completed with a signature.

3 rows in the sample data.

## Created by
- [[truckChecklistCreate]]

## Fields
- `id`
- `no`
- `truck`
- `date`
- `issues`
- `notes`
- `status`
- `signature`

## A sample row

```json
{
  "id": "tc409",
  "no": "CHK-00001",
  "truck": "Truck 1",
  "date": "2026-11-11",
  "issues": 0,
  "notes": "Tires and lights fine",
  "status": "Completed",
  "signature": "Driver A"
}
```

Up: [[Data Model]].
