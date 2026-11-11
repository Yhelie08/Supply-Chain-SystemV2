---
title: "list Fenteng_Notifications_Report"
source_file: "Deluge Script/Notification\list Fenteng_Notifications_Report.txt"
category: "Procurement/Supplier - Fenteng/Deluge"
associated_widget: "[[Procurement/Supplier - Fenteng/Widget/Supplier Portal - Fenteng|Supplier Portal - Fenteng]]"
lines: 94
tags:
  - deluge
  - notification
  - procurement
  - purchase-order
---

# list Fenteng_Notifications_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Supplier - Fenteng/Widget/Supplier Portal - Fenteng|Supplier Portal - Fenteng]]
> - **Category:** `Procurement/Supplier - Fenteng/Deluge`
> - **Source File:** `Deluge Script/Notification\list Fenteng_Notifications_Report.txt`
> - **Lines of Code:** 94
> - **Tags:** `#deluge`, `#notification`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Supplier - Fenteng/Widget/Supplier Portal - Fenteng|Supplier Portal - Fenteng]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Fenteng_Notifications_Report
{
	displayName = "Fenteng_Notifications Report"
	show all rows from Fenteng_Notifications
	(
		Recipient_Email
		Notification_Type
		Message
		Created_On
		Read
		Target_URL
		Source_Record_No
		Source_Record_ID
		Deep_Link_Token
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					Recipient_Email
					Notification_Type
					Message
					Created_On
					Read
					Target_URL
					Source_Record_No
				)
			)
		)
			menu
			(
				header
				(
					Edit
					Duplicate
					Delete
				)
			record
			(
				Edit
				Duplicate
				Delete
    		)
			)
    	action
    	(
			on click
			(
				View Record
    		)
			on right click
			(
				Edit
				Delete
				Duplicate
				View Record
    		)
     	)
	)
	detailview
	(
		layout
		(
			datablock1
			(
				fields
				(
					Recipient_Email
					Notification_Type
					Message
					Created_On
					Read
					Target_URL
					Source_Record_No
					Source_Record_ID
					Deep_Link_Token
				)
			)
		)
			menu
			(
				header
				(
					Edit
					Duplicate
					Delete
				)
			)
	)
}

````
