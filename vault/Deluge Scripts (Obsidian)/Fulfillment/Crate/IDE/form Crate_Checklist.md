---
title: "form Crate_Checklist"
source_file: "Crate\form Crate_Checklist.txt"
category: "Fulfillment/Crate/IDE"
associated_widget: "[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]"
lines: 262
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
---

# form Crate_Checklist

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]
> - **Category:** `Fulfillment/Crate/IDE`
> - **Source File:** `Crate\form Crate_Checklist.txt`
> - **Lines of Code:** 262
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-request`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Crate_Checklist
{
	displayname = "Crate Checklist"
	success message = "Crate Added Successfully"
	Section
	(
		type = section
	 	row = 1
	 	column = 0   
		width = medium
	)
	Assign_Crater
	(
		type = picklist
		displayname = "Assign Crater"
		maxchar = 100
		values = {"Lito"}
		sortorder = ascending
		others option = true
	 	row = 1
	 	column = 1   
		width = medium
	)
	Assigned_Checker
	(
    	type = text
		displayname = "Assigned Checker"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Sales_Order_Details
	(
		type = section
		displayname = "Sales Order Details"
		visibility = true
	 	row = 2
	 	column = 0   
		width = medium
	)
	SO
	(
    	type = text
		displayname = "SO #"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Package_Order
	(
    	type = text
		displayname = "PACK #"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Target_Delivery_Date
	(
    	type = date
		displayname = "Target Delivery Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 2
	 	column = 1   
		width = medium
	)
	PR_if_any
	(
    	type = text
		displayname = "PR # (if any)"
	 	row = 2
	 	column = 2   
		width = medium
	)
	Dem_if_any
	(
    	type = text
		displayname = "Dem # (if any)"
	 	row = 2
	 	column = 2   
		width = medium
	)
	Order_Type
	(
    	type = text
		displayname = "Order Type"
	 	row = 2
	 	column = 2   
		width = medium
	)
	RR_if_any
	(
    	type = text
		displayname = "RR # (if any)"
	 	row = 2
	 	column = 3   
		width = medium
	)
	Delivery_Type
	(
    	type = text
		displayname = "Delivery Type"
	 	row = 2
	 	column = 3   
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
	Quantity
	(
    	type = text
	 	row = 4
	 	column = 1   
		width = medium
	)
	Crating_Checklist1
	(
		type = section
		displayname = "Crating Checklist"
		visibility = true
	 	row = 5
	 	column = 0   
		width = medium
	)
	Crating_Checklist
	(
		type = list	
		displayname = "Crating Checklist"
		values = {"Maayos at matibay ang pagkaka-crate","Walang sira o bitak sa kahon o crate","Lahat ng bahagi ng item ay ligtas at nakapaloob (walang gumagalaw sa loob)","May foam o proteksyon sa mga gilid at sulok","May tamang label ng item sa crate","Naselyuhan o nailagay ng maayos ang takip ng crate","May larawan bago i-seal ang crate (for record)","Na-check ng checker bago ipadala"}
		height = 60px
	 	row = 5
	 	column = 1   
		width = medium
	)
	Documentation
	(
		type = section
		visibility = true
	 	row = 6
	 	column = 0   
		width = medium
	)
	Photo_Documentation
	(
    	type = image
		displayname = "Photo Documentation"
		source  = file
    	file count = 10
		camera = primary
		show gallery = true
		switch camera = true
	 	row = 6
	 	column = 1   
		width = medium
	)
	Video_Documentation
	(
    	type = video
		displayname = "Video Documentation"
    	duration=210
	 	row = 6
	 	column = 1   
		width = medium
	)
	Crating_Status
	(
		type = section
		displayname = "Crating Status"
	 	row = 7
	 	column = 0   
		width = medium
	)
	Crating_Status1
	(
		type = radiobuttons
		displayname = "Crating Status"
		maxchar = 100
		values = {"Pending","Done"}
	 	row = 7
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
