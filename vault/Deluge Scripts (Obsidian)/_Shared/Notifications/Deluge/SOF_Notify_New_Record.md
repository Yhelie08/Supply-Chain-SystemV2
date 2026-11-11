---
title: "SOF_Notify_New_Record"
source_file: "SOF_Notify_New_Record"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 12
tags:
  - deluge
  - fulfillment
  - notification
  - procurement
  - purchase-request
  - zoho-creator
---

# SOF_Notify_New_Record

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `SOF_Notify_New_Record`
> - **Lines of Code:** 12
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#procurement`, `#purchase-request`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
insert into SO_Notifications
[
	Recipient_Email="homecartelff@gmail.com"
	Notification_Type="SO Record Created"
	Message="New Sales Order Fulfillment record — " + input.SO_No + " (" + input.PR_No + "). Click to open it."
	Created_On=zoho.currenttime
	Read=false
	Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:SOR?soRecordId=" + input.ID
	Source_Record_No=input.SO_No
	Source_Record_ID=input.ID
	Added_User=zoho.loginuser
]

````
