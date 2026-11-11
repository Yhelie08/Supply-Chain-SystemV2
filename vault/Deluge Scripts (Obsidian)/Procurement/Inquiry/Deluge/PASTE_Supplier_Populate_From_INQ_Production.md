---
title: "PASTE_Supplier_Populate_From_INQ_Production"
source_file: "NEw/PASTE_Supplier_Populate_From_INQ_Production.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 250
tags:
  - deluge
  - inquiry
  - notification
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# PASTE_Supplier_Populate_From_INQ_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `NEw/PASTE_Supplier_Populate_From_INQ_Production.txt`
> - **Lines of Code:** 250
> - **Tags:** `#deluge`, `#inquiry`, `#notification`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
PASTE TARGET: Inquiry_Form -> Supplier_Populate_From_INQ
(PRODUCTION environment's own live workflow editor)
Action 1 = Supplier_2 (Tony), Action 2 = Supplier_1 (Fenteng) — 2 SEPARATE
action blocks inside the same one workflow
====================================================

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
	if(input.Attachments != null && (input.Attachments + "") != "" && (input.Attachments + "") != "[]")
	{
		newRec.Image_from_Inq=input.Attachments;
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
	if(input.Attachments != null && (input.Attachments + "") != "" && (input.Attachments + "") != "[]")
	{
		newRec1.Image_from_Inq=input.Attachments;
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

````
