---
title: "stage_inquiry_changed_actions"
source_file: "stage_inquiry_changed_actions.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 261
tags:
  - deluge
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# stage_inquiry_changed_actions

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `stage_inquiry_changed_actions.txt`
> - **Lines of Code:** 261
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Stage_Inquiry_Changed — Action 2 (Supplier_2) and Action 3 (Supplier_1) ==
== edit_counter only sets when THAT supplier's quote fields changed ==
== "Selected" also sets edit_counter = 1 (so button stays clickable) ==

== FIXED 2026-08-05, real bug found live in Production: picking a supplier on the
   Inquiry made BOTH Supplier_1/Supplier_2 records show "Not Selected" instead of
   one Selected/one Not Selected. Root cause: `quote.Suppliers` (Inquiry's own
   Supplier_Quotes row) stores the FULL name ("Tony Fan"/"Fenteng Lighting"), while
   `sq.SupplierName` (each supplier record's own quote row) stores the SHORT name
   ("Tony"/"Fenteng") — same short-vs-full mismatch already documented elsewhere in
   this app (PRs widget's own `supplierKeyMatch()`). The exact `==` comparison here
   never matched, so `hasSelected` stayed false for both records regardless of what
   was actually picked, falling through to "Not Selected" for both via the
   `anySelected` branch. FIX: all 4 comparison sites (2 per action) now use a
   case-insensitive, either-direction `.contains()` check instead of exact `==`. ==

====================================================
FIXED 2026-07-09: added a Response_Status=="Completed" guard around each record's
entire body. Root cause found live: this script always recomputes Response_Status to
Selected/Not Selected/Submit Response on EVERY Inquiry edit, with no awareness that
Completed is supposed to be a terminal/permanent state (per finalization_scripts.txt's
own notes: "Completed is permanent — only way to revert is manual field edit"). Any
Inquiry save — even editing something unrelated — silently reverted an already-
Completed supplier straight back to "Selected", re-opening collateral edit and the
Submit button. Confirmed live: supplier reached Completed via the widget's own
auto-complete check, then a routine Inquiry edit flipped it right back to Selected.
Fix: wrap the whole per-record body in `if(r.Response_Status != "Completed")` so an
already-Completed record is left untouched by this sync, matching the same "Completed
is final" rule already enforced elsewhere (widget's own hard-lock, native
Disable_Item_Field_Edit_Supplier).
====================================================

====================================================
Action 2 (Supplier_2):
====================================================

rows = Supplier_2[INQ_No_Supplier == input.INQ_No];
for each  r in rows
{
	if(r.Response_Status != "Completed")
	{
		hasChanges = false;
		for each  sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each  quote in input.Supplier_Quotes
			{
				if(quote.Suppliers.toLowerCase().contains(matchingSupplierName.toLowerCase()) || matchingSupplierName.toLowerCase().contains(quote.Suppliers.toLowerCase()))
				{
					if(sq.Availability_Supplier != quote.Availability || sq.Initial_Price_Supplier != quote.Initial_Price || sq.Negotiated_Supplier != quote.Negotiated || sq.Final_Price_Supplier != quote.Final_Price || sq.Lead_Time_Supplier != quote.Lead_Time)
					{
						hasChanges = true;
					}
				}
			}
		}
		update r
		[
			SKU_Supplier=input.sku
			Target_Date_Supplier=input.target_date
			Items_Supplier=input.Items
			Quantity_Supplier=input.quantity
			Unit_Supplier=input.unit
			Description_Supplier=input.description
			Open_to_similar_design_Supplier=input.Open_to_similar_design
			Additional_Description_Supplier=input.Addtional_Description
		];
		if(hasChanges == true)
		{
			r.edit_counter = 1;
		}
		if(input.Product_Sample != "Required" && input.Product_Sample != "HideToSupplier")
		{
			r.Product_Sample_Supplier=input.Product_Sample;
		}
		if(input.D_Image != "Required" && input.D_Image != "HideToSupplier")
		{
			r.D_Image_Supplier=input.D_Image;
		}
		if(input.Specification != "Required" && input.Specification != "HideToSupplier")
		{
			r.Specification_Supplier=input.Specification;
		}
		if(input.Technical_Drawing != "Required" && input.Technical_Drawing != "HideToSupplier")
		{
			r.Technical_Drawing_Supplier=input.Technical_Drawing;
		}
		r.Specification_Details_Supplier=input.Specification_Details;
		hasSelected = false;
		for each  sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each  quote in input.Supplier_Quotes
			{
				if(quote.Suppliers.toLowerCase().contains(matchingSupplierName.toLowerCase()) || matchingSupplierName.toLowerCase().contains(quote.Suppliers.toLowerCase()))
				{
					sq.Availability_Supplier=quote.Availability;
					sq.Initial_Price_Supplier=quote.Initial_Price;
					sq.Negotiated_Supplier=quote.Negotiated;
					sq.Final_Price_Supplier=quote.Final_Price;
					sq.Lead_Time_Supplier=quote.Lead_Time;
					sq.Stage_Supplier=quote.Stage;
					sq.Selected_Supplier=quote.Selected;
					if(quote.Selected == true)
					{
						hasSelected = true;
					}
				}
			}
		}
		if(hasSelected == true)
		{
			r.Response_Status="Selected";
			r.edit_counter = 1;
		}
		else
		{
			anySelected = false;
			for each  quote in input.Supplier_Quotes
			{
				if(quote.Selected == true)
				{
					anySelected = true;
				}
			}
			if(anySelected == true)
			{
				r.Response_Status="Not Selected";
			}
			else
			{
				if(hasChanges == true)
				{
					r.Response_Status="Submit Response";
				}
			}
		}
	}
}

