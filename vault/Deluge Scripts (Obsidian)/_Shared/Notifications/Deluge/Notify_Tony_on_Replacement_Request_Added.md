---
title: "Notify_Tony_on_Replacement_Request_Added"
source_file: "Deluge Script/Notification\Notify_Tony_on_Replacement_Request_Added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 53
tags:
  - deluge
  - notification
  - procurement
  - purchase-order
  - zoho-creator
---

# Notify_Tony_on_Replacement_Request_Added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Tony_on_Replacement_Request_Added.txt`
> - **Lines of Code:** 53
> - **Tags:** `#deluge`, `#notification`, `#procurement`, `#purchase-order`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Notify_Tony_on_Replacemen as "Notify Tony on Replacement Request Added"
{
	type =  form
	form = Tony_Fan_Replacement_Request

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
				deep_link_token = "RR-" + input.ID + "-" + ts;
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="Replacement Request added"
					Message="A new replacement request " + input.RR_No + " was added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=page_base_url + "/#Page:Replacement_Request_Tony?tonyrrid=" + deep_link_token
					Source_Record_No=input.RR_No
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
					subject :"Replacement Request added"
					message :"A new replacement request has been added in your portal."
					content type :Plain Text
				]
			)
		}
	}

}

````
