---
title: "Sales_Order_Readiness_Gate_Report"
source_file: "Sales Order Readiness Gate\Sales_Order_Readiness_Gate_Report.txt"
category: "Fulfillment/Order Readiness/IDE"
associated_widget: "[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]"
lines: 146
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

# Sales_Order_Readiness_Gate_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]
> - **Category:** `Fulfillment/Order Readiness/IDE`
> - **Source File:** `Sales Order Readiness Gate\Sales_Order_Readiness_Gate_Report.txt`
> - **Lines of Code:** 146
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Sales_Order_Readiness_Gate_Report
{
	displayName = "Sales Order Readiness Gate Report"
	show all rows from Sales_Order_Readiness_Gate    
	(
		sales_order_number as "Sales Order Number"
		customer_name as "Customer Name"
		customer_type as "Customer Type"
		customer_address as "Customer Address"
		payment_status as "Payment Status"
		priority as "Priority"
		pr_number as "PR Number"
		rr_number as "RR Number"
		Order_Type as "Order Type"
		Delivery_Type as "Delivery Type"
		Package_Order as "Package Order Number"
		Item_Name as "Item Name"
		SKU
		Quantity
		Bin_Location as "Bin Location"
		Release_Log as "Release Log"
		Release
		For_Crate as "For Crate"
		PR as "PR #"
		RR as "RR #"
		Demo as "Demo #"
		Added_Time as "Added Time"
		Target_Delivery_Date as "Target Delivery Date"
		Added_User as "Added User"
		Assign_Picker as "Assign Picker"
	)
	group by
	(
		sales_order_number descending
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					sales_order_number as "Sales Order Number"
					customer_name as "Customer Name"
					customer_type as "Customer Type"
					customer_address as "Customer Address"
					payment_status as "Payment Status"
					priority as "Priority"
					Delivery_Type as "Delivery Type"
					Order_Type as "Order Type"
					Package_Order as "Package Order Number"
					pr_number as "PR Number"
					rr_number as "RR Number"
					Item_Name as "Item Name"
					SKU
					Quantity
					Bin_Location as "Bin Location"
					Release_Log as "Release Log"
					Release
					PR as "PR #"
					RR as "RR #"
					Demo as "Demo #"
					For_Crate as "For Crate"
					Added_Time as "Added Time"
					Added_User as "Added User"
					Target_Delivery_Date as "Target Delivery Date"
					Assign_Picker as "Assign Picker"
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
					sales_order_number as "Sales Order Number"
					customer_name as "Customer Name"
					customer_type as "Customer Type"
					customer_address as "Customer Address"
					payment_status as "Payment Status"
					priority as "Priority"
					pr_number as "PR Number"
					rr_number as "RR Number"
					Order_Type as "Order Type"
					Delivery_Type as "Delivery Type"
					Package_Order as "Package Order Number"
					Item_Name as "Item Name"
					SKU
					Quantity
					Bin_Location as "Bin Location"
					Release_Log as "Release Log"
					Release
					For_Crate as "For Crate"
					PR as "PR #"
					RR as "RR #"
					Demo as "Demo #"
					Target_Delivery_Date as "Target Delivery Date"
					Assign_Picker as "Assign Picker"
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
