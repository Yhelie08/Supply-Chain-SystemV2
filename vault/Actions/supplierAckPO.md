---
title: supplierAckPO
tags: [action, tony-fan]
module: Tony Fan
source: "src/domain/actions.js:1010"
---

# supplierAckPO

Supplier portal: the supplier acknowledges a sent PO with an ETD and ETA, which confirms it and creates the shipment. Blocked if every line is held or cancelled.

**Source:** `src/domain/actions.js:1010`

## Offered on
- [[Tony Fan - Purchase Order]] (Tony Fan)
- [[Fenteng Lighting - Purchase Order]] (Fenteng Lighting)

## Creates records in
- [[shipments]]
- [[receivings]]

## Rules
- [[SUP.OWN]]: A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.
- [[SUP.PO_HELD]]: A PO or shipment cannot be acknowledged or shipped while every line on it is on hold or cancelled.
- [[PO.ACK_ONCE]]: A PO can be acknowledged only once.
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PO.ACK_DATES]]: Acknowledging a PO needs both an ETD and an ETA, and the ETA cannot be before the ETD.
- [[SUP.VISIBLE]]: A supplier sees a PO only once it is sent, and a shipment only once the PO is acknowledged (or the replacement approved). The supplier status of an inquiry or PR line is worked out from the quotes, never stored.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
