---
title: "list All_Crates"
source_file: "Crate\list All_Crates.txt"
category: "Fulfillment/Crate/IDE"
associated_widget: "[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]"
lines: 125
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - procurement
  - purchase-request
  - qc
---

# list All_Crates

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]
> - **Category:** `Fulfillment/Crate/IDE`
> - **Source File:** `Crate\list All_Crates.txt`
> - **Lines of Code:** 125
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-request`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list All_Crates
{
	displayName = "All Crates"
	show all rows from Crate_Checklist    
	(
		Assign_Crater as "Assign Crater"
		Package_Order as "PACK #"
		PR_if_any as "PR # (if any)"
		RR_if_any as "RR # (if any)"
		Order_Type as "Order Type"
		Delivery_Type as "Delivery Type"
		Customer_Name as "Customer Name"
		Customer_Type as "Customer Type"
		Customer_Address as "Customer Address"
		Item_Name as "Item Name"
		SKU
		Quantity
		Crating_Checklist as "Crating Checklist"
		Photo_Documentation as "Photo Documentation"
		Video_Documentation as "Video Documentation"
		Crating_Status1 as "Crating Status"
		Assigned_Checker as "Assigned Checker"
		SO as "SO #"
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
					Assign_Crater as "Assign Crater"
					Package_Order as "PACK #"
					PR_if_any as "PR # (if any)"
					RR_if_any as "RR # (if any)"
					Order_Type as "Order Type"
					Assigned_Checker as "Assigned Checker"
					SO as "SO #"
					Delivery_Type as "Delivery Type"
					Customer_Name as "Customer Name"
					Customer_Address as "Customer Address"
					Customer_Type as "Customer Type"
					Item_Name as "Item Name"
					SKU
					Quantity
					Crating_Checklist as "Crating Checklist"
					Photo_Documentation as "Photo Documentation"
					Video_Documentation as "Video Documentation"
					Crating_Status1 as "Crating Status"
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
					Assign_Crater as "Assign Crater"
					Package_Order as "PACK #"
					PR_if_any as "PR # (if any)"
					RR_if_any as "RR # (if any)"
					Order_Type as "Order Type"
					Delivery_Type as "Delivery Type"
					Customer_Name as "Customer Name"
					Customer_Type as "Customer Type"
					Customer_Address as "Customer Address"
					Item_Name as "Item Name"
					SKU
					Quantity
					Crating_Checklist as "Crating Checklist"
					Photo_Documentation as "Photo Documentation"
					Video_Documentation as "Video Documentation"
					Crating_Status1 as "Crating Status"
					Assigned_Checker as "Assigned Checker"
					SO as "SO #"
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
