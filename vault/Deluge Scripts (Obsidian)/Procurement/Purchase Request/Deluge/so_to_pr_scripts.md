---
title: "so_to_pr_scripts"
source_file: "so_to_pr_scripts.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 217
tags:
  - delivery-management
  - deluge
  - dms
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# so_to_pr_scripts

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `so_to_pr_scripts.txt`
> - **Lines of Code:** 217
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Books SO → Creator Purchase_Request1 ==
== Triggered when SO status = "approved" ==
== One PR per SO line item ==

====================================================
WORKFLOW SETUP — SO_To_PR
====================================================
In Zoho Books:
  Settings → Automation → Workflow Rules
  Module: Sales Orders
  Trigger: On Approval (or On Edit, condition: Status is "Approved")
  Action: Custom Function → SO_To_PR

  TEST CONDITION (remove later):
    Customer Name is "(TEST ORDER) BY CPY PAM TAN"
====================================================

CUSTOM FUNCTION SETUP:
  Name: SO_To_PR
  Arguments: (auto-injected by Books — DO NOT declare these)
    Map salesorder, Map organization, Map user
  Paste BODY ONLY below (no outer braces, no return type declaration)
====================================================

owner = "homecartel";
app = "supply-chain-app";
connection = "supply_chain";

custName = salesorder.get("customer_name");
custBookId = salesorder.get("customer_id");
soNumber = salesorder.get("salesorder_number");

salesOwner = "";
targetDate = "";
orderType = "";
customFields = salesorder.get("custom_fields");
for each  cf in customFields
{
	if(cf.get("api_name") == "cf_sales_agent")
	{
		salesOwner = cf.get("value");
	}
	if(cf.get("api_name") == "cf_target_delivery_date")
	{
		targetDate = cf.get("value");
	}
	if(cf.get("api_name") == "cf_type_of_transaction")
	{
		orderType = cf.get("value");
	}
}

custCreatorId = "";
custType = "";
custResp = invokeurl
[
	url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookId + "%22"
	type: GET
	headers: {"environment":"development"}
	connection: "supply_chain"
];
info "custResp: " + custResp;
if(custResp.get("data") != null && custResp.get("data").size() > 0)
{
	custCreatorId = custResp.get("data").get(0).get("ID");
	custType = custResp.get("data").get(0).get("Customer_Type");
}
info "custCreatorId: " + custCreatorId + " | custType: " + custType;

