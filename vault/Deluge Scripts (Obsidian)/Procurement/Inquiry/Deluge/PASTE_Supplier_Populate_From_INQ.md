---
title: "PASTE_Supplier_Populate_From_INQ"
source_file: "PASTE_Supplier_Populate_From_INQ.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 267
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

# PASTE_Supplier_Populate_From_INQ

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `PASTE_Supplier_Populate_From_INQ.txt`
> - **Lines of Code:** 267
> - **Tags:** `#deluge`, `#inquiry`, `#notification`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
WORKFLOW: Supplier_Populate_From_INQ
Form: Inquiry_Form
Trigger: Created > Successful form submission
====================================================
TANDAAN: May 2 hiwalay na Actions sa loob ng workflow na ito:
- Action 1: Para kay Tony Fan (Supplier_2)
- Action 2: Para kay Fenteng Lighting (Supplier_1)
====================================================


====================================================
ACTION 1: TONY FAN (Supplier_2)
====================================================
itemRec = Items[ID == input.Items];
seqValA1 = input.INQ_Seq;
paddedSeqA1 = "";
if(seqValA1 < 10)
{
	paddedSeqA1 = "0000" + seqValA1;
}
else if(seqValA1 < 100)
{
	paddedSeqA1 = "000" + seqValA1;
}
else if(seqValA1 < 1000)
{
	paddedSeqA1 = "00" + seqValA1;
}
else if(seqValA1 < 10000)
{
	paddedSeqA1 = "0" + seqValA1;
}
else
{
	paddedSeqA1 = seqValA1 + "";
}
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


====================================================
ACTION 2: FENTENG LIGHTING (Supplier_1)
====================================================
itemRec = Items[ID == input.Items];
seqValA2 = input.INQ_Seq;
paddedSeqA2 = "";
if(seqValA2 < 10)
{
	paddedSeqA2 = "0000" + seqValA2;
}
else if(seqValA2 < 100)
{
	paddedSeqA2 = "000" + seqValA2;
}
else if(seqValA2 < 1000)
{
	paddedSeqA2 = "00" + seqValA2;
}
else if(seqValA2 < 10000)
{
	paddedSeqA2 = "0" + seqValA2;
}
else
{
	paddedSeqA2 = seqValA2 + "";
}
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
