---
title: "sideUpdateScript"
source_file: "sideUpdateScript.txt"
category: "_Shared/Deluge/_Unlabelled/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 382
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# sideUpdateScript

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `_Shared/Deluge/_Unlabelled/Deluge`
> - **Source File:** `sideUpdateScript.txt`
> - **Lines of Code:** 382
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SIDE UPDATE: Product Image on Supplier reports ==
== Fields: Product_Image_Supplier2_INQ (Supplier_2), Product_Image_Supplier1_INQ (Supplier_1) ==
== Source: Items.Image, matched via input.Items ==

====================================================
REAL ROOT CAUSE FOUND 2026-07-09 (5th pass) — PLATFORM LIMITATION, NOT A SCRIPT BUG
Confirmed via Zoho's own docs (help.zoho.com/.../fields-image-understand): multi-image
("Image/s", "allow multiple images") fields do NOT support assignment via workflows —
"Assignment via workflows... is not supported" / "In subforms, image files can't be
added or updated via workflows." Zoho silently no-ops the assignment — no error, no
crash. This is exactly why 4 passes of script changes today all failed identically
despite confirmed-real source data (Items.Image), confirmed-correct field names, and
logic that otherwise ran fine (Product_Sample_Supplier etc. in the same block saved
correctly every time).
Product_Image_Supplier1_INQ / Product_Image_Supplier2_INQ were configured as multi-image
fields (List() assignment required — see prior versions of this file). The PR-side
equivalent (Product_Image_Supplier1_PR / _Supplier2_PR, sideUpdateScriptPR.txt, CONFIRMED
WORKING) are SINGLE "Image" fields, not multi — single-Image fields DO support workflow
assignment. That's the actual difference that made one work and the other silently never
work.
FIX REQUIRES A FORM CHANGE FIRST (not just this script): in Zoho Creator, change
Product_Image_Supplier1_INQ (Supplier_1 form) and Product_Image_Supplier2_INQ
(Supplier_2 form) from multi-image ("allow multiple images") to a single Image field —
matching Product_Image_Supplier1_PR/_Supplier2_PR exactly. Do this BEFORE pasting the
script below; the List()-based version will keep silently no-op'ing until the field type
is changed.
====================================================

====================================================
1. Supplier_Populate_From_INQ (Inquiry Form - Created > Successful form submission)
   Action 1 = Supplier_2, Action 2 = Supplier_1
====================================================

== FIXED 2026-08-04, same real bug/fix as edit_counter_scripts.txt (see that
   file's own NOTES for the full writeup) — quote.Supplier_ID is a bracketed
   Creator record ID, differs per environment; resolved through the Suppliers
   form's own Supplier_ID field (the real, environment-constant Books Contact
   ID) instead. Only Section 1 below needed this — Sections 2/3
   (Stage_Inquiry_Changed) already match by plain-text Supplier NAME, already
   environment-safe, untouched. ==

ACTION 1 (Supplier_2):

itemRec = Items[ID == input.Items];

== FIXED 2026-08-05, same real bug as edit_counter_scripts.txt (see that file's own
   NOTES for the full writeup) — INQ_No_Supplier below used to read input.INQ_No
   directly, which can still be stale at Create time if a SEPARATE workflow
   (INQ_Generate_Number) hasn't yet overwritten it with the real INQ_Seq-based
   number. Computed directly from input.INQ_Seq instead, same padding as
   INQ_Generate_Number, guaranteed race-free since Auto-Number fields are set by
   the platform before any workflow runs at all. ==
seqValB1 = input.INQ_Seq;
paddedSeqB1 = "";
if(seqValB1 < 10) { paddedSeqB1 = "0000" + seqValB1; }
else if(seqValB1 < 100) { paddedSeqB1 = "000" + seqValB1; }
else if(seqValB1 < 1000) { paddedSeqB1 = "00" + seqValB1; }
else if(seqValB1 < 10000) { paddedSeqB1 = "0" + seqValB1; }
else { paddedSeqB1 = seqValB1 + ""; }
computedInqNoB1 = "INQ-" + paddedSeqB1;

