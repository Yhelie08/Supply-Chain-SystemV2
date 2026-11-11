---
title: "Pre_Order1_Report"
source_file: "Pre Order\Pre_Order1_Report.txt"
category: "Fulfillment/Pre-Order/IDE"
associated_widget: "[[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]"
lines: 168
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - procurement
  - purchase-order
  - purchase-request
---

# Pre_Order1_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]
> - **Category:** `Fulfillment/Pre-Order/IDE`
> - **Source File:** `Pre Order\Pre_Order1_Report.txt`
> - **Lines of Code:** 168
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`, `#purchase-request`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Pre_Order1_Report
{
	displayName = "Pre Order Report"
	show all rows from Pre_Order_FF    
	(
		SO_Creation_Date as "SO Creation Date"
		PR as "PR #"
		(
			width = 101px
		)
		Package_Number as "Package Number #"
		(
			width = 165px
		)
		Order_Type as "Order Type"
		Delivery_Type as "Delivery Type"
		(
			width = 133px
		)
		Target_Delivery as "Target Delivery"
		(
			width = 133px
		)
		Pre_Order_Status as "Pre-Order Status"
		(
			width = 145px
		)
		PR_Date_Received as "PR Date Received"
		Replacement_Request.Single_Line1 as "Replacement Request"
		Customer_Name as "Customer Name"
		Customer_Address as "Customer Address"
		Customer_Type as "Customer Type"
		Item_Name as "Item Name"
		(
			width = 390px
		)
		SKU
		(
			width = 323px
		)
		Qty
		(
			width = 80px
		)
		Added_Time as "Added Time"
		(
			width = 175px
		)
		Status
		SO as "SO #"
		Bin_Location as "Bin Location"
		For_Crate as "For Crate"
		custom action "Create Package"
		(
	  			workflow = Create_Package_FF
				show action in edit record menu = true
				column header = "Create Package"
				confirmation before execution
				(
					message for individual record = "Execute the Create Package action for this record?"
					confirm button text = "Yes"		
					cancel button text = "No"
				)
		)
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					Pre_Order_Status as "Pre-Order Status"
					Package_Number as "Package Number #"
					PR as "PR #"
					Item_Name as "Item Name"
					SKU
					Qty
					Target_Delivery as "Target Delivery"
					Delivery_Type as "Delivery Type"
					Added_Time as "Added Time"
					SO as "SO #"
					Status
					SO_Creation_Date as "SO Creation Date"
					Order_Type as "Order Type"
					PR_Date_Received as "PR Date Received"
					Replacement_Request.Single_Line1 as "Replacement Request"
					Customer_Name as "Customer Name"
					Customer_Address as "Customer Address"
					Customer_Type as "Customer Type"
					For_Crate as "For Crate"
					Bin_Location as "Bin Location"
					"Create Package"
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
					SO_Creation_Date as "SO Creation Date"
					PR as "PR #"
					Package_Number as "Package Number #"
					Order_Type as "Order Type"
					Delivery_Type as "Delivery Type"
					Target_Delivery as "Target Delivery"
					Pre_Order_Status as "Pre-Order Status"
					PR_Date_Received as "PR Date Received"
					Replacement_Request.Single_Line1 as "Replacement Request"
					Customer_Name as "Customer Name"
					Customer_Address as "Customer Address"
					Customer_Type as "Customer Type"
					Item_Name as "Item Name"
					SKU
					Qty
					Status
					SO as "SO #"
					Bin_Location as "Bin Location"
					For_Crate as "For Crate"
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
