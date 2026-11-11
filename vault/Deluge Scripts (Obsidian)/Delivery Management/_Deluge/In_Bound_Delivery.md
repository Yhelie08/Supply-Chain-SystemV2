---
title: "In_Bound_Delivery"
source_file: "In_Bound_Delivery.txt"
category: "Delivery Management/_Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 630
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-order
---

# In_Bound_Delivery

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Delivery Management/_Deluge`
> - **Source File:** `In_Bound_Delivery.txt`
> - **Lines of Code:** 630
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
form In_Bound_Delivery
{
	displayname = "Field Work"
	success message = "Data Added Successfully!"
	feature property = 32
	Field_Portal_Team_Fields
	(
		type = section
		displayname = "Field Portal Team Fields"
		visibility = true
	 	row = 1
	 	column = 0   
		width = medium
	)
	Status
	(
		type = picklist
		maxchar = 100
		values = {"Pending","Started","Reschedule Requested","Rescheduled","Archived"}
		initial value = "Pending"
	 	row = 1
	 	column = 1   
		width = medium
	)
	Notes
	(
    	type = textarea
		displayname = "Logistic Notes"
		height = 100px
	 	row = 1
	 	column = 1   
		width = medium
	)
	Package_Order
	(
    	type = image
		displayname = "Package Order"
		source  = file
    	file count = 10
		camera = primary
		show gallery = true
		switch camera = true
	 	row = 1
	 	column = 1   
		width = medium
	)
	Shipment_Order
	(
    	type = upload file
		displayname = "Shipment Order"
				browse = local_drive
		private = true
	 	row = 1
	 	column = 1   
		width = medium
	)
	Logistic_Notes2
	(
		type = grid
		displayname = "Logistic Notes"
		Image
		(
    		type = image
			displayname = "Attachment of Photo"
			source  = file
			aspect ratio = original
			camera = primary
			show gallery = true
			switch camera = true
			width = medium
		)
		Notes
		(
    		type = text
			width = medium
		)
		private = true
	 	row = 2
	 	column = 1   
		width = medium
	)
	SO_Details
	(
		type = section
		displayname = "SO Details"
		visibility = true
	 	row = 3
	 	column = 0   
		width = medium
	)
	Service_Appointment
	(
    	type = text
		displayname = "Service Request#"
	 	row = 3
	 	column = 1   
		width = medium
	)
	RMA
	(
    	type = text
		displayname = "RMA#"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Original_SO
	(
    	type = text
		displayname = "Original SO#"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Reason
	(
    	type = textarea
		height = 100px
	 	row = 3
	 	column = 1   
		width = medium
	)
	Sub_Reason
	(
		type = picklist
		displayname = "Sub Reason"
		maxchar = 100
		values = {"Change of Mind","Damaged Item","Demo","Replacement"}
	 	row = 3
	 	column = 1   
		width = medium
	)
	Sales_Order
	(
    	type = text
		displayname = "Sales Order#"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Package_Number
	(
    	type = text
		displayname = "Package Number"
	 	row = 3
	 	column = 1   
		width = medium
	)
	Type_of_Delivery1
	(
    	type = text
		displayname = "Type of Delivery "
	 	row = 3
	 	column = 1   
		width = medium
	)
	Customer_Details
	(
		type = section
		displayname = "Customer Details"
		visibility = true
	 	row = 4
	 	column = 0   
		width = medium
	)
	Customer_Name
	(
    	type = text
		displayname = "Customer Name"
	 	row = 4
	 	column = 1   
		width = medium
	)
	Customer_Address
	(
    	type = text
		displayname = "Customer Address"
	 	row = 4
	 	column = 1   
		width = medium
	)
	City
	(
    	type = text
	 	row = 4
	 	column = 1   
		width = medium
	)
	Email
	(
    	type = email
		maxchar = 80
	 	row = 4
	 	column = 1   
		width = medium
		personal data = true
	)
	Contact
	(
    	type = phonenumber
	 	row = 4
	 	column = 1   
		width = medium
		personal data = true
	)
	For_Automation_Not_to_Edit
	(
		type = section
		displayname = "For Automation ('Wag I edit)"
	 	row = 5
	 	column = 0   
		width = medium
	)
	If_Pull_Out
	(
		type = radiobuttons
		displayname = "If Pull Out"
		maxchar = 100
		values = {"Yes","No"}
	 	row = 5
	 	column = 1   
		width = medium
	)
	Scheduled_Date_and_Time
	(
    	type = datetime
		displayname = "Scheduled Date and Time"
		timedisplayoptions = "hh:mm"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 5
	 	column = 1   
		width = medium
	)
	Assigned_to
	(
		type = picklist
		displayname = "Assigned to (Installer)"
		maxchar = 100
		values = {"Edmon","Justin","Jonrey","Nherwin","John Dave","Norman","Russel Mark","CJ","Jayvon"}
		sortorder = ascending
		others option = true
	 	row = 5
	 	column = 1   
		width = medium
	)
	Assigned_to_Dispatcher
	(
		type = picklist
		displayname = "Assigned to (Dispatcher)"
		maxchar = 100
		values = {"Jhi","Flor","Andrea","Kate"}
	 	row = 5
	 	column = 1   
		width = medium
	)
	Completed
	(
		type = radiobuttons
		maxchar = 100
		values = {"Yes","No"}
	 	row = 5
	 	column = 1   
		width = medium
	)
	Schedule_Start_Date_and_Time
	(
    	type = datetime
		displayname = "Schedule Start Date and Time"
		timedisplayoptions = "hh:mm:ss"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 5
	 	column = 1   
		width = medium
	)
	Schedule_end_Date_and_Time
	(
    	type = datetime
		displayname = "Schedule end Date and Time"
		timedisplayoptions = "hh:mm:ss"
		alloweddays = 0,1,2,3,4,5,6
	 	row = 5
	 	column = 1   
		width = medium
	)
	Signed
	(
		type = radiobuttons
		displayname = "Customer Signed"
		maxchar = 100
		values = {"Yes"}
	 	row = 5
	 	column = 1   
		width = medium
	)
	Assignee_Signed
	(
		type = radiobuttons
		displayname = "Assignee Signed"
		maxchar = 100
		values = {"Yes"}
	 	row = 5
	 	column = 1   
		width = medium
	)
	To_Request_Reschedule_Please_Upload_PDF_Of_this_Report
	(
		type = section
		displayname = "To Request Reschedule Please Upload PDF Of this Report"
	 	row = 6
	 	column = 0   
		width = medium
	)
	File_upload
	(
    	type = upload file
		displayname = "Upload PDF of Initial Report "
				browse = local_drive
	 	row = 6
	 	column = 1   
		width = medium
	)
	Request_Reschedule
	(
		type = radiobuttons
		displayname = "Request Reschedule"
		maxchar = 100
		values = {"Request","Reset Request"}
	 	row = 6
	 	column = 1   
		width = medium
	)
	Requested_By
	(
		type = picklist
		displayname = "Requested By"
		maxchar = 100
		values = {"Choice 1","Choice 2","Choice 3"}
	 	row = 6
	 	column = 1   
		width = medium
	)
	Item_Details
	(
		type = grid
		displayname = "Item Details"
		Item_Name
		(
    		type = text
			displayname = "Item Name"
			width = medium
		)
		SKU
		(
    		type = text
			width = medium
		)
		Quantity
		(
			type = number
			width = medium
		)
	 	row = 7
	 	column = 1   
		width = medium
	)
	Section
	(
		type = section
		displayname = "Customer Feedback"
		visibility = true
	 	row = 8
	 	column = 0   
		width = medium
	)
	Customer_Rating
	(
		type = radiobuttons
		displayname = "Customer Rating"
		maxchar = 100
		values = {"⭐","⭐⭐","⭐⭐⭐","⭐⭐⭐⭐","⭐⭐⭐⭐⭐"}
    	description
    	[
    		type = none
    	 	message = "5 is the highest rating while 1 is the lowest rating"
    	]
	 	row = 8
	 	column = 1   
		width = medium
	)
	Customer_Review
	(
    	type = textarea
		displayname = "Customer Review"
		height = 100px
	 	row = 8
	 	column = 1   
		width = medium
	)
	Receiver_s_Name
	(
    	type = text
		displayname = "Receiver's Name"
	 	row = 8
	 	column = 1   
		width = medium
	)
	Customer_Signature
	(
    	type = signature
		displayname = "Receiver's Signature"
	 	row = 8
	 	column = 1   
		width = medium
	)
	Assignee_Signature
	(
    	type = signature
		displayname = "Assignee Signature"
	 	row = 8
	 	column = 1   
		width = medium
		personal data = true
	)
	Signature_Upload
	(
    	type = image
		displayname = "Receiver's Signature Upload"
		source  = file
		aspect ratio = original
		camera = primary
		show gallery = true
		switch camera = true
    	description
    	[
    		type = tooltip
    	 	message = "Kung sa papel pumirma ang client, i-upload dito ang picture"
    	]
	 	row = 8
	 	column = 2   
		width = medium
	)
	ID1
	(
		type = section
		displayname = "ID"
	 	row = 9
	 	column = 0   
		width = medium
	)
	Final_Checking_Bago_Umalis_sa_Site
	(
		type = checkboxes	
		displayname = "Final Checking Bago Umalis sa Site"
		values = {"Lahat ng ilaw o fixtures ay pantay ang ayos at hitsura.","Walang tabingi","Lahat ng ilaw ay naka-align sa layout.","Na-check gamit ang level bar","Lahat ng LED/bulb ay gumagana, walang busted.","Walang flicker o hindi pantay ang liwanag.","Tinanggal lahat ng kalat (plastic, wire cuttings, screws, etc.).","Naayos ang mga gamit bago umalis sa site.","Na-turn over ng maayos sa client o site engineer."}
	 	row = 9
	 	column = 1   
		width = medium
	)
	Installation_Status
	(
		type = picklist
		displayname = "Installation Status"
		maxchar = 100
		values = {"Completed","Incomplete"}
		initial value = "Incomplete"
		sortorder = ascending
	 	row = 9
	 	column = 1   
		width = medium
	)
	Sales_Return_Status
	(
		type = picklist
		displayname = "Sales Return Status"
		maxchar = 100
		values = {"SR CREATED","SR PENDING"}
		initial value = "SR PENDING"
	 	row = 9
	 	column = 1   
		width = medium
	)
	Section1
	(
		type = section
		displayname = "Section"
	 	row = 10
	 	column = 0   
		width = medium
	)
	Image
	(
    	type = image
		annotation = true
		source  = file
    	file count = 10
		camera = primary
		show gallery = true
		switch camera = true
	 	row = 10
	 	column = 1   
		width = medium
	)
	Image1
	(
    	type = image
		displayname = "Image"
		source  = file
    	file count = 10
		camera = primary
		show gallery = true
		switch camera = true
	 	row = 10
	 	column = 1   
		width = medium
	)
	Image2
	(
    	type = image
		displayname = "Image"
		source  = file
    	file count = 10
		camera = primary
		show gallery = true
		switch camera = true
	 	row = 10
	 	column = 1   
		width = medium
	)
	Attachment_of_Photo
	(
		type = grid
		displayname = "Video and Status of Installed Item"
		maxrow = 100
		Image_Upload
		(
    		type = image
			displayname = "Image Upload"
			annotation = true
			source  = file
    		file count = 10
			camera = primary
			show gallery = true
			switch camera = true
			private = true
			width = medium
		)
		Video_If_necessary
		(
    		type = video
			displayname = "Video (If necessary)"
    		duration=300
    		description
    		[
    			type = tooltip
    		 	message = "If necessary"
    		]
			width = medium
		)
		Notes_Remarks
		(
    		type = textarea
			displayname = "Notes/Remarks"
			height = 100px
			width = medium
		)
    	description
    	[
    		type = none
    	 	message = "Attachment of Photo of the installed Item"
    	]
	 	row = 11
	 	column = 1   
		width = medium
	)
	Section2
	(
		type = section
		displayname = "Section"
		visibility = true
	 	row = 12
	 	column = 0   
		width = medium
	)
	Complaint_Record_ID
	(
    	type = text
		displayname = "Complaint Record ID"
	 	row = 12
	 	column = 1   
		width = medium
	)
	Appointment_Record_ID
	(
    	type = text
		displayname = "Appointment Record ID"
	 	row = 12
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
			reset
			(
   				type = reset
   				displayname = "Reset"
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
