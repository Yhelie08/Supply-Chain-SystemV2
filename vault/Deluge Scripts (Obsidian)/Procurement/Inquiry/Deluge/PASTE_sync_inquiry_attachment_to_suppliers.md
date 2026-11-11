---
title: "PASTE_sync_inquiry_attachment_to_suppliers"
source_file: "PASTE_sync_inquiry_attachment_to_suppliers.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 479
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

# PASTE_sync_inquiry_attachment_to_suppliers

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `PASTE_sync_inquiry_attachment_to_suppliers.txt`
> - **Lines of Code:** 479
> - **Tags:** `#deluge`, `#inquiry`, `#notification`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
SYNC INQUIRY ATTACHMENTS TO SUPPLIER (Tony Fan & Fenteng Lighting)
Target Field on Suppliers: Image from Inq (link name: Image_from_Inq)
Source Field on Inquiry: Attachments (multi-file / images upload)
====================================================

----------------------------------------------------
CHECKLIST BAGO I-PASTE AT I-UPLOAD:
----------------------------------------------------
1. [FORM BUILDER]
   - Sa Tony Fan (Supplier_2) form: May Image field na `Image from Inq` (link name: `Image_from_Inq`, Max file limit: 10). (Confirmed sa image copy 134.png).
   - Sa Fenteng Lighting (Supplier_1) form: Siguraduhin na nagawa rin ang parehong field:
     * Field Name: Image from Inq
     * Field Link Name: Image_from_Inq
     * Type: Image (Max file limit: 10)

2. [CONFIGURE FIELDS SA REPORTS]
   - Pumunta sa Report Settings -> Configure Fields ng:
     * Supplier_2_Report (Tony Fan Report) -> I-check ang "Image from Inq"
     * Supplier_1_Report (Fenteng Lighting Report) -> I-check ang "Image from Inq"

3. [WIDGET ZIP UPDATES]
   - INQsv2.zip (Inquiry Widget): Na-update na para i-upload ang attached files direkta kay Tony at Fenteng sa `Image_from_Inq` field via Zoho Creator API!
   - Tony-Inquiries.zip at Fenteng-Inquiries.zip: Na-update na para ipakita ang `Image_from_Inq` bilang product picture sa portal ng supplier!

====================================================
1. WORKFLOW: Supplier_Populate_From_INQ
   Form: Inquiry_Form
   Trigger: Created > Successful form submission
====================================================

--- ACTION 1 (Supplier_2 / Tony Fan) ---
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
for each quote in input.Supplier_Quotes
{
	sidRawA1 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdA1 = "";
	if(sidRawA1 != "")
	{
		for each supRecA1 in Suppliers
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
	for each quote in input.Supplier_Quotes
	{
		sidRawA1b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdA1b = "";
		if(sidRawA1b != "")
		{
			for each supRecA1b in Suppliers
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


--- ACTION 2 (Supplier_1 / Fenteng Lighting — separate action block) ---
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
for each quote in input.Supplier_Quotes
{
	sidRawA2 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdA2 = "";
	if(sidRawA2 != "")
	{
		for each supRecA2 in Suppliers
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
	for each quote in input.Supplier_Quotes
	{
		sidRawA2b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdA2b = "";
		if(sidRawA2b != "")
		{
			for each supRecA2b in Suppliers
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
2. WORKFLOW: Stage_Inquiry_Changed
   Form: Inquiry_Form
   Trigger: Created or Edited > Successful form submission
====================================================

--- ACTION 2 (Supplier_2 / Tony Fan) ---
rows = Supplier_2[INQ_No_Supplier == input.INQ_No];
for each r in rows
{
	if(r.Response_Status != "Completed")
	{
		hasChanges = false;
		for each sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each quote in input.Supplier_Quotes
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
		if(input.Attachments != null && (input.Attachments + "") != "" && (input.Attachments + "") != "[]")
		{
			r.Image_from_Inq=input.Attachments;
		}
		hasSelected = false;
		for each sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each quote in input.Supplier_Quotes
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
			for each quote in input.Supplier_Quotes
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


--- ACTION 3 (Supplier_1 / Fenteng Lighting — separate action block) ---
rows1 = Supplier_1[INQ_No_Supplier == input.INQ_No];
for each r in rows1
{
	if(r.Response_Status != "Completed")
	{
		hasChanges = false;
		for each sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each quote in input.Supplier_Quotes
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
		if(input.Attachments != null && (input.Attachments + "") != "" && (input.Attachments + "") != "[]")
		{
			r.Image_from_Inq=input.Attachments;
		}
		hasSelected = false;
		for each sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each quote in input.Supplier_Quotes
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
			for each quote in input.Supplier_Quotes
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

````
