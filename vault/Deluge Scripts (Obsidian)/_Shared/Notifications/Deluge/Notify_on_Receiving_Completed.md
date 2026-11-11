---
title: "Notify_on_Receiving_Completed"
source_file: "Deluge Script/Notification\Notify_on_Receiving_Completed.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]"
lines: 32
tags:
  - deluge
  - fulfillment
  - notification
  - pack
---

# Notify_on_Receiving_Completed

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_on_Receiving_Completed.txt`
> - **Lines of Code:** 32
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#pack`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_on_Receiving_Compl as "Notify on Receiving Completed"
{
	type =  form
	form = Receiving

	record event = on edit

	on success
	{
		actions
		{
			custom deluge script
			(
					if(input.Receive_Status == "Completed")
				{
					insert into App_Notifications
					[
						Recipient_Email="homecartelpacker@gmail.com"
						Notification_Type="Receiving"
						Message="Receiving " + input.Receive_No1 + " has been completed."
						Created_On=zoho.currenttime
						Target_URL="https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Receiving1"
						Source_Record_No=input.Receive_No1
						Source_Record_ID=input.ID
						Added_User=zoho.loginuser
					]
				}
			)
		}
	}

}

````
