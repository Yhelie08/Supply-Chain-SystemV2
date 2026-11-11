---
title: "Pick1_Notify_New_Record"
source_file: "Deluge Script/Notification\Pick1_Notify_New_Record.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]"
lines: 30
tags:
  - deluge
  - fulfillment
  - notification
  - pick
---

# Pick1_Notify_New_Record

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Pick1_Notify_New_Record.txt`
> - **Lines of Code:** 30
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#pick`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Pick1_Notify_New_Record as "Pick1_Notify_New_Record"
{
	type =  form
	form = Pick1

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					insert into Pick_Notifications
				[
					Recipient_Email="homecartelff@gmail.com"
					Notification_Type="Pick Record Created"
					Message="New item ready for picking — " + input.SO + " (" + input.Item_Name + "). Click to open it."
					Created_On=zoho.currenttime
					Read=false
					Target_URL="https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Pick2?pickRecordId=" + input.ID
					Source_Record_No=input.SO
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
