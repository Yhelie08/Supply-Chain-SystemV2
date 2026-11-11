---
title: "PR1_Created_Edited_Routing"
source_file: "PR1_Created_Edited_Routing"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 216
tags:
  - delivery-management
  - deluge
  - dms
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# PR1_Created_Edited_Routing

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `PR1_Created_Edited_Routing`
> - **Lines of Code:** 216
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
Fenteng

if(input.Source == "SO")
{
	return;
}
if(input.Sourcing_Type == "Local")
{
	return;
}
matchedInqNo = input.inquiry_reference;
routeFenteng = true;
hasFentengQuote = false;
selAvail = "";
selInitPrice = 0;
selNego = 0;
selFinalPrice = 0;
selLeadTime = 0;
if(matchedInqNo != null && matchedInqNo != "")
{
	routeFenteng = false;
	anySelected = false;
	inqRecs = Inquiry_Form[INQ_No == matchedInqNo];
	for each  inqRec in inqRecs
	{
		for each  q in inqRec.Supplier_Quotes
		{
			if(q.Selected == true)
			{
				anySelected = true;
				sid = q.Supplier_ID + "";
				sidRawC1 = sid.removeFirstOccurence("[").removeLastOccurence("]");
				quoteBooksIdC1 = "";
				if(sidRawC1 != "")
				{
					for each  supRecC1 in Suppliers
					{
						if(supRecC1.ID + "" == sidRawC1)
						{
							quoteBooksIdC1 = supRecC1.Supplier_ID + "";
						}
					}
				}
				if(quoteBooksIdC1 == "2680178000049168001")
				{
					routeFenteng = true;
					hasFentengQuote = true;
					selAvail = q.Availability;
					selInitPrice = q.Initial_Price;
					selNego = q.Negotiated;
					selFinalPrice = q.Final_Price;
					selLeadTime = q.Lead_Time;
				}
			}
		}
		break;
	}
	if(anySelected == false)
	{
		routeFenteng = true;
	}
}
if(routeFenteng == true)
{
	fResponseStatus = "Waiting";
	if(hasFentengQuote == true)
	{
		fResponseStatus = "Selected";
	}
	newRecID1 = insert into Fenteng_Lighting_Purchase_Request
	[
		PR_No_Supplier1=input.PR_No
		PR_Date_Supplier1=input.PR_Date
		Items_Supplier1=input.Items
		sku_Supplier1=input.sku
		quantity_Supplier1=input.quantity
		Description1_Supplier1=input.Description1
		description_Supplier1=input.description
		unit_Supplier1=input.unit
		category_Supplier1=input.category
		Target_Delivery_Supplier1=input.Target_Delivery
		Priority_PR_Supplier1=input.Priority
		SRP_Rate_PR_Supplier1=input.SRP_Rate_PR
		inquiry_reference_Supplier1=matchedInqNo
		Response_Status=fResponseStatus
		edit_counter=1
		Added_User=zoho.loginuser
	];
	newRec1 = Fenteng_Lighting_Purchase_Request[ID == newRecID1];
	itemRecF = Items[ID == input.Items];
	if(itemRecF != null && itemRecF.Image != null)
	{
		newRec1.Product_Image_Supplier1_PR=itemRecF.Image;
	}
	subRow1 = Fenteng_Lighting_Purchase_Request.Supplier_Selected_Supplier1();
	subRow1.Suppliers_Supplier1="Fenteng";
	if(hasFentengQuote == true)
	{
		subRow1.Availability_Supplier1=selAvail;
		subRow1.Initial_Price_Supplier1=selInitPrice;
		subRow1.Negotiated_Supplier1=selNego;
		subRow1.Final_Price_Supplier1=selFinalPrice;
		subRow1.Lead_Time_Supplier1=selLeadTime;
		subRow1.Selected_Supplier1=true;
	}
	newRec1.Supplier_Selected_Supplier1.insert(subRow1);
}


Tony

if(input.Source == "SO")
{
	return;
}
if(input.Sourcing_Type == "Local")
{
	return;
}
matchedInqNo = input.inquiry_reference;
routeTony = true;
hasTonyQuote = false;
selAvail = "";
selInitPrice = 0;
selNego = 0;
selFinalPrice = 0;
selLeadTime = 0;
if(matchedInqNo != null && matchedInqNo != "")
{
	routeTony = false;
	anySelected = false;
	inqRecs = Inquiry_Form[INQ_No == matchedInqNo];
	for each  inqRec in inqRecs
	{
		for each  q in inqRec.Supplier_Quotes
		{
			if(q.Selected == true)
			{
				anySelected = true;
				sid = q.Supplier_ID + "";
				sidRawC2 = sid.removeFirstOccurence("[").removeLastOccurence("]");
				quoteBooksIdC2 = "";
				if(sidRawC2 != "")
				{
					for each  supRecC2 in Suppliers
					{
						if(supRecC2.ID + "" == sidRawC2)
						{
							quoteBooksIdC2 = supRecC2.Supplier_ID + "";
						}
					}
				}
				if(quoteBooksIdC2 == "2680178000002735078")
				{
					routeTony = true;
					hasTonyQuote = true;
					selAvail = q.Availability;
					selInitPrice = q.Initial_Price;
					selNego = q.Negotiated;
					selFinalPrice = q.Final_Price;
					selLeadTime = q.Lead_Time;
				}
			}
		}
		break;
	}
	if(anySelected == false)
	{
		routeTony = true;
	}
}
if(routeTony == true)
{
	tResponseStatus = "Waiting";
	if(hasTonyQuote == true)
	{
		tResponseStatus = "Selected";
	}
	newRecID2 = insert into Tony_Fan_Purchase_Request
	[
		PR_No_Supplier2=input.PR_No
		PR_Date_Supplier2=input.PR_Date
		Items_Supplier2=input.Items
		sku_Supplier2=input.sku
		quantity_Supplier2=input.quantity
		Description1_Supplier2=input.Description1
		description_Supplier2=input.description
		unit_Supplier2=input.unit
		category_Supplier2=input.category
		Target_Delivery_Supplier2=input.Target_Delivery
		Priority_PR_Supplier2=input.Priority
		SRP_Rate_PR_Supplier2=input.SRP_Rate_PR
		inquiry_reference_Supplier2=matchedInqNo
		Response_Status=tResponseStatus
		edit_counter=1
		Added_User=zoho.loginuser
	];
	newRec2 = Tony_Fan_Purchase_Request[ID == newRecID2];
	itemRecT = Items[ID == input.Items];
	if(itemRecT != null && itemRecT.Image != null)
	{
		newRec2.Product_Image_Supplier2_PR=itemRecT.Image;
	}
	subRow2 = Tony_Fan_Purchase_Request.Supplier_Selected_Supplier2();
	subRow2.Suppliers_Supplier2="Tony";
	if(hasTonyQuote == true)
	{
		subRow2.Availability_Supplier2=selAvail;
		subRow2.Initial_Price_Supplier2=selInitPrice;
		subRow2.Negotiated_Supplier2=selNego;
		subRow2.Final_Price_Supplier2=selFinalPrice;
		subRow2.Lead_Time_Supplier2=selLeadTime;
		subRow2.Selected_Supplier2=true;
	}
	newRec2.Supplier_Selected_Supplier2.insert(subRow2);
}

````
