---
title: "Pick1_Report"
source_file: "Pick\Pick1_Report.txt"
category: "Fulfillment/Pick/IDE"
associated_widget: "[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]"
lines: 121
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
---

# Pick1_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]
> - **Category:** `Fulfillment/Pick/IDE`
> - **Source File:** `Pick\Pick1_Report.txt`
> - **Lines of Code:** 121
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Pick1_Report
{
	displayName = "Pick Report"
	show all rows from Pick1    
	(
		Package_Order as "PAC #"
		PR_if_any as "PR #"
		RR as "RR #"
		Order_Type as "Order Type"
		Delivery_Type as "Delivery Type"
		SKU
		Bin_Location as "Bin Location"
		Quantity_to_Pick as "Quantity to Pick"
		Customer_Name as "Customer Name"
		Customer_Address as "Customer Address"
		Customer_Type as "Customer Type"
		Demo as "Demo #"
		Picker
		SO as "SO #"
		Marked as "Mark Picked"
		Item_Name as "Item Name"
		Added_Time as "Added Time"
		Target_Delivery_Date as "Target Delivery Date"
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					Package_Order as "PAC #"
					PR_if_any as "PR #"
					RR as "RR #"
					Order_Type as "Order Type"
					Delivery_Type as "Delivery Type"
					Marked as "Mark Picked"
					Picker
					SO as "SO #"
					Demo as "Demo #"
					Item_Name as "Item Name"
					Bin_Location as "Bin Location"
					SKU
					Quantity_to_Pick as "Quantity to Pick"
					Customer_Name as "Customer Name"
					Customer_Address as "Customer Address"
					Customer_Type as "Customer Type"
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
					Package_Order as "PAC #"
					PR_if_any as "PR #"
					RR as "RR #"
					Order_Type as "Order Type"
					Delivery_Type as "Delivery Type"
					SKU
					Bin_Location as "Bin Location"
					Quantity_to_Pick as "Quantity to Pick"
					Customer_Name as "Customer Name"
					Customer_Address as "Customer Address"
					Customer_Type as "Customer Type"
					Demo as "Demo #"
					Picker
					SO as "SO #"
					Marked as "Mark Picked"
					Item_Name as "Item Name"
					Target_Delivery_Date as "Target Delivery Date"
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
