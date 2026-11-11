---
title: "finalization_scripts"
source_file: "finalization_scripts.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 212
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# finalization_scripts

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `finalization_scripts.txt`
> - **Lines of Code:** 212
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== FINALIZATION — "Completed" STATE ==
== When selected supplier fills all collateral → permanently locked ==
== Checks: Product_Sample, D_Image, Specification, Technical_Drawing == "Completed" ==
==         Specification_Details != blank ==
== Similar_Design_Photo not required ==

====================================================
UPDATED TABLE:
====================================================
| State                  | Response_Status  | edit_counter | Button | Quotes   | Collateral |
| Initial                | Waiting          | 1            | Shows  | Enabled  | Disabled   |
| Supplier submitted     | Waiting          | 0            | Hidden | Enabled  | Disabled   |
| Inquiry changed quotes | Submit Response  | 1            | Shows  | Enabled  | Disabled   |
| Winner chosen          | Selected         | 1            | Shows  | Disabled | Enabled    |
| Loser                  | Not Selected     | 0            | Hidden | Disabled | Disabled   |
| All collateral done    | Completed        | 0            | Hidden | Disabled | Disabled   |

====================================================
1. Stage_Supplier_Changed Action 1 (BOTH Supplier_1 and Supplier_2)
   Stage logic + edit_counter + completion check
   FULL SCRIPT:
====================================================

for each  s2q in input.Supplier_quotes
{
	nego = s2q.Negotiated_Supplier;
	fp = s2q.Final_Price_Supplier;
	if(nego != null && nego != 0 && fp != null && fp != 0)
	{
		s2q.Stage_Supplier="Final";
	}
	else if(nego != null && nego != 0 || fp != null && fp != 0)
	{
		s2q.Stage_Supplier="Negotiating";
	}
	else
	{
		s2q.Stage_Supplier="Not Selected";
	}
}
if(input.Response_Status != "Selected")
{
	input.edit_counter = 0;
}
if(input.Response_Status == "Selected")
{
	if(input.Product_Sample_Supplier == "Completed" && input.D_Image_Supplier == "Completed" && input.Specification_Supplier == "Completed" && input.Technical_Drawing_Supplier == "Completed" && input.Specification_Details_Supplier != null && input.Specification_Details_Supplier != "")
	{
		input.Response_Status = "Completed";
		input.edit_counter = 0;
	}
}

====================================================
2. Disable_Item_Field_Edit_Supplier Action 1 (BOTH Supplier_1 and Supplier_2)
   Edited > Load of form
   FULL SCRIPT:
   NOTE: "update Form[...][col1 col2]" multi-column task NOT allowed in Load of form.
         Use dot-notation (rec.field = value) for DB updates here.
====================================================

