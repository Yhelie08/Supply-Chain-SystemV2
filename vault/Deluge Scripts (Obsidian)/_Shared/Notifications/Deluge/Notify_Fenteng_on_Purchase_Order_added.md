---
title: "Notify_Fenteng_on_Purchase_Order_added"
source_file: "Deluge Script/Notification\Notify_Fenteng_on_Purchase_Order_added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 39
tags:
  - deluge
  - notification
  - procurement
  - purchase-order
  - supplier-portal
  - zoho-creator
---

# Notify_Fenteng_on_Purchase_Order_added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Fenteng_on_Purchase_Order_added.txt`
> - **Lines of Code:** 39
> - **Tags:** `#deluge`, `#notification`, `#procurement`, `#purchase-order`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_Fenteng_on_Purchas as "Notify Fenteng on Purchase Order added"
{
	type =  form
	form = Fenteng_Lighting_Purchase_Order

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					if(thisapp.environment.type == "production")
				{
					baseUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Fenteng_Lighting_PO";
				}
				else
				{
					baseUrl = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Fenteng_Lighting_PO";
				}
				targetUrl = baseUrl + "?fentengpoid=" + input.PO_No_Supplier1;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Purchase Order added"
					Message="New purchase order " + input.PO_No_Supplier1 + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.PO_No_Supplier1
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
