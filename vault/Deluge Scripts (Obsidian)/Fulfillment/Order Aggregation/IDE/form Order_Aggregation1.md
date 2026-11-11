---
title: "form Order_Aggregation1"
source_file: "Order Aggregation\form Order_Aggregation1.txt"
category: "Fulfillment/Order Aggregation/IDE"
associated_widget: "[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]"
lines: 204
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - order-aggregation
---

# form Order_Aggregation1

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]
> - **Category:** `Fulfillment/Order Aggregation/IDE`
> - **Source File:** `Order Aggregation\form Order_Aggregation1.txt`
> - **Lines of Code:** 204
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Order_Aggregation1
{
	displayname = "Order Aggregation"
	success message = "Data Added Successfully!"
	Section
	(
		type = section
	 	row = 1
	 	column = 0   
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
	PAC
	(
    	type = text
		displayname = "PAC #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	ORDER_TYPE
	(
    	type = text
		displayname = "ORDER TYPE"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Target_Date
	(
    	type = date
		displayname = "Target Delivery Date"
		alloweddays = 0,1,2,3,4,5,6
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
	DEMO
	(
    	type = text
		displayname = "DEMO #"
	 	row = 1
	 	column = 2   
		width = medium
	)
	DELIVERY_TYPE
	(
    	type = text
		displayname = "DELIVERY TYPE"
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
	Customer_Details
	(
		type = section
		displayname = "Customer Details"
		visibility = true
	 	row = 2
	 	column = 0   
		width = medium
	)
	Customer_Name
	(
    	type = text
		displayname = "Customer Name"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Customer_Address
	(
    	type = text
		displayname = "Customer Address"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Customer_Type
	(
    	type = text
		displayname = "Customer Type"
	 	row = 2
	 	column = 2   
		width = medium
	)
	Item_Details
	(
		type = grid
		displayname = "Item Details"
		Item_Name
		(
    		type = text
			displayname = "Item Name"
			width = medium
		)
		SKU
		(
    		type = text
			width = medium
		)
		QTY
		(
			type = number
			width = medium
		)
		Bin_Location
		(
    		type = text
			displayname = "Bin Location"
			width = medium
		)
		Select1
		(
    		type = checkbox
			displayname = "Select"
			initial value = false
			width = medium
		)
		Dispatched
		(
    		type = checkbox
			initial value = false
			width = medium
		)
	 	row = 3
	 	column = 1   
		width = medium
	)
	Section1
	(
		type = section
		displayname = "Section"
	 	row = 4
	 	column = 0   
		width = medium
	)
	Dispatch_Selected
	(
    	type = checkbox
		displayname = "Dispatch Selected"
		initial value = false
	 	row = 4
	 	column = 1   
		width = medium
	)
	Archived
	(
    	type = checkbox
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
