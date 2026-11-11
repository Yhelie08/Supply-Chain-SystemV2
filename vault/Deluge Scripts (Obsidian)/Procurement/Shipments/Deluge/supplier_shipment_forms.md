---
title: "supplier_shipment_forms"
source_file: "supplier_shipment_forms.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 276
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-creator
---

# supplier_shipment_forms

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `supplier_shipment_forms.txt`
> - **Lines of Code:** 276
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== New 2026-07-21, per user (Supplier Shipment self-report feature, see plan.txt) ==
== Application IDE source — paste each form block below as a NEW form (Settings →
   Application IDE → paste under the app's own form list, same "raw form X {...}
   source editor" mechanism already proven working in this app for Section A of the
   DMS build — confirmed pasteable/saveable there). ==

====================================================
Based on user's own pasted schema (plan.txt lines 405-532), with 2 additions per
this session's design discussion:
  1. Select_To_Ship (Decision Box) added to each grid — the supplier checks this
     per row to mark "I'm shipping this item today."
  2. Synced (Decision Box) added to each grid, hidden from the supplier's own view
     via the widget (not a native field-level hide — see the widget's own NOTES) —
     internal-only flag the sync workflow (supplier_shipment_sync.txt) uses to
     dedupe, so a resave of this record never re-appends an already-synced row to
     the parent Shipments.Supplier_Shipment_Details.
  3. Shipment_No (Single Line Text) added at the header level — the link back to
     the parent Shipments record, same "plain text field storing the aggregate's
     own number" convention already used throughout this app for supplier-form
     ↔ aggregate-form linking (e.g. PO_No_Supplier1 on the supplier PO forms).
     Confirmed real field, not a lookup — matches this app's established pattern
     of NOT using Lookup fields for supplier-form cross-references (only the
     aggregate's own plain Shipments.PO_No is a real lookup; every supplier-side
     mirror field elsewhere in this app is plain text).
====================================================

form Fenteng_Shipment
{
	displayname = "Shipment"
	success message = "Data Added Successfully!"
	Shipment_No
	(
		type = text
		displayname = "Shipment No."
		row = 1
		column = 1
		width = medium
	)
	Supplier1_Shipment_Details
	(
		type = grid
		Select_To_Ship
		(
			type = checkbox
			displayname = "Select To Ship"
			initial value = false
			width = medium
		)
		SKU
		(
			type = text
			width = medium
		)
		Item_Name
		(
			type = text
			displayname = "Item Name"
			width = medium
		)
		PR_No
		(
			type = text
			displayname = "PR No."
			width = medium
		)
		RR_No
		(
			type = text
			displayname = "RR No."
			width = medium
		)
		Date_Shipped
		(
			type = date
			displayname = "Date Shipped"
			alloweddays = 0,1,2,3,4,5,6
			width = medium
		)
		Shipment_Mode
		(
			type = picklist
			displayname = "Shipment Mode"
			maxchar = 100
			values = {"Airfreight","LCL","FCL"}
			width = medium
		)
		Synced
		(
			type = checkbox
			displayname = "Synced"
			initial value = false
			width = medium
		)
		Status
		(
			type = textarea
			height = 100px
			width = medium
		)
	 	row = 1
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

form Tony_Shipment
{
	displayname = "Shipment"
	success message = "Data Added Successfully!"
	Shipment_No
	(
		type = text
		displayname = "Shipment No."
		row = 1
		column = 1
		width = medium
	)
	Supplier2_Shipment_Details
	(
		type = grid
		displayname = "Supplier2 Shipment Details"
		SKU
		(
			type = text
			width = medium
		)
		Item_Name
		(
			type = text
			displayname = "Item Name"
			width = medium
		)
		PR_No
		(
			type = text
			displayname = "PR No."
			width = medium
		)
		RR_No
		(
			type = text
			displayname = "RR No."
			width = medium
		)
		Date_Shipped
		(
			type = date
			displayname = "Date Shipped"
			alloweddays = 0,1,2,3,4,5,6
			width = medium
		)
		Shipment_Mode
		(
			type = picklist
			displayname = "Shipment Mode"
			maxchar = 100
			values = {"Airfreight","LCL","FCL"}
			width = medium
		)
		Select_To_Ship
		(
			type = checkbox
			displayname = "Select to Ship"
			initial value = false
			width = medium
		)
		Synced
		(
			type = checkbox
			displayname = "Synced"
			initial value = false
			width = medium
		)
		Status
		(
			type = text
			displayname = "Status"
			width = medium
		)
	 	row = 1
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
FIXED 2026-07-21, live paste attempt — user's Fenteng_Shipment already had
Select_To_Ship (displayname "Select To Ship") + Status (type=textarea, not text)
from an earlier pass, before this file was even written. Original paste tried to
change Status's TYPE from textarea->text via source-paste, which errored generic
("An error has occurred. Please contact support@zohocreator.com") - the confirmed
AppIDE limitation (cannot change an EXISTING field's type via source-paste, only
Form Builder UI can, see CLAUDE.md Deluge Gotchas). Corrected: Status kept as
type=textarea (matches what's already live, functionally identical for storing
short strings like "In Transit"/"Arrived" - no downstream code cares whether it's
text vs textarea), Select_To_Ship kept with its existing displayname. Only
Shipment_No/PR_No/RR_No/Synced are genuinely new fields in this corrected paste.
Tony_Shipment's live state was NOT independently confirmed before this fix - check
its own current AppIDE source first before pasting, don't assume it matches
Fenteng's pre-existing extras.
====================================================
NOTES:
- `PR_No`/`RR_No` are pre-computed and stamped by the auto-create workflow
  (shipments_auto_create_supplier_shipment.txt) at the moment this record is
  created — reading `input.PO_Shipments`/`input.PO_No.RR_Reference_No` off the
  PARENT Shipments record, a safe `input`-context read. Deliberately NOT
  re-derived later at sync time by reading a subform off a criteria-queried
  record (the confirmed-unreliable platform pattern documented at length
  elsewhere in this codebase) — they just sit here, already computed, hidden
  from the supplier's own widget view (same as Synced).
- `Status` added to each supplier form's own grid row (text, matching the parent
  Shipments.Supplier_Shipment_Details.Status field's own type) — this is what the
  back-sync workflow (shipment_status_back_sync.txt) writes into once the buyer
  sets it on the parent side. Blank until synced once; supplier sees it read-only
  in their own widget (not native field-level lock — the widget itself just never
  renders an input for it, matching every other read-only-in-widget field in this
  app).
- `Synced` is a genuinely internal bookkeeping field — the widget should hide it
  entirely from the supplier's own UI (don't render a column/checkbox for it at
  all), it exists purely for the native sync workflow's own dedup logic.
- `Select_To_Ship` intentionally does NOT auto-reset to false after a successful
  sync — leaving it checked is the honest "yes I shipped this" record; `Synced`
  is what prevents re-processing, not clearing Select_To_Ship.
====================================================

````
