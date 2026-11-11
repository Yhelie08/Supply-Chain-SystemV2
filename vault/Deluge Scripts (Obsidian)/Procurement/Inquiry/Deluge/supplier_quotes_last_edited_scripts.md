---
title: "supplier_quotes_last_edited_scripts"
source_file: "supplier_quotes_last_edited_scripts.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 320
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# supplier_quotes_last_edited_scripts

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `supplier_quotes_last_edited_scripts.txt`
> - **Lines of Code:** 320
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPPLIER QUOTES LAST EDITED — ALL SCRIPTS ==
== FIXED 2026-08-04, items 2/3 below: same real bug as edit_counter_scripts.txt/
   sideUpdateScript.txt — sq.Supplier_ID is a bracketed Creator record ID
   (env-specific), was compared against Development's own hardcoded literal.
   Now resolved through the Suppliers form's own Supplier_ID field (the real,
   environment-constant Books Contact ID) instead. See edit_counter_scripts.txt's
   own NOTES for the full writeup. ==

====================================================
1. INQ_Auto_Populate_Supplier_Quotes (Inquiry Form - Created > Validations on form submission)
   FULL SCRIPT — adds Supplier_Quotes_Last_Edited population at end
====================================================

maxNum = 0;
allInquiries = Inquiry_Form[ID != 0];
for each  rec in allInquiries
{
	try
	{
		currentNum = rec.INQ_No.replaceAll("[^0-9]","").toLong();
		if(currentNum > maxNum)
		{
			maxNum = currentNum;
		}
	}	catch (e)
	{
	}
}
newNum = maxNum + 1;
newNum_str = newNum.toString();
if(newNum < 10)
{
	newNum_str = "0000" + newNum_str;
}
else if(newNum < 100)
{
	newNum_str = "000" + newNum_str;
}
else if(newNum < 1000)
{
	newNum_str = "00" + newNum_str;
}
else if(newNum < 10000)
{
	newNum_str = "0" + newNum_str;
}
input.INQ_No = "INQ-" + newNum_str;
input.quote_group = input.Projects.Project_Code;
for each  sup in input.Suppliers
{
	supRecord = Suppliers[ID == sup];
	supName = supRecord.Supplier_Name.first_name;
	newRow = Inquiry_Form.Supplier_Quotes();
	newRow.Suppliers=supName;
	newRow.Supplier_ID=sup;
	newRow.Stage="Not Selected";
	input.Supplier_Quotes.insert(newRow);
}
for each  sup in input.Suppliers
{
	supRecord = Suppliers[ID == sup];
	supName = supRecord.Supplier_Name.first_name;
	newRow2 = Inquiry_Form.Supplier_Quotes_Last_Edited();
	newRow2.Suppliers_Last_Edited=supName;
	input.Supplier_Quotes_Last_Edited.insert(newRow2);
}

====================================================
2. Stage_Supplier_Changed Action 2 (Supplier_2 form)
   FULL SCRIPT — with Last Edited sync added before break
====================================================

inqNo = input.INQ_No_Supplier;
inqRecords = Inquiry_Form[INQ_No == inqNo];
for each  inq in inqRecords
{
	for each  sq in inq.Supplier_Quotes
	{
		sidRawD1 = sq.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdD1 = "";
		if(sidRawD1 != "")
		{
			for each  supRecD1 in Suppliers
			{
				if(supRecD1.ID + "" == sidRawD1) { quoteBooksIdD1 = supRecD1.Supplier_ID + ""; }
			}
		}
		if(quoteBooksIdD1 == "2680178000002735078")
		{
			for each  s2q in input.Supplier_quotes
			{
				sq.Availability=s2q.Availability_Supplier;
				sq.Initial_Price=s2q.Initial_Price_Supplier;
				sq.Negotiated=s2q.Negotiated_Supplier;
				sq.Final_Price=s2q.Final_Price_Supplier;
				sq.Lead_Time=s2q.Lead_Time_Supplier;
				sq.Stage=s2q.Stage_Supplier;
				break;
			}
			break;
		}
	}
	if(inq.Product_Sample != "HideToSupplier")
	{
		inq.Product_Sample=input.Product_Sample_Supplier;
	}
	if(inq.D_Image != "HideToSupplier")
	{
		inq.D_Image=input.D_Image_Supplier;
	}
	if(inq.Specification != "HideToSupplier")
	{
		inq.Specification=input.Specification_Supplier;
		inq.Specification_Details=input.Specification_Details_Supplier;
	}
	if(inq.Technical_Drawing != "HideToSupplier")
	{
		inq.Technical_Drawing=input.Technical_Drawing_Supplier;
	}
	simPhotoStr = input.Similar_Design_Photo_Supplier + "";
	if(input.Similar_Design_Photo_Supplier != null && simPhotoStr != "" && simPhotoStr != "{}" && simPhotoStr != "[]")
	{
		simDesignImgList = List();
		simDesignImgList.add(input.Similar_Design_Photo_Supplier);
		inq.Similar_Design_Photo=simDesignImgList;
	}
	for each  leRow in inq.Supplier_Quotes_Last_Edited
	{
		for each  s2q in input.Supplier_quotes
		{
			if(leRow.Suppliers_Last_Edited == s2q.SupplierName)
			{
				leRow.Availability_Last_Edited=s2q.Availability_Supplier;
				leRow.Initial_Price_Last_Edited=s2q.Initial_Price_Supplier;
				leRow.Negotiated_Last_Edited=s2q.Negotiated_Supplier;
				leRow.Final_Price_Last_Edited=s2q.Final_Price_Supplier;
				leRow.Lead_Time_Last_Edited=s2q.Lead_Time_Supplier;
			}
		}
	}
	break;
}
openUrl("#Report:Supplier_2_Report", "same window");

