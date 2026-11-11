---
title: "form Sales_Order_Readiness_Gate"
source_file: "Sales Order Readiness Gate\form Sales_Order_Readiness_Gate.txt"
category: "Fulfillment/Order Readiness/IDE"
associated_widget: "[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]"
lines: 267
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
---

# form Sales_Order_Readiness_Gate

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]
> - **Category:** `Fulfillment/Order Readiness/IDE`
> - **Source File:** `Sales Order Readiness Gate\form Sales_Order_Readiness_Gate.txt`
> - **Lines of Code:** 267
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Sales_Order_Readiness_Gate
{
	displayname = "Sales Order Readiness Gate"
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
	sales_order_number
	(
    	type = text
		displayname = "Sales Order Number"
	 	row = 1
	 	column = 1   
		width = medium
	)
	PR
	(
    	type = text
		displayname = "PR #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	RR
	(
    	type = text
		displayname = "RR #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Demo
	(
    	type = text
		displayname = "Demo #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Order_Type
	(
    	type = text
		displayname = "Order Type"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Package_Order
	(
    	type = text
		displayname = "Package Order Number"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Delivery_Type
	(
    	type = text
		displayname = "Delivery Type"
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
	payment_status
	(
		type = picklist
		displayname = "Payment Status"
		maxchar = 100
		values = {"Paid","Partially Paid","Pending"}
	 	row = 1
	 	column = 1   
		width = medium
	)
	Target_Delivery_Date
	(
    	type = date
		displayname = "Target Delivery Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 1   
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
	customer_name
	(
    	type = text
		displayname = "Customer Name"
	 	row = 2
	 	column = 1   
		width = medium
	)
	customer_type
	(
		type = picklist
		displayname = "Customer Type"
		maxchar = 100
		values = {"Corporate","End User","VIP","Dealer","Design Partner"}
	 	row = 2
	 	column = 1   
		width = medium
	)
	customer_address
	(
    	type = textarea
		displayname = "Customer Address"
		height = 13px
	 	row = 2
	 	column = 1   
		width = medium
	)
	Section
	(
		type = section
	 	row = 3
	 	column = 0   
		width = medium
	)
	priority
	(
		type = picklist
		displayname = "Priority"
		maxchar = 100
		values = {"Air","Complaint","Normal"}
	 	row = 3
	 	column = 1   
		width = medium
	)
	pr_number
	(
    	type = text
		displayname = "PR Number"
	 	row = 3
	 	column = 1   
		width = medium
	)
	rr_number
	(
    	type = text
		displayname = "RR Number"
	 	row = 3
	 	column = 1   
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
	Quantity
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
	Section1
	(
		type = section
		displayname = "Section"
		visibility = true
	 	row = 5
	 	column = 0   
		width = medium
	)
	Assign_Picker
	(
		type = picklist
		displayname = "Assign Picker"
		maxchar = 100
		values = {"Hendel","Jayvon","Jazz","Edwin"}
		others option = true
	 	row = 5
	 	column = 1   
		width = medium
	)
	Release
	(
    	type = checkbox
		initial value = false
	 	row = 5
	 	column = 1   
		width = medium
	)
	Release_Log
	(
    	type = text
		displayname = "Release Log"
	 	row = 5
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
