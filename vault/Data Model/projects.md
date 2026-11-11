---
title: projects
tags: [entity]
label: Project
---

# projects

**Project.** A customer project with a PRJ-xxxxx code and a group discount. Inquiries of the same project and discount share a quote group.

25 rows in the sample data.

## Created by
- [[projectCreate]]

## Shown on
- [[Inquiry]]

## Fields
- `id`
- `code`
- `name`
- `customerId`
- `type`
- `groupDiscountPct`
- `status`

## A sample row

```json
{
  "id": "prj2",
  "code": "PRJ-00001",
  "name": "Villa Project",
  "customerId": "cus1",
  "type": "Residential",
  "groupDiscountPct": 0,
  "status": "Active"
}
```

Up: [[Data Model]].