====================================================
3. Stage_Supplier_Changed Action 2 (Supplier_1 form)
   FULL SCRIPT — with Last Edited sync added before break
====================================================

inqNo = input.INQ_No_Supplier;
inqRecords = Inquiry_Form[INQ_No == inqNo];
for each  inq in inqRecords
{
	for each  sq in inq.Supplier_Quotes
	{
		sidRawD2 = sq.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdD2 = "";
		if(sidRawD2 != "")
		{
			for each  supRecD2 in Suppliers
			{
				if(supRecD2.ID + "" == sidRawD2) { quoteBooksIdD2 = supRecD2.Supplier_ID + ""; }
			}
		}
		if(quoteBooksIdD2 == "2680178000049168001")
		{
			for each  s2q in input.Supplier_quotes
			{
				sq.Availability=s2q.Availability_Supplier;
				sq.Initial_Price=s2q.Initial_Price_Supplier;
				sq.Negotiated=s2q.Negotiated_Supplier;
				sq.Final_Price=s2q.Final_Price_Supplier;
				sq.Lead_Time=s2q.Lead_Time_Supplier;
				sq.Stage=s2q.Stage_Supplier;
				break;
			}
			break;
		}
	}
	if(inq.Product_Sample != "HideToSupplier")
	{
		inq.Product_Sample=input.Product_Sample_Supplier;
	}
	if(inq.D_Image != "HideToSupplier")
	{
		inq.D_Image=input.D_Image_Supplier;
	}
	if(inq.Specification != "HideToSupplier")
	{
		inq.Specification=input.Specification_Supplier;
		inq.Specification_Details=input.Specification_Details_Supplier;
	}
	if(inq.Technical_Drawing != "HideToSupplier")
	{
		inq.Technical_Drawing=input.Technical_Drawing_Supplier;
	}
	simPhotoStr = input.Similar_Design_Photo_Supplier + "";
	if(input.Similar_Design_Photo_Supplier != null && simPhotoStr != "" && simPhotoStr != "{}" && simPhotoStr != "[]")
	{
		simDesignImgList = List();
		simDesignImgList.add(input.Similar_Design_Photo_Supplier);
		inq.Similar_Design_Photo=simDesignImgList;
	}
	for each  leRow in inq.Supplier_Quotes_Last_Edited
	{
		for each  s2q in input.Supplier_quotes
		{
			if(leRow.Suppliers_Last_Edited == s2q.SupplierName)
			{
				leRow.Availability_Last_Edited=s2q.Availability_Supplier;
				leRow.Initial_Price_Last_Edited=s2q.Initial_Price_Supplier;
				leRow.Negotiated_Last_Edited=s2q.Negotiated_Supplier;
				leRow.Final_Price_Last_Edited=s2q.Final_Price_Supplier;
				leRow.Lead_Time_Last_Edited=s2q.Lead_Time_Supplier;
			}
		}
	}
	break;
}
openUrl("#Report:Supplier_1_Report", "same window");

====================================================
4. Disable_Supplier_Quotes_LastEdited (Inquiry Form - Created or Edited > Load of form)
   ADDED 2026-07-08: disable INQ_No plus 6 more auto-populated/system-only fields
   (Inquiry polish pass, field link names confirmed via live full-form field dump).
   All folded into this SAME existing Created-or-Edited > Load-of-form action rather
   than adding a new trigger, per this codebase's convention.
   - INQ_No: auto-generated on create (script 1 above, `input.INQ_No = "INQ-"+...`)
   - quote_group: auto-set from `Projects.Project_Code` on create — editing it breaks
     the sibling-inquiry lookup (`Inquiry_Form[quote_group==...]`) used throughout the
     estimate sync
   - sku / description / unit: auto-filled from `Items` selection via
     INQ_AutoFill_Item_Details (SyncItemsCust/CLAUDE.md) — manual edit could desync
     from the actually-selected item
   - SRP_Approved1: auto-filled from `Items.Rate` (INQ_AutoFill_Item_Details)
   - Books_Estimate_No / Books_Estimate_ID: system-only, set by the Books estimate
     sync scripts — manual edit would silently break the Creator<->Books link
   - Estimate_Created: gate checkbox the estimate-create logic reads — manual toggle
     could cause it to silently skip creating an estimate, or re-fire wrongly
   - created_date: auto-set to `zoho.currentdate` on create, no reason editable after
   - Product_Image: auto-populated from `Items.Image` (per user, same INQ_AutoFill_Item_Details
     family as sku/description/unit/SRP_Approved1)
   - Project_Name: per user, already auto-populated from the `Projects` lookup (confirmed
     live via screenshot — selecting Projects="Test Project" mirrors Project_Name)
   - Customer_Type: per user, already auto-populated from `Customer` selection (live
     workflow `INQ_AutoFill_Customer_Type`, Created or Edited > User input of Customer)
