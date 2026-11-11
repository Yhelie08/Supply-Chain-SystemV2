---
title: "All_Qc_Reports1"
source_file: "Quality Check\All_Qc_Reports1.txt"
category: "Fulfillment/QC Checklist/IDE"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 177
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - procurement
  - purchase-order
  - qc
---

# All_Qc_Reports1

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `Fulfillment/QC Checklist/IDE`
> - **Source File:** `Quality Check\All_Qc_Reports1.txt`
> - **Lines of Code:** 177
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#procurement`, `#purchase-order`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list All_Qc_Reports1
{
	displayName = "All Qc Reports"
	show all rows from Checker_Checklist    
	(
		PR as "PR#"
		PAC as "PAC#"
		Order_Type as "Order Type"
		Delivery_Type as "Delivery Type"
		Customer_Name as "Customer Name"
		Customer_Type as "Customer Type"
		Customer_Address as "Customer Address"
		Date_Checked as "Date Checked"
		Location
		Fixture_Body_Checklist as "Fixture Body Checklist "
		LED_Checklist as "LED Checklist"
		Type_of_Bulb as "Type of Bulb"
		Kelvin
		Color_Temperature as "Color Temperature"
		Lighting_Feature as "Lighting Feature"
		Item_to_Replace as "Item to Replace"
		Quantity_of_Damage_Items as "Quantity of Damage Items"
		Uniformity
		Remarks
		Signature
		QC_Status as "QC Status"
		RR as "RR#"
		Item_Name as "Item Name"
		SKU
		Quantity
		Demo as "Demo #"
		Bin_Location as "Bin Location"
		Quality_Checker as "Quality Checker"
		SO as "SO #"
		Added_Time as "Added Time"
		Target_Delivery_Date as "Target Delivery Date"
		For_Crate as "For Crate"
		Exception_Number
		Image_Upload_max_10_JPG_JPEG_PNG as "Image Upload (max 10 · JPG, JPEG, PNG)"
		Video_Upload_max_3_min_30_sec1 as "Video Upload (max 3 min 30 sec)"
		Spare_part_type as "Spare part type"
		(
			field = Spare_part_type.Spare_Part_Type + " " + Spare_part_type.Quantity_of_damage_spare_s
		)
		Split_Rejected_Qty
		Split_Original_Qty
	)
	quickview
	(
		layout
		(
			datablock1
			(
				fields
				(
					PR as "PR#"
					PAC as "PAC#"
					Order_Type as "Order Type"
					Delivery_Type as "Delivery Type"
					Customer_Name as "Customer Name"
					Customer_Type as "Customer Type"
					RR as "RR#"
					Customer_Address as "Customer Address"
					Item_Name as "Item Name"
					Quantity
					SKU
					Date_Checked as "Date Checked"
					Location
					SO as "SO #"
					Demo as "Demo #"
					Bin_Location as "Bin Location"
					Quality_Checker as "Quality Checker"
					Fixture_Body_Checklist as "Fixture Body Checklist "
					LED_Checklist as "LED Checklist"
					Type_of_Bulb as "Type of Bulb"
					Kelvin
					Color_Temperature as "Color Temperature"
					Lighting_Feature as "Lighting Feature"
					Uniformity
					Item_to_Replace as "Item to Replace"
					Quantity_of_Damage_Items as "Quantity of Damage Items"
					Spare_part_type.Spare_Part_Type as "Spare part type"
					Remarks
					Signature
					QC_Status as "QC Status"
					Added_Time as "Added Time"
					Target_Delivery_Date as "Target Delivery Date"
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
					PR as "PR#"
					PAC as "PAC#"
					Order_Type as "Order Type"
					Delivery_Type as "Delivery Type"
					Customer_Name as "Customer Name"
					Customer_Type as "Customer Type"
					Customer_Address as "Customer Address"
					Date_Checked as "Date Checked"
					Location
					Fixture_Body_Checklist as "Fixture Body Checklist "
					LED_Checklist as "LED Checklist"
					Type_of_Bulb as "Type of Bulb"
					Kelvin
					Color_Temperature as "Color Temperature"
					Lighting_Feature as "Lighting Feature"
					Item_to_Replace as "Item to Replace"
					Quantity_of_Damage_Items as "Quantity of Damage Items"
					Uniformity
					Remarks
					Signature
					QC_Status as "QC Status"
					RR as "RR#"
					Spare_part_type.Spare_Part_Type as "Spare part type"
					Item_Name as "Item Name"
					SKU
					Quantity
					Demo as "Demo #"
					Bin_Location as "Bin Location"
					Quality_Checker as "Quality Checker"
					SO as "SO #"
					Target_Delivery_Date as "Target Delivery Date"
					For_Crate as "For Crate"
					Exception_Number
					Image_Upload_max_10_JPG_JPEG_PNG as "Image Upload (max 10 · JPG, JPEG, PNG)"
					Video_Upload_max_3_min_30_sec1 as "Video Upload (max 3 min 30 sec)"
					Split_Rejected_Qty
					Split_Original_Qty
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
