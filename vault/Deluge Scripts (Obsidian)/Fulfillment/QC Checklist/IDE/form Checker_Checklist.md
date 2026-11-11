---
title: "form Checker_Checklist"
source_file: "Quality Check\form Checker_Checklist.txt"
category: "Fulfillment/QC Checklist/IDE"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 406
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - qc
---

# form Checker_Checklist

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `Fulfillment/QC Checklist/IDE`
> - **Source File:** `Quality Check\form Checker_Checklist.txt`
> - **Lines of Code:** 406
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Checker_Checklist
{
	displayname = "Quality Check"
	success message = "Qc Report Added Successfully"
	Sales_Order_Details
	(
		type = section
		displayname = "Sales Order Details"
		visibility = true
	 	row = 1
	 	column = 0   
		width = medium
	)
	SO
	(
    	type = text
		displayname = "SO #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	PAC
	(
    	type = text
		displayname = "PAC#"
	 	row = 1
	 	column = 1   
		width = medium
	)
	PR
	(
    	type = text
		displayname = "PR#"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Demo
	(
    	type = text
		displayname = "Demo #"
	 	row = 1
	 	column = 2   
		width = medium
	)
	RR
	(
    	type = text
		displayname = "RR#"
	 	row = 1
	 	column = 2   
		width = medium
	)
	Target_Delivery_Date
	(
    	type = date
		displayname = "Target Delivery Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 2   
		width = medium
	)
	Delivery_Type
	(
    	type = text
		displayname = "Delivery Type"
	 	row = 1
	 	column = 3   
		width = medium
	)
	Order_Type
	(
    	type = text
		displayname = "Order Type"
	 	row = 1
	 	column = 3   
		width = medium
	)
	For_Crate
	(
    	type = checkbox
		displayname = "For Crate"
		initial value = false
	 	row = 1
	 	column = 3   
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
	Customer_Name
	(
    	type = text
		displayname = "Customer Name"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Customer_Address
	(
    	type = text
		displayname = "Customer Address"
	 	row = 2
	 	column = 1   
		width = medium
	)
	Customer_Type
	(
    	type = text
		displayname = "Customer Type"
	 	row = 2
	 	column = 2   
		width = medium
	)
	Item_Details
	(
		type = section
		displayname = "Item Details"
		visibility = true
	 	row = 3
	 	column = 0   
		width = medium
	)
	Item_Name
	(
    	type = text
		displayname = "Item Name"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Quantity
	(
    	type = text
	 	row = 3
	 	column = 1   
		width = medium
	)
	SKU
	(
    	type = text
	 	row = 3
	 	column = 2   
		width = medium
	)
	Bin_Location
	(
    	type = text
		displayname = "Bin Location"
	 	row = 3
	 	column = 2   
		width = medium
	)
	QC_Details
	(
		type = section
		displayname = "QC Details"
		visibility = true
	 	row = 4
	 	column = 0   
		width = medium
	)
	Date_Checked
	(
    	type = date
		displayname = "Date Checked"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 4
	 	column = 1   
		width = medium
	)
	Quality_Checker
	(
    	type = text
		displayname = "Quality Checker"
	 	row = 4
	 	column = 1   
		width = medium
	)
	Fixture_Body_Checklist
	(
		type = checkboxes	
		displayname = "Fixture Body Checklist "
		values = {"Ang glass ay malinaw, walang bubbles o mantsa","Ang kulay at pintura ay tama","Kompleto ang mga turnilyo, base at iba pang parte ng ilaw (buuhin)","Walang yupi, gasgas, bitak o basag"}
	 	row = 4
	 	column = 1   
		width = medium
	)
	LED_Checklist
	(
		type = checkboxes	
		displayname = "Checklist"
		values = {"Hindi kumukurap at hindi grounded ang mga ilaw","Hindi sobrang mainit ang bulb","Walang sira o hiwa ang wire"}
	 	row = 4
	 	column = 1   
		width = medium
	)
	Type_of_Bulb
	(
		type = list	
		displayname = "Type of Bulb"
		values = {"A60 - E27","LED Strip","A60 - E27 Dimmable","c35 - L E14","c35 - L E14 Dimmable","Corn type E14","Corn type E14 Dimmable","Corn type E27","Corn type E27 Dimmable","E14-Candle","G4","G4 Dimmable","G4 Jelly","G9","G-95","G9 Dimmable","G45 - E27","G45 - E27 Dimmable","G80 - E27","G125 - E27","GU10","GU10 Dimmable","ST64"}
		height = 60px
	 	row = 4
	 	column = 1   
		width = medium
	)
	Kelvin
	(
		type = list	
		values = {"2700K","3000K","3500K","4000K","4500K","5000K","6000K","6500K"}
		height = 60px
	 	row = 4
	 	column = 1   
		width = medium
	)
	Color_Temperature
	(
		type = list	
		displayname = "Color Temperature"
		values = {"Warm (2700K)","Warm (3000K)","Neutral (3500K)","Neutral (4000K)","Daylight (4500K)","Daylight (5000K)","Cool (6000K)","Cool (6500K)"}
		height = 60px
	 	row = 4
	 	column = 1   
		width = medium
	)
	Lighting_Feature
	(
		type = list	
		displayname = "Lighting Feature"
		values = {"Tri-color"}
		height = 60px
	 	row = 4
	 	column = 1   
		width = medium
	)
	Uniformity
	(
		type = checkboxes	
		values = {"Kapag marami ang ilaw dapat pare-parehas ang kulay ng ilaw at wire","Kapag marami ang ilaw dapat pare-parehas ang hugis","Kapag marami ang ilaw dapat pare-parehas ang sukat"}
	 	row = 4
	 	column = 1   
		width = medium
	)
	Item_to_Replace
	(
		type = picklist
		displayname = "Item to Replace"
		maxchar = 100
		values = {"Whole Fixture","Spare Parts","No damage"}
	 	row = 4
	 	column = 1   
		width = medium
	)
	Quantity_of_Damage_Items
	(
    	type = text
		displayname = "Quantity of Damage Items"
	 	row = 4
	 	column = 1   
		width = medium
	)
	Location
	(
		type = picklist
		maxchar = 100
		values = {"WH Banawe","WH Baesa"}
	 	row = 4
	 	column = 2   
		width = medium
	)
	Spare_part_type
	(
		type = grid
		displayname = "Spare part type"
		Spare_Part_Type
		(
			type = list	
			displayname = "Spare Part Type"
			values = {"Shade","Base","Glass"}
			height = 60px
			width = medium
		)
		Quantity_of_damage_spare_s
		(
    		type = text
			displayname = "Quantity of damage spare/s"
			width = medium
		)
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
	Image_Upload_max_10_JPG_JPEG_PNG
	(
    	type = upload file
		displayname = "Image Upload (max 10 · JPG, JPEG, PNG)"
    	file count = 10
				browse = local_drive
	 	row = 6
	 	column = 1   
		width = medium
	)
	Video_Upload_max_3_min_30_sec1
	(
    	type = upload file
		displayname = "Video Upload (max 3 min 30 sec)"
    	file count = 10
				browse = local_drive
	 	row = 6
	 	column = 1   
		width = medium
	)
	Remarks
	(
    	type = textarea
		height = 100px
	 	row = 6
	 	column = 1   
		width = medium
	)
	Section
	(
		type = section
	 	row = 7
	 	column = 0   
		width = medium
	)
	Signature
	(
    	type = signature
	 	row = 7
	 	column = 1   
		width = medium
		personal data = true
	)
	QC_Status
	(
		type = radiobuttons
		displayname = "QC Status"
		maxchar = 100
		values = {"Approved","Rejected"}
	 	row = 7
	 	column = 1   
		width = medium
	)
	Section1
	(
		type = section
		displayname = "Section"
		visibility = true
	 	row = 8
	 	column = 0   
		width = medium
	)
	Exception_Number
	(
    	type = text
	 	row = 8
	 	column = 1   
		width = medium
	)
	Split_Rejected_Qty
	(
		type = number
	 	row = 8
	 	column = 1   
		width = medium
	)
	Split_Original_Qty
	(
		type = number
	 	row = 8
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
