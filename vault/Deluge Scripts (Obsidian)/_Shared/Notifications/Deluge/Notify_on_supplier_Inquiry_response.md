---
title: "Notify_on_supplier_Inquiry_response"
source_file: "Deluge Script/Notification\Notify_on_supplier_Inquiry_response.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 32
tags:
  - deluge
  - fulfillment
  - inquiry
  - notification
  - pack
  - procurement
  - purchase-order
  - supplier-portal
---

# Notify_on_supplier_Inquiry_response

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_on_supplier_Inquiry_response.txt`
> - **Lines of Code:** 32
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#notification`, `#pack`, `#procurement`, `#purchase-order`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_on_supplier_Inquir as "Notify on supplier Inquiry response"
{
	type =  form
	form = Inquiry_Messages

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					if(input.Sender_Role == "Supplier")
				{
					insert into App_Notifications
					[
						Recipient_Email="homecartelpacker@gmail.com"
						Notification_Type="Supplier Inquiry Conversation"
						Message=input.Supplier + " sent a message on " + input.INQ_No + "."
						Created_On=zoho.currenttime
						Target_URL="https://creatorapp.zoho.com/homecartel/supply-chain-app/#Page:Inquiry"
						Source_Record_No=input.INQ_No
						Source_Record_ID=input.ID
						Added_User=zoho.loginuser
					]
				}
			)
		}
	}

}

````
