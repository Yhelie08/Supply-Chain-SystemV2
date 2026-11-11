---
title: "Notify_Tony_on_Purchase_Request_added"
source_file: "Deluge Script/Notification\Notify_Tony_on_Purchase_Request_added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 42
tags:
  - deluge
  - notification
  - procurement
  - purchase-request
  - supplier-portal
  - zoho-creator
---

# Notify_Tony_on_Purchase_Request_added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Tony_on_Purchase_Request_added.txt`
> - **Lines of Code:** 42
> - **Tags:** `#deluge`, `#notification`, `#procurement`, `#purchase-request`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_Tony_on_Purchase_R as "Notify Tony on Purchase Request added"
{
	type =  form
	form = Tony_Fan_Purchase_Request

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
				deep_link_token = "PR-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="Purchase Request added"
					Message="A new purchase request " + input.PR_No_Supplier2 + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Tony_Fan_PR?tonyprid=" + deep_link_token
					Source_Record_No=input.PR_No_Supplier2
					Source_Record_ID=input.ID
					Deep_Link_Token=deep_link_token
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