hasSupplier2 = false;
for each  quote in input.Supplier_Quotes
{
	sidRawB1 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdB1 = "";
	if(sidRawB1 != "")
	{
		for each  supRecB1 in Suppliers
		{
			if(supRecB1.ID + "" == sidRawB1) { quoteBooksIdB1 = supRecB1.Supplier_ID + ""; }
		}
	}
	if(quoteBooksIdB1 == "2680178000002735078")
	{
		hasSupplier2 = true;
	}
}
if(hasSupplier2 == true)
{
	newRecID = insert into Supplier_2
	[
		INQ_No_Supplier=computedInqNoB1
		SKU_Supplier=input.sku
		Target_Date_Supplier=input.target_date
		Items_Supplier=input.Items
		Quantity_Supplier=input.quantity
		Unit_Supplier=input.unit
		Description_Supplier=input.description
		Date_Created_Supplier=input.created_date
		Open_to_similar_design_Supplier=input.Open_to_similar_design
		Additional_Description_Supplier=input.Addtional_Description
		Added_User=zoho.loginuser
		Response_Status="Waiting"
		edit_counter=1
	];
	newRec = Supplier_2[ID == newRecID];
	if(itemRec != null && itemRec.Image != null)
	{
		newRec.Product_Image_Supplier2_INQ = itemRec.Image;
	}
	for each  quote in input.Supplier_Quotes
	{
		sidRawB1b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdB1b = "";
		if(sidRawB1b != "")
		{
			for each  supRecB1b in Suppliers
			{
				if(supRecB1b.ID + "" == sidRawB1b) { quoteBooksIdB1b = supRecB1b.Supplier_ID + ""; }
			}
		}
		if(quoteBooksIdB1b == "2680178000002735078")
		{
			row1 = Supplier_2.Supplier_quotes();
			row1.SupplierName=quote.Suppliers;
			row1.Availability_Supplier=quote.Availability;
			row1.Initial_Price_Supplier=quote.Initial_Price;
			row1.Negotiated_Supplier=quote.Negotiated;
			row1.Final_Price_Supplier=quote.Final_Price;
			row1.Lead_Time_Supplier=quote.Lead_Time;
			row1.Stage_Supplier=quote.Stage;
			row1.Selected_Supplier=quote.Selected;
			newRec.Supplier_quotes.insert(row1);
		}
	}
}

ACTION 2 (Supplier_1 — separate action):

itemRec = Items[ID == input.Items];

seqValB2 = input.INQ_Seq;
paddedSeqB2 = "";
if(seqValB2 < 10) { paddedSeqB2 = "0000" + seqValB2; }
else if(seqValB2 < 100) { paddedSeqB2 = "000" + seqValB2; }
else if(seqValB2 < 1000) { paddedSeqB2 = "00" + seqValB2; }
else if(seqValB2 < 10000) { paddedSeqB2 = "0" + seqValB2; }
else { paddedSeqB2 = seqValB2 + ""; }
computedInqNoB2 = "INQ-" + paddedSeqB2;

hasSupplier1 = false;
for each  quote in input.Supplier_Quotes
{
	sidRawB2 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdB2 = "";
	if(sidRawB2 != "")
	{
		for each  supRecB2 in Suppliers
		{
			if(supRecB2.ID + "" == sidRawB2) { quoteBooksIdB2 = supRecB2.Supplier_ID + ""; }
		}
	}
	if(quoteBooksIdB2 == "2680178000049168001")
	{
		hasSupplier1 = true;
	}
}
if(hasSupplier1 == true)
{
	newRecID1 = insert into Supplier_1
	[
		INQ_No_Supplier=computedInqNoB2
		SKU_Supplier=input.sku
		Target_Date_Supplier=input.target_date
		Items_Supplier=input.Items
		Quantity_Supplier=input.quantity
		Unit_Supplier=input.unit
		Description_Supplier=input.description
		Date_Created_Supplier=input.created_date
		Open_to_similar_design_Supplier=input.Open_to_similar_design
		Additional_Description_Supplier=input.Addtional_Description
		Response_Status="Waiting"
		edit_counter=1
	];
	newRec1 = Supplier_1[ID == newRecID1];
	if(itemRec != null && itemRec.Image != null)
	{
		newRec1.Product_Image_Supplier1_INQ = itemRec.Image;
	}
	for each  quote in input.Supplier_Quotes
	{
		sidRawB2b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdB2b = "";
		if(sidRawB2b != "")
		{
			for each  supRecB2b in Suppliers
			{
				if(supRecB2b.ID + "" == sidRawB2b) { quoteBooksIdB2b = supRecB2b.Supplier_ID + ""; }
			}
		}
		if(quoteBooksIdB2b == "2680178000049168001")
		{
			row1 = Supplier_1.Supplier_quotes();
			row1.SupplierName=quote.Suppliers;
			row1.Availability_Supplier=quote.Availability;
			row1.Initial_Price_Supplier=quote.Initial_Price;
			row1.Negotiated_Supplier=quote.Negotiated;
			row1.Final_Price_Supplier=quote.Final_Price;
			row1.Lead_Time_Supplier=quote.Lead_Time;
			row1.Stage_Supplier=quote.Stage;
			row1.Selected_Supplier=quote.Selected;
			newRec1.Supplier_quotes.insert(row1);
		}
	}
}

