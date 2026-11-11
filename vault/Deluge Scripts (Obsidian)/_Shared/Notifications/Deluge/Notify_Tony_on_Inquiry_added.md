---
title: "Notify_Tony_on_Inquiry_added"
source_file: "Deluge Script/Notification\Notify_Tony_on_Inquiry_added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 36
tags:
  - deluge
  - inquiry
  - notification
  - procurement
  - supplier-portal
  - zoho-creator
---

# Notify_Tony_on_Inquiry_added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Tony_on_Inquiry_added.txt`
> - **Lines of Code:** 36
> - **Tags:** `#deluge`, `#inquiry`, `#notification`, `#procurement`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
TAMA NA ITO — walang kailangan ayusin, tamang Production URL na ang page_base_url dito.

Notify_Tony_on_Inquiry_ad as "Notify Tony on Inquiry added"
{
	type =  form
	form = Supplier_2

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
				ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
				deep_link_token = "INQ-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="New Inquiry added"
					Message="A new inquiry " + input.INQ_No_Supplier + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Tony_Fan_Inquiries?tonyinquiriesid=" + deep_link_token
					Source_Record_No=input.INQ_No_Supplier
					Source_Record_ID=input.ID
					Deep_Link_Token=deep_link_token
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