====================================================

disable Supplier_Quotes_Last_Edited.Suppliers_Last_Edited;
disable Supplier_Quotes_Last_Edited.Availability_Last_Edited;
disable Supplier_Quotes_Last_Edited.Initial_Price_Last_Edited;
disable Supplier_Quotes_Last_Edited.Negotiated_Last_Edited;
disable Supplier_Quotes_Last_Edited.Final_Price_Last_Edited;
disable Supplier_Quotes_Last_Edited.Lead_Time_Last_Edited;
disable INQ_No;
disable quote_group;
disable sku;
disable description;
disable unit;
disable SRP_Approved1;
disable Books_Estimate_No;
disable Books_Estimate_ID;
disable Estimate_Created;
disable created_date;
disable Product_Image;
disable Project_Name;
disable Customer_Type;

====================================================
NOTES (added 2026-07-08):
- BUG confirmed live: after adding the HideToSupplier hide/disable override
  (finalization_scripts.txt), the Inquiry's own "HideToSupplier" collateral values got
  silently wiped back to blank ("-Select-") after a SUPPLIER saved their response (not
  an Inquiry edit itself — user initially thought it was, screenshots showed it was
  actually a Tony Fan supplier-side submit). Root cause: `Stage_Supplier_Changed`
  Action 2 (items 2/3, this same file) unconditionally synced collateral values BACK
  from supplier -> Inquiry on every supplier save (`inq.Product_Sample=input.
  Product_Sample_Supplier;` etc). Since a HideToSupplier field is now hidden from the
  supplier, `input.Product_Sample_Supplier` stays permanently blank on their form — so
  this sync-back kept clobbering the Inquiry's real "HideToSupplier" value with blank,
  every single time the supplier saved ANYTHING (price, availability, unrelated
  fields). FIXED: each of the 4 collateral sync-back lines now only overwrites the
  Inquiry field if it ISN'T currently "HideToSupplier" — makes HideToSupplier sticky/
  authoritative on the Inquiry side, while still allowing normal two-way sync for
  fields that aren't hidden. UNTESTED — needs a live retest: set a field to
  HideToSupplier on Inquiry, have a supplier save their response, confirm the
  Inquiry's value survives.
- BUG confirmed live: submitting a Tony Fan (Supplier_2) response with no Similar Design
  Photo uploaded threw "Unable to update the value to inq.Similar_Design_Photo ...
  Invalid value assigned for the field '{}'. Provide a valid path or file to the
  multi-file/image upload field." The `!= null` guard (added 2026-07-03, see NOTES
  below) wasn't enough — an unset `Similar_Design_Photo_Supplier` reads back as an
  empty `{}` object, not true Deluge null, so the guard passed and the wrap-in-List
  assignment failed on the empty object. FIXED: guard now also stringifies the value
  and rejects `""`/`"{}"`/`"[]"` in addition to the null check, in both Action 2 copies
  (items 2 and 3 below). UNTESTED — first live retest still needed after this fix.
====================================================
NOTES (added 2026-07-03):
- BUG fixed: `Similar_Design_Photo_Supplier` (submitted by supplier alongside the other
  collateral fields — Product_Sample/D_Image/Specification/Technical_Drawing) was never
  synced back to Inquiry_Form. Items 2 and 3 above (`Stage_Supplier_Changed` Action 2 on
  both Supplier_1 and Supplier_2) already synced the other four collateral fields but
  missed this one — added `inq.Similar_Design_Photo=input.Similar_Design_Photo_Supplier;`
  alongside them in both scripts.
- CONFIRMED: the guessed field link name `Similar_Design_Photo` on Inquiry_Form was
  correct (naming convention held — every other collateral field drops the `_Supplier`
  suffix). Field exists, no need to add it.
- BUG confirmed live 2026-07-03: direct assignment
  `inq.Similar_Design_Photo=input.Similar_Design_Photo_Supplier;` failed —
  "Invalid value assigned for the field 'Similar_Design_Photo'. Provide a valid path or
  file to the multi-file/image upload field." `Similar_Design_Photo` on Inquiry_Form is
  an "Image/s" (multi-image) field, same as `Product_Image_Supplier1/2_INQ` documented
  in `sideUpdateScript.txt` — must assign a `List()` wrapping the single source value,
  not the raw value directly (Deluge silently/hard-fails on multi-image fields given a
  single File/Image value). FIXED using the exact same `imgList = List();
  imgList.add(source); target = imgList;` pattern already proven in
  `sideUpdateScript.txt` for the Items.Image -> Product_Image_Supplier1/2_INQ sync,
  wrapped in `if(input.Similar_Design_Photo_Supplier != null)` since the supplier may not
  have uploaded one yet (avoids assigning a List containing a null entry).
====================================================

````
