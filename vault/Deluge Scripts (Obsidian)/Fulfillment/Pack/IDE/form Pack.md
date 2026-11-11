---
title: "form Pack"
source_file: "Pack\form Pack.txt"
category: "Fulfillment/Pack/IDE"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 212
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - qc
---

# form Pack

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `Fulfillment/Pack/IDE`
> - **Source File:** `Pack\form Pack.txt`
> - **Lines of Code:** 212
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Pack
{
	success message = "Data Added Successfully!"
	Section
	(
		type = section
	 	row = 1
	 	column = 0   
		width = medium
	)
	Assign_Packer
	(
		type = picklist
		displayname = "Assign Packer"
		maxchar = 100
		values = {"Kurt","Pual","Edmon","Petz","Jonrey","Rio","Jayvon","Jonard","Jazz","Hendell"}
		sortorder = ascending
		others option = true
	 	row = 1
	 	column = 1   
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
	PR
	(
    	type = text
		displayname = "PR #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	RR
	(
    	type = text
		displayname = "RR #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	PAC
	(
    	type = text
		displayname = "PAC #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Demo
	(
    	type = text
		displayname = "Demo #"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Order_Type
	(
    	type = text
		displayname = "Order Type"
	 	row = 1
	 	column = 1   
		width = medium
	)
	For_Crate
	(
    	type = checkbox
		displayname = "For Crate"
		initial value = false
	 	row = 1
	 	column = 1   
		width = medium
	)
	Delivery_Type
	(
    	type = text
		displayname = "Delivery Type"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Target_Delivery_Date
	(
    	type = date
		displayname = "Target Delivery Date"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 1   
		width = medium
	)
	Costumer_Details
	(
		type = section
		displayname = "Costumer Details"
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
	Customer_Type
	(
    	type = text
		displayname = "Customer Type"
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
	SKU
	(
    	type = text
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
	Bin_Location
	(
    	type = text
		displayname = "Bin Location"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Section1
	(
		type = section
		displayname = "Section"
		visibility = true
	 	row = 4
	 	column = 0   
		width = medium
	)
	Send_to_QC
	(
    	type = checkbox
		displayname = "Send to QC"
		initial value = false
	 	row = 4
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
