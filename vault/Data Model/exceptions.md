---
title: exceptions
tags: [entity]
label: Exception
---

# exceptions

**Exception.** Damaged, missing or QC-rejected goods. Source is Procurement or Fulfillment.

8 rows in the sample data.

## Created by
- [[receive]]
- [[exceptionRaise]]
- [[qcReject]]

## Shown on
- [[Supply Chain Analytic]]
- [[Procurement Dashboard]]
- [[Exceptions]]
- [[Tony Fan - Replacement Request]]
- [[Fenteng Lighting - Replacement Request]]
- [[Fulfillment Dashboard]]
- [[Exception Control]]

## Lifecycle (`status`)

```mermaid
flowchart LR
  Open["Open"] -->|exceptionCreateRR| RR_Created["RR Created"]
  RR_Created["RR Created"] -->|receive| Closed["Closed"]
```

| From | To | Step |
| --- | --- | --- |
| Open | RR Created | [[exceptionCreateRR]] |
| RR Created | Closed | [[receive]] |

Closed happens when the replacement shipment is received in full.

Values seen in the sample data: `Open`, `RR Created`.

## Fields
- `id`
- `no`
- `source`
- `receivingNo`
- `shipmentNo`
- `poNo`
- `supplier`
- `item`
- `type`
- `qty`
- `prNos`
- `itemId`
- `status`
- `rrNo`
- `raisedOn`
- `createdOn`
- `notes`
- `fcStatus`

## A sample row

```json
{
  "id": "exc64",
  "no": "EXC-00001",
  "source": "Procurement",
  "receivingNo": "RCV-00003",
  "shipmentNo": "SHP-00003",
  "poNo": "PO-00003",
  "supplier": "Tony Fan",
  "item": "Outdoor Bollard",
  "type": "Damaged + Missing",
  "qty": 3,
  "prNos": [
    "PR-00006"
  ],
  "itemId": "",
  "status": "Open",
  "rrNo": "",
  "raisedOn": "2026-11-11",
  "createdOn": "2026-11-11"
}
```

Up: [[Data Model]].
