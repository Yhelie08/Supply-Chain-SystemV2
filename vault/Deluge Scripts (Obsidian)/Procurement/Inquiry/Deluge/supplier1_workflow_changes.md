---
title: "supplier1_workflow_changes"
source_file: "supplier1_workflow_changes.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 298
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# supplier1_workflow_changes

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `supplier1_workflow_changes.txt`
> - **Lines of Code:** 298
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPPLIER_1 (Fenteng Lighting) WORKFLOW CHANGES ==
== Supplier ID: [4662244000012469015] ==
== Form link name: Supplier_1 ==
== Field link names: same _Supplier suffix as Supplier_2 ==
== Subform link name: Supplier_quotes (same as Supplier_2) ==
== Duplicated form quirk: cross-form subform refs from other forms fail ==
==   -> Supplier_1 scripts must be SEPARATE actions, not combined with Supplier_2 ==

====================================================
1. Supplier_Populate_From_INQ (Inquiry Form - Created > Successful form submission)
   Action 1 = Supplier_2 (unchanged), Action 2 = Supplier_1 (new)
====================================================

ACTION 1 (Supplier_2 — unchanged):

hasSupplier2 = false;
for each  quote in input.Supplier_Quotes
{
	sidRawE1 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdE1 = "";
	if(sidRawE1 != "")
	{
		for each  supRecE1 in Suppliers
		{
			if(supRecE1.ID + "" == sidRawE1) { quoteBooksIdE1 = supRecE1.Supplier_ID + ""; }
		}
	}
	if(quoteBooksIdE1 == "2680178000002735078")
	{
		hasSupplier2 = true;
	}
}
if(hasSupplier2 == true)
{
	newRecID = insert into Supplier_2
	[
		INQ_No_Supplier=input.INQ_No
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
	];
	newRec = Supplier_2[ID == newRecID];
	for each  quote in input.Supplier_Quotes
	{
		sidRawE1b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdE1b = "";
		if(sidRawE1b != "")
		{
			for each  supRecE1b in Suppliers
			{
				if(supRecE1b.ID + "" == sidRawE1b) { quoteBooksIdE1b = supRecE1b.Supplier_ID + ""; }
			}
		}
		if(quoteBooksIdE1b == "2680178000002735078")
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

ACTION 2 (Supplier_1 — MUST be separate action):

hasSupplier1 = false;
for each  quote in input.Supplier_Quotes
{
	sidRawE2 = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
	quoteBooksIdE2 = "";
	if(sidRawE2 != "")
	{
		for each  supRecE2 in Suppliers
		{
			if(supRecE2.ID + "" == sidRawE2) { quoteBooksIdE2 = supRecE2.Supplier_ID + ""; }
		}
	}
	if(quoteBooksIdE2 == "2680178000049168001")
	{
		hasSupplier1 = true;
	}
}
if(hasSupplier1 == true)
{
	newRecID1 = insert into Supplier_1
	[
		INQ_No_Supplier=input.INQ_No
		SKU_Supplier=input.sku
		Target_Date_Supplier=input.target_date
		Items_Supplier=input.Items
		Quantity_Supplier=input.quantity
		Unit_Supplier=input.unit
		Description_Supplier=input.description
		Date_Created_Supplier=input.created_date
		Open_to_similar_design_Supplier=input.Open_to_similar_design
		Additional_Description_Supplier=input.Addtional_Description
	];
	newRec1 = Supplier_1[ID == newRecID1];
	for each  quote in input.Supplier_Quotes
	{
		sidRawE2b = quote.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdE2b = "";
		if(sidRawE2b != "")
		{
			for each  supRecE2b in Suppliers
			{
				if(supRecE2b.ID + "" == sidRawE2b) { quoteBooksIdE2b = supRecE2b.Supplier_ID + ""; }
			}
		}
		if(quoteBooksIdE2b == "2680178000049168001")
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
2. Stage_Inquiry_Changed Action 2 (Inquiry Form - Edited > Successful form submission)
   Syncs Inquiry edits to BOTH Supplier_2 and Supplier_1
   TODO: May need separate actions like Supplier_Populate_From_INQ
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
			}
		}
	}
}
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
			}
		}
	}
}

====================================================
3. Stage_Supplier_Changed Action 2 (Supplier_1 form — already done by user)
   Changed supplier ID to [4662244000012469015]
====================================================

inqNo = input.INQ_No_Supplier;
inqRecords = Inquiry_Form[INQ_No == inqNo];
for each  inq in inqRecords
{
	for each  sq in inq.Supplier_Quotes
	{
		sidRawE3 = sq.Supplier_ID.removeFirstOccurence("[").removeLastOccurence("]");
		quoteBooksIdE3 = "";
		if(sidRawE3 != "")
		{
			for each  supRecE3 in Suppliers
			{
				if(supRecE3.ID + "" == sidRawE3) { quoteBooksIdE3 = supRecE3.Supplier_ID + ""; }
			}
		}
		if(quoteBooksIdE3 == "2680178000049168001")
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
	inq.Product_Sample=input.Product_Sample_Supplier;
	inq.D_Image=input.D_Image_Supplier;
	inq.Specification=input.Specification_Supplier;
	inq.Technical_Drawing=input.Technical_Drawing_Supplier;
	inq.Specification_Details=input.Specification_Details_Supplier;
	break;
}

====================================================
NOTES:
- Supplier_1 duplicated from Supplier_2 (Tony Fan) 2026-06-25
- Form link name rename didn't stick internally — use original assigned name
- Field link names: _Supplier suffix (reverted from _Supplier1, rename stuck)
- Subform link name: Supplier_quotes (same as Supplier_2)
- CRITICAL: Supplier_1 insert + subform MUST be separate action from Supplier_2
  (combining in same Deluge script causes "Form '{0}' does not exist")
- FinalPrice_Supplier_Changed / Negotiated_Supplier_Changed: leave DISABLED
- Supplier IDs: Tony Fan = 4662244000012938023, Fenteng Lighting = 4662244000012469015
- Brackets required in ID comparison: "[4662244000012469015]"
====================================================

````
