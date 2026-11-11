---
title: "list Tony_Notifications_Report"
source_file: "Deluge Script/Notification\list Tony_Notifications_Report.txt"
category: "Procurement/Supplier - Tony Fan/Deluge"
associated_widget: "[[Procurement/Supplier - Tony Fan/Widget/Supplier Portal - Tony Fan|Supplier Portal - Tony Fan]]"
lines: 94
tags:
  - deluge
  - notification
  - procurement
  - purchase-order
---

# list Tony_Notifications_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Supplier - Tony Fan/Widget/Supplier Portal - Tony Fan|Supplier Portal - Tony Fan]]
> - **Category:** `Procurement/Supplier - Tony Fan/Deluge`
> - **Source File:** `Deluge Script/Notification\list Tony_Notifications_Report.txt`
> - **Lines of Code:** 94
> - **Tags:** `#deluge`, `#notification`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Supplier - Tony Fan/Widget/Supplier Portal - Tony Fan|Supplier Portal - Tony Fan]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Tony_Notifications_Report
{
	displayName = "Tony_Notifications Report"
	show all rows from Tony_Notifications
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
