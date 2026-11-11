---
title: "ApplyNow"
source_file: "ApplyNow.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 432
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
  - zoho-creator
---

# ApplyNow

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `ApplyNow.txt`
> - **Lines of Code:** 432
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== APPLY BOTH OF THESE — 2026-07-01 ==
== Part 1: Books custom function SO_To_PR (paste over existing function body) ==
== Part 2: Two new Creator workflows (image triggers on the supplier PR forms) ==

====================================================
PART 1 — BOOKS CUSTOM FUNCTION SETUP
====================================================
In Zoho Books:
  Settings → Automation → Workflow Rules
  Module: Sales Orders
  Trigger: On Approval (or On Edit, condition: Status is "Approved")
  Action: Custom Function → SO_To_PR

  TEST CONDITION (remove later):
    Customer Name is "(TEST ORDER) BY CPY PAM TAN"

CUSTOM FUNCTION SETUP:
  Name: SO_To_PR
  Arguments: (auto-injected by Books — DO NOT declare these)
    Map salesorder, Map organization, Map user
  Paste BODY ONLY below (no outer braces, no return type declaration)
====================================================

owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
today = zoho.currentdate.toString("yyyy-MM-dd");

custName = salesorder.get("customer_name");
custBookId = salesorder.get("customer_id");
soNumber = salesorder.get("salesorder_number");

salesOwner = "";
targetDate = "";
orderType = "";
soInqNo = "";
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
	if(cf.get("api_name") == "cf_inq_no")
	{
		soInqNo = cf.get("value");
	}
}
info "soInqNo: " + soInqNo;
info "orderType: " + orderType;

// ===== GATE 1: ORDER TYPE =====
if(orderType != "Pre Order" && orderType != "Partly Pre Order")
{
	info "Order type not pre-order — skipping SO " + soNumber;
	return;
}

