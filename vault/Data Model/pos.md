---
title: pos
tags: [entity]
label: Purchase Order
---

# pos

**Purchase Order.** The order sent to a supplier. One per supplier per conversion.

3 rows in the sample data.

## Created by
- [[prConvert]]
- [[prGroupCreatePO]]

## Shown on
- [[Dashboard]]
- [[Purchase Request]]
- [[Purchase Order]]

## Fields
- `id`
- `no`
- `supplier`
- `prIds`
- `prNos`
- `mode`
- `qty`
- `total`
- `currency`
- `status`
- `etd`
- `eta`
- `ackAt`

## A sample row

```json
{
  "id": "po10",
  "no": "PO-00001",
  "supplier": "Fenteng Lighting",
  "prIds": [
    "pr7"
  ],
  "prNos": [
    "PR-00001"
  ],
  "mode": "Airfreight",
  "qty": 20,
  "total": 17000,
  "currency": "CNY",
  "status": "Acknowledged",
  "etd": "2026-10-22",
  "eta": "2026-11-09",
  "ackAt": "2026-11-11T02:57:46.325Z"
}
```

Up: [[Data Model]].
