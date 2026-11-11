---
title: "list Exception_Control_Report"
source_file: "Exception\list Exception_Control_Report.txt"
category: "Procurement/Exceptions/IDE"
associated_widget: "[[Fulfillment/Exception Control/Widget/Exception Control Widget|Exception Control Widget]]"
lines: 163
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - procurement
  - purchase-order
  - qc
  - supplier-portal
---

# list Exception_Control_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Exception Control/Widget/Exception Control Widget|Exception Control Widget]]
> - **Category:** `Procurement/Exceptions/IDE`
> - **Source File:** `Exception\list Exception_Control_Report.txt`
> - **Lines of Code:** 163
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#procurement`, `#purchase-order`, `#qc`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Exception Control/Widget/Exception Control Widget|Exception Control Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Exception_Control_Report
{
	displayName = "Exception Control Report"
	show all rows from Exception_Control1    
	(
		Rework_Status as "REWORK STATUS"
		Customer_Address as "ADDRESS"
		Modified_Time2 as "MODIFIED TIME"
		Added_Time2 as "ADDED TIME"
		Rework_Type as "REWORK TYPE"
		Customer_Name as "CUSTOMER NAME"
		Customer_Type as "CUSTOMER TYPE"
		Sales_Order as "SO #"
		PR as "PR #"
		PAC as "PAC #"
		Added_User as "Added User"
		Added_Time as "Added Time"
		Modified_User as "Modified User"
		Modified_Time as "Modified Time"
		RR_No as "RR #"
		Remarks
		Checker as "Checked By"
		Modified_By as "Modified By"
		Exception_Number as "Exception Number"
		Source_Module as "Source Module"
		Supplier
		Rework
		Status
		Item_Name as "Item Name"
		SKU
		Qty
		Affected_Qty as "Affected Qty"
		Signature
		Image_max_10_JPG_JPEG_PNG as "Image"
		Video_Upload_max_3_min_30_sec as "Video"
		Item_to_Replace1 as "Item to Replace"
		Quantity_of_damage_spare_s as "Quantity of damage spare/s"
		Quantity as "Quantity of Damage Items"
		Item_to_Replace3 as "Item to Replace"
		DELIVERY_TYPE as "DELIVERY TYPE"
		Order_Type as "Order Type"
		Demo1 as "Demo #"
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					Rework_Status as "REWORK STATUS"
					Customer_Name as "CUSTOMER NAME"
					Customer_Type as "CUSTOMER TYPE"
					Customer_Address as "ADDRESS"
					Rework_Type as "REWORK TYPE"
					Sales_Order as "SO #"
					PR as "PR #"
					PAC as "PAC #"
					Added_User as "Added User"
					Added_Time as "Added Time"
					Modified_User as "Modified User"
					Modified_Time as "Modified Time"
					Signature
					Exception_Number as "Exception Number"
					RR_No as "RR #"
					Source_Module as "Source Module"
					Checker as "Checked By"
					Remarks
					Supplier
					Rework
					Status
					Item_Name as "Item Name"
					SKU
					Qty
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
					Rework_Status as "REWORK STATUS"
					Customer_Address as "ADDRESS"
					Modified_Time2 as "MODIFIED TIME"
					Added_Time2 as "ADDED TIME"
					Rework_Type as "REWORK TYPE"
					Customer_Name as "CUSTOMER NAME"
					Customer_Type as "CUSTOMER TYPE"
					Sales_Order as "SO #"
					PR as "PR #"
					PAC as "PAC #"
					RR_No as "RR #"
					Remarks
					Checker as "Checked By"
					Modified_By as "Modified By"
					Exception_Number as "Exception Number"
					Source_Module as "Source Module"
					Supplier
					Rework
					Status
					Item_Name as "Item Name"
					SKU
					Qty
					Affected_Qty as "Affected Qty"
					Signature
					Image_max_10_JPG_JPEG_PNG as "Image"
					Video_Upload_max_3_min_30_sec as "Video"
					Item_to_Replace1 as "Item to Replace"
					Quantity_of_damage_spare_s as "Quantity of damage spare/s"
					Quantity as "Quantity of Damage Items"
					Item_to_Replace3 as "Item to Replace"
					DELIVERY_TYPE as "DELIVERY TYPE"
					Order_Type as "Order Type"
					Demo1 as "Demo #"
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
