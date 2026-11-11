---
title: "hc_system_po_shipment_receiving_rr_setup"
source_file: "hc_system_po_shipment_receiving_rr_setup.txt"
category: "Procurement/Replacement/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 9
tags:
  - deluge
  - procurement
  - purchase-order
  - supplier-portal
  - zoho-books
---

# hc_system_po_shipment_receiving_rr_setup

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Procurement/Replacement/Deluge`
> - **Source File:** `hc_system_po_shipment_receiving_rr_setup.txt`
> - **Lines of Code:** 9
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPERSEDED 2026-09-04, same day — see hc_system_local_sourcing_setup.txt instead ==
== Per user: no separate HC_System_Purchase_Order/HC_System_Shipment/HC_System_
   Replacement_Request forms, no acknowledgePOHC, no createRRHC/approveRRHC. Simplified
   down to one Custom Function (approvePOHC, builds Shipment+Receiving straight off the
   native aggregate Purchase_Order, no Books, no supplier-specific twin records) + the
   Receiving Books-skip guard (that part is unchanged, still correct). ==

Go to hc_system_local_sourcing_setup.txt for the current, much smaller setup. Nothing
from this file's earlier version should be pasted into Zoho.

````
