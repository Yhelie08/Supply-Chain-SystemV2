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
    GATE[Order Readiness] --> PICK[Pick] --> PACK[Pack] --> QC[Pack & QC]
    QC -->|needs crate| CRATE[Crate] --> OA[To Ship]
    QC -->|no crate| OA
    QC -.->|rejected| EXC
  end
  subgraph DMS["3 · Delivery"]
    IS[Initial Scheduling] --> SR[Service Request] --> SA[Service Appointment] --> ON[Ongoing Service]
    ON -.->|failed| DX[DMS Exception Queue] -.->|resolve| SR
  end
  INQ -->|in stock| GATE
  RCV ==>|received in full| GATE
  OA ==>|dispatch| IS
```

## The three modules

The app has six sections (the dropdown in the top bar). These are the three that carry the order, and the other three are [[Analytic]], [[Tony Fan]] and [[Fenteng Lighting]].

- [[Procurement]]: [[Procurement Dashboard]] → [[Inquiry List]] → [[Purchase Request]] → [[Purchase Order]] → [[Shipments]] → [[Receiving]] → [[Replacement Request]] → [[Exceptions]] → [[Forecast Setting]]
- [[Fulfillment]]: [[Fulfillment Dashboard]] → [[Sales Order Report]] → [[Pre-Order]] → [[Order Readiness]] → [[Pick]] → [[Pack & QC]] → [[Crate]] → [[To Ship]] → [[Exception Control]] → [[Transfer Item]]
- [[Delivery Management]]: [[Delivery Analytics]] → [[Daily Team Availability]] → [[Initial Scheduling]] → [[Service Request]] → [[Service Appointment]] → [[Ongoing Service]] → [[Archived]] → [[Field Service Site Visits]] → [[Sales Returns]] → [[DMS Exception Queue]] → [[Truck Maintenance]] → [[Schedule Requests]]

## The hand-offs between them

| From | To | Happens when | Step |
| --- | --- | --- | --- |
| Inquiry List | Purchase Request + Fulfillment item | The customer approves the estimate | [[inquiryApprove]] |
| Purchase Request | Purchase Order | Ready PRs are converted | [[prConvert]] |
| Purchase Order | Shipment + Receiving | The supplier acknowledges | [[poAcknowledge]] |
| Receiving | Order Readiness (item becomes packageable) | The shipment is received in full | [[receive]] |
| Receiving | Exceptions | Any goods are damaged or missing | [[receive]] |
| Pack & QC | Exceptions | An item is rejected | [[qcReject]] |
| To Ship | Initial Scheduling | The item is dispatched | [[dispatch]] |
| Ongoing Service | DMS Exception Queue | A delivery fails | [[srFail]] |

Other starting points: [[Home]], [[Rules Index]], [[Data Model]].
