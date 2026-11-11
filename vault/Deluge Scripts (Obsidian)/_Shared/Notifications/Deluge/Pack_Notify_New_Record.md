---
title: "Pack_Notify_New_Record"
source_file: "Deluge Script/Notification\Pack_Notify_New_Record.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 30
tags:
  - deluge
  - fulfillment
  - notification
  - pack
---

# Pack_Notify_New_Record

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Pack_Notify_New_Record.txt`
> - **Lines of Code:** 30
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#pack`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Pack_Notify_New_Record as "Pack_Notify_New_Record"
{
	type =  form
	form = Pack

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					insert into Pack_Notifications
				[
					Recipient_Email="homecartelff@gmail.com"
					Notification_Type="Pack Record Created"
					Message="New item ready for packing — " + input.SO + " (" + input.Item_Name + "). Click to open it."
					Created_On=zoho.currenttime
					Read=false
					Target_URL="https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Pack1?packRecordId=" + input.ID
					Source_Record_No=input.SO
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