// ===== CUSTOMER LOOKUP (once) =====
custCreatorId = "";
custType = "";
custResp = invokeurl
[
	url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookId + "%22"
	type: GET
	headers: {"environment":"development"}
	connection: "supply_chain"
];
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
	itemBooksId = item.get("item_id");

	info "line " + skuVal + " | inqNo: " + soInqNo;

	// ===== GATE 2: STOCK ON HAND =====
	availStock = 0;
	itemBooks = zoho.books.getRecordsByID("items", orgId, itemBooksId);
	info "itemBooks response: " + itemBooks;
	if(itemBooks != null && itemBooks.get("item") != null)
	{
		availStock = itemBooks.get("item").get("available_stock");
	}
	info "line " + skuVal + " | availStock: " + availStock + " | ordered: " + itemQty;
	if(itemQty <= availStock)
	{
		info "Enough stock for " + skuVal + " — no PR created.";
		continue;
	}

	// ----- item lookup (Creator) -----
	itemCreatorId = "";
	itemCategory = "";
	itemResp = invokeurl
	[
		url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Items?criteria=SKU%3D%3D%22" + skuVal + "%22"
		type: GET
		headers: {"environment":"development"}
		connection: "supply_chain"
	];
	if(itemResp.get("data") != null && itemResp.get("data").size() > 0)
	{
		itemCreatorId = itemResp.get("data").get(0).get("ID");
		itemCategory = itemResp.get("data").get(0).get("category");
	}
	info "itemCreatorId: " + itemCreatorId + " | itemCategory: " + itemCategory;

	// NOTE: Product image is NOT fetched/uploaded here. Zoho's v2.1 Upload File API only
	// allows ONE successful multipart upload per Books custom function execution — every
	// upload after the first one in the same run fails with code 3700 "Unable to upload a
	// file". Since one SO approval can create several supplier PR records, image handling
	// is instead done natively in Creator (see PART 2 below) — a "Created" trigger on
	// Fenteng_Lighting_Purchase_Request / Tony_Fan_Purchase_Request each run as their own
	// isolated execution, sidestepping the limit entirely.

	// ===== GATE 3: INQ ROUTING (before PR1 create) =====
	routeFenteng = true;
	routeTony = true;
	matchedInqNo = "";
	prSupplierRows = List();
	hasFentengQuote = false;
	hasTonyQuote = false;
	selAvail = "";
	selInitPrice = 0;
	selNego = 0;
	selFinalPrice = 0;
	selLeadTime = 0;
	if(soInqNo != "")
	{
		routeFenteng = false;
		routeTony = false;
		matchedInq = false;
		inqList = (soInqNo + "").toList(",");
		for each  singleInq in inqList
		{
			singleInq = singleInq.trim();
			if(singleInq == "") { continue; }
			inqResp = invokeurl
			[
				url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Inquiries?criteria=INQ_No%3D%3D%22" + singleInq + "%22"
				type: GET
				headers: {"environment":"development"}
				connection: "supply_chain"
			];
			inqDataSize = 0;
			if(inqResp.get("data") != null) { inqDataSize = inqResp.get("data").size(); }
			info "INQ check: " + singleInq + " for line sku [" + skuVal + "] -> records found: " + inqDataSize;
			if(inqResp.get("data") != null && inqResp.get("data").size() > 0)
			{
				inqRec = inqResp.get("data").get(0);
				inqSkuVal = inqRec.get("sku") + "";
				info "  INQ " + singleInq + " sku: [" + inqSkuVal + "]";
				if(inqSkuVal == skuVal)
				{
					matchedInq = true;
					matchedInqNo = singleInq;
					quotes = inqRec.get("Supplier_Quotes");
					anySelected = false;
					if(quotes != null)
					{
						for each  q in quotes
						{
							if(q.get("Selected") == true || q.get("Selected") == "true")
							{
								anySelected = true;
								sid = q.get("Supplier_ID") + "";
								selAvail = q.get("Availability");
								selInitPrice = q.get("Initial_Price");
								selNego = q.get("Negotiated");
								selFinalPrice = q.get("Final_Price");
								selLeadTime = q.get("Lead_Time");
								if(sid.contains("4662244000012469015")) { routeFenteng = true; hasFentengQuote = true; }
								if(sid.contains("4662244000012938023")) { routeTony = true; hasTonyQuote = true; }
								prSupRow = Map();
								prSupRow.put("Supplier_ID", sid.removeFirstOccurence("[").removeLastOccurence("]"));
								prSupRow.put("Suppliers", q.get("Suppliers") + "");
								prSupRow.put("Availability", selAvail);
								prSupRow.put("Initial_Price", selInitPrice);
								prSupRow.put("Negotiated", selNego);
								prSupRow.put("Final_Price", selFinalPrice);
								prSupRow.put("Lead_Time", selLeadTime);
								prSupRow.put("Selected", true);
								prSupplierRows.add(prSupRow);
							}
						}
					}
					if(anySelected == false)
					{
						routeFenteng = true;
						routeTony = true;
					}
				}
			}
		}
		if(matchedInq == false)
		{
			routeFenteng = true;
			routeTony = true;
		}
	}
	if(prSupplierRows.size() == 0)
	{
		if(routeFenteng == true)
		{
			fRow = Map();
			fRow.put("Supplier_ID", "4662244000012469015");
			fRow.put("Suppliers", "Fenteng");
			prSupplierRows.add(fRow);
		}
		if(routeTony == true)
		{
			tRow = Map();
			tRow.put("Supplier_ID", "4662244000012938023");
			tRow.put("Suppliers", "Tony");
			prSupplierRows.add(tRow);
		}
	}
	info "routeFenteng: " + routeFenteng + " | routeTony: " + routeTony + " | matchedInqNo: " + matchedInqNo + " | hasFentengQuote: " + hasFentengQuote + " | hasTonyQuote: " + hasTonyQuote;

	// ----- create Purchase_Request1 -----
	data = Map();
	data.put("PR_Date", today);
	data.put("Source", "SO");
	data.put("Sales_Order", soNumber);
	data.put("Sales_Owner", salesOwner);
	data.put("sku", skuVal);
	data.put("Description1", itemName);
	data.put("description", itemDesc);
	data.put("quantity", itemQty);
	data.put("unit", itemUnit);
	if(targetDate != "") { data.put("Target_Delivery", targetDate); }
	if(orderType != "") { data.put("Order_Type", orderType); }
	if(custCreatorId != "") { data.put("Customer", custCreatorId); }
	if(custType != "") { data.put("Customer_Type", custType); }
	if(itemCreatorId != "") { data.put("Items", itemCreatorId); }
	if(itemCategory != "") { data.put("category", itemCategory); }
	if(matchedInqNo != "") { data.put("inquiry_reference", matchedInqNo); }
	data.put("Supplier_Selected", prSupplierRows);

	config = Map();
	config.put("environment", "development");
	createResp = zoho.creator.v2_1.createRecord("homecartel", "supply-chain-app", "Purchase_Request1", data, config, "supply_chain");
	info "createRecord response: " + createResp;

	prId = "";
	if(createResp.get("data") != null)
	{
		prId = createResp.get("data").get("ID");
	}
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
		if(prResp.get("data") != null)
		{
			prNo = prResp.get("data").get("PR_No");
		}
	}
	info "prNo: " + prNo;

	if(prNo != null && prNo != "")
	{
		// ----- Fenteng (Supplier_1) -----
		if(routeFenteng == true)
		{
			fData = Map();
			fData.put("PR_No_Supplier1", prNo);
			fData.put("PR_Date_Supplier1", today);
			fData.put("sku_Supplier1", skuVal);
			fData.put("Description1_Supplier1", itemName);
			fData.put("description_Supplier1", itemDesc);
			fData.put("quantity_Supplier1", itemQty);
			fData.put("unit_Supplier1", itemUnit);
			fResponseStatus = "Waiting";
			if(hasFentengQuote == true) { fResponseStatus = "Selected"; }
			fData.put("Response_Status", fResponseStatus);
			fData.put("edit_counter", 1);
			if(targetDate != "") { fData.put("Target_Delivery_Supplier1", targetDate); }
			if(itemCreatorId != "") { fData.put("Items_Supplier1", itemCreatorId); }
			if(itemCategory != "") { fData.put("category_Supplier1", itemCategory); }
			fSubList = List();
			fSubRow = Map();
			fSubRow.put("Suppliers_Supplier1", "Fenteng");
			if(hasFentengQuote == true)
			{
				fSubRow.put("Availability_Supplier1", selAvail);
				fSubRow.put("Initial_Price_Supplier1", selInitPrice);
				fSubRow.put("Negotiated_Supplier1", selNego);
				fSubRow.put("Final_Price_Supplier1", selFinalPrice);
				fSubRow.put("Lead_Time_Supplier1", selLeadTime);
				fSubRow.put("Selected_Supplier1", true);
			}
			fSubList.add(fSubRow);
			fData.put("Supplier_Selected_Supplier1", fSubList);
			fCreateResp = zoho.creator.v2_1.createRecord("homecartel", "supply-chain-app", "Fenteng_Lighting_Purchase_Request", fData, config, "supply_chain");
			info "Fenteng createRecord: " + fCreateResp;
		}

		// ----- Tony Fan (Supplier_2) -----
		if(routeTony == true)
		{
			tData = Map();
			tData.put("PR_No_Supplier2", prNo);
			tData.put("PR_Date_Supplier2", today);
			tData.put("sku_Supplier2", skuVal);
			tData.put("Description1_Supplier2", itemName);
			tData.put("description_Supplier2", itemDesc);
			tData.put("quantity_Supplier2", itemQty);
			tData.put("unit_Supplier2", itemUnit);
			tResponseStatus = "Waiting";
			if(hasTonyQuote == true) { tResponseStatus = "Selected"; }
			tData.put("Response_Status", tResponseStatus);
			tData.put("edit_counter", 1);
			if(targetDate != "") { tData.put("Target_Delivery_Supplier2", targetDate); }
			if(itemCreatorId != "") { tData.put("Items_Supplier2", itemCreatorId); }
			if(itemCategory != "") { tData.put("category_Supplier2", itemCategory); }
			tSubList = List();
			tSubRow = Map();
			tSubRow.put("Suppliers_Supplier2", "Tony");
			if(hasTonyQuote == true)
			{
				tSubRow.put("Availability_Supplier2", selAvail);
				tSubRow.put("Initial_Price_Supplier2", selInitPrice);
				tSubRow.put("Negotiated_Supplier2", selNego);
				tSubRow.put("Final_Price_Supplier2", selFinalPrice);
				tSubRow.put("Lead_Time_Supplier2", selLeadTime);
				tSubRow.put("Selected_Supplier2", true);
			}
			tSubList.add(tSubRow);
			tData.put("Supplier_Selected_Supplier2", tSubList);
			tCreateResp = zoho.creator.v2_1.createRecord("homecartel", "supply-chain-app", "Tony_Fan_Purchase_Request", tData, config, "supply_chain");
			info "Tony createRecord: " + tCreateResp;
		}
	}
}

