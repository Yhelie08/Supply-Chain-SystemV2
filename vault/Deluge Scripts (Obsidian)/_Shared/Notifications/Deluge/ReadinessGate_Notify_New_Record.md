---
title: "ReadinessGate_Notify_New_Record"
source_file: "ReadinessGate_Notify_New_Record"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]"
lines: 12
tags:
  - deluge
  - fulfillment
  - notification
  - readiness-gate
  - zoho-creator
---

# ReadinessGate_Notify_New_Record

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `ReadinessGate_Notify_New_Record`
> - **Lines of Code:** 12
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#readiness-gate`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
insert into ReadinessGate_Notifications
[
	Recipient_Email="homecartelff@gmail.com"
	Notification_Type="Readiness Gate Record Created"
	Message="New Sales Order Readiness Gate record — " + input.sales_order_number + " (" + input.Item_Name + "). Click to open it."
	Created_On=zoho.currenttime
	Read=false
	Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Order_Readiness1?readinessGateRecordId=" + input.ID
	Source_Record_No=input.sales_order_number
	Source_Record_ID=input.ID
	Added_User=zoho.loginuser
]

````