====================================================
2. Stage_Inquiry_Changed (Inquiry Form - Created or Edited > Successful form submission)
   Action 2 = Supplier_2 sync
====================================================

itemRec = Items[ID == input.Items];

rows = Supplier_2[INQ_No_Supplier == input.INQ_No];
for each  r in rows
{
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
		edit_counter=1
	];
	if(itemRec != null && itemRec.Image != null)
	{
		r.Product_Image_Supplier2_INQ=itemRec.Image;
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
			if(quote.Suppliers == matchingSupplierName)
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
		r.Response_Status="Submit Response";
	}
	else
	{
		r.Response_Status="Waiting";
	}
}

====================================================
3. Stage_Inquiry_Changed (Inquiry Form)
   Action 3 = Supplier_1 sync (separate action)
====================================================

itemRec = Items[ID == input.Items];

rows1 = Supplier_1[INQ_No_Supplier == input.INQ_No];
for each  r in rows1
{
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
		edit_counter=1
	];
	if(itemRec != null && itemRec.Image != null)
	{
		r.Product_Image_Supplier1_INQ=itemRec.Image;
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
			if(quote.Suppliers == matchingSupplierName)
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
		r.Response_Status="Submit Response";
	}
	else
	{
		r.Response_Status="Waiting";
	}
}

====================================================
NOTES:
- PREREQUISITE (do first, in Creator form builder, not Deluge): change
  Product_Image_Supplier1_INQ (Supplier_1) and Product_Image_Supplier2_INQ (Supplier_2)
  from multi-image ("allow multiple images") to a single Image field. Multi-image fields
  silently reject workflow assignment entirely (confirmed via Zoho's own docs) — no
  amount of script correctness fixes that, only the field type change does.
- Once single-Image: assign itemRec.Image DIRECTLY, no List() wrap — List() would now
  throw "LIST value cannot be assigned to '<field>'" (same error already seen and fixed
  this exact way on the PR-side fields, sideUpdateScriptPR.txt).
- itemRec = Items[ID == input.Items] works because these actions run directly on the
  Inquiry Form (input.Items is direct input context — see Deluge Gotchas in CLAUDE.md).
  Do NOT reuse this pattern on a fetched record (e.g. Items[ID == r.Items]) — BIGINT error.
- Guard itemRec != null in case Items lookup is empty on the Inquiry.
- EXISTING BAD DATA: only fixes the sync going forward. Records already created before
  this fix stay blank until that Inquiry is edited/re-saved once, or backfilled manually.
- SupplierPortal widgets (UI/SupplierPortal/Fenteng-Inquiries, Tony-Inquiries) already
  read this field correctly via ZOHO.CREATOR.DATA.getRecordById + setImageData
  (applyCreatorImage unwraps an array if present) — no widget change needed once the
  field type + this script are both fixed. The array-unwrap logic there is now dead code
  for a single-Image field but harmless to leave (Array.isArray check just falls through).
- PR-side image sync (Fenteng_Lighting_Purchase_Request / Tony_Fan_Purchase_Request,
  including images arriving via Books SO approval) is in sideUpdateScriptPR.txt — this
  is the pattern that was already proven working and that this file now matches.
====================================================

````
