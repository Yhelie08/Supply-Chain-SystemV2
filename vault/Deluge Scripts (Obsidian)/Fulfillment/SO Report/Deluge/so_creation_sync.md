---
title: "so_creation_sync"
source_file: "so_creation_sync.txt"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 723
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - zoho-books
  - zoho-creator
  - zoho-inventory
---

# so_creation_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `so_creation_sync.txt`
> - **Lines of Code:** 723
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#zoho-books`, `#zoho-creator`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
config = Map();
config.put("environment","production");
soId = salesorder.get("salesorder_id") + "";
soNumber = salesorder.get("salesorder_number") + "";
custBookId = salesorder.get("customer_id") + "";
// DIAGNOSTIC (added 2026-07-20 after "Invalid value passed for entity_id" on the
// getRecordsByID("salesorders",...) call below — soId resolved to something invalid.
// Test SO switched 2026-07-21 to SO-16275, expected salesorder_id 2680178000078998890.
// Logging the raw trigger map here so the next test run shows which key actually holds
// it, instead of guessing further.
info "raw salesorder trigger map: " + salesorder;
info "soId resolved to: [" + soId + "]";
// ===== TEST GATE (remove later) — scoped to this one test SO only while we validate
// the SO-creation trigger, same pattern as the TEST GATE in so_fulfillment_sync.txt
// but keyed on SO number since that's the specific test record we're using here =====
if(soNumber != "SO-16275")
{
	info "Sales Order " + soNumber + " is not the test SO — skipping.";
	return;
}
// ===== SO DETAIL FETCH (custom fields + live invoices[] list — same
// re-fetch-for-reliability pattern as so_fulfillment_sync.txt, even though the
// trigger's own salesorder map likely already carries most of this) =====
soResp = zoho.books.getRecordsByID("salesorders",orgId,soId);
soRec = soResp.get("salesorder");
orderTypeRaw = "";
forCrate = false;
targetDate = "";
soCreatedDate = "";
soLineItems = List();
soInvoicePaidValues = List();
if(soRec != null)
{
	soCreatedDate = soRec.get("date") + "";
	soLineItems = soRec.get("line_items");
	soCF = soRec.get("custom_fields");
	for each  cf in soCF
	{
		apiName = cf.get("api_name") + "";
		val = cf.get("value") + "";
		if(apiName == "cf_type_of_transaction")
		{
			orderTypeRaw = val;
		}
		if(apiName == "cf_for_crate")
		{
			forCrate = val == "true";
		}
		if(apiName == "cf_target_delivery_date")
		{
			targetDate = val;
		}
	}
	// Same invoice payment-status pattern as so_fulfillment_sync.txt. At SO-creation
	// time this will almost always come back empty (no invoice yet), which is fine —
	// paymentStatus below just defaults to "No".
	soInvoices = soRec.get("invoices");
	if(soInvoices != null)
	{
		for each  siv in soInvoices
		{
			invId = siv.get("invoice_id") + "";
			invStatus = siv.get("status") + "";
			if(invStatus == "void")
			{
				continue;
			}
			invResp = zoho.books.getRecordsByID("invoices",orgId,invId);
			invRec = invResp.get("invoice");
			if(invRec != null)
			{
				invCF = invRec.get("custom_fields");
				for each  cf in invCF
				{
					if(cf.get("api_name") + "" == "cf_paid")
					{
						soInvoicePaidValues.add(cf.get("value") + "");
					}
				}
			}
		}
	}
}
// ===== EXISTING RECORDS FETCH (for per-item duplicate guard below) =====
// No Package number exists yet at SO-creation time, so unlike
// so_fulfillment_sync.txt's per-package match, this fetches every existing
// Sales_Order_Fulfillment record for this SO_No — checked per item (by SKU) further
// down, since creation now happens one record per item, not one record per SO.
existingResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report?criteria=SO_No%3D%3D%22" + soNumber + "%22"
	type :GET
	headers:{"environment":"production"}
	connection:"supply_chain"
];
orderType = orderTypeRaw;
// ===== FULFILLMENT STAGE =====
// FIXED 2026-07-22 — "Not Shipped" is NOT a valid Fulfillment_Stage picklist option
// (confirmed against Sales_Order_Fulfillment.txt form definition: only
// "Received"/"Picking"/"Pack & QC"/"To Ship"/"For Delivery" are allowed). This bug was
// silent before because Fulfillment_Stage used to be misplaced inside the Item_Details1
// subform (fixed separately), where an invalid value doesn't get checked; now that it's
// a real top-level field, Creator validates it and rejects bad values. No Package (and
// so no package.status) exists yet at SO-creation time, so "Received" is used as the
// earliest-stage default — nothing has been picked/packed/shipped yet.
fulfillmentStage = "Received";
// ===== PAYMENT STATUS ===== (same aggregation logic as so_fulfillment_sync.txt)
paymentStatus = "No";
hasPartial = false;
hasYes = false;
hasNo = false;
for each  paidVal in soInvoicePaidValues
{
	if(paidVal == "Partial")
	{
		hasPartial = true;
	}
	else if(paidVal == "Yes")
	{
		hasYes = true;
	}
	else if(paidVal == "No")
	{
		hasNo = true;
	}
}
if(hasPartial || (hasYes && hasNo))
{
	paymentStatus = "Partial";
}
else if(hasYes)
{
	paymentStatus = "Yes";
}
// ===== CUSTOMER LOOKUP ===== (same Creator Customer record pattern as
// so_fulfillment_sync.txt — falls back to blank if the Customer record or a given
// field on it can't be found)
custCreatorId = "";
custType = "";
contactNo = "";
billAddr = "";
shipAddr = "";
custResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookId + "%22&field_config=all"
	type :GET
	headers:{"environment":"production"}
	connection:"supply_chain"
];
if(custResp.get("data") != null && custResp.get("data").size() > 0)
{
	custRecMap = custResp.get("data").get(0);
	custCreatorId = custRecMap.get("ID");
	custType = custRecMap.get("Customer_Type") + "";
	if(custType == "null")
	{
		custType = "";
	}
	phoneVal = custRecMap.get("Phone_Number") + "";
	if(phoneVal == "null")
	{
		phoneVal = "";
	}
	mobileVal = custRecMap.get("Mobile") + "";
	if(mobileVal == "null")
	{
		mobileVal = "";
	}
	if(phoneVal != "")
	{
		contactNo = phoneVal;
	}
	else if(mobileVal != "")
	{
		contactNo = mobileVal;
	}
	billMap3 = custRecMap.get("Billing_Address");
	shipMap3 = custRecMap.get("Shipping_Address");
	if(contactNo == "" && billMap3 != null)
	{
		bLine1 = billMap3.get("address_line_1") + "";
		if(bLine1 == "null")
		{
			bLine1 = "";
		}
		bLine2 = billMap3.get("address_line_2") + "";
		if(bLine2 == "null")
		{
			bLine2 = "";
		}
		bCombined = bLine1 + " " + bLine2;
		if(bCombined.contains("Phone:"))
		{
			afterPhone = bCombined.getSuffix("Phone:").trim();
			if(afterPhone.contains(","))
			{
				afterPhone = afterPhone.getPrefix(",");
			}
			contactNo = afterPhone.trim();
		}
	}
	if(contactNo == "" && shipMap3 != null)
	{
		sLine1 = shipMap3.get("address_line_1") + "";
		if(sLine1 == "null")
		{
			sLine1 = "";
		}
		sLine2 = shipMap3.get("address_line_2") + "";
		if(sLine2 == "null")
		{
			sLine2 = "";
		}
		sCombined = sLine1 + " " + sLine2;
		if(sCombined.contains("Phone:"))
		{
			afterPhoneS = sCombined.getSuffix("Phone:").trim();
			if(afterPhoneS.contains(","))
			{
				afterPhoneS = afterPhoneS.getPrefix(",");
			}
			contactNo = afterPhoneS.trim();
		}
	}
	if(billMap3 != null)
	{
		billParts = List();
		bf1 = billMap3.get("address_line_1") + "";
		bf1 = bf1.replaceAll("\n"," ").replaceAll("\r"," ");
		if(bf1 != "" && bf1 != "null")
		{
			billParts.add(bf1);
		}
		bf2 = billMap3.get("address_line_2") + "";
		bf2 = bf2.replaceAll("\n"," ").replaceAll("\r"," ");
		if(bf2 != "" && bf2 != "null")
		{
			billParts.add(bf2);
		}
		bf3 = billMap3.get("district_city") + "";
		if(bf3 != "" && bf3 != "null")
		{
			billParts.add(bf3);
		}
		bf4 = billMap3.get("state_province") + "";
		if(bf4 != "" && bf4 != "null")
		{
			billParts.add(bf4);
		}
		bf5 = billMap3.get("postal_Code") + "";
		if(bf5 != "" && bf5 != "null")
		{
			billParts.add(bf5);
		}
		bf6 = billMap3.get("country") + "";
		if(bf6 != "" && bf6 != "null")
		{
			billParts.add(bf6);
		}
		for each  bp in billParts
		{
			if(billAddr == "")
			{
				billAddr = bp;
			}
			else
			{
				billAddr = billAddr + ", " + bp;
			}
		}
	}
	if(shipMap3 != null)
	{
		shipParts = List();
		sf1 = shipMap3.get("address_line_1") + "";
		sf1 = sf1.replaceAll("\n"," ").replaceAll("\r"," ");
		if(sf1 != "" && sf1 != "null")
		{
			shipParts.add(sf1);
		}
		sf2 = shipMap3.get("address_line_2") + "";
		sf2 = sf2.replaceAll("\n"," ").replaceAll("\r"," ");
		if(sf2 != "" && sf2 != "null")
		{
			shipParts.add(sf2);
		}
		sf3 = shipMap3.get("district_city") + "";
		if(sf3 != "" && sf3 != "null")
		{
			shipParts.add(sf3);
		}
		sf4 = shipMap3.get("state_province") + "";
		if(sf4 != "" && sf4 != "null")
		{
			shipParts.add(sf4);
		}
		sf5 = shipMap3.get("postal_Code") + "";
		if(sf5 != "" && sf5 != "null")
		{
			shipParts.add(sf5);
		}
		sf6 = shipMap3.get("country") + "";
		if(sf6 != "" && sf6 != "null")
		{
			shipParts.add(sf6);
		}
		for each  sp in shipParts
		{
			if(shipAddr == "")
			{
				shipAddr = sp;
			}
			else
			{
				shipAddr = shipAddr + ", " + sp;
			}
		}
	}
}
// ===== PR_No / Shipment_Mode LOOKUP ===== (same as so_fulfillment_sync.txt — will
// most likely come back empty at SO-creation time since a Purchase Request usually
// doesn't exist yet, which is fine, both just stay blank and get skipped below)
prNoJoined = "";
shipMode = "";
prResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=Sales_Order%3D%3D%22" + soNumber + "%22&field_config=all"
	type :GET
	headers:{"environment":"production"}
	connection:"supply_chain"
];
if(prResp.get("data") != null)
{
	for each  prRec in prResp.get("data")
	{
		prNoVal = prRec.get("PR_No") + "";
		if(prNoVal != "" && prNoVal != "null")
		{
			if(prNoJoined == "" || !prNoJoined.contains(prNoVal))
			{
				if(prNoJoined == "")
				{
					prNoJoined = prNoVal;
				}
				else
				{
					prNoJoined = prNoJoined + ", " + prNoVal;
				}
			}
		}
		if(shipMode == "")
		{
			shipModeVal = prRec.get("Shipment_Mode") + "";
			if(shipModeVal != "" && shipModeVal != "null")
			{
				shipMode = shipModeVal;
			}
		}
	}
}
// ===== RR_No LOOKUP ===== (same best-effort scan as so_fulfillment_sync.txt — will
// most likely come back empty at SO-creation time)
rrNoJoined = "";
rrResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Replacement_Requests?field_config=all"
	type :GET
	headers:{"environment":"production"}
	connection:"supply_chain"
];
if(rrResp.get("data") != null)
{
	for each  rrRec in rrResp.get("data")
	{
		rrSummary = rrRec.get("Replacement_Summary");
		if(rrSummary != null)
		{
			for each  rsRow in rrSummary
			{
				rowSO = rsRow.get("SO_No") + "";
				if(rowSO == soNumber)
				{
					rrNoVal = rrRec.get("RR_No") + "";
					if(rrNoVal != "" && rrNoVal != "null" && (rrNoJoined == "" || !rrNoJoined.contains(rrNoVal)))
					{
						if(rrNoJoined == "")
						{
							rrNoJoined = rrNoVal;
						}
						else
						{
							rrNoJoined = rrNoJoined + ", " + rrNoVal;
						}
					}
				}
			}
		}
	}
}
// ===== ONE Sales_Order_Fulfillment RECORD PER ITEM =====
// CHANGED 2026-07-21, per user request: isang HIWALAY na Sales_Order_Fulfillment
// record ang gagawin PER ITEM sa SO's line_items (hindi isang record na may subform na
// maraming rows) — parehong pattern ng 2026-07-21 change sa so_fulfillment_sync.txt.
// PR # tinanggal na rin sa Sales_Order_Fulfillment data (hindi na ipinapasa ang
// prNoJoined dito — nananatili lang itong ginagamit sa Pre_Order_FF section sa ibaba).
// Bin_Location skipped pa rin — walang storage assignment sa SO-creation stage.
// Package / Package_Date / Delivery_Type wala rin — walang Package pa sa stage na ito.
// DUPLICATE GUARD key = SO_No + SKU, laban sa existingResp na kinuha na sa itaas.
for each  li in soLineItems
{
	skuVal = li.get("sku") + "";
	// ===== SERVICE ITEM EXCLUSION (per user request 2026-07-21) — same Category
	// "Services" check as the Pre_Order_FF loop below; Service items shouldn't get a
	// Sales_Order_Fulfillment record either.
	itemIdSof = li.get("item_id") + "";
	categoryNameSof = "";
	binLocationVal = "";
	if(itemIdSof != "" && itemIdSof != "null")
	{
		itemRespSof = zoho.books.getRecordsByID("items",orgId,itemIdSof);
		itemRecSof = itemRespSof.get("item");
		if(itemRecSof != null)
		{
			categoryNameSof = itemRecSof.get("category_name") + "";
			// BIN LOCATION (added 2026-07-22, per user request) — confirmed via a live raw
			// itemRec dump that Bin/Storage data lives INSIDE this same Books item response
			// (no separate Zoho Inventory connection needed): each entry in the item's own
			// "warehouses" array has a "storages" list. Match against THIS line item's own
			// warehouse_id (carried on the SO line item itself), then read that specific
			// warehouse's storages[] for the bin name. Diagnostic log included since the
			// exact field name inside a populated "storages" entry hasn't been confirmed
			// yet (the first test item had no bin assigned, so storages[] was empty).
			warehouseIdForBin = li.get("warehouse_id") + "";
			warehousesListSof = itemRecSof.get("warehouses");
			if(warehousesListSof != null && warehouseIdForBin != "" && warehouseIdForBin != "null")
			{
				for each  whRec in warehousesListSof
				{
					whIdVal = whRec.get("warehouse_id") + "";
					if(whIdVal == warehouseIdForBin)
					{
						storagesListSof = whRec.get("storages");
						info "bin check — SKU [" + skuVal + "] warehouse [" + warehouseIdForBin + "] raw storages: " + storagesListSof;
						if(storagesListSof != null)
						{
							for each  storRec in storagesListSof
							{
								binNameVal = storRec.get("name") + "";
								if(binNameVal == "" || binNameVal == "null")
								{
									binNameVal = storRec.get("storage_id") + "";
								}
								if(binNameVal != "" && binNameVal != "null")
								{
									if(binLocationVal == "")
									{
										binLocationVal = binNameVal;
									}
									else
									{
										binLocationVal = binLocationVal + ", " + binNameVal;
									}
								}
							}
						}
					}
				}
			}
		}
	}
	if(categoryNameSof == "Services")
	{
		info "SKU " + skuVal + " category=Services — skipping Sales_Order_Fulfillment.";
		continue;
	}
	alreadyExists = false;
	if(existingResp.get("data") != null)
	{
		for each  existingRec in existingResp.get("data")
		{
			existingItems = existingRec.get("Item_Details1");
			if(existingItems != null)
			{
				for each  eiRow in existingItems
				{
					if((eiRow.get("SKU") + "") == skuVal)
					{
						alreadyExists = true;
					}
				}
			}
		}
	}
	if(alreadyExists == true)
	{
		info "Sales_Order_Fulfillment already exists for SO " + soNumber + " / SKU " + skuVal + " — skipping.";
		continue;
	}
	row = Map();
	row.put("Item",li.get("name") + "");
	row.put("SKU",skuVal);
	row.put("Quantity",li.get("quantity") + "");
	if(binLocationVal != "")
	{
		row.put("Bin_Location",binLocationVal);
	}
	lineRows = List();
	lineRows.add(row);
	data = Map();
	data.put("SO_No",soNumber);
	data.put("Fulfillment_Stage",fulfillmentStage);
	if(orderType != "")
	{
		data.put("order_type",orderType);
	}
	data.put("For_Crate",forCrate);
	if(soCreatedDate != "")
	{
		data.put("SO_Created_Date",soCreatedDate);
	}
	if(rrNoJoined != "")
	{
		data.put("RR_No",rrNoJoined);
	}
	if(shipMode != "")
	{
		data.put("Shipment_Mode",shipMode);
	}
	if(targetDate != "")
	{
		data.put("target_delivery_date",targetDate);
	}
	if(custCreatorId != "")
	{
		data.put("Customer",custCreatorId);
	}
	if(custType != "")
	{
		data.put("Customer_Type",custType);
	}
	if(billAddr != "")
	{
		data.put("Billing_Address",billAddr);
	}
	if(shipAddr != "")
	{
		data.put("Shipping_Address",shipAddr);
	}
	if(contactNo != "")
	{
		data.put("Contact_No",contactNo);
	}
	data.put("Status",paymentStatus);
	data.put("Item_Details1",lineRows);
	info "data map about to be sent for item " + skuVal + ": " + data;
	createResp = zoho.creator.v2_1.createRecord(owner,app,"Sales_Order_Fulfillment",data,config,"supply_chain");
	info "createRecord response: " + createResp;
}
// ===== ZERO-STOCK -> PRE ORDER ROUTING =====
// Same logic as so_fulfillment_sync.txt, run off the SO's own line items. Package_Number
// is skipped in preOrderData — no package exists yet. Duplicate guard by SO_No + SKU
// added here too (same pattern as the 2026-07-21 addition in so_fulfillment_sync.txt),
// para hindi dumoble ang Pre_Order_FF kapag na-re-trigger. PR # tinanggal din sa
// Pre_Order_FF data (per user request 2026-07-21).
custNameForPreOrder = "";
if(custResp.get("data") != null && custResp.get("data").size() > 0)
{
	custRecMapPO = custResp.get("data").get(0);
	nameVal = custRecMapPO.get("Name") + "";
	if(nameVal == "" || nameVal == "null")
	{
		nameVal = custRecMapPO.get("Customer_Name") + "";
	}
	if(nameVal != "" && nameVal != "null")
	{
		custNameForPreOrder = nameVal;
	}
}
preOrderCustAddress = shipAddr;
if(preOrderCustAddress == "")
{
	preOrderCustAddress = billAddr;
}
preOrderStatus = paymentStatus;
if(preOrderStatus == "Partial")
{
	preOrderStatus = "Partially";
}
for each  li2 in soLineItems
{
	itemId = li2.get("item_id") + "";
	stockOnHand = 0;
	itemType = "";
	categoryName = "";
	// DIAGNOSTIC (added 2026-07-21) — stockOnHand defaults to 0 above, same as a
	// genuine zero-stock item, so a failed item_id/API lookup here would silently
	// LOOK LIKE "no stock" and wrongly route every item to Pre_Order_FF. Logging each
	// step so a live test run shows exactly where the lookup breaks, instead of
	// guessing further.
	itemLookupNote = "no item_id on this line item";
	if(itemId != "" && itemId != "null")
	{
		itemResp = zoho.books.getRecordsByID("items",orgId,itemId);
		itemRec = itemResp.get("item");
		if(itemRec != null)
		{
			itemType = itemRec.get("item_type") + "";
			categoryName = itemRec.get("category_name") + "";
			aVal = itemRec.get("actual_available_stock") + "";
			if(aVal != "" && aVal != "null")
			{
				stockOnHand = aVal.toDecimal();
				itemLookupNote = "resolved ok (top-level actual_available_stock = physical stock, confirmed via Zoho Inventory API docs), item_type=" + itemType;
			}
			else
			{
				// PHYSICAL STOCK (updated 2026-07-22, confirmed via Zoho Inventory API docs) — checking
					// actual_available_stock (physical) instead of stock_on_hand (accounting), per user
					// request. Top-level actual_available_stock can come back
				// blank when the Books org has multi-location inventory tracking
				// blank when the Books org has multi-location inventory tracking enabled; the real
					// per-warehouse physical figures live in the item's own
				// "locations" array instead (each with its own location_actual_available_stock,
				// each with its own location_actual_available_stock). Sum across all locations as
					// the stand-in for the item's total physical stock.
				locSum = 0;
				locList = itemRec.get("locations");
				if(locList != null)
				{
					for each  locRec in locList
					{
						locActual = locRec.get("location_actual_available_stock") + "";
						if(locActual != "" && locActual != "null")
						{
							locSum = locSum + locActual.toDecimal();
						}
					}
				}
				stockOnHand = locSum;
				itemLookupNote = "top-level actual_available_stock blank, summed locations[].location_actual_available_stock (physical stock) instead, item_type=" + itemType;
			}
		}
		else
		{
			itemLookupNote = "getRecordsByID returned no item — raw response: " + itemResp;
		}
	}
	info "stock check — SKU [" + (li2.get("sku") + "") + "] item_id [" + itemId + "] stockOnHand=" + stockOnHand + " category_name=[" + categoryName + "] item_type=[" + itemType + "] (" + itemLookupNote + ")";
	// ===== SERVICE ITEM EXCLUSION (per user request 2026-07-21, confirmed via Zoho
	// Books "Edit Item" screenshot — the Item's own "Category" dropdown, separate from
	// the Goods/Service "Type" radio, is what should gate this) — Category "Services"
	// items don't carry physical stock, so stock_on_hand reading 0 for them is
	// normal/expected, not a real "needs procurement" signal. Excluded from
	// Pre_Order_FF routing entirely, even if stockOnHand resolves to 0. item_type kept
	// as a secondary check in case category_name is blank for a given item.
	if(categoryName == "Services" || itemType == "service" || itemType == "digital_service")
	{
		info "SKU " + (li2.get("sku") + "") + " category=" + categoryName + "/type=" + itemType + " — skipping Pre_Order_FF (services don't carry stock).";
		continue;
	}
	if(stockOnHand <= 0)
	{
		skuVal2 = li2.get("sku") + "";
		existingPreOrderResp = invokeurl
		[
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Pre_Order1_Report?criteria=SO%3D%3D%22" + soNumber + "%22%26%26SKU%3D%3D%22" + skuVal2 + "%22"
			type :GET
			headers:{"environment":"production"}
			connection:"supply_chain"
		];
		alreadyHasThisPreOrder = false;
		if(existingPreOrderResp.get("data") != null)
		{
			for each  existingPO in existingPreOrderResp.get("data")
			{
				alreadyHasThisPreOrder = true;
			}
		}
		if(alreadyHasThisPreOrder == true)
		{
			info "Pre_Order_FF already exists for SO " + soNumber + " / SKU " + skuVal2 + " — skipping.";
			continue;
		}
		preOrderData = Map();
		if(soNumber != "")
		{
			preOrderData.put("SO",soNumber);
		}
		if(targetDate != "")
		{
			preOrderData.put("Target_Delivery",targetDate);
		}
		if(soCreatedDate != "")
		{
			preOrderData.put("SO_Creation_Date",soCreatedDate);
		}
		if(orderType != "")
		{
			preOrderData.put("Order_Type",orderType);
		}
		if(custNameForPreOrder != "")
		{
			preOrderData.put("Customer_Name",custNameForPreOrder);
		}
		if(preOrderCustAddress != "")
		{
			preOrderData.put("Customer_Address",preOrderCustAddress);
		}
		if(custType != "")
		{
			preOrderData.put("Customer_Type",custType);
		}
		preOrderData.put("Item_Name",li2.get("name") + "");
		preOrderData.put("SKU",skuVal2);
		preOrderData.put("Qty",li2.get("quantity") + "");
		preOrderData.put("Status",preOrderStatus);
		preOrderCreateResp = zoho.creator.v2_1.createRecord(owner,app,"Pre_Order_FF",preOrderData,config,"supply_chain");
		info "Pre_Order_FF createRecord response: " + preOrderCreateResp;
	}
}

````
