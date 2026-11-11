---
title: "hc_system_pr_sync_supplier_selected_guard"
source_file: "hc_system_pr_sync_supplier_selected_guard.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 7
tags:
  - deluge
  - procurement
  - purchase-request
  - supplier-portal
---

# hc_system_pr_sync_supplier_selected_guard

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `hc_system_pr_sync_supplier_selected_guard.txt`
> - **Lines of Code:** 7
> - **Tags:** `#deluge`, `#procurement`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPERSEDED 2026-09-04, same day — folded into hc_system_local_sourcing_setup.txt ==
== The guard itself (pr_sync_supplier_selected.txt needs a Sourcing_Type=="Local" early
   return that sets Selected_Supplier="HC System") is UNCHANGED and still correct — it
   just now lives in the single consolidated file instead of its own file, since the
   rest of the original HC System plan got simplified down to almost nothing else. ==

Go to hc_system_local_sourcing_setup.txt — this exact guard is STEP 2 there.

````
