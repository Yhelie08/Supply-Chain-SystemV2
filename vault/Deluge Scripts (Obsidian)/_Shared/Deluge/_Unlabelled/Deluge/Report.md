---
title: "Report"
source_file: "Report"
category: "_Shared/Deluge/_Unlabelled/Deluge"
associated_widget: "[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]"
lines: 104
tags:
  - deluge
  - fulfillment
  - pick
  - procurement
  - purchase-order
---

# Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]
> - **Category:** `_Shared/Deluge/_Unlabelled/Deluge`
> - **Source File:** `Report`
> - **Lines of Code:** 104
> - **Tags:** `#deluge`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list All_Warehouse_Requests
{
	displayName = "All Warehouse Requests"
	show all rows from Warehouse_Request    
	(
		Type_of_Request as "Type of Request"
		Request as "Request Description"
		Date_Requested as "Date Requested"
		Request_By as "Request By:"
		Upload_Image as "Upload Image"
		Item.Items
		Picker
		Request_Status as "Request Status:"
		Remarks
		Actual_Photo_Upload as "Actual Photo Upload"
		Actual_Video_Upload as "Actual Video Upload"
		Added_Time as "Added Time"
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					Type_of_Request as "Type of Request"
					Request as "Request Description"
					Date_Requested as "Date Requested"
					Request_By as "Request By:"
					Upload_Image as "Upload Image"
					Item.Items as "Items"
					Picker
					Remarks
					Actual_Photo_Upload as "Actual Photo Upload"
					Actual_Video_Upload as "Actual Video Upload"
					Request_Status as "Request Status:"
					Added_Time as "Added Time"
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
					Type_of_Request as "Type of Request"
					Request as "Request Description"
					Date_Requested as "Date Requested"
					Request_By as "Request By:"
					Upload_Image as "Upload Image"
					Item.Items as "Items"
					Picker
					Request_Status as "Request Status:"
					Remarks
					Actual_Photo_Upload as "Actual Photo Upload"
					Actual_Video_Upload as "Actual Video Upload"
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