====================================================
PART 2 — CREATOR NATIVE WORKFLOWS (product image triggers)
====================================================
Add TWO separate workflows in Zoho Creator (supply-chain-app). Each is completely
independent of Part 1 — no changes needed anywhere else.

----------------------------------------------------
WORKFLOW A — Fenteng_Populate_Image_PR
  Form: Fenteng_Lighting_Purchase_Request
  Trigger: Created > Successful form submission
----------------------------------------------------

if(input.Items_Supplier1 != null)
{
	itemRec = Items[ID == input.Items_Supplier1];
	if(itemRec != null && itemRec.Image != null)
	{
		imgList = List();
		imgList.add(itemRec.Image);
		r = Fenteng_Lighting_Purchase_Request[ID == input.ID];
		update r
		[
			Product_Image_Supplier1_PR=imgList
		];
	}
}

----------------------------------------------------
WORKFLOW B — Tony_Populate_Image_PR
  Form: Tony_Fan_Purchase_Request
  Trigger: Created > Successful form submission
----------------------------------------------------

if(input.Items_Supplier2 != null)
{
	itemRec = Items[ID == input.Items_Supplier2];
	if(itemRec != null && itemRec.Image != null)
	{
		imgList = List();
		imgList.add(itemRec.Image);
		r = Tony_Fan_Purchase_Request[ID == input.ID];
		update r
		[
			Product_Image_Supplier2_PR=imgList
		];
	}
}

====================================================
WHY IMAGE HANDLING IS SPLIT OUT LIKE THIS (context)
====================================================
Tried doing the image fetch + upload inline inside the Books SO_To_PR function first.
Confirmed via live testing (2026-07-01): Zoho's v2.1 Upload File API allows only ONE
successful multipart upload per Books custom function execution — every upload attempt
after the first one in the SAME run fails with code 3700 "Unable to upload a file", even
with a freshly-fetched file variable. Since one SO approval can create several supplier
PR records in one execution (multiple lines, both suppliers), Books-side upload is
unreliable by design.

Workflows A and B fire on the SUPPLIER FORM'S OWN Created event — not on Purchase_Request1
or inside Books — so each one is its own isolated execution. This works identically
whether the record was inserted by SO_To_PR (Books, via zoho.creator.v2_1.createRecord)
or by the manual PR_Populate_From_PR flow (native Deluge insert into) — both are just
"Created" events on the supplier form either way. No REST upload API involved at all,
just plain field assignment, so the one-upload-per-run limit never applies.

Field link names: Product_Image_Supplier1_PR (Fenteng), Product_Image_Supplier2_PR
(Tony) — both "Image/s" (multiple-image) fields, must assign a List(), not a raw File.
====================================================

````
