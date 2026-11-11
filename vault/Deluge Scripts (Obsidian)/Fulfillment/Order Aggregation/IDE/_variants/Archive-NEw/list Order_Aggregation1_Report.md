---
title: "list Order_Aggregation1_Report"
source_file: "Deluge Script/Application IDE\Order Aggregation\list Order_Aggregation1_Report.txt"
category: "Fulfillment/Order Aggregation/IDE/_variants/Archive-NEw"
associated_widget: "[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]"
lines: 113
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - order-aggregation
  - procurement
  - purchase-order
---

# list Order_Aggregation1_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]
> - **Category:** `Fulfillment/Order Aggregation/IDE/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/Application IDE\Order Aggregation\list Order_Aggregation1_Report.txt`
> - **Lines of Code:** 113
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Order_Aggregation1_Report
{
	displayName = "Order Aggregation Report"
	show all rows from Order_Aggregation1    
	(
		SO as "SO #"
		PR as "PR #"
		PAC as "PAC #"
		DEMO as "DEMO #"
		ORDER_TYPE as "ORDER TYPE"
		DELIVERY_TYPE as "DELIVERY TYPE"
		Target_Date as "Target Delivery Date"
		Customer_Name as "Customer Name"
		Customer_Type as "Customer Type"
		Customer_Address as "Customer Address"
		For_Crate as "For Crate"
		Item_Details as "Item Details"
		(
			field = Item_Details.Bin_Location + " " + Item_Details.Item_Name + " " + Item_Details.QTY + " " + Item_Details.SKU + " " + Item_Details.Select + " " + Item_Details.Added_Time
		)
		Added_Time as "Added Time"
		Dispatch_Selected as "Dispatch Selected"
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					SO as "SO #"
					PR as "PR #"
					PAC as "PAC #"
					DEMO as "DEMO #"
					ORDER_TYPE as "ORDER TYPE"
					DELIVERY_TYPE as "DELIVERY TYPE"
					Target_Date as "Target Delivery Date"
					For_Crate as "For Crate"
					Customer_Name as "Customer Name"
					Customer_Address as "Customer Address"
					Customer_Type as "Customer Type"
					Item_Details.Bin_Location as "Item Details"
					Added_Time as "Added Time"
					Dispatch_Selected as "Dispatch Selected"
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
					SO as "SO #"
					PR as "PR #"
					PAC as "PAC #"
					DEMO as "DEMO #"
					ORDER_TYPE as "ORDER TYPE"
					DELIVERY_TYPE as "DELIVERY TYPE"
					Target_Date as "Target Delivery Date"
					Customer_Name as "Customer Name"
					Customer_Type as "Customer Type"
					Customer_Address as "Customer Address"
					Item_Details.Bin_Location as "Item Details"
					For_Crate as "For Crate"
					Dispatch_Selected as "Dispatch Selected"
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
