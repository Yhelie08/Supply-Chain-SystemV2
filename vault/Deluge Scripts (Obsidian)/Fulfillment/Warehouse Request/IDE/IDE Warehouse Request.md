---
title: "IDE Warehouse Request"
source_file: "IDE Warehouse Request"
category: "Fulfillment/Warehouse Request/IDE"
associated_widget: "[[Fulfillment/Warehouse Request/Widget/Warehouse Request Widget|Warehouse Request Widget]]"
lines: 178
tags:
  - deluge
  - fulfillment
  - pick
---

# IDE Warehouse Request

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Warehouse Request/Widget/Warehouse Request Widget|Warehouse Request Widget]]
> - **Category:** `Fulfillment/Warehouse Request/IDE`
> - **Source File:** `IDE Warehouse Request`
> - **Lines of Code:** 178
> - **Tags:** `#deluge`, `#fulfillment`, `#pick`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Warehouse Request/Widget/Warehouse Request Widget|Warehouse Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form Warehouse_Request
{
	displayname = "Warehouse Request"
	success message = "Warehouse Request Added Successfully"
	Section
	(
		type = section
	 	row = 1
	 	column = 0   
		width = medium
	)
	Type_of_Request
	(
		type = picklist
		displayname = "Type of Request"
		maxchar = 100
		values = {"Actual Photo","Measurement","Stock Availability"}
		others option = true
	 	row = 1
	 	column = 1   
		width = medium
	)
	Date_Requested
	(
    	type = datetime
		displayname = "Date Requested"
		timedisplayoptions = "hh:mm:ss"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 1
	 	column = 1   
		width = medium
	)
	Request_By
	(
		type = picklist
		displayname = "Request By:"
		maxchar = 100
		values = {"Emily","Julia","Vanessa","Lovely","Ellen"}
		others option = true
	 	row = 1
	 	column = 1   
		width = medium
	)
	Upload_Image
	(
    	type = upload file
		displayname = "Upload Image"
    	file count = 10
				browse = local_drive
	 	row = 1
	 	column = 1   
		width = medium
	)
	Request
	(
    	type = textarea
		displayname = "Request Description"
		height = 100px
	 	row = 1
	 	column = 2   
		width = medium
	)
	Item
	(
		type = grid
		displayname = "Items"
		Image
		(
    		type = image
			source  = file
			aspect ratio = original
			camera = primary
			show gallery = true
			switch camera = true
			width = medium
		)
		Items
		(
			type = picklist	
			values  = Items.ID
    		displayformat = [item_name]
			sortorder = ascending
			width = medium
		)
		SKU
		(
    		type = text
			width = medium
		)
	 	row = 2
	 	column = 1   
		width = medium
	)
	To_be_Edit_by_Fulfillment
	(
		type = section
		displayname = "To be Edit by Fulfillment"
		visibility = true
	 	row = 3
	 	column = 0   
		width = medium
	)
	Picker
	(
		type = picklist
		maxchar = 100
		values = {"Hendel","Jayvon"}
		others option = true
	 	row = 3
	 	column = 1   
		width = medium
	)
	Remarks
	(
    	type = textarea
		height = 100px
	 	row = 3
	 	column = 1   
		width = medium
	)
	Actual_Photo_Upload
	(
    	type = image
		displayname = "Actual Photo Upload"
		source  = file
    	file count = 10
		camera = primary
		show gallery = true
		switch camera = true
	 	row = 3
	 	column = 1   
		width = medium
	)
	Actual_Video_Upload
	(
    	type = video
		displayname = "Actual Video Upload"
    	duration=30
	 	row = 3
	 	column = 1   
		width = medium
	)
	Request_Status
	(
		type = picklist
		displayname = "Request Status:"
		maxchar = 100
		values = {"Pending","Done"}
	 	row = 3
	 	column = 2   
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
