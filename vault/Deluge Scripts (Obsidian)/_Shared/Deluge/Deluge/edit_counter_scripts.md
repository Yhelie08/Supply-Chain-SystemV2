---
title: "edit_counter_scripts"
source_file: "edit_counter_scripts.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 589
tags:
  - deluge
  - fulfillment
  - inquiry
  - notification
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# edit_counter_scripts

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `edit_counter_scripts.txt`
> - **Lines of Code:** 589
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#notification`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== EDIT COUNTER SYSTEM ==
== Field: edit_counter (Number) on both Supplier_1 and Supplier_2 ==
== 1 = supplier can edit, 0 = locked ==
== Report Action Item condition: edit_counter == 1 ==

====================================================
1. Supplier_Populate_From_INQ (Inquiry Form - Created > Successful form submission)
   Action 1 = Supplier_2, Action 2 = Supplier_1
====================================================

== FIXED 2026-08-04, real bug found live in Production (INQ-00007 created zero
   supplier records — matched nothing, no error): quote.Supplier_ID on the
   Inquiry's own Supplier_Quotes subform is a bracketed CREATOR RECORD ID
   pointing at a row in the Suppliers form — NOT a stable value, Creator
   assigns different record IDs per environment. The hardcoded literals below
   ("[4662244000012469015]"/"[4662244000012938023]") are Development's own
   Suppliers.ID values — Production's real Suppliers rows have completely
   different IDs (confirmed live: 4662244000014031308/4662244000014031306),
   so these comparisons silently matched nothing there. FIX, per user request
   ("i wanna use Books contact IDs because that is constant id for that
   supplier specifically") — confirmed live that Suppliers.Supplier_ID (a
   DIFFERENT field, on the Suppliers form itself, not the Inquiry's subform)
   already stores the real Books Contact ID and is genuinely IDENTICAL across
   Dev/Prod (2680178000049168001 Fenteng / 2680178000002735078 Tony,
   confirmed via a live pull of both environments' Suppliers records). Every
   comparison now resolves quote.Supplier_ID -> its Suppliers row -> that
   row's own Books-Contact-ID field, then compares against the constant
   instead of comparing the raw Creator ID directly. ==

ACTION 1 (Supplier_2 / Tony):
== RECAPTURED 2026-08-04 from live Temp.txt — local file was missing: itemRec
   image copy, thisapp.environment.type URL detection, Tony_Notifications insert.
   Books Contact ID fix applied on top (replaces hardcoded Dev Creator record ID
   "[4662244000012938023]" with Suppliers lookup → Books Contact ID comparison). ==

== FIXED 2026-08-05, real bug found live in Production: INQ_No_Supplier below used to
   read input.INQ_No directly — but a SEPARATE workflow (INQ_Generate_Number,
   inquiry_generate_inq_no.txt) also writes the real INQ_No from input.INQ_Seq on this
   SAME Created > Successful form submission trigger, and depending on which of the
   two same-trigger-type workflows Creator runs first, input.INQ_No can still be
   stale here. Confirmed live: Production's Supplier_1/Supplier_2 records both got
   INQ_No_Supplier="INQ-00001" (this file's own item 1 old max+1-scan default for a
   brand-new max-0 environment) while the real Inquiry was INQ-00014 — Stage_Supplier_
   Changed's own lookup (Inquiry_Form[INQ_No==input.INQ_No_Supplier]) then matched
   nothing at all, so supplier responses never synced back. FIX: compute the real
   INQ_No directly from input.INQ_Seq here too (same padding logic as
   INQ_Generate_Number) instead of trusting input.INQ_No — INQ_Seq is a platform
   Auto-Number field, always populated before ANY workflow runs, so this can't race. ==

itemRec = Items[ID == input.Items];
seqValA1 = input.INQ_Seq;
paddedSeqA1 = "";
if(seqValA1 < 10) { paddedSeqA1 = "0000" + seqValA1; }
else if(seqValA1 < 100) { paddedSeqA1 = "000" + seqValA1; }
else if(seqValA1 < 1000) { paddedSeqA1 = "00" + seqValA1; }
else if(seqValA1 < 10000) { paddedSeqA1 = "0" + seqValA1; }
else { paddedSeqA1 = seqValA1 + ""; }
computedInqNoA1 = "INQ-" + paddedSeqA1;
hasSupplier2 = false;
for each  quote in input.Supplier_Quotes
{
	sidRawA1 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdA1 = "";
	if(sidRawA1 != "")
	{
		for each  supRecA1 in Suppliers
		{
			if(supRecA1.ID + "" == sidRawA1)
			{
				quoteBooksIdA1 = supRecA1.Supplier_ID + "";
			}
		}
	}
	if(quoteBooksIdA1 == "2680178000002735078")
	{
		hasSupplier2 = true;
	}
}
if(hasSupplier2 == true)
{
	newRecID = insert into Supplier_2
	[
		INQ_No_Supplier=computedInqNoA1
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
		newRec.Product_Image_Supplier2_INQ=itemRec.Image;
	}
	for each  quote in input.Supplier_Quotes
	{
		sidRawA1b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdA1b = "";
		if(sidRawA1b != "")
		{
			for each  supRecA1b in Suppliers
			{
				if(supRecA1b.ID + "" == sidRawA1b)
				{
					quoteBooksIdA1b = supRecA1b.Supplier_ID + "";
				}
			}
		}
		if(quoteBooksIdA1b == "2680178000002735078")
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
	page_base_url = "";
	if(thisapp.environment.type == "production")
	{
		page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
	}
	else
	{
		page_base_url = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app";
	}
	ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
	deep_link_token = "INQ-" + newRecID + "-" + ts;
	insert into Tony_Notifications
	[
		Recipient_Email="184319330@qq.com"
		Notification_Type="New Inquiry added"
		Message="A new inquiry " + computedInqNoA1 + " was added."
		Created_On=zoho.currenttime
		Read=false
		Target_URL=page_base_url + "/#Page:Tony_Fan_Inquiries?tonyinquiriesid=" + deep_link_token
		Source_Record_No=computedInqNoA1
		Source_Record_ID=newRecID
		Deep_Link_Token=deep_link_token
		Added_User=zoho.loginuser
	]
}

ACTION 2 (Supplier_1 / Fenteng — separate action):
== RECAPTURED 2026-08-04 from live Temp1.txt — same gaps as Action 1.
   Books Contact ID fix applied (replaces "[4662244000012469015]" with lookup). ==

itemRec = Items[ID == input.Items];
seqValA2 = input.INQ_Seq;
paddedSeqA2 = "";
if(seqValA2 < 10) { paddedSeqA2 = "0000" + seqValA2; }
else if(seqValA2 < 100) { paddedSeqA2 = "000" + seqValA2; }
else if(seqValA2 < 1000) { paddedSeqA2 = "00" + seqValA2; }
else if(seqValA2 < 10000) { paddedSeqA2 = "0" + seqValA2; }
else { paddedSeqA2 = seqValA2 + ""; }
computedInqNoA2 = "INQ-" + paddedSeqA2;
hasSupplier1 = false;
for each  quote in input.Supplier_Quotes
{
	sidRawA2 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdA2 = "";
	if(sidRawA2 != "")
	{
		for each  supRecA2 in Suppliers
		{
			if(supRecA2.ID + "" == sidRawA2)
			{
				quoteBooksIdA2 = supRecA2.Supplier_ID + "";
			}
		}
	}
	if(quoteBooksIdA2 == "2680178000049168001")
	{
		hasSupplier1 = true;
	}
}
if(hasSupplier1 == true)
{
	newRecID1 = insert into Supplier_1
	[
		INQ_No_Supplier=computedInqNoA2
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
		Added_User=zoho.loginuser
	];
	newRec1 = Supplier_1[ID == newRecID1];
	if(itemRec != null && itemRec.Image != null)
	{
		newRec1.Product_Image_Supplier1_INQ=itemRec.Image;
	}
	for each  quote in input.Supplier_Quotes
	{
		sidRawA2b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdA2b = "";
		if(sidRawA2b != "")
		{
			for each  supRecA2b in Suppliers
			{
				if(supRecA2b.ID + "" == sidRawA2b)
				{
					quoteBooksIdA2b = supRecA2b.Supplier_ID + "";
				}
			}
		}
		if(quoteBooksIdA2b == "2680178000049168001")
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
	page_base_url = "";
	if(thisapp.environment.type == "production")
	{
		page_base_url = "https://creator.zoho.com/homecartel/supply-chain-app";
	}
	else
	{
		page_base_url = "https://creatorapp.zoho.com/homecartel/environment/development/supply-chain-app";
	}
	ts = zoho.currenttime.toString().replaceAll(" ","").replaceAll(":","").replaceAll("-","");
	deep_link_token = "INQ-" + newRecID1 + "-" + ts;
	insert into Fenteng_Notifications
	[
		Recipient_Email="<Fenteng's portal account email>"
		Notification_Type="New Inquiry added"
		Message="A new inquiry " + computedInqNoA2 + " was added."
		Created_On=zoho.currenttime
		Read=false
		Target_URL=page_base_url + "/#Page:Fenteng_Lighting_Inquiries?fentenginquiriesid=" + deep_link_token
		Source_Record_No=computedInqNoA2
		Source_Record_ID=newRecID1
		Deep_Link_Token=deep_link_token
		Added_User=zoho.loginuser
	]
}

====================================================
2. Stage_Supplier_Changed (Supplier_2 form - Created or Edited > Successful form submission)
   Action 1 = stage logic (add edit_counter = 0 at end)
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
input.edit_counter = 0;

====================================================
3. Stage_Supplier_Changed (Supplier_1 form - Created or Edited > Successful form submission)
   Action 1 = stage logic (add edit_counter = 0 at end)
   NOTE: If duplicated workflow has broken form context, create NEW workflow
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
input.edit_counter = 0;

====================================================
SUPERSEDED 2026-07-09 — items 4 and 5 below are the OLDER, BUGGY version of this
workflow. Confirmed live in Creator 2026-07-09 and confirmed broken: the `hasSelected`
branch only ever writes Response_Status="Submit Response", never "Selected" — so a
supplier could never actually reach the Selected state, collateral stayed permanently
locked, no matter what the buyer picked. The CURRENT, CORRECT version (proper 3-way
Selected/Not Selected/Submit Response branch, matching the proven PR-side
PR_Changed pattern) lives in stage_inquiry_changed_actions.txt — paste from there, not
from here. Left below for history only, do not paste.
====================================================
4. Stage_Inquiry_Changed (Inquiry Form - Created or Edited > Successful form submission)
   Action 2 = Supplier_2 sync (with edit_counter reset)
====================================================

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
5. Stage_Inquiry_Changed (Inquiry Form)
   Action 3 = Supplier_1 sync (separate action, with edit_counter reset)
====================================================

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
6. Disable_Item_Field_Edit_Supplier (Both Supplier forms - Edited > Load of form)
   Action 1 = disable fields + lock when edit_counter == 0
====================================================

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
if(input.edit_counter == 0)
{
	disable Supplier_quotes.Availability_Supplier;
	disable Supplier_quotes.Initial_Price_Supplier;
	disable Supplier_quotes.Negotiated_Supplier;
	disable Supplier_quotes.Final_Price_Supplier;
	disable Supplier_quotes.Lead_Time_Supplier;
	disable Product_Sample_Supplier;
	disable D_Image_Supplier;
	disable Specification_Supplier;
	disable Technical_Drawing_Supplier;
	disable Specification_Details_Supplier;
	disable Similar_Design_Photo_Supplier;
}

====================================================
7. Mandatory_Supplier_Fields (Both Supplier forms - Edited > Validations)
   Add edit_counter check at top
   CHANGED 2026-07-09: rewritten to match the live PR-side rule exactly
   (Mandatory_PR_Fields_Supplier1/2, purchase_request_scripts1.txt, updated
   2026-07-06) instead of the earlier 2026-07-02 version of this file, which had
   drifted from it in two ways — see NOTES below.
====================================================

if(input.edit_counter == 0)
{
	alert "Editing is locked. Wait for inquiry update.";
	cancel submit;
}
hasEmpty = false;
msg = "";
for each  sq in input.Supplier_quotes
{
	if(sq.Availability_Supplier == null || sq.Availability_Supplier == "")
	{
		hasEmpty = true;
		msg = msg + "Availability, ";
	}
	if(sq.Availability_Supplier != "Cannot Produce" && sq.Availability_Supplier != "Unavailable" && sq.Availability_Supplier != "Confirmed")
	{
		if(sq.Initial_Price_Supplier == null || sq.Initial_Price_Supplier == 0)
		{
			hasEmpty = true;
			msg = msg + "Initial Price, ";
		}
		if(sq.Final_Price_Supplier == null || sq.Final_Price_Supplier == 0)
		{
			hasEmpty = true;
			msg = msg + "Final Price, ";
		}
	}
	if(sq.Availability_Supplier != "Cannot Produce" && sq.Availability_Supplier != "Unavailable")
	{
		if(sq.Availability_Supplier != "Confirmed")
		{
			if(sq.Lead_Time_Supplier == null || sq.Lead_Time_Supplier == "")
			{
				hasEmpty = true;
				msg = msg + "Lead Time, ";
			}
		}
	}
}
if(hasEmpty == true)
{
	alert "Required fields missing: " + msg.removeLastOccurence(", ");
	cancel submit;
}

====================================================
FIXED 2026-08-24, real bug confirmed live: this native rule only ever recognized
"Cannot Produce" as an availability value exempt from Initial/Final Price + Lead
Time. The Supplier Portal widget's own JS (Tony-Inquiries.zip/Fenteng-Inquiries.zip)
has treated "Unavailable" identically to "Cannot Produce" since 2026-07-14/2026-08-10
(skip pricing/lead time entirely, auto-remove from view on decline) — but this
SERVER-SIDE validation, which runs regardless of what the widget's own JS believes,
never got the matching update. Result: picking "Unavailable" in the widget still hit
this native rule's "Required fields missing: Initial Price, Final Price, Lead Time"
alert on submit, blocking the exact decline flow the widget was built to support.
Added "Unavailable" everywhere "Cannot Produce" was already checked, so both are now
treated identically (matches the widget's own behavior exactly).

SUMMARY:
- Inquiry created -> edit_counter = 1 (supplier can edit)
- Supplier saves -> edit_counter = 0 (locked)
- Inquiry edited -> edit_counter = 1 (unlocked again)
- Report Action Item condition: edit_counter == 1
- Disable_Item_Field_Edit_Supplier: locks all fields when edit_counter == 0
- Mandatory_Supplier_Fields: blocks submit when edit_counter == 0. Matches
  Mandatory_PR_Fields_Supplier1/2's CURRENT rule (2026-07-06 version) as of
  2026-07-09: Availability_Supplier == "Cannot Produce" OR == "Unavailable" OR ==
  "Confirmed" -> Initial Price + Final Price both optional (Negotiated_Supplier is NOT
  checked at all, matching PR-side — dropped from this script, it never blocks submit
  either way). Lead_Time separately optional when Availability_Supplier == "Cannot
  Produce", "Unavailable", or "Confirmed" (FIXED 2026-08-24 — "Unavailable" added;
  previously only Cannot Produce/Confirmed skipped it, contrary to this summary's own
  older wording which incorrectly said "only when Confirmed"). Availability itself
  always mandatory.
  NOT ported: PR-side also exempts prices when SRP_Rate_PR_Supplier1/2 (an
  SO-approved-rate mirror field) already has a value — Inquiry-side Supplier_1/
  Supplier_2 have no equivalent field today, so this exemption has no Inquiry-side
  counterpart yet. Add one (and this check) later if that scenario shows up here too.
  CONFIRMED: Availability_Supplier's dropdown does have "Cannot Produce" and
  "Confirmed" as real options on Supplier_1/Supplier_2 (Temp.txt form dump,
  `values = {"Confirmed","Pending","Unavailable","Cannot Produce"}`).
====================================================

````
