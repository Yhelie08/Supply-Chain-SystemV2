---
title: "Notify_Fenteng_on_Purchase_Request_added"
source_file: "Deluge Script/Notification\Notify_Fenteng_on_Purchase_Request_added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 40
tags:
  - deluge
  - notification
  - procurement
  - purchase-request
  - supplier-portal
  - zoho-creator
---

# Notify_Fenteng_on_Purchase_Request_added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Fenteng_on_Purchase_Request_added.txt`
> - **Lines of Code:** 40
> - **Tags:** `#deluge`, `#notification`, `#procurement`, `#purchase-request`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_Fenteng_on_Purchas1 as "Notify Fenteng on Purchase Request added"
{
	type =  form
	form = Fenteng_Lighting_Purchase_Request

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					baseUrl = "";
				if(thisapp.environment.type == "production")
				{
					baseUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Fenteng_Lighting_PR";
				}
				else
				{
					baseUrl = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Fenteng_Lighting_PR";
				}
				targetUrl = baseUrl + "?fentengprid=" + input.PR_No_Supplier1;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Purchase Request added"
					Message="New purchase request " + input.PR_No_Supplier1 + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.PR_No_Supplier1
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
