---
title: "PR"
source_file: "PR"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]"
lines: 199
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
  - zoho-creator
---

# PR

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `PR`
> - **Lines of Code:** 199
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pre-Order/Widget/Pre Order Report Widget|Pre Order Report Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

/*
This is a sample function. Uncomment to execute or make changes to this function.
salesorderID = salesorder.get("salesorder_id");
salesorderdate = salesorder.get("date").toDate();
organizationID = organization.get("organization_id");
*/
salesorderID = salesorder.get("salesorder_id");
salesorderdate = salesorder.get("date").toDate();
organizationID = organization.get("organization_id");
so_details = zoho.books.getRecordsByID("salesorders",organizationID,salesorderID,"zbooks").get("salesorder");
// info so_details;
custom_fields = so_details.get("custom_fields");
for each  custom_field in custom_fields
{
	label1 = custom_field.get("label");
	if(label1 == "Customer Type")
	{
		Customer_Type = custom_field.get("value");
		break;
	}
}
salesorder_number = so_details.get("salesorder_number");
info "SO Number: " + salesorder_number;
customer_Name = so_details.get("customer_name");
contact_person_details = so_details.get("contact_person_details").get(0);
contact_Email = contact_person_details.get("email");
contact_phone = contact_person_details.get("phone");
custom_fields = so_details.get("custom_fields");
for each  f in custom_fields
{
	label1 = f.get("label");
	if(label1 == "Target Delivery Date")
	{
		value1 = f.get("value").toDate();
	}
}
for each  field in custom_fields
{
	label = field.get("label");
	if(label == "Order Type")
	{
		value = field.get("value");
		break;
	}
}
if(value == "Pre Order" || value == "(Partly) Pre Order")
{
	line_item = so_details.get("line_items");
	for each  item in line_item
	{
		line_item_id = item.get("item_id");
		name = item.get("name");
		info name;
		sku = item.get("sku");
		quantity = item.get("quantity");
		description = item.get("description");
		// 		salesorder_number = item.get("salesorder_number");
		item_details = zoho.books.getRecordsByID("items",organizationID,line_item_id,"zbooks").get("item");
		custom_fields = item_details.get("custom_fields");
		category_name = item_details.get("category_name");
		ITEMREF = "";
		if(custom_fields.size() >= 0)
		{
			for each  custom_field in custom_fields
			{
				label = custom_field.get("label");
				if(label == "ITEMREF")
				{
					ITEMREF = custom_field.get("value");
					info ITEMREF;
					break;
				}
			}
		}
		// 		info item_details;
		itemID1 = item_details.get("item_id");
		info itemID1;
		itemImage = invokeurl
		[
			url :"https://books.zoho.com/api/v3/items/" + itemID1 + "/image?organization_id=" + organizationID
			type :GET
			connection:"zbooks"
		];
		info "img " + itemImage;
		category_name = item_details.get("category_name");
		item_category = "Whole Fixtures";
		if(category_name == "Spare Parts Item")
		{
			item_category = "Spare part";
		}
		available_stock = item_details.get("stock_on_hand");
		weight = item_details.get("package_details").get("weight");
		item_type = item_details.get("item_type");
		rate = item_details.get("rate");
		description = item_details.get("description");
		unit = item_details.get("unit");
		response = zoho.creator.getRecords("homecartel","procurement-application","All_Items","Item_Name==\"" + name + "\"",1,200,"zcreator1");
		info response;
		if(response.get("message") != "No records found for the given criteria.")
		{
			it = response.get("data").get(0);
			dataid = it.get("ID");
			vendorID = it.get("Vendors.ID");
			Product_Image = it.get("Product_Image");
			info vendorID;
			vendorID = List();
			vendorIDsString = it.get("Vendors.ID");
			if(vendorIDsString != null && vendorIDsString != "")
			{
				vendorID = vendorIDsString.toList(",");
				// Convert the comma-separated string into a List
			}
			//  for each var in records
			//  {
			//  itid= var.get("ID");
			//  }
			info "available_stock: " + available_stock;
			if(available_stock <= 0 || value == "Pre Order")
			{
				item_details = Map();
				subformRows = List();
				subform = Map();
				subform.put("Item_name",dataid);
				subform.put("Item_Name1",name);
				subform.put("Product_Image",itemImage);
				subform.put("SKU",sku);
				subform.put("Weight",weight);
				subform.put("Unit",unit);
				subform.put("Description",description);
				subform.put("Item_Type",item_type);
				subform.put("Quantity",quantity);
				subform.put("Vendors",vendorID);
				subform.put("Category",category_name);
				subform.put("Description",description);
				subform.put("ITEMREF",ITEMREF);
				// Properly map vendors
				subformRows.add(subform);
				data = Map();
				data.put("Project","Home Cartel");
				data.put("Sales_Order_date_created",salesorderdate);
				data.put("Sales_Order_Reference",salesorder_number);
				data.put("Sales_Order_date_created",salesorderdate);
				data.put("Customer_Phone_Number",contact_phone);
				data.put("Customer_Email",contact_Email);
				data.put("Customer_Name1",customer_Name);
				data.put("Target_Delivery_Date",value1.toString("dd-MMM-yyyy"));
				data.put("Expected_Delivery",value1.toString("dd-MMM-yyyy"));
				data.put("Order_Type1",value);
				data.put("PR_Type","Pre Order");
				data.put("Order_Type",item_category);
				data.put("Customer_Name1",customer_Name);
				data.put("Customer_Type",Customer_Type);
				data.put("Products1",subformRows);
				// 	salesorder_number
				// target Delivery Date
				data.put("PR_Status","Pending");
				query = Map();
				if(category_name != "Services")
				{
					Create1 = zoho.creator.createRecord("homecartel","procurement-application","Create_PR",data,query,"zcreator1");
					info Create1;
					main_form_record = Create1.get("data").get("ID").tolong();
					getRec = zoho.creator.getRecordById("homecartel","procurement-application","Open_Requests",main_form_record,"zcreator1");
					info getRec;
					Subform_record = getRec.get("data").get("Products1").get(0).get("ID").tolong();
					itemImage.setParamName("file");
					fileObj1 = invokeurl
					[
						url :"https://creator.zoho.com/api/v2/homecartel/procurement-application/report/Open_Requests/" + main_form_record + "/Products1.Product_Image/" + Subform_record + "/upload"
						type :POST
						files:itemImage
						connection:"zcreator1"
					];
					dataid1 = it.get("ID").toLong();
					fileObj1 = invokeurl
					[
						url :"https://creator.zoho.com/api/v2/homecartel/procurement-application/report/All_Items/" + dataid1 + "/Product_Image/upload"
						type :POST
						files:itemImage
						connection:"zcreator1"
					];
				}
				else
				{
					info "Item is in services category";
				}
			}
		}
		else
		{
			info "record not found in creator Line Item Name " + name;
		}
	}
}
else
{
	info "Order is of different Order Type";
}

````
