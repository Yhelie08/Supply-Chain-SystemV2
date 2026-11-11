---
title: salesReturns
tags: [entity]
label: Sales Return
---

# salesReturns

**Sales Return.** A return for a completed or failed delivery, sent to Books with an RMA.

2 rows in the sample data.

## Created by
- [[salesReturnCreate]]

## Fields
- `id`
- `no`
- `srNo`
- `soNo`
- `customer`
- `warehouse`
- `rma`
- `reason`
- `qty`
- `status`
- `createdOn`
- `signature`
- `sentOn`

## A sample row

```json
{
  "id": "ret404",
  "no": "SRT-00001",
  "srNo": "SR-00007",
  "soNo": "SO-16620",
  "customer": "Wes Gil",
  "warehouse": "Main Warehouse",
  "rma": "RMA-2026-0001",
  "reason": "Customer changed the order",
  "qty": 1,
  "status": "Created",
  "createdOn": "2026-11-11",
  "signature": "Wes Gil",
  "sentOn": "2026-11-11"
}
```

Up: [[Data Model]].
