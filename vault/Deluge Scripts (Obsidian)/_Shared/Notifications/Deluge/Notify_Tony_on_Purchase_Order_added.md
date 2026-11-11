---
title: "Notify_Tony_on_Purchase_Order_added"
source_file: "Deluge Script/Notification\Notify_Tony_on_Purchase_Order_added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 53
tags:
  - deluge
  - notification
  - procurement
  - purchase-order
  - supplier-portal
  - zoho-creator
---

# Notify_Tony_on_Purchase_Order_added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Tony_on_Purchase_Order_added.txt`
> - **Lines of Code:** 53
> - **Tags:** `#deluge`, `#notification`, `#procurement`, `#purchase-order`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_Tony_on_Purchase_O as "Notify Tony on Purchase Order added"
{
	type =  form
	form = Tony_Fan_Purchase_Order

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
					page_base_url = "";
				if(thisapp.environment.type == "production")
				{
					page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
				}
				else
				{
					page_base_url = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app";
				}
				ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
				deep_link_token = "PO-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="Purchase Order added"
					Message="A new purchase order " + input.PO_No_Supplier2 + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Tony_Fan_PO?tonypoid=" + deep_link_token
					Source_Record_No=input.PO_No_Supplier2
					Source_Record_ID=input.ID
					Deep_Link_Token=deep_link_token
					Added_User=zoho.loginuser
				]
				sendmail
				[
					from :zoho.adminuserid
					to :"184319330@qq.com"
					cc:""
					bcc :""
					reply to :zoho.adminuserid
					subject :"Purchase Order added"
					message :"A new purchase order has been added in your portal."
					content type :Plain Text
				]
			)
		}
	}

}

````
