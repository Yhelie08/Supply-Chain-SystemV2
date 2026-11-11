---
title: "Notify_on_Purchase_Request_Add"
source_file: "Deluge Script/Notification\Notify_on_Purchase_Request_Add.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 40
tags:
  - deluge
  - fulfillment
  - notification
  - pack
  - procurement
  - purchase-request
  - zoho-creator
---

# Notify_on_Purchase_Request_Add

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_on_Purchase_Request_Add.txt`
> - **Lines of Code:** 40
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#pack`, `#procurement`, `#purchase-request`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_on_Purchase_Reques1 as "Notify on Purchase Request - Add"
{
	type =  form
	form = Purchase_Request1

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					notifId1 = insert into App_Notifications
				[
					Recipient_Email="hcinvanalyst@gmail.com"
					Notification_Type="Purchase Request added"
					Message="Purchase Request " + input.PR_No + " was added"
					Created_On=zoho.currenttime
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Purchase_Request"
					Source_Record_No=input.PR_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				];
				notifId2 = insert into App_Notifications
				[
					Recipient_Email="homecartelpacker@gmail.com"
					Notification_Type="Purchase Request added"
					Message="Purchase Request " + input.PR_No + " was added"
					Created_On=zoho.currenttime
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Purchase_Request"
					Source_Record_No=input.PR_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				];
			)
		}
	}

}

````
