---
title: "so_to_pr"
source_file: "Deluge Script/so_to_pr.txt"
category: "Procurement/Purchase Request/Deluge/_variants/Archive-NEw"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 484
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# so_to_pr

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Procurement/Purchase Request/Deluge/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/so_to_pr.txt`
> - **Lines of Code:** 484
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
today = zoho.currentdate.toString("yyyy-MM-dd");
custName = salesorder.get("customer_name");
custBookId = salesorder.get("customer_id");
soNumber = salesorder.get("salesorder_number");
soTotal = salesorder.get("total");
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
info "soTotal: " + soTotal;
// ===== GATE 1: ORDER TYPE =====
// FIXED 2026-07-22, real bug caught live: real Books cf_type_of_transaction value is
// "(Partly) Pre Order" (with parens) — NOT "Partly Pre Order" as originally coded.
// Live log proved it: SO-16280 logged orderType:"(Partly) Pre Order" and still hit
// this gate's "not pre-order" branch, meaning a real Partly-Pre-Order SO was being
// silently skipped entirely (same class of exact-string mismatch already documented
// elsewhere in this app for this same field, e.g. so_fulfillment_sync.txt's own
// double-space "(Partly)  Pre Order" note — confirms Books' real values here need
// checking against a live log, not assumed). Also normalizes accidental double
// spaces defensively (`.replaceAll("  ", " ")`) in case this field's spacing is
// inconsistent record-to-record, same defensive habit already used elsewhere in
// this codebase for messy free-text Books fields.
orderTypeNorm = (orderType + "").replaceAll("  "," ").trim();
if(orderTypeNorm != "Pre Order" && orderTypeNorm != "(Partly) Pre Order")
{
	info "Order type not pre-order — skipping SO " + soNumber;
	return;
}
// ===== CUSTOMER LOOKUP (once) =====
custCreatorId = "";
custType = "";
custResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookId + "%22"
	type :GET
	headers:{"environment":"development"}
	connection:"supply_chain"
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
	itemRate = item.get("rate");
	info "line " + skuVal + " | inqNo: " + soInqNo;
	// ----- Books item detail fetch (used for BOTH category + stock — one call) -----
	itemBooks = zoho.books.getRecordsByID("items",orgId,itemBooksId);
	info "itemBooks response: " + itemBooks;
	booksCategory = "";
	availStock = 0;
	if(itemBooks != null && itemBooks.get("item") != null)
	{
		booksItem = itemBooks.get("item");
		booksCategory = booksItem.get("category_name") + "";
		// CHANGED 2026-07-28, per user request: gamitin ang parehong stock basis gaya ng
		// so_fulfillment_sync.txt — "actual_available_stock" (top-level, PHYSICAL stock),
		// may fallback sa "locations[].location_actual_available_stock" kung blangko ang
		// top-level field. Dati "available_stock" ang ginagamit dito (ibang field/basis).
		aValPr = booksItem.get("actual_available_stock") + "";
		if(aValPr != "" && aValPr != "null")
		{
			availStock = aValPr.toDecimal();
		}
		else
		{
			locSumPr = 0;
			locListPr = booksItem.get("locations");
			if(locListPr != null)
			{
				for each  locRecPr in locListPr
				{
					locActualPr = locRecPr.get("location_actual_available_stock") + "";
					if(locActualPr != "" && locActualPr != "null")
					{
						locSumPr = locSumPr + locActualPr.toDecimal();
					}
				}
			}
			availStock = locSumPr;
		}
	}
	info "line " + skuVal + " | booksCategory: " + booksCategory;
	// ===== GATE 2: SERVICES CATEGORY (skip — no physical procurement for service
	// items) — REORDERED 2026-07-22 to run BEFORE the stock gate and to source
	// category straight from BOOKS (not the old Creator All_Items lookup). Confirmed
	// live 2026-07-22: SyncItemsCust's own sync.js already skips syncing
	// Services-category items into Creator's All_Items at all (deliberate, by
	// design) — meaning the OLD version of this gate, which read itemCategory off a
	// Creator lookup for the SKU, could NEVER see a real "Services" value (always
	// blank, itemCreatorId also always blank) and so silently never fired, letting
	// Services lines fall through and create PRs anyway. Also sidesteps a 2nd real
	// bug: a Services item's Books `available_stock` comes back null/undefined
	// (confirmed live) — the OLD stock-gate comparison (`itemQty <= availStock`)
	// would have been comparing a NUMBER against NULL for any service line that
	// reached it, an invalid Deluge comparison and a real crash risk independent of
	// the category-skip bug. Checking category first, from the SAME Books fetch
	// already needed for stock, avoids ever reaching that comparison for a service
	// line at all. =====
	if(booksCategory != null && booksCategory.trim().toLowerCase() == "services")
	{
		info "Item category is Services — skipping PR for " + skuVal;
		continue;
	}
	// ===== GATE 3: STOCK ON HAND — RULE DIFFERS BY ORDER TYPE, added 2026-07-22 per
	// user. "Pre Order" keeps the original full-coverage rule (skip only when stock
	// fully covers the ordered qty). "Partly Pre Order" uses a different rule per
	// user's explicit instruction — skip whenever ANY stock exists at all
	// (availStock > 0), regardless of whether it's enough to cover the full ordered
	// qty; only stock == 0 or negative creates a PR. Category=Services skip (Gate 2,
	// above) is unchanged/unaffected by order type either way. =====
	info "line " + skuVal + " | availStock: " + availStock + " | ordered: " + itemQty + " | orderType: " + orderTypeNorm;
	if(orderTypeNorm == "(Partly) Pre Order")
	{
		if(availStock > 0)
		{
			info "Partly Pre Order — stock > 0 for " + skuVal + " — no PR created.";
			continue;
		}
	}
	else
	{
		if(itemQty <= availStock)
		{
			info "Enough stock for " + skuVal + " — no PR created.";
			continue;
		}
	}
	// ----- item lookup (Creator) — still needed for itemCreatorId/itemCategory on
	// real goods lines; Services lines never reach this point anymore -----
	itemCreatorId = "";
	itemCategory = "";
	itemResp = invokeurl
	[
		url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Items?criteria=SKU%3D%3D%22" + skuVal + "%22"
		type :GET
		headers:{"environment":"development"}
		connection:"supply_chain"
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
	// is instead done natively in Creator (see sideUpdateScriptPR.txt) — a "Created"
	// trigger on Fenteng_Lighting_Purchase_Request / Tony_Fan_Purchase_Request each run as
	// their own isolated execution, sidestepping the limit entirely.
	// ===== GATE 4: INQ ROUTING (before PR1 create) =====
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
			if(singleInq == "")
			{
				continue;
			}
			inqResp = invokeurl
			[
				url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Inquiries?criteria=INQ_No%3D%3D%22" + singleInq + "%22"
				type :GET
				headers:{"environment":"development"}
				connection:"supply_chain"
			];
			inqDataSize = 0;
			if(inqResp.get("data") != null)
			{
				inqDataSize = inqResp.get("data").size();
			}
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
								if(sid.contains("4662244000012469015"))
								{
									routeFenteng = true;
									hasFentengQuote = true;
								}
								if(sid.contains("4662244000012938023"))
								{
									routeTony = true;
									hasTonyQuote = true;
								}
								prSupRow = Map();
								prSupRow.put("Supplier_ID",sid.removeFirstOccurence("[").removeLastOccurence("]"));
								prSupRow.put("Suppliers",q.get("Suppliers") + "");
								prSupRow.put("Availability",selAvail);
								prSupRow.put("Initial_Price",selInitPrice);
								prSupRow.put("Negotiated",selNego);
								prSupRow.put("Final_Price",selFinalPrice);
								prSupRow.put("Lead_Time",selLeadTime);
								prSupRow.put("Selected",true);
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
			fRow.put("Supplier_ID","4662244000012469015");
			fRow.put("Suppliers","Fenteng");
			prSupplierRows.add(fRow);
		}
		if(routeTony == true)
		{
			tRow = Map();
			tRow.put("Supplier_ID","4662244000012938023");
			tRow.put("Suppliers","Tony");
			prSupplierRows.add(tRow);
		}
	}
	info "routeFenteng: " + routeFenteng + " | routeTony: " + routeTony + " | matchedInqNo: " + matchedInqNo + " | hasFentengQuote: " + hasFentengQuote + " | hasTonyQuote: " + hasTonyQuote;
	// ----- create Purchase_Request1 -----
	data = Map();
	data.put("PR_Date",today);
	data.put("Source","SO");
	data.put("Sales_Order",soNumber);
	data.put("Sales_Owner",salesOwner);
	if(soTotal != null)
	{
		data.put("Order_Value",soTotal.toLong());
	}
	data.put("sku",skuVal);
	data.put("Description1",itemName);
	data.put("description",itemDesc);
	data.put("quantity",itemQty);
	data.put("unit",itemUnit);
	if(targetDate != "")
	{
		data.put("Target_Delivery",targetDate);
	}
	if(orderType != "")
	{
		data.put("Order_Type",orderType);
	}
	if(custCreatorId != "")
	{
		data.put("Customer",custCreatorId);
	}
	if(custType != "")
	{
		data.put("Customer_Type",custType);
	}
	if(itemCreatorId != "")
	{
		data.put("Items",itemCreatorId);
	}
	if(itemCategory != "")
	{
		data.put("category",itemCategory);
	}
	if(itemRate != null)
	{
		data.put("SRP_Rate_PR",itemRate.toLong());
	}
	if(matchedInqNo != "")
	{
		data.put("inquiry_reference",matchedInqNo);
	}
	data.put("Supplier_Selected",prSupplierRows);
	config = Map();
	config.put("environment","development");
	createResp = zoho.creator.v2_1.createRecord("homecartel","supply-chain-app","Purchase_Request1",data,config,"supply_chain");
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
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request/" + prId
			type :GET
			headers:{"environment":"development"}
			connection:"supply_chain"
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
			fData.put("PR_No_Supplier1",prNo);
			fData.put("PR_Date_Supplier1",today);
			fData.put("sku_Supplier1",skuVal);
			fData.put("Description1_Supplier1",itemName);
			fData.put("description_Supplier1",itemDesc);
			fData.put("quantity_Supplier1",itemQty);
			fData.put("unit_Supplier1",itemUnit);
			fResponseStatus = "Waiting";
			if(hasFentengQuote == true)
			{
				fResponseStatus = "Selected";
			}
			fData.put("Response_Status",fResponseStatus);
			fData.put("edit_counter",1);
			if(targetDate != "")
			{
				fData.put("Target_Delivery_Supplier1",targetDate);
			}
			if(itemCreatorId != "")
			{
				fData.put("Items_Supplier1",itemCreatorId);
			}
			if(itemCategory != "")
			{
				fData.put("category_Supplier1",itemCategory);
			}
			if(matchedInqNo != "")
			{
				fData.put("inquiry_reference_Supplier1",matchedInqNo);
			}
			fSubList = List();
			fSubRow = Map();
			fSubRow.put("Suppliers_Supplier1","Fenteng");
			if(hasFentengQuote == true)
			{
				fSubRow.put("Availability_Supplier1",selAvail);
				fSubRow.put("Initial_Price_Supplier1",selInitPrice);
				fSubRow.put("Negotiated_Supplier1",selNego);
				fSubRow.put("Final_Price_Supplier1",selFinalPrice);
				fSubRow.put("Lead_Time_Supplier1",selLeadTime);
				fSubRow.put("Selected_Supplier1",true);
			}
			fSubList.add(fSubRow);
			fData.put("Supplier_Selected_Supplier1",fSubList);
			fCreateResp = zoho.creator.v2_1.createRecord("homecartel","supply-chain-app","Fenteng_Lighting_Purchase_Request",fData,config,"supply_chain");
			info "Fenteng createRecord: " + fCreateResp;
		}
		// ----- Tony Fan (Supplier_2) -----
		if(routeTony == true)
		{
			tData = Map();
			tData.put("PR_No_Supplier2",prNo);
			tData.put("PR_Date_Supplier2",today);
			tData.put("sku_Supplier2",skuVal);
			tData.put("Description1_Supplier2",itemName);
			tData.put("description_Supplier2",itemDesc);
			tData.put("quantity_Supplier2",itemQty);
			tData.put("unit_Supplier2",itemUnit);
			tResponseStatus = "Waiting";
			if(hasTonyQuote == true)
			{
				tResponseStatus = "Selected";
			}
			tData.put("Response_Status",tResponseStatus);
			tData.put("edit_counter",1);
			if(targetDate != "")
			{
				tData.put("Target_Delivery_Supplier2",targetDate);
			}
			if(itemCreatorId != "")
			{
				tData.put("Items_Supplier2",itemCreatorId);
			}
			if(itemCategory != "")
			{
				tData.put("category_Supplier2",itemCategory);
			}
			if(matchedInqNo != "")
			{
				tData.put("inquiry_reference_Supplier2",matchedInqNo);
			}
			tSubList = List();
			tSubRow = Map();
			tSubRow.put("Suppliers_Supplier2","Tony");
			if(hasTonyQuote == true)
			{
				tSubRow.put("Availability_Supplier2",selAvail);
				tSubRow.put("Initial_Price_Supplier2",selInitPrice);
				tSubRow.put("Negotiated_Supplier2",selNego);
				tSubRow.put("Final_Price_Supplier2",selFinalPrice);
				tSubRow.put("Lead_Time_Supplier2",selLeadTime);
				tSubRow.put("Selected_Supplier2",true);
			}
			tSubList.add(tSubRow);
			tData.put("Supplier_Selected_Supplier2",tSubList);
			tCreateResp = zoho.creator.v2_1.createRecord("homecartel","supply-chain-app","Tony_Fan_Purchase_Request",tData,config,"supply_chain");
			info "Tony createRecord: " + tCreateResp;
		}
	}
}

````
