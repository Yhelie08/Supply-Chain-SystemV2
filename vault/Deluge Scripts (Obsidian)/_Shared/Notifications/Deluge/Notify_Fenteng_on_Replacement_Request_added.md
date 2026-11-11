---
title: "Notify_Fenteng_on_Replacement_Request_added"
source_file: "Deluge Script/Notification\Notify_Fenteng_on_Replacement_Request_added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 39
tags:
  - deluge
  - notification
  - zoho-creator
---

# Notify_Fenteng_on_Replacement_Request_added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Fenteng_on_Replacement_Request_added.txt`
> - **Lines of Code:** 39
> - **Tags:** `#deluge`, `#notification`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_Fenteng_on_Replace as "Notify Fenteng on Replacement Request added"
{
	type =  form
	form = Fenteng_Lighting_Replacement_Request

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					if(thisapp.environment.type == "production")
				{
					baseUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Replacement_Request_Fenteng";
				}
				else
				{
					baseUrl = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Replacement_Request_Fenteng";
				}
				targetUrl = baseUrl + "?fentengrrid=" + input.RR_No;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@Fentenglighting.com"
					Notification_Type="Replacement Request added"
					Message="New replacement request " + input.RR_No + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.RR_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
