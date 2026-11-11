---
title: supplierShip
tags: [action, tony-fan]
module: Tony Fan
source: "src/domain/actions.js:1018"
---

# supplierShip

Supplier portal: the supplier ships a pending shipment with a date shipped (not in the future) and a mode. The shipment goes In Transit.

**Source:** `src/domain/actions.js:1018`

## Offered on
- [[Tony Fan - Shipments]] (Tony Fan)
- [[Fenteng Lighting - Shipments]] (Fenteng Lighting)

## Rules
- [[SUP.OWN]]: A supplier can only act on records assigned to it. Each portal shows only its own supplier's lines.
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[SUP.SHIP]]: Shipping needs a Date Shipped (not in the future) and a Mode.
- [[SUP.PO_HELD]]: A PO or shipment cannot be acknowledged or shipped while every line on it is on hold or cancelled.
- [[SUP.VISIBLE]]: A supplier sees a PO only once it is sent, and a shipment only once the PO is acknowledged (or the replacement approved). The supplier status of an inquiry or PR line is worked out from the quotes, never stored.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