if(input.Response_Status == "Selected")
{
	if(input.Product_Sample_Supplier == "Completed" && input.D_Image_Supplier == "Completed" && input.Specification_Supplier == "Completed" && input.Technical_Drawing_Supplier == "Completed" && input.Specification_Details_Supplier != null && input.Specification_Details_Supplier != "")
	{
		input.Response_Status = "Completed";
		input.edit_counter = 0;
		recs = Supplier_2[ID == input.ID];
		for each rec in recs
		{
			rec.Response_Status = "Completed";
			rec.edit_counter = 0;
		}
	}
}
disable INQ_No_Supplier;
disable SKU_Supplier;
disable Target_Date_Supplier;
disable Items_Supplier;
disable Quantity_Supplier;
disable Unit_Supplier;
disable Description_Supplier;
disable Dropdown1;
disable Dropdown2;
disable Date_Created_Supplier;
disable Open_to_similar_design_Supplier;
disable Additional_Description_Supplier;
disable Response_Status;
disable edit_counter;
disable Supplier_quotes.SupplierName;
disable Supplier_quotes.Stage_Supplier;
disable Supplier_quotes.Selected_Supplier;
if(input.Response_Status == "Completed")
{
	disable Supplier_quotes.Availability_Supplier;
	disable Supplier_quotes.Initial_Price_Supplier;
	disable Supplier_quotes.Negotiated_Supplier;
	disable Supplier_quotes.Final_Price_Supplier;
	disable Supplier_quotes.Lead_Time_Supplier;
	disable Product_Sample_Supplier;
	disable D_Image_Supplier;
	disable Specification_Supplier;
	disable Specification_Details_Supplier;
	disable Technical_Drawing_Supplier;
	disable Similar_Design_Photo_Supplier;
}
if(input.Response_Status == "Not Selected")
{
	disable Supplier_quotes.Availability_Supplier;
	disable Supplier_quotes.Initial_Price_Supplier;
	disable Supplier_quotes.Negotiated_Supplier;
	disable Supplier_quotes.Final_Price_Supplier;
	disable Supplier_quotes.Lead_Time_Supplier;
}
if(input.Response_Status == "Selected")
{
	disable Supplier_quotes.Availability_Supplier;
	disable Supplier_quotes.Initial_Price_Supplier;
	disable Supplier_quotes.Negotiated_Supplier;
	disable Supplier_quotes.Final_Price_Supplier;
	disable Supplier_quotes.Lead_Time_Supplier;
}
if(input.Response_Status != "Selected" && input.Response_Status != "Completed")
{
	disable Product_Sample_Supplier;
	disable D_Image_Supplier;
	disable Specification_Supplier;
	disable Specification_Details_Supplier;
	disable Technical_Drawing_Supplier;
	disable Similar_Design_Photo_Supplier;
}
// === ADDED 2026-07-08: HideToSupplier override — runs LAST, unconditionally, so it
// wins over the Selected-based enable above. A field the Inquiry marked HideToSupplier
// must stay invisible to the supplier even once they're the winning/Selected supplier.
inqRecsHide = Inquiry_Form[INQ_No == input.INQ_No_Supplier];
inqProductSampleHide = "";
inqDImageHide = "";
inqSpecificationHide = "";
inqTechnicalDrawingHide = "";
for each  iqh in inqRecsHide
{
	inqProductSampleHide = iqh.Product_Sample;
	inqDImageHide = iqh.D_Image;
	inqSpecificationHide = iqh.Specification;
	inqTechnicalDrawingHide = iqh.Technical_Drawing;
}
if(inqProductSampleHide == "HideToSupplier")
{
	hide Product_Sample_Supplier;
	disable Product_Sample_Supplier;
}
if(inqDImageHide == "HideToSupplier")
{
	hide D_Image_Supplier;
	disable D_Image_Supplier;
}
if(inqSpecificationHide == "HideToSupplier")
{
	hide Specification_Supplier;
	disable Specification_Supplier;
	hide Specification_Details_Supplier;
	disable Specification_Details_Supplier;
}
if(inqTechnicalDrawingHide == "HideToSupplier")
{
	hide Technical_Drawing_Supplier;
	disable Technical_Drawing_Supplier;
}

====================================================
3. Report Action Item condition (BOTH Supplier_1 and Supplier_2 reports)
====================================================

Response_Status != "Not Selected" && Response_Status != "Completed" && edit_counter == 1

====================================================
4. Stage_Inquiry_Changed Action 2 (Supplier_2) — NO CHANGES
   Already in stage_inquiry_changed_actions.txt
====================================================

5. Stage_Inquiry_Changed Action 3 (Supplier_1) — NO CHANGES
   Already in stage_inquiry_changed_actions.txt

====================================================
NOTES:
- "Completed" is permanent — only way to revert is manual field edit
- Completion check runs on supplier form save (Stage_Supplier_Changed Action 1)
- Only checks when Response_Status == "Selected" (can't complete if not winner)
- Similar_Design_Photo not part of completion check
- Specification_Details checked for non-blank (not "Completed" dropdown)
- ADDED 2026-07-08: user reported the HideToSupplier collateral option (Product_Sample/
  D_Image/Specification/Technical_Drawing dropdown, confirmed live via screenshot —
  choices are Required/HideToSupplier/Completed/Pending/N/A) wasn't actually hiding
  anything from the supplier, even after they became the Selected/winning supplier.
  Root cause: this script (`Disable_Item_Field_Edit_Supplier` Action 1) only ever
  toggled `disable`/enable based on `Response_Status` — nothing here read the Inquiry's
  HideToSupplier value at all. The sync scripts (supplier1_workflow_changes.txt,
  edit_counter_scripts.txt) only skip COPYING the value when HideToSupplier, they never
  hide the field itself, and once Response_Status=="Selected" this script force-enables
  all 4 collateral fields unconditionally with no per-field override. FIXED: appended a
  new block at the very end of this script (runs last, unconditionally, so it always
  overrides the Selected-enable above) that fetches the linked Inquiry
  (`Inquiry_Form[INQ_No == input.INQ_No_Supplier]`) and, per collateral field, calls
  BOTH `hide` and `disable` on the matching `_Supplier` field whenever that Inquiry
  field's value is exactly "HideToSupplier" — true visual hide, not just greyed-out.
  `Specification_Details_Supplier` is hidden alongside `Specification_Supplier` since
  it's just elaboration text for that same field, no separate HideToSupplier value of
  its own. `Similar_Design_Photo_Supplier` NOT included — its Inquiry-side counterpart
  (`Similar_Design_Photo`) is a plain upload-file field with no HideToSupplier-style
  dropdown, so there's nothing to key this logic off for that field; leave as-is unless
  told otherwise. UNTESTED — first time this addition has been pasted/run live.
====================================================

````