lineItems = salesorder.get("line_items");
info "lineItems count: " + lineItems.size();
for each  item in lineItems
{
	skuVal = item.get("sku");
	itemName = item.get("name");
	itemDesc = item.get("description");
	itemQty = item.get("quantity");
	itemUnit = item.get("unit");

	itemCreatorId = "";
	itemCategory = "";
	itemResp = invokeurl
	[
		url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Items?criteria=SKU%3D%3D%22" + skuVal + "%22"
		type: GET
		headers: {"environment":"development"}
		connection: "supply_chain"
	];
	info "itemResp for " + skuVal + ": " + itemResp;
	if(itemResp.get("data") != null && itemResp.get("data").size() > 0)
	{
		itemCreatorId = itemResp.get("data").get(0).get("ID");
		itemCategory = itemResp.get("data").get(0).get("category");
	}
	info "itemCreatorId: " + itemCreatorId + " | itemCategory: " + itemCategory;

	data = Map();
	data.put("PR_Date", zoho.currentdate);
	data.put("Sales_Order", soNumber);
	data.put("Sales_Owner", salesOwner);
	data.put("sku", skuVal);
	data.put("Description1", itemName);
	data.put("description", itemDesc);
	data.put("quantity", itemQty);
	data.put("unit", itemUnit);
	if(targetDate != "")
	{
		data.put("Target_Delivery", targetDate);
	}
	if(orderType != "")
	{
		data.put("Order_Type", orderType);
	}
	if(custCreatorId != "")
	{
		data.put("Customer", custCreatorId);
	}
	if(custType != "")
	{
		data.put("Customer_Type", custType);
	}
	if(itemCreatorId != "")
	{
		data.put("Items", itemCreatorId);
	}
	if(itemCategory != "")
	{
		data.put("category", itemCategory);
	}

	config = Map();
	config.put("environment", "development");
	createResp = zoho.creator.v2_1.createRecord("homecartel", "supply-chain-app", "Purchase_Request1", data, config, "supply_chain");
	info "createRecord response: " + createResp;

	prId = createResp.get("data").get("ID");
	prNo = "";
	if(prId != null && prId != "")
	{
		prResp = invokeurl
		[
			url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request/" + prId
			type: GET
			headers: {"environment":"development"}
			connection: "supply_chain"
		];
		info "prResp: " + prResp;
		if(prResp.get("data") != null)
		{
			prNo = prResp.get("data").get("PR_No");
		}
	}
	info "prNo: " + prNo;

	if(prNo != null && prNo != "")
	{
		fData = Map();
		fData.put("PR_No_Supplier1", prNo);
		fData.put("PR_Date_Supplier1", zoho.currentdate);
		fData.put("sku_Supplier1", skuVal);
		fData.put("Description1_Supplier1", itemName);
		fData.put("description_Supplier1", itemDesc);
		fData.put("quantity_Supplier1", itemQty);
		fData.put("unit_Supplier1", itemUnit);
		fData.put("Response_Status", "Waiting");
		fData.put("edit_counter", 1);
		if(targetDate != "") { fData.put("Target_Delivery_Supplier1", targetDate); }
		if(itemCreatorId != "") { fData.put("Items_Supplier1", itemCreatorId); }
		if(itemCategory != "") { fData.put("category_Supplier1", itemCategory); }
		fSubList = List();
		fSubRow = Map();
		fSubRow.put("Suppliers_Supplier1", "Fenteng");
		fSubList.add(fSubRow);
		fData.put("Supplier_Selected_Supplier1", fSubList);
		fCreateResp = zoho.creator.v2_1.createRecord("homecartel", "supply-chain-app", "Fenteng_Lighting_Purchase_Request", fData, config, "supply_chain");
		info "Fenteng createRecord: " + fCreateResp;

		tData = Map();
		tData.put("PR_No_Supplier2", prNo);
		tData.put("PR_Date_Supplier2", zoho.currentdate);
		tData.put("sku_Supplier2", skuVal);
		tData.put("Description1_Supplier2", itemName);
		tData.put("description_Supplier2", itemDesc);
		tData.put("quantity_Supplier2", itemQty);
		tData.put("unit_Supplier2", itemUnit);
		tData.put("Response_Status", "Waiting");
		tData.put("edit_counter", 1);
		if(targetDate != "") { tData.put("Target_Delivery_Supplier2", targetDate); }
		if(itemCreatorId != "") { tData.put("Items_Supplier2", itemCreatorId); }
		if(itemCategory != "") { tData.put("category_Supplier2", itemCategory); }
		tSubList = List();
		tSubRow = Map();
		tSubRow.put("Suppliers_Supplier2", "Tony");
		tSubList.add(tSubRow);
		tData.put("Supplier_Selected_Supplier2", tSubList);
		tCreateResp = zoho.creator.v2_1.createRecord("homecartel", "supply-chain-app", "Tony_Fan_Purchase_Request", tData, config, "supply_chain");
		info "Tony createRecord: " + tCreateResp;
	}
}

====================================================
NOTES:
- paste body only — Books auto-injects: Map salesorder, Map organization, Map user
- connection name: supply_chain (lowercase)
- getRecords NOT available in Books Deluge → use invokeurl instead
- Customer: looked up by Books customer_id matching Creator All_Customers.ID1 field
- Items: looked up by SKU matching Creator All_Items.SKU field
- %3D%3D = ==, %22 = " (URL-encoded criteria)
- Sales_Order: single line field — stores SO number as text (e.g. "SO-16096")
- Sales_Order1: separate lookup field — NOT used here
- Supplier PRs created directly here (not via Creator workflow) — Creator workflows don't fire on cross-app createRecord
- PR_Populate_From_PR workflow on Purchase_Request1 can be left in place for manual PR creation
- Test condition (in Books workflow rule): Customer Name = "(TEST ORDER) BY CPY PAM TAN"
  Remove condition after testing confirmed working
- API calls per SO: 1 (customer) + 3 per line item (item lookup + PR1 create + PR1 fetch + 2 supplier creates) = heavy but fine for low volume
- Report name for Purchase_Request1: All_Purchase_Request
====================================================

````
