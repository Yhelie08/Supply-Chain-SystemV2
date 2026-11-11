---
title: "form Exception_Control1"
source_file: "Exception\form Exception_Control1.txt"
category: "Procurement/Exceptions/IDE"
associated_widget: "[[Fulfillment/Exception Control/Widget/Exception Control Widget|Exception Control Widget]]"
lines: 379
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
  - qc
  - supplier-portal
---

# form Exception_Control1

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Exception Control/Widget/Exception Control Widget|Exception Control Widget]]
> - **Category:** `Procurement/Exceptions/IDE`
> - **Source File:** `Exception\form Exception_Control1.txt`
> - **Lines of Code:** 379
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`, `#qc`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Exception Control/Widget/Exception Control Widget|Exception Control Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Exception_Control1
{
	displayname = "Exception Control"
	success message = "Data Added Successfully!"
	o
	(
		type = section
		displayname = "Sales Order Details"
		visibility = true
	 	row = 1
	 	column = 0   
		width = medium
	)
	Exception_Number
	(
    	type = text
		displayname = "Exception Number"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Sales_Order
	(
    	type = text
		displayname = "SO #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	RR_No
	(
    	type = text
		displayname = "RR #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Source_Module
	(
    	type = text
		displayname = "Source Module"
	 	row = 1
	 	column = 1   
		width = medium
	)
	PR
	(
    	type = text
		displayname = "PR #"
	 	row = 1
	 	column = 2   
		width = medium
	)
	Demo1
	(
    	type = text
		displayname = "Demo #"
	 	row = 1
	 	column = 2   
		width = medium
	)
	Order_Type
	(
    	type = text
		displayname = "Order Type"
	 	row = 1
	 	column = 2   
		width = medium
	)
	Signature
	(
    	type = signature
	 	row = 1
	 	column = 2   
		width = medium
		personal data = true
	)
	PAC
	(
    	type = text
		displayname = "PAC #"
	 	row = 1
	 	column = 3   
		width = medium
	)
	Rework_Status
	(
		type = picklist
		displayname = "REWORK STATUS"
		maxchar = 100
		values = {"Pending Assessment","In Rework","Completed","Unrepairable"}
	 	row = 1
	 	column = 3   
		width = medium
	)
	DELIVERY_TYPE
	(
    	type = text
		displayname = "DELIVERY TYPE"
	 	row = 1
	 	column = 3   
		width = medium
	)
	QC_Rejection
	(
		type = section
		displayname = "QC Rejection"
		visibility = true
	 	row = 2
	 	column = 0   
		width = medium
	)
	Checker
	(
    	type = text
		displayname = "Checked By"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Remarks
	(
    	type = text
	 	row = 2
	 	column = 1   
		width = medium
	)
	Customer
	(
		type = section
		displayname = "Customer Details"
		visibility = true
	 	row = 3
	 	column = 0   
		width = medium
	)
	Customer_Name
	(
    	type = text
		displayname = "CUSTOMER NAME"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Customer_Type
	(
    	type = text
		displayname = "CUSTOMER TYPE"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Customer_Address
	(
    	type = text
		displayname = "ADDRESS"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Item_to_Replace2
	(
		type = section
		displayname = "Item to Replace"
		visibility = true
	 	row = 4
	 	column = 0   
		width = medium
	)
	Item_to_Replace3
	(
		type = picklist
		displayname = "Item to Replace"
		maxchar = 100
		values = {"Whole Fixture","Spare Parts"}
	 	row = 4
	 	column = 1   
		width = medium
	)
	Quantity
	(
    	type = text
		displayname = "Quantity of Damage Items"
	 	row = 4
	 	column = 1   
		width = medium
	)
	Item_to_Replace
	(
		type = section
		displayname = "Spare part type"
		visibility = true
	 	row = 5
	 	column = 0   
		width = medium
	)
	Item_to_Replace1
	(
		type = list	
		displayname = "Item to Replace"
		values = {"Shade","Base","Glass"}
		height = 60px
	 	row = 5
	 	column = 1   
		width = medium
	)
	Quantity_of_damage_spare_s
	(
    	type = text
		displayname = "Quantity of damage spare/s"
	 	row = 5
	 	column = 1   
		width = medium
	)
	Item_Details_Section
	(
		type = section
		displayname = "Item Details"
		visibility = true
	 	row = 6
	 	column = 0   
		width = medium
	)
	Supplier
	(
    	type = text
	 	row = 6
	 	column = 1   
		width = medium
	)
	Rework
	(
		type = picklist
		maxchar = 100
		values = {"Select","OK","Repair","Rewire","Repaint"}
	 	row = 6
	 	column = 1   
		width = medium
	)
	Status
	(
		type = picklist
		maxchar = 100
		values = {"Pending","OK","In Rework","Completed","Unrepairable"}
	 	row = 6
	 	column = 1   
		width = medium
	)
	Item_Name
	(
    	type = text
		displayname = "Item Name"
	 	row = 6
	 	column = 1   
		width = medium
	)
	SKU
	(
    	type = text
	 	row = 6
	 	column = 1   
		width = medium
	)
	Qty
	(
		type = number
	 	row = 6
	 	column = 1   
		width = medium
	)
	Affected_Qty
	(
		type = number
		displayname = "Affected Qty"
	 	row = 6
	 	column = 1   
		width = medium
	)
	Documentation
	(
		type = section
		visibility = true
	 	row = 7
	 	column = 0   
		width = medium
	)
	Image_max_10_JPG_JPEG_PNG
	(
    	type = upload file
		displayname = "Image"
    	file count = 10
				browse = local_drive
	 	row = 7
	 	column = 1   
		width = medium
	)
	Video_Upload_max_3_min_30_sec
	(
    	type = upload file
		displayname = "Video"
    	file count = 10
				browse = local_drive
	 	row = 7
	 	column = 1   
		width = medium
	)
	Rework_Status1
	(
		type = section
		displayname = "Rework Status"
		visibility = true
	 	row = 8
	 	column = 0   
		width = medium
	)
	Rework_Type
	(
		type = picklist
		displayname = "REWORK TYPE"
		maxchar = 100
		values = {"Repair","Repaint","Rewire"}
	 	row = 8
	 	column = 1   
		width = medium
	)
	Modified_By
	(
		type = picklist
		displayname = "Modified By"
		maxchar = 100
		values = {"Choice 1","Choice 2","Choice 3"}
	 	row = 8
	 	column = 1   
		width = medium
	)
	Modified_Time2
	(
    	type = time
		displayname = "MODIFIED TIME"
		timedisplayoptions = "hh:mm:ss" 
	 	row = 8
	 	column = 2   
		width = medium
	)
	Added_Time2
	(
    	type = time
		displayname = "ADDED TIME"
		timedisplayoptions = "hh:mm:ss" 
	 	row = 8
	 	column = 2   
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

````
