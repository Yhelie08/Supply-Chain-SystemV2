---
title: "hc_system_purchase_request_setup"
source_file: "hc_system_purchase_request_setup.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 13
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# hc_system_purchase_request_setup

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `hc_system_purchase_request_setup.txt`
> - **Lines of Code:** 13
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPERSEDED 2026-09-04, same day — see hc_system_local_sourcing_setup.txt instead ==
== Per user ("gagawin lang natin is yung name lang ng HC for record lang siya... isang
   diretso lang siya... wala naman papasok sa zoho books"): the full HC_System_
   Purchase_Request twin form + pricing/negotiation workflow drafted in this file's
   earlier version is NOT what the user wants. Simplified — no separate portal, no
   separate quote/response cycle. "HC System" is just the supplier NAME stamped for
   record-keeping; price comes from the PR's own existing rate. Do NOT create the
   HC_System_Purchase_Request form described in an earlier version of this file. ==

Go to hc_system_local_sourcing_setup.txt for the current, much smaller setup (1 new
field on Purchase_Request1, 2 one-line guards on existing scripts, 1 new Custom
Function, 1 guard on the Receiving script). Nothing from this file's earlier version
should be pasted into Zoho.

````
