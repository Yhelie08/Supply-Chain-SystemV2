---
title: poAcknowledge
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:514"
---

# poAcknowledge

Records the supplier's ETD and ETA, once only. Creates the Shipment and its Receiving if they are missing.

**Source:** `src/domain/actions.js:514`

## Offered on
- [[Purchase Order]] (Procurement)

## Creates records in
- [[shipments]]
- [[receivings]]

## Rules
- [[PO.ACK_ONCE]]: A PO can be acknowledged only once.
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PO.ACK_DATES]]: Acknowledging a PO needs both an ETD and an ETA, and the ETA cannot be before the ETD.
- [[PO.ACK_AUTO]]: Acknowledging a PO creates its Shipment and its Receiving.
- [[RCV.ONE]]: There is only one Receiving per Shipment.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
