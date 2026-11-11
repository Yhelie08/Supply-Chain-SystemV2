---
title: "form Pick1"
source_file: "Pick\form Pick1.txt"
category: "Fulfillment/Pick/IDE"
associated_widget: "[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]"
lines: 210
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

# form Pick1

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]
> - **Category:** `Fulfillment/Pick/IDE`
> - **Source File:** `Pick\form Pick1.txt`
> - **Lines of Code:** 210
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-request`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Pick1
{
	displayname = "Pick"
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
	Picker
	(
    	type = text
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
	Package_Order
	(
    	type = text
		displayname = "PAC #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	For_Crate
	(
    	type = checkbox
		displayname = "For Crate"
		initial value = false
	 	row = 1
	 	column = 1   
		width = medium
	)
	PR_if_any
	(
    	type = text
		displayname = "PR #"
	 	row = 1
	 	column = 2   
		width = medium
	)
	RR
	(
    	type = text
		displayname = "RR #"
	 	row = 1
	 	column = 2   
		width = medium
	)
	Demo
	(
    	type = text
		displayname = "Demo #"
	 	row = 1
	 	column = 2   
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
	Order_Type
	(
    	type = text
		displayname = "Order Type"
	 	row = 1
	 	column = 3   
		width = medium
	)
	Target_Delivery_Date
	(
    	type = date
		displayname = "Target Delivery Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 3   
		width = medium
	)
	Item_Details
	(
		type = section
		displayname = "Item Details"
		visibility = true
	 	row = 2
	 	column = 0   
		width = medium
	)
	Item_Name
	(
    	type = text
		displayname = "Item Name"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Bin_Location
	(
    	type = text
		displayname = "Bin Location"
	 	row = 2
	 	column = 1   
		width = medium
	)
	SKU
	(
    	type = text
	 	row = 2
	 	column = 2   
		width = medium
	)
	Quantity_to_Pick
	(
    	type = text
		displayname = "Quantity to Pick"
	 	row = 2
	 	column = 2   
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
	Section
	(
		type = section
		visibility = true
	 	row = 4
	 	column = 0   
		width = medium
	)
	Marked
	(
    	type = checkbox
		displayname = "Mark Picked"
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
