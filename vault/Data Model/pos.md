---
title: pos
tags: [entity]
label: Purchase Order
---

# pos

**Purchase Order.** The order sent to a supplier. One per supplier per conversion.

11 rows in the sample data.

## Created by
- [[prConvert]]
- [[prGroupCreatePO]]

## Shown on
- [[Supply Chain Analytic]]
- [[Procurement Dashboard]]
- [[Purchase Request]]
- [[Purchase Order]]
- [[Tony Fan - Purchase Order]]
- [[Fenteng Lighting - Purchase Order]]

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
- `createdOn`

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
  "status": "Completed",
  "etd": "2026-10-22",
  "eta": "2026-11-09",
  "ackAt": "2026-11-11T05:11:32.904Z",
  "createdOn": "2026-11-11"
}
```

Up: [[Data Model]].
