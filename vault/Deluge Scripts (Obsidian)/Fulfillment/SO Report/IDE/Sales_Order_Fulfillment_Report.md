---
title: "Sales_Order_Fulfillment_Report"
source_file: "Sales Order Fulfillment\Sales_Order_Fulfillment_Report.txt"
category: "Fulfillment/SO Report/IDE"
associated_widget: "[[Fulfillment/SO Report/Widget/SO Report Widget|SO Report Widget]]"
lines: 134
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

# Sales_Order_Fulfillment_Report

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/SO Report/Widget/SO Report Widget|SO Report Widget]]
> - **Category:** `Fulfillment/SO Report/IDE`
> - **Source File:** `Sales Order Fulfillment\Sales_Order_Fulfillment_Report.txt`
> - **Lines of Code:** 134
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`, `#purchase-request`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/SO Report/Widget/SO Report Widget|SO Report Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
list Sales_Order_Fulfillment_Report
{
	displayName = "Sales Order Fulfillment Report"
	show all rows from Sales_Order_Fulfillment    
	(
		PR_No as "PR No."
		RR_No as "RR No."
		Package as "Package#"
		order_type as "Order Type"
		target_delivery_date as "Target Delivery Date"
		SO_No as "SO No."
		Billing_Address as "Billing Address"
		SO_Created_Date as "SO Created Date"
		For_Crate as "For Crate"
		Customer
		Customer_Type as "Customer Type"
		Shipping_Address as "Shipping Address"
		Package_Date as "Package Date"
		Contact_No as "Contact No"
		Shipment_Mode as "Shipment Mode"
		Delivery_Type as "Delivery Type"
		Status
		SO_Status as "SO Status"
		Fulfillment_Stage as "Fulfillment Stage"
		Added_Time as "Added Time"
		Item_Details1 as "Item Details"
		(
			field = Item_Details1.Item + " " + Item_Details1.SKU + " " + Item_Details1.Bin_Location + " " + Item_Details1.Quantity
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
					Fulfillment_Stage as "Fulfillment Stage"
					SO_No as "SO No."
					PR_No as "PR No."
					RR_No as "RR No."
					Package as "Package#"
					Item_Details1.Item as "Item Details"
					order_type as "Order Type"
					target_delivery_date as "Target Delivery Date"
					SO_Created_Date as "SO Created Date"
					Status
					SO_Status as "SO Status"
					Delivery_Type as "Delivery Type"
					For_Crate as "For Crate"
					Package_Date as "Package Date"
					Shipment_Mode as "Shipment Mode"
					Customer
					Customer_Type as "Customer Type"
					Contact_No as "Contact No"
					Billing_Address as "Billing Address"
					Shipping_Address as "Shipping Address"
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
					PR_No as "PR No."
					RR_No as "RR No."
					Package as "Package#"
					order_type as "Order Type"
					target_delivery_date as "Target Delivery Date"
					SO_No as "SO No."
					Billing_Address as "Billing Address"
					SO_Created_Date as "SO Created Date"
					For_Crate as "For Crate"
					Customer
					Customer_Type as "Customer Type"
					Item_Details1.Item as "Item Details"
					Shipping_Address as "Shipping Address"
					Package_Date as "Package Date"
					Contact_No as "Contact No"
					Shipment_Mode as "Shipment Mode"
					Delivery_Type as "Delivery Type"
					Status
					SO_Status as "SO Status"
					Fulfillment_Stage as "Fulfillment Stage"
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
