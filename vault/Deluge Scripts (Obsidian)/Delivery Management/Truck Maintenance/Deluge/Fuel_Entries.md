---
title: "Fuel_Entries"
source_file: "Fuel_Entries"
category: "Delivery Management/Truck Maintenance/Deluge"
associated_widget: "[[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]"
lines: 212
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
---

# Fuel_Entries

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]
> - **Category:** `Delivery Management/Truck Maintenance/Deluge`
> - **Source File:** `Fuel_Entries`
> - **Lines of Code:** 212
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
//Form

form Fuel_Entries
{
	displayname = "Fuel Entries"
	success message = "Fuel Entry Added Successfully"
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
	Date_field
	(
    	type = date
		displayname = "Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 1   
		width = medium
	)
	Gas_Bar
	(
		type = number
		displayname = "Gas Bar"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Odometer
	(
		type = number
	 	row = 1
	 	column = 1   
		width = medium
	)
	Price_Unit
	(
		type = number
		displayname = "Price/Unit"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Vendor
	(
    	type = text
	 	row = 1
	 	column = 1   
		width = medium
	)
	Invoice_No
	(
    	type = text
		displayname = "Invoice No#"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Invoice_Receipt
	(
    	type = upload file
		displayname = "Invoice Receipt"
    	file count = 10
				browse = local_drive
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

list All_Fuel_Entries
{
	displayName = "All Fuel Entries"
	show all rows from Fuel_Entries    
	(
		Vehicle
		Date_field as "Date"
		Gas_Bar as "Gas Bar"
		Odometer
		Price_Unit as "Price/Unit"
		Vendor
		Invoice_No as "Invoice No#"
		Invoice_Receipt as "Invoice Receipt"
		Remarks
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
					Date_field as "Date"
					Gas_Bar as "Gas Bar"
					Odometer
					Price_Unit as "Price/Unit"
					Vendor
					Invoice_No as "Invoice No#"
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
					Date_field as "Date"
					Gas_Bar as "Gas Bar"
					Odometer
					Price_Unit as "Price/Unit"
					Vendor
					Invoice_No as "Invoice No#"
					Invoice_Receipt as "Invoice Receipt"
					Remarks
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
