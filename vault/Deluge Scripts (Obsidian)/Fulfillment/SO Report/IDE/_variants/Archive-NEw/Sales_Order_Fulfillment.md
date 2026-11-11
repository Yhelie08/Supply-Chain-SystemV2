---
title: "Sales_Order_Fulfillment"
source_file: "Deluge Script/Application IDE\Sales Order Fulfillment\Sales_Order_Fulfillment.txt"
category: "Fulfillment/SO Report/IDE/_variants/Archive-NEw"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 243
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
  - qc
  - readiness-gate
---

# Sales_Order_Fulfillment

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `Fulfillment/SO Report/IDE/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/Application IDE\Sales Order Fulfillment\Sales_Order_Fulfillment.txt`
> - **Lines of Code:** 243
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-request`, `#qc`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Sales_Order_Fulfillment
{
	displayname = "Sales Order Fulfillment"
	success message = "Data Added Successfully!"
	Sales_Order_Details
	(
		type = section
		displayname = "SO & Package Details"
		visibility = true
	 	row = 1
	 	column = 0   
		width = medium
	)
	Fulfillment_Stage
	(
		type = picklist
		displayname = "Fulfillment Stage"
		maxchar = 100
		values = {"Waiting For Package","Order Readiness","Picking","Pack","Quality Checking","To Ship","For Delivery"}
	 	row = 1
	 	column = 1   
		width = medium
	)
	SO_Status
	(
		type = picklist
		displayname = "SO Status"
		maxchar = 100
		values = {"Preparing","For Delivery"}
		initial value = "Preparing"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Package
	(
    	type = text
		displayname = "Package#"
	 	row = 1
	 	column = 1   
		width = medium
	)
	order_type
	(
		type = picklist
		displayname = "Order Type"
		maxchar = 100
		values = {"Normal","Replacement","Pre Order","(Partly) Pre Order","Furniture Republic Stores","Change Item"}
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
	Status
	(
		type = picklist
		maxchar = 100
		values = {"Yes","No","Partial"}
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
	SO_No
	(
    	type = text
		displayname = "SO No."
	 	row = 1
	 	column = 2   
		width = medium
	)
	SO_Created_Date
	(
    	type = date
		displayname = "SO Created Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 2   
		width = medium
	)
	Package_Date
	(
    	type = date
		displayname = "Package Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 2   
		width = medium
	)
	Shipment_Mode
	(
    	type = text
		displayname = "Shipment Mode"
	 	row = 1
	 	column = 2   
		width = medium
	)
	PR_No
	(
    	type = text
		displayname = "PR No."
	 	row = 1
	 	column = 2   
		width = medium
	)
	RR_No
	(
    	type = text
		displayname = "RR No."
	 	row = 1
	 	column = 2   
		width = medium
	)
	target_delivery_date
	(
    	type = date
		displayname = "Target Delivery Date"
		alloweddays = 0,1,2,3,4,5,6
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
	Customer
	(
		type = picklist	
		values  = Customer.ID
    	displayformat = [customer_name]
		sortorder = ascending
	 	row = 2
	 	column = 1   
		width = medium
	)
	Customer_Type
	(
    	type = text
		displayname = "Customer Type"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Contact_No
	(
    	type = text
		displayname = "Contact No"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Billing_Address
	(
    	type = text
		displayname = "Billing Address"
	 	row = 2
	 	column = 2   
		width = medium
	)
	Shipping_Address
	(
    	type = text
		displayname = "Shipping Address"
	 	row = 2
	 	column = 2   
		width = medium
	)
	Item_Details1
	(
		type = grid
		displayname = "Item Details"
		Item
		(
    		type = text
			width = medium
		)
		SKU
		(
    		type = text
			width = medium
		)
		Quantity
		(
    		type = text
			width = medium
		)
		Bin_Location
		(
    		type = text
			displayname = "Bin Location"
			width = medium
		)
	 	row = 3
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
