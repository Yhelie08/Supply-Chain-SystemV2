---
title: "Service_Entries"
source_file: "Service_Entries"
category: "Delivery Management/Truck Maintenance/Deluge"
associated_widget: "[[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]"
lines: 228
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
  - procurement
  - purchase-order
---

# Service_Entries

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]
> - **Category:** `Delivery Management/Truck Maintenance/Deluge`
> - **Source File:** `Service_Entries`
> - **Lines of Code:** 228
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
//Form

form Service_Entries
{
	displayname = "Service Entries"
	success message = "Service Entry Added Successfully"
	Section
	(
		type = section
	 	row = 1
	 	column = 0   
		width = medium
	)
	Vehicle
	(
		type = picklist
		maxchar = 100
		values = {"Innova","NBX-1446 - Hino","NIB-3823 - Travis","NKI-4696 - Travis","Rav4"}
		others option = true
	 	row = 1
	 	column = 1   
		width = medium
	)
	Service
	(
		type = checkboxes	
		values = {"Car Lights Repair","Change Oil","Charging Port","Fixing Break","Fixing Engine","Inflating Tire","Oil Filter","Repaint","Transmission Repair"}
	 	row = 1
	 	column = 1   
		width = medium
	)
	Remarks
	(
    	type = textarea
		height = 100px
	 	row = 1
	 	column = 1   
		width = medium
	)
	Invoice_Details
	(
		type = section
		displayname = "Invoice Details"
		visibility = true
	 	row = 2
	 	column = 0   
		width = medium
	)
	Labor
	(
		type = number
	 	row = 2
	 	column = 1   
		width = medium
	)
	Parts
	(
		type = number
	 	row = 2
	 	column = 1   
		width = medium
	)
	Tax
	(
    	type = text
	 	row = 2
	 	column = 1   
		width = medium
	)
	must have Total
	(
		type = number
	 	row = 2
	 	column = 1   
		width = medium
	)
	Invoice_Number
	(
    	type = text
		displayname = "Invoice Number"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Invoice_Receipt
	(
    	type = upload file
		displayname = "Invoice Receipt"
    	file count = 10
				browse = local_drive
	 	row = 2
	 	column = 1   
		width = medium
	)
	Submitted_by
	(
    	type = text
		displayname = "Submitted by"
	 	row = 2
	 	column = 1   
		width = medium
	)
	
	actions
	{
		on add
		{
			submit
			(
   				type = submit
   				displayname = "Submit"
			)
		}
		on edit
		{
			update
			(
   				type = submit
   				displayname = "Update"
			)
			cancel
			(
   				type = cancel
   				displayname = "Cancel"
			)
		}
	}
}


//Reprot

list All_Service_Entries
{
	displayName = "All Service Entries"
	show all rows from Service_Entries    
	(
		Vehicle
		Service
		Remarks
		Labor
		Parts
		Tax
		Total
		Invoice_Number as "Invoice Number"
		Invoice_Receipt as "Invoice Receipt"
		Submitted_by as "Submitted by"
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					Vehicle
					Service
					Remarks
					Labor
					Parts
					Tax
					Total
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
					Vehicle
					Service
					Remarks
					Labor
					Parts
					Tax
					Total
					Invoice_Number as "Invoice Number"
					Invoice_Receipt as "Invoice Receipt"
					Submitted_by as "Submitted by"
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
