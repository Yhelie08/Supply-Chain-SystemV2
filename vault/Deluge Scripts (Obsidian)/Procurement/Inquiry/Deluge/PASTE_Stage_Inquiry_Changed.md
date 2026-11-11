---
title: "PASTE_Stage_Inquiry_Changed"
source_file: "PASTE_Stage_Inquiry_Changed.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 245
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# PASTE_Stage_Inquiry_Changed

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `PASTE_Stage_Inquiry_Changed.txt`
> - **Lines of Code:** 245
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
WORKFLOW: Stage_Inquiry_Changed
Form: Inquiry_Form
Trigger: Created or Edited > Successful form submission
====================================================
TANDAAN: May 2 hiwalay na Actions sa loob ng workflow na ito:
- Action 2: Para kay Tony Fan (Supplier_2)
- Action 3: Para kay Fenteng Lighting (Supplier_1)
====================================================


====================================================
ACTION 2: TONY FAN (Supplier_2)
====================================================
itemRec = Items[ID == input.Items];

rows = Supplier_2[INQ_No_Supplier == input.INQ_No];
for each  r in rows
{
	if(r.Response_Status != "Completed")
	{
		hasChanges = false;
		for each  sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each  quote in input.Supplier_Quotes
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
			r.edit_counter=1;
		}
		if(itemRec != null && itemRec.Image != null)
		{
			r.Product_Image_Supplier2_INQ = itemRec.Image;
		}
		if(input.Attachments != null && (input.Attachments + "") != "" && (input.Attachments + "") != "[]")
		{
			r.Image_from_Inq=input.Attachments;
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
			r.edit_counter=1;
		}
		else
		{
			anySelected = false;
			for each  quote in input.Supplier_Quotes
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


====================================================
ACTION 3: FENTENG LIGHTING (Supplier_1)
====================================================
itemRec = Items[ID == input.Items];

rows1 = Supplier_1[INQ_No_Supplier == input.INQ_No];
for each  r in rows1
{
	if(r.Response_Status != "Completed")
	{
		hasChanges = false;
		for each  sq in r.Supplier_quotes
		{
			matchingSupplierName = sq.SupplierName;
			for each  quote in input.Supplier_Quotes
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
			r.edit_counter=1;
		}
		if(itemRec != null && itemRec.Image != null)
		{
			r.Product_Image_Supplier1_INQ = itemRec.Image;
		}
		if(input.Attachments != null && (input.Attachments + "") != "" && (input.Attachments + "") != "[]")
		{
			r.Image_from_Inq=input.Attachments;
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
			r.edit_counter=1;
		}
		else
		{
			anySelected = false;
			for each  quote in input.Supplier_Quotes
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
