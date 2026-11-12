---
title: siteVisits
tags: [entity]
label: Site visit
---

# siteVisits

**Site visit.** A site assessment before installation or repair.

3 rows in the sample data.

## Created by
- [[siteVisitCreate]]

## Shown on
- [[Field Service Site Visits]]

## Fields
- `id`
- `no`
- `srNo`
- `soNo`
- `customer`
- `kind`
- `siteReady`
- `notes`
- `visitDate`

## A sample row

```json
{
  "id": "sv406",
  "no": "SV-00001",
  "srNo": "SR-00003",
  "soNo": "SO-16616",
  "customer": "Sam Cortez",
  "kind": "Installation Assessment",
  "siteReady": true,
  "notes": "Ceiling is open and the power is on.",
  "visitDate": "2026-11-12"
}
```

Up: [[Data Model]].
