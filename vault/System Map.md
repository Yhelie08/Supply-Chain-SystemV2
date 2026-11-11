---
title: System Map
tags: [index, architecture]
---

# System Map

From the customer's first inquiry to the truck at their door.

```mermaid
flowchart TD
  subgraph PROC["1 · Procurement"]
    INQ[Inquiry] --> PR[Purchase Request] --> PO[Purchase Order] --> SHP[Shipments] --> RCV[Receiving]
    RCV -.->|damaged or missing| EXC[Exceptions] --> RR[Replacement] -.->|replacement shipment| SHP
  end
  subgraph FUL["2 · Fulfillment"]
    GATE[Readiness Gate] --> PICK[Pick] --> PACK[Pack] --> QC[QC Checklist]
    QC -->|needs crate| CRATE[Crate] --> OA[Order Aggregation]
    QC -->|no crate| OA
    QC -.->|rejected| EXC
  end
  subgraph DMS["3 · Delivery"]
    IS[Initial Scheduling] --> SR[Service Request] --> SA[Appointments] --> ON[Ongoing Service]
    ON -.->|failed| DX[Exception Queue] -.->|resolve| SR
  end
  INQ -->|in stock| GATE
  RCV ==>|received in full| GATE
  OA ==>|dispatch| IS
```

## The three modules

- [[Procurement]]: [[Inquiry]] → [[Purchase Request]] → [[Purchase Order]] → [[Shipments]] → [[Receiving]] → [[Exceptions]] → [[Replacement]]
- [[Fulfillment]]: [[Readiness Gate]] → [[Pick]] → [[Pack]] → [[QC Checklist]] → [[Crate]] → [[Order Aggregation]]
- [[Delivery]]: [[Initial Scheduling]] → [[Service Request]] → [[Appointments]] → [[Ongoing Service]] → [[Exception Queue]] → [[Teams & Capacity]]

## The hand-offs between them

| From | To | Happens when | Step |
| --- | --- | --- | --- |
| Inquiry | Purchase Request + Fulfillment item | The customer approves the estimate | [[inquiryApprove]] |
| Purchase Request | Purchase Order | Ready PRs are converted | [[prConvert]] |
| Purchase Order | Shipment + Receiving | The supplier acknowledges | [[poAcknowledge]] |
| Receiving | Readiness Gate (item becomes packageable) | The shipment is received in full | [[receive]] |
| Receiving | Exceptions | Any goods are damaged or missing | [[receive]] |
| QC Checklist | Exceptions | An item is rejected | [[qcReject]] |
| Order Aggregation | Initial Scheduling | The item is dispatched | [[dispatch]] |
| Ongoing Service | Exception Queue | A delivery fails | [[srFail]] |

Other starting points: [[Home]], [[Rules Index]], [[Data Model]].
