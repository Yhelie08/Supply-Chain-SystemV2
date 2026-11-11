---
title: "QC_Notify_New_Record"
source_file: "QC_Notify_New_Record"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 12
tags:
  - deluge
  - fulfillment
  - notification
  - qc
  - zoho-creator
---

# QC_Notify_New_Record

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `QC_Notify_New_Record`
> - **Lines of Code:** 12
> - **Tags:** `#deluge`, `#fulfillment`, `#notification`, `#qc`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
insert into QC_Notifications
[
	Recipient_Email="homecartelff@gmail.com"
	Notification_Type="QC Record Created"
	Message="New QC record for review — " + input.SO + " (" + input.Item_Name + "). Click to open it."
	Created_On=zoho.currenttime
	Read=false
	Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:Quality_Check?qcRecordId=" + input.ID
	Source_Record_No=input.SO
	Source_Record_ID=input.ID
	Added_User=zoho.loginuser
]

````
