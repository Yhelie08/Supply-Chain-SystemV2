---
title: "dms_sales_returns_form"
source_file: "dms_sales_returns_form.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/Sales Returns/Widget/SalesReturns Widget|SalesReturns Widget]]"
lines: 244
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - zoho-books
---

# dms_sales_returns_form

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/Sales Returns/Widget/SalesReturns Widget|SalesReturns Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `dms_sales_returns_form.txt`
> - **Lines of Code:** 244
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/Sales Returns/Widget/SalesReturns Widget|SalesReturns Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPERSEDED 2026-07-18, same day this was written — DO NOT PASTE ==
== A real `Sales_Returns_Form` already existed live in supply-chain-app the ==
== whole time (confirmed via a live Application IDE dump, Temp.txt) — this   ==
== whole file's field guesses were never needed. The real form has a richer, ==
== more precise field set (Items subform: SKU/Qty_Shipped_Fulfilled/         ==
== Return_Quantity; SR_CREATION_STATUS; Signature; a real Warehouse_Name     ==
== dropdown with the actual 22-warehouse list) than anything guessed below.  ==
== Kept only for history — the real SalesReturns widget (UI/DMS WIDGET/      ==
== SalesReturns/) was built directly against the pre-existing form instead.  ==

== DMS — Sales Returns native form ==
== New 2026-07-18, per user decision to build a genuinely new form (not a filtered ==
== view of Service_Appointment/Field_Work) matching the OLD standalone app's real ==
== "Sales Returns" module (creatorapp.zoho.com/homecartel/logistics-management,   ==
== a SEPARATE Creator app from supply-chain-app, first touched this session via a ==
== live screenshot, confirmed real production data — "Showing 138 of 138"). ==

====================================================
WHY THIS EXISTS / SCOPE NOTE
====================================================
The old app's Sales Returns has real fields with NO equivalent anywhere in
supply-chain-app today: Warehouse Name, a line-level Items subform, Image/Video
evidence, Returned By, and a "Sales Return On Books" action button (real Zoho
Books integration — its actual Deluge logic lives in the OLD app, which this
project has zero prior documentation for; per user's explicit choice, this build
is TRACKING ONLY for now — the Books button is deliberately NOT built, flagged
as a separate, deferred integration for whenever the old script is pulled).

Sub_Reason values match EXACTLY what Service_Appointment_Form/Field_Work_Form
already use ("Change of Mind"/"Damaged Item"/"Demo"/"Replacement") — same
taxonomy, confirmed via the old app's own visible data (Change of Mind/Demo/
Damaged Item all appear in the screenshot).

The Items subform's exact old-app display format ("Belkis | Chandelier : 1 : 1")
is ambiguous from a screenshot alone — inferred as Item_Name | Description :
Qty : Total. Flag/correct after first live look if wrong.

====================================================
STEP 1 — New form: Sales_Returns
(Application IDE, brand new form — additive only, doesn't touch any existing
form. Paste as a new "form Sales_Returns { ... }" block, separate from
Service_Appointment_Form's own source.)
====================================================
form Sales_Returns
{
	displayname = "Sales Returns"
	success message = "Sales Return Added Successfully"

	Details_Section
	(
		type = section
		displayname = "Return Details"
		row = 1
		column = 0
		width = medium
	)
	Return_Date
	(
		type = date
		displayname = "Date"
		alloweddays = 0,1,2,3,4,5,6
		row = 1
		column = 1
		width = medium
	)
	Sales_Order
	(
		type = text
		displayname = "SO#"
		row = 1
		column = 1
		width = medium
	)
	PAC_No
	(
		type = text
		displayname = "PAC#"
		row = 1
		column = 1
		width = medium
	)
	RMA_No
	(
		type = text
		displayname = "RMA#"
		row = 1
		column = 1
		width = medium
	)
	Warehouse_Name
	(
		type = text
		displayname = "Warehouse Name"
		row = 1
		column = 1
		width = medium
	)
	Reason
	(
		type = textarea
		displayname = "Reason"
		height = 80px
		row = 1
		column = 1
		width = medium
	)
	Sub_Reason
	(
		type = picklist
		displayname = "Sub Reason"
		maxchar = 100
		values = {"Change of Mind","Damaged Item","Demo","Replacement"}
		row = 1
		column = 1
		width = medium
	)
	Returned_By
	(
		type = text
		displayname = "Returned By"
		row = 1
		column = 1
		width = medium
	)

	Items_Section
	(
		type = section
		displayname = "Items"
		row = 2
		column = 0
		width = medium
	)
	Return_Items
	(
		type = grid
		displayname = "Return Items"
		Item_Name
		(
			type = text
			displayname = "Item Name"
			width = medium
		)
		Description
		(
			type = text
			displayname = "Description"
			width = medium
		)
		Qty
		(
			type = number
			displayname = "Qty"
			width = medium
		)
		Total
		(
			type = number
			displayname = "Total"
			width = medium
		)
		row = 2
		column = 1
		width = medium
	)

	Evidence_Section
	(
		type = section
		displayname = "Evidence"
		row = 3
		column = 0
		width = medium
	)
	Return_Image
	(
		type = image
		displayname = "Image"
		source = file
		aspect ratio = original
		camera = primary
		show gallery = true
		switch camera = true
		row = 3
		column = 1
		width = medium
	)
	Return_Video
	(
		type = upload file
		displayname = "Video"
		browse = local_drive
		row = 3
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

====================================================
STEP 2 — Expose the default report
====================================================
After creating the form, confirm/set its default report link name — Creator
usually auto-names it "All_Sales_Returns" or "Sales_Returns_Report". Check via
Design → Sales_Returns form → its own default report, tell me the real name
before I wire the widget (same "don't guess a report name" rule this whole
project follows).

====================================================
NOTES:
- Return_Image is a plain HEADER Image field (not inside the subform) — safe
  multi-file usage confirmed elsewhere in this app (Inquiry_Form.Product_Image
  etc.), the documented multi-image/subform restriction doesn't apply here
  since nothing ever WRITES to this field via workflow, only direct user
  upload through the widget.
- "Sales Return On Books" button deliberately NOT built — needs the old app's
  real Deluge script pulled first if ever wanted, see scope note above.
- UNTESTED — needs the form created live, report name confirmed, then a
  widget built against it.
====================================================

````
