---
title: "Notify_Fenteng_on_Shipment_Added"
source_file: "Deluge Script/Notification\Notify_Fenteng_on_Shipment_Added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 39
tags:
  - deluge
  - notification
  - zoho-creator
---

# Notify_Fenteng_on_Shipment_Added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Fenteng_on_Shipment_Added.txt`
> - **Lines of Code:** 39
> - **Tags:** `#deluge`, `#notification`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_Fenteng_on_Shipmen as "Notify Fenteng on Shipment Added"
{
	type =  form
	form = Fenteng_Shipment

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					if(thisapp.environment.type == "production")
				{
					baseUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Fenteng_Shipments";
				}
				else
				{
					baseUrl = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Fenteng_Shipments";
				}
				targetUrl = baseUrl + "?fentengshipmentid=" + input.Shipment_No;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Shipment added"
					Message="New shipment " + input.Shipment_No + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.Shipment_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
