---
title: "Notify_Suppliers_on_Inquiry_Added"
source_file: "Deluge Script/Notification\Notify_Suppliers_on_Inquiry_Added.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 59
tags:
  - deluge
  - inquiry
  - notification
  - procurement
  - supplier-portal
  - zoho-creator
---

# Notify_Suppliers_on_Inquiry_Added

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_Suppliers_on_Inquiry_Added.txt`
> - **Lines of Code:** 59
> - **Tags:** `#deluge`, `#inquiry`, `#notification`, `#procurement`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
PAALALA: NAKA-"status = inactive" ito (disabled sa Zoho ngayon) — malamang ang aktibong
"New Inquiry added" (Tony side) ay galing sa ibang workflow (Notify_Tony_on_Inquiry_ad sa
Supplier_2 form, TAMA na doon). May bug din dito na hiwalay sa dev/production issue: ang
Tony_Notifications insert (linya 36-47) ay ginagamit ang PAREHONG targetUrl (Fenteng
page/param) sa halip na sariling Tony-specific na URL. Huwag i-activate/ayusin hangga't
hindi kumpirmadong kailangan pa ito.

Notify_Suppliers_on_Inqui as "Notify Suppliers on Inquiry Added"
{
	type =  form
	form = Inquiry_Form

	record event = on add
		status = inactive

	on success
	{
		actions
		{
			custom deluge script
			(
					if(thisapp.environment.type == "production")
				{
					baseUrl = "https://creator.zoho.com/homecartel/supply-chain-app/#Page:Fenteng_Lighting_Inquiries";
				}
				else
				{
					baseUrl = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app/#Page:Fenteng_Lighting_Inquiries";
				}
				targetUrl = baseUrl + "?fentenginquiriesid=" + input.INQ_No;
				insert into Fenteng_Notifications
				[
					Recipient_Email="admin@fentenglighthing.com"
					Notification_Type="New Inquiry added"
					Message="New inquiry " + input.INQ_No + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.INQ_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
				insert into Tony_Notifications
				[
					Recipient_Email="184319330@qq.com"
					Notification_Type="New Inquiry added"
					Message="New inquiry " + input.INQ_No + " has been added."
					Created_On=zoho.currenttime
					Read=false
					Target_URL=targetUrl
					Source_Record_No=input.INQ_No
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				]
			)
		}
	}

}

````
