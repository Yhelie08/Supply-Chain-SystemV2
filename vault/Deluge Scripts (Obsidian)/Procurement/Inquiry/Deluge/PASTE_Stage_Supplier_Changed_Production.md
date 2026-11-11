---
title: "PASTE_Stage_Supplier_Changed_Production"
source_file: "NEw/PASTE_Stage_Supplier_Changed_Production.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 154
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# PASTE_Stage_Supplier_Changed_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `NEw/PASTE_Stage_Supplier_Changed_Production.txt`
> - **Lines of Code:** 154
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
PASTE TARGET: Supplier_2 form (Tony) -> Stage_Supplier_Changed -> Action 2
(PRODUCTION environment's own live workflow editor)
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
PASTE TARGET: Supplier_1 form (Fenteng) -> Stage_Supplier_Changed -> Action 2
(PRODUCTION environment's own live workflow editor)
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

````
