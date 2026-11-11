---
title: "Pack_Report"
source_file: "Deluge Script/Application IDE\Pack\Pack_Report.txt"
category: "Fulfillment/Pack/IDE/_variants/Archive-NEw"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 124
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - procurement
  - purchase-order
  - qc
---

# Pack_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `Fulfillment/Pack/IDE/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/Application IDE\Pack\Pack_Report.txt`
> - **Lines of Code:** 124
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Pack_Report
{
	displayName = "Pack Report"
	show all rows from Pack    
	(
		Assign_Packer as "Assign Packer"
		SO as "SO #"
		PR as "PR #"
		RR as "RR #"
		PAC as "PAC #"
		Demo as "Demo #"
		Order_Type as "Order Type"
		For_Crate as "For Crate"
		Delivery_Type as "Delivery Type"
		Customer_Name as "Customer Name"
		Customer_Type as "Customer Type"
		Customer_Address as "Customer Address"
		Item_Name as "Item Name"
		SKU
		Quantity
		Bin_Location as "Bin Location"
		Send_to_QC as "Send to QC"
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
					Assign_Packer as "Assign Packer"
					SO as "SO #"
					PR as "PR #"
					RR as "RR #"
					PAC as "PAC #"
					Demo as "Demo #"
					Order_Type as "Order Type"
					For_Crate as "For Crate"
					Delivery_Type as "Delivery Type"
					Customer_Name as "Customer Name"
					Customer_Type as "Customer Type"
					Customer_Address as "Customer Address"
					Item_Name as "Item Name"
					SKU
					Quantity
					Bin_Location as "Bin Location"
					Send_to_QC as "Send to QC"
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
					Assign_Packer as "Assign Packer"
					SO as "SO #"
					PR as "PR #"
					RR as "RR #"
					PAC as "PAC #"
					Demo as "Demo #"
					Order_Type as "Order Type"
					For_Crate as "For Crate"
					Delivery_Type as "Delivery Type"
					Customer_Name as "Customer Name"
					Customer_Type as "Customer Type"
					Customer_Address as "Customer Address"
					Item_Name as "Item Name"
					SKU
					Quantity
					Bin_Location as "Bin Location"
					Send_to_QC as "Send to QC"
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
