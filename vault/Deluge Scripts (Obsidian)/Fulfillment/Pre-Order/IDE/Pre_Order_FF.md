---
title: "Pre_Order_FF"
source_file: "Pre Order\Pre_Order_FF.txt"
category: "Fulfillment/Pre-Order/IDE"
associated_widget: "[[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]"
lines: 254
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-request
---

# Pre_Order_FF

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]
> - **Category:** `Fulfillment/Pre-Order/IDE`
> - **Source File:** `Pre Order\Pre_Order_FF.txt`
> - **Lines of Code:** 254
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-request`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Pre_Order_FF
{
	displayname = "Pre Order FF"
	success message = "Data Added Successfully!"
	Sales_Order_Details
	(
		type = section
		displayname = "Sales Order Details"
		visibility = true
	 	row = 1
	 	column = 0   
		width = medium
	)
	Pre_Order_Status
	(
		type = picklist
		displayname = "Pre-Order Status"
		maxchar = 100
		values = {"Pending","Received"}
		initial value = "Pending"
	 	row = 1
	 	column = 1   
		width = medium
	)
	SO
	(
    	type = text
		displayname = "SO #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Package_Number
	(
    	type = text
		displayname = "Package Number #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Target_Delivery
	(
    	type = date
		displayname = "Target Delivery"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 1   
		width = medium
	)
	Status
	(
		type = picklist
		maxchar = 100
		values = {"Yes","No","Partially"}
	 	row = 1
	 	column = 1   
		width = medium
	)
	SO_Creation_Date
	(
    	type = date
		displayname = "SO Creation Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 2   
		width = medium
	)
	Select_To_Package
	(
    	type = checkbox
		displayname = "Select to Package"
		initial value = false
	 	row = 1
	 	column = 1   
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
	For_Crate
	(
    	type = checkbox
		displayname = "For Crate"
		initial value = false
	 	row = 1
	 	column = 2   
		width = medium
	)
	PR
	(
    	type = text
		displayname = "PR #"
	 	row = 1
	 	column = 3   
		width = medium
	)
	Delivery_Type
	(
    	type = text
		displayname = "Delivery Type"
	 	row = 1
	 	column = 3   
		width = medium
	)
	PR_Date_Received
	(
    	type = datetime
		displayname = "PR Date Received"
		timedisplayoptions = "hh:mm:ss"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 3   
		width = medium
	)
	Replacement_Request
	(
		type = grid
		displayname = "Replacement Request"
		Single_Line1
		(
    		type = text
			displayname = "#"
			width = medium
		)
		RR
		(
    		type = text
			displayname = "RR #"
			width = medium
		)
		Date_Received
		(
    		type = datetime
			displayname = "Date Received"
			timedisplayoptions = "hh:mm:ss"
			alloweddays = 0,1,2,3,4,5,6
			width = medium
		)
	 	row = 2
	 	column = 1   
		width = medium
	)
	Customer_Details
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
		displayname = "Customer Name"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Customer_Address
	(
    	type = text
		displayname = "Customer Address"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Customer_Type
	(
    	type = text
		displayname = "Customer Type"
	 	row = 3
	 	column = 2   
		width = medium
	)
	Item_Details
	(
		type = section
		displayname = "Item Details"
		visibility = true
	 	row = 4
	 	column = 0   
		width = medium
	)
	Item_Name
	(
    	type = text
		displayname = "Item Name"
	 	row = 4
	 	column = 1   
		width = medium
	)
	SKU
	(
    	type = text
	 	row = 4
	 	column = 1   
		width = medium
	)
	Qty
	(
    	type = text
	 	row = 4
	 	column = 1   
		width = medium
	)
	Bin_Location
	(
    	type = text
		displayname = "Bin Location"
	 	row = 4
	 	column = 1
		width = medium
	)
	Packaged_Out
	(
    	type = checkbox
		displayname = "Packaged Out"
		initial value = false
	 	row = 4
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

````