====================================================
Action 3 (Supplier_1):
====================================================

rows1 = Supplier_1[INQ_No_Supplier == input.INQ_No];
for each  r in rows1
{
	if(r.Response_Status != "Completed")
	{
		hasChanges = false;
		for each  sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each  quote in input.Supplier_Quotes
			{
				if(quote.Suppliers.toLowerCase().contains(matchingSupplierName.toLowerCase()) || matchingSupplierName.toLowerCase().contains(quote.Suppliers.toLowerCase()))
				{
					if(sq.Availability_Supplier != quote.Availability || sq.Initial_Price_Supplier != quote.Initial_Price || sq.Negotiated_Supplier != quote.Negotiated || sq.Final_Price_Supplier != quote.Final_Price || sq.Lead_Time_Supplier != quote.Lead_Time)
					{
						hasChanges = true;
					}
				}
			}
		}
		update r
		[
			SKU_Supplier=input.sku
			Target_Date_Supplier=input.target_date
			Items_Supplier=input.Items
			Quantity_Supplier=input.quantity
			Unit_Supplier=input.unit
			Description_Supplier=input.description
			Open_to_similar_design_Supplier=input.Open_to_similar_design
			Additional_Description_Supplier=input.Addtional_Description
		];
		if(hasChanges == true)
		{
			r.edit_counter = 1;
		}
		if(input.Product_Sample != "Required" && input.Product_Sample != "HideToSupplier")
		{
			r.Product_Sample_Supplier=input.Product_Sample;
		}
		if(input.D_Image != "Required" && input.D_Image != "HideToSupplier")
		{
			r.D_Image_Supplier=input.D_Image;
		}
		if(input.Specification != "Required" && input.Specification != "HideToSupplier")
		{
			r.Specification_Supplier=input.Specification;
		}
		if(input.Technical_Drawing != "Required" && input.Technical_Drawing != "HideToSupplier")
		{
			r.Technical_Drawing_Supplier=input.Technical_Drawing;
		}
		r.Specification_Details_Supplier=input.Specification_Details;
		hasSelected = false;
		for each  sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each  quote in input.Supplier_Quotes
			{
				if(quote.Suppliers.toLowerCase().contains(matchingSupplierName.toLowerCase()) || matchingSupplierName.toLowerCase().contains(quote.Suppliers.toLowerCase()))
				{
					sq.Availability_Supplier=quote.Availability;
					sq.Initial_Price_Supplier=quote.Initial_Price;
					sq.Negotiated_Supplier=quote.Negotiated;
					sq.Final_Price_Supplier=quote.Final_Price;
					sq.Lead_Time_Supplier=quote.Lead_Time;
					sq.Stage_Supplier=quote.Stage;
					sq.Selected_Supplier=quote.Selected;
					if(quote.Selected == true)
					{
						hasSelected = true;
					}
				}
			}
		}
		if(hasSelected == true)
		{
			r.Response_Status="Selected";
			r.edit_counter = 1;
		}
		else
		{
			anySelected = false;
			for each  quote in input.Supplier_Quotes
			{
				if(quote.Selected == true)
				{
					anySelected = true;
				}
			}
			if(anySelected == true)
			{
				r.Response_Status="Not Selected";
			}
			else
			{
				if(hasChanges == true)
				{
					r.Response_Status="Submit Response";
				}
			}
		}
	}
}

====================================================
== Inquiry_Form — On Delete: Remove Supplier Records ==
====================================================
WORKFLOW SETUP:
  Form: Inquiry_Form
  Trigger: Deleted
  Action: Execute script (paste below)
====================================================

delete from Supplier_2 [INQ_No_Supplier == input.INQ_No];
delete from Supplier_1 [INQ_No_Supplier == input.INQ_No];

====================================================

````
