---
title: transfers
tags: [entity]
label: Transfer
---

# transfers

**Transfer.** A warehouse request or a warehouse-to-warehouse transfer.

4 rows in the sample data.

## Created by
- [[transferCreate]]

## Fields
- `id`
- `no`
- `kind`
- `item`
- `qty`
- `from`
- `to`
- `status`

## A sample row

```json
{
  "id": "xf400",
  "no": "XFER-00001",
  "kind": "Warehouse Request",
  "item": "Bulb E27 (box)",
  "qty": 30,
  "from": "Showroom",
  "to": "Main Warehouse",
  "status": "Pending"
}
```

Up: [[Data Model]].
