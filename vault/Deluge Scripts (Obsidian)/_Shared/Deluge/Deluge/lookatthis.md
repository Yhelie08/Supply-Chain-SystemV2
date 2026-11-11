---
title: "lookatthis"
source_file: "lookatthis.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 5
tags:
  - deluge
  - procurement
  - purchase-request
  - supplier-portal
---

# lookatthis

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `lookatthis.txt`
> - **Lines of Code:** 5
> - **Tags:** `#deluge`, `#procurement`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
1. Supplier_ID (if needed) , Suppliers , Availability , Initial_Price , Negotiated , Final_Price , Lead_Time , Status , Selected

2.  Availability_Supplier1 , Initial_Price_Supplier1 , Negotiated_Supplier1 , Final_Price_Supplier1 , Lead_Time_Supplier1

3. PR_No_Supplier1 , PR_No_Supplier2 ... PR_No -> this is in Purchase_Request1
````
