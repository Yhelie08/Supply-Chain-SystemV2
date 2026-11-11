---
title: "Notify_on_Created_Exception"
source_file: "Deluge Script/Notification\Notify_on_Created_Exception.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 29
tags:
  - deluge
  - fulfillment
  - notification
  - pack
---

# Notify_on_Created_Exception

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_on_Created_Exception.txt`
> - **Lines of Code:** 29
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#pack`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_on_Created_Excepti as "Notify on Created Exception"
{
	type =  form
	form = Exceptions

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					notifId = insert into App_Notifications
				[
					Recipient_Email="homecartelpacker@gmail.com"
					Notification_Type="Exception"
					Message="A new exception " + input.Exception_No + " was created."
					Created_On=zoho.currenttime
					Target_URL="https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Exceptions1"
					Source_Record_No=input.Exception_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				];
			)
		}
	}

}

````
