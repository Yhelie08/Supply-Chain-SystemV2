---
title: "syncpackagetofulfillment"
source_file: "syncpackagetofulfillment.txt"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 672
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - kanban
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
  - zoho-creator
  - zoho-inventory
---

# syncpackagetofulfillment

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `syncpackagetofulfillment.txt`
> - **Lines of Code:** 672
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#kanban`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-creator`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
config = Map();

// ===== MOVED TO ZOHO INVENTORY (Package module), 2026-09-02 — real root cause found by
// the user: packages for these SOs are actually created in ZOHO INVENTORY's own "Create
// Package"/"Create Shipment" flow, NOT natively in Zoho Books. Books and Inventory share
// the same underlying package/SO data (same org), but each has its OWN separate
// Workflow Rules system — a Books-side Workflow Rule on Module: Package was NEVER going
// to fire for a package actually created through Inventory's UI. This finally explains
// the previously-undiagnosed mystery of why the original Books Package-trigger degraded
// around 2026-08-29 (see below) — staff were very likely already creating packages via
// Inventory by then, not Books.
//
// This same design was reverted-to-and-modernized earlier the same day (from the
// 2026-09-01 SO-Edited rework, after reviewing "check pac" — a saved snapshot of the
// last CONFIRMED-working version, real EXECUTED Workflow log entries dated 2026-08-15/
// 17). That revert kept every fix layered on since that snapshot — migrated connection
// names (`supply_chain_app`, not the snapshot's old `supply_chain`), the real lowercase
// `customer_name` Customer field (the snapshot still had the pre-2026-07-28 broken
// `Name`/`Customer_Name` lookup, which always came back blank), and the per-item
// (SO+SKU) PR_No lookup + backfill logic the 2026-09-01 SO-Edited rework introduced
// (more precise than the snapshot's whole-SO PR join, kept regardless of which module
// triggers the run). Trigger context reads straight off `package.get(...)` — one event
// = one package, single `alreadyHasThisPackage` boolean guard, package line_items/
// custom_fields come directly off the trigger Map (no separate
// zoho.books.getRecordsByID("packages",...) detail fetch needed).
//
// NONE OF THE SCRIPT'S OWN CODE NEEDS TO CHANGE for this move — Deluge's built-in
// `zoho.books.*`/`zoho.creator.*` tasks are callable from a function hosted in ANY Zoho
// product (Books, Inventory, Creator, CRM, Flow, etc.), not just the one it's defined
// in, and Inventory's own "Package" object is the same underlying record Books reads —
// same field names, same `package.get(...)` shape. Only WHERE the Workflow Rule +
// Function live changes.
//
// WORKFLOW SETUP REQUIRED IN ZOHO INVENTORY (manual step in the UI, not in this
// script) — NOT Zoho Books this time:
//   Zoho Inventory -> Settings -> Automation -> Workflow Rules -> New Workflow Rule
//     Module: Package
//     Workflow Type: Event Based
//     When should this rule be executed: Created or Edited
//     Criteria: none
//     Immediate Action -> Functions -> syncpackagetofulfillment (paste this file's body)
// =====

pkgNo = package.get("package_number") + "";
soId = package.get("salesorder_id") + "";
soNumber = package.get("salesorder_number") + "";
custBookId = package.get("customer_id") + "";
pkgDate = package.get("date") + "";
pkgStatus = package.get("status") + "";

// ===== SO DETAIL FETCH (fresh — the injected `package` trigger Map doesn't carry the
// SO's own custom fields, live packages[] list, or live invoices[] list, all needed
// below; same reasoning already established in the SO-Edited version and
// so_fulfillment_sync.txt.) =====
soResp = zoho.books.getRecordsByID("salesorders",orgId,soId);
soRec = soResp.get("salesorder");
orderTypeRaw = "";
forCrate = false;
custType = "";
targetDate = "";
soCreatedDate = "";
livePackageNumbers = List();
soInvoicePaidValues = List();
if(soRec != null)
{
	soCreatedDate = soRec.get("date") + "";
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
	// SO detail's own "packages" array is the LIVE/current list of packages that still
	// exist for this SO right now (confirmed live 2026-07-10 — the /packages LIST
	// endpoint's salesorder_id/package_number filter params are both silently ignored,
	// always return the unfiltered default list even for a fake package number, so this
	// embedded array is the only reliable way to know which packages are still real).
	soPackages = soRec.get("packages");
	if(soPackages != null)
	{
		for each  sp in soPackages
		{
			livePackageNumbers.add(sp.get("package_number") + "");
		}
	}
	// SO detail also embeds the live list of invoices generated against it (same
	// pattern/reliability as the packages[] array above), but that embedded entry is
	// only basic info (invoice_id, status, total) — it does NOT carry custom_fields.
	// The actual payment info we need is Books' own custom field "Paid" (cf_paid) on
	// the INVOICE itself, values Yes/No/Partial (see Invoices module field settings),
	// so each invoice has to be fetched individually to read its custom_fields — same
	// custom-fields-scan pattern already used above for the SO's own custom fields.
	// Void invoices are skipped here — a cancelled invoice shouldn't count toward the
	// SO's overall payment status.
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
// ===== STALE-RECORD CLEANUP (per user's company workflow: "update a package" = delete
// old + create new, always within the same SO — see this file's own top NOTES). Books
// workflow rules don't support an On-Delete trigger for Packages, so this self-heals
// instead: every time a NEW package is created for an SO, delete any
// Sales_Order_Fulfillment record for that SAME SO whose Package number is no longer in
// the SO's live packages[] list above — its package was deleted in Books. Records for
// packages that ARE still live (legitimate sibling/split-shipment packages) are left
// untouched — this does NOT blanket-delete by SO_No. Also doubles as the source data
// for the Package/Package_Date/Delivery_Type UPDATE loop further down — fetched once,
// used twice, no extra query needed. =====
existingResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report?criteria=SO_No%3D%3D%22" + soNumber + "%22&field_config=all"
	type :GET
	connection:"supply_chain_app_v1"
];
alreadyHasThisPackage = false;
if(existingResp.get("data") != null)
{
	for each  existingRec in existingResp.get("data")
	{
		existingPkgNo = existingRec.get("Package") + "";
		existingId = existingRec.get("ID") + "";
		if(existingPkgNo == pkgNo)
		{
			alreadyHasThisPackage = true;
		}
		else if(existingPkgNo != "" && existingPkgNo != "null" && !livePackageNumbers.contains(existingPkgNo))
		{
			info "Package " + existingPkgNo + " no longer exists on SO " + soNumber + " — deleting stale Sales_Order_Fulfillment record " + existingId;
			delResp = invokeurl
			[
				url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report/" + existingId
				type :DELETE
				connection:"supply_chain_app_v1"
			];
			info "delete resp: " + delResp;
		}
	}
}
// ===== DUPLICATE GUARD (this exact package already synced — re-trigger safety) =====
if(alreadyHasThisPackage == true)
{
	info "Sales_Order_Fulfillment already stamped with Package " + pkgNo + " — skipping.";
	return;
}
// order_type: Creator's choice list uses the same single space as Books' raw value
// (confirmed 2026-07-16 via the form's actual .form schema dump), so pass through as-is.
orderType = orderTypeRaw;
// ===== PACKAGE-LEVEL CUSTOM FIELD (delivery type) — read directly off the `package`
// trigger Map, no separate detail fetch needed (unlike the SO-Edited version's SO-
// embedded packages[] array, which is basic-info-only). Creator's `delivery_type` is
// plain Single Line — passes through Books' raw `cf_delivery_type` value as-is (e.g.
// "Delivery - Metro Manila"). =====
deliveryTypeRaw = "";
pkgCF = package.get("custom_fields");
for each  cf in pkgCF
{
	if(cf.get("api_name") + "" == "cf_delivery_type")
	{
		deliveryTypeRaw = cf.get("value") + "";
	}
}
deliveryType = deliveryTypeRaw;
// ===== PAYMENT STATUS — still computed (used by the Pre_Order_FF routing further
// down), just no longer written onto Sales_Order_Fulfillment by this function. =====
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
if(hasPartial || hasYes && hasNo)
{
	paymentStatus = "Partial";
}
else if(hasYes)
{
	paymentStatus = "Yes";
}
// ===== CUSTOMER LOOKUP — still computed (used by Pre_Order_FF routing further down,
// which still creates its own records same as before), just no longer written onto
// Sales_Order_Fulfillment by this function. =====
custCreatorId = "";
custType = "";
contactNo = "";
billAddr = "";
shipAddr = "";
custResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookId + "%22&field_config=all"
	type :GET
	connection:"supply_chain_app_v1"
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
// Pre_Order_FF customer name — real field is lowercase "customer_name" (confirmed via
// the Customer form's own displayformat, "[customer_name]" — "Name"/"Customer_Name" are
// NOT real fields; fixed 2026-07-28, so_fulfillment_sync.txt applied the same fix).
custNameForPreOrder = "";
if(custResp.get("data") != null && custResp.get("data").size() > 0)
{
	custRecMapPO = custResp.get("data").get(0);
	nameVal = custRecMapPO.get("customer_name") + "";
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
// Pre_Order_FF's Status picklist uses "Partially" where the rest of this script uses
// "Partial" for the same concept — translate just for this form.
preOrderStatus = paymentStatus;
if(preOrderStatus == "Partial")
{
	preOrderStatus = "Partially";
}
// ===== ITEM MATCH + UPDATE (Package / Package_Date / Delivery_Type ONLY) — matches
// each package line by SKU against the ALREADY-fetched existingResp (Sales_Order_
// Fulfillment records so_kanban created at SO-creation time, one per item, one row in
// Item_Details1 each) — no new query needed. Line items come straight off the `package`
// trigger Map, no detail fetch. =====
pkgLineItems = package.get("line_items");
for each  li in pkgLineItems
{
	skuValLi = li.get("sku") + "";
	matchedRecId = "";
	if(existingResp.get("data") != null)
	{
		for each  existingRec in existingResp.get("data")
		{
			existingItemsSof = existingRec.get("Item_Details1");
			if(existingItemsSof != null)
			{
				for each  eiRow in existingItemsSof
				{
					if(eiRow.get("SKU") + "" == skuValLi)
					{
						matchedRecId = existingRec.get("ID") + "";
					}
				}
			}
		}
	}
	if(matchedRecId == "")
	{
		info "No existing Sales_Order_Fulfillment record found for SO " + soNumber + " / SKU " + skuValLi + " — skipping (so_kanban should have created it at SO-creation time).";
		continue;
	}
	updateData = Map();
	updateData.put("Package",pkgNo);
	if(pkgDate != "")
	{
		updateData.put("Package_Date",pkgDate);
	}
	if(deliveryType != "")
	{
		updateData.put("Delivery_Type",deliveryType);
	}
	updateCriteria = "ID==" + matchedRecId;
	info "updating Sales_Order_Fulfillment " + matchedRecId + " for SKU " + skuValLi + ": " + updateData;
	updateResp = zoho.creator.v2_1.updateRecords(owner,app,"Sales_Order_Fulfillment_Report",updateCriteria,updateData,config,"supply_chain_app_v1");
	info "updateRecords response: " + updateResp;
	// ===== PRE-ORDER CLEANUP, ADDED 2026-09-02 per direct user request — an item that
	// was previously routed to Pre_Order_FF (zero stock at the time) can later get a
	// real package once stock actually arrives. Without this, that old Pre_Order_FF
	// record just sits there forever showing "Pending" even though the SAME item now
	// genuinely has a Package # on its Sales_Order_Fulfillment record — confusing, since
	// the item would show as both packaged AND still pending in two different reports.
	// This item just got matched+updated with a real Package above, so its Pre-Order
	// entry (if any) is now stale. CHANGED 2026-09-02, per user ("wag delete pala hide
	// nalang") — HIDE via a new `Packaged_Out` checkbox field on Pre_Order_FF (added to
	// the form) instead of deleting the record outright, same hide-not-delete pattern
	// already used elsewhere in this app's pipeline (For_Crate/Select_To_Package-style
	// checkbox fields). The Pre_Order1_Report's own Report Criteria still needs a
	// matching manual UI change ("Packaged_Out is not checked") to actually stop
	// showing these rows — that's a Zoho Creator report setting, not something this
	// script controls. =====
	preOrderCleanupResp = invokeurl
	[
		url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Pre_Order1_Report?criteria=SO%3D%3D%22" + soNumber + "%22%26%26SKU%3D%3D%22" + skuValLi + "%22&field_config=all"
		type :GET
		connection:"supply_chain_app_v1"
	];
	if(preOrderCleanupResp.get("data") != null)
	{
		for each  staleP1Rec in preOrderCleanupResp.get("data")
		{
			staleP1Id = staleP1Rec.get("ID") + "";
			info "Item " + skuValLi + " on SO " + soNumber + " now has a real Package (" + pkgNo + ") — hiding stale Pre_Order_FF record " + staleP1Id;
			p1HideData = Map();
			p1HideData.put("Packaged_Out",true);
			p1HideResp = zoho.creator.v2_1.updateRecordById(owner,app,"Pre_Order1_Report",staleP1Id,p1HideData,config,"supply_chain_app_v1");
			info "Pre_Order_FF hide resp: " + p1HideResp;
		}
	}
}
// ===== ZERO-STOCK -> PRE ORDER ROUTING (per user request 2026-07-18: an item with no
// Stock on Hand can't get a PAC# yet since it hasn't been received. Books' package/SO
// line_items don't carry stock info — only the standalone Items endpoint does, as
// "actual_available_stock", physical stock.) =====
for each  li2 in pkgLineItems
{
	itemId = li2.get("item_id") + "";
	stockOnHand = 0;
	if(itemId != "" && itemId != "null")
	{
		itemResp = zoho.books.getRecordsByID("items",orgId,itemId);
		itemRec = itemResp.get("item");
		if(itemRec != null)
		{
			sohVal = itemRec.get("actual_available_stock") + "";
			if(sohVal != "" && sohVal != "null")
			{
				stockOnHand = sohVal.toDecimal();
			}
		}
	}
	// ===== ORDER TYPE ALLOWLIST, ADDED 2026-09-02 — same gate `so_fulfillment_sync.txt`
	// added 2026-08-28 (that file's own comment has the full user-supplied allowlist of
	// every real Order Type value in this org and which report each belongs in). Real
	// live bug found by the user: SO-10283's SKU FDEL267/FDEL268 (Order Type "Normal")
	// were showing up in the Pre-Order Report even though "Normal" orders should ONLY
	// ever appear in the Sales Order Report. This gate was deliberately NOT carried over
	// when it was first added to so_fulfillment_sync.txt (per that file's own scope
	// note, "don't extend a fix to a sibling file unless told to") — now added here too,
	// per direct user instruction, since the same zero-stock routing exists in both
	// files' Pre_Order_FF loop. Only "Pre Order"/"(Partly) Pre Order" ever proceed past
	// this point; every other Order Type (including "Normal") is skipped — it still gets
	// its Sales_Order_Fulfillment record from the item-match loop above, unaffected. =====
	if(orderType != "Pre Order" && orderType != "(Partly) Pre Order")
	{
		info "SKU " + li2.get("sku") + "" + " — Order Type is '" + orderType + "', only 'Pre Order'/'(Partly) Pre Order' ever enter Pre_Order_FF — skipping.";
		continue;
	}
	if(stockOnHand <= 0)
	{
		// ===== DUPLICATE GUARD (same SO + same Item already has a Pre_Order_FF
		// record — re-trigger safety, same pattern as the Sales_Order_Fulfillment
		// guard above) =====
		skuVal2 = li2.get("sku") + "";
		existingPreOrderResp = invokeurl
		[
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Pre_Order1_Report?criteria=SO%3D%3D%22" + soNumber + "%22%26%26SKU%3D%3D%22" + skuVal2 + "%22&field_config=all"
			type :GET
			connection:"supply_chain_app_v1"
		];
		existingPreOrderId = "";
		existingPreOrderPR = "";
		if(existingPreOrderResp.get("data") != null)
		{
			for each  existingPO in existingPreOrderResp.get("data")
			{
				existingPreOrderId = existingPO.get("ID") + "";
				existingPreOrderPR = existingPO.get("PR") + "";
			}
		}
		// ===== PR LOOKUP, PER ITEM (SO+SKU) — more precise than a whole-SO join, kept
		// from the 2026-09-01 SO-Edited rework's own refinement. =====
		prNoForItemPo = "";
		prLookupPo = invokeurl
		[
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=Sales_Order%3D%3D%22" + soNumber + "%22%26%26sku%3D%3D%22" + skuVal2 + "%22&field_config=all"
			type :GET
			connection:"supply_chain_app_v1"
		];
		if(prLookupPo.get("data") != null)
		{
			for each  prRecPo in prLookupPo.get("data")
			{
				prNoValPo = prRecPo.get("PR_No") + "";
				if(prNoValPo != "" && prNoValPo != "null")
				{
					prNoForItemPo = prNoValPo;
				}
			}
		}
		if(existingPreOrderId != "")
		{
			if((existingPreOrderPR == "" || existingPreOrderPR == "null") && prNoForItemPo != "")
			{
				backfillPOData = Map();
				backfillPOData.put("PR",prNoForItemPo);
				backfillPOResp = zoho.creator.v2_1.updateRecordById(owner,app,"Pre_Order1_Report",existingPreOrderId,backfillPOData,config,"supply_chain_app_v1");
				info "Backfilled PR " + prNoForItemPo + " onto existing Pre_Order_FF " + existingPreOrderId + " (SO " + soNumber + " / SKU " + skuVal2 + "): " + backfillPOResp;
			}
			else
			{
				info "Pre_Order_FF already exists for SO " + soNumber + " / SKU " + skuVal2 + " — skipping.";
			}
			continue;
		}
		preOrderData = Map();
		preOrderData.put("Package_Number",pkgNo);
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
		if(prNoForItemPo != "")
		{
			preOrderData.put("PR",prNoForItemPo);
		}
		if(deliveryType != "")
		{
			preOrderData.put("Delivery_Type",deliveryType);
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
		preOrderData.put("SKU",li2.get("sku") + "");
		preOrderData.put("Qty",li2.get("quantity") + "");
		preOrderData.put("Status",preOrderStatus);
		// FIXED 2026-09-10, real gap found live (Pre Order Report widget showing "—"
		// instead of a Pending/Received badge for every row created by THIS function,
		// inconsistent with rows created by so_kanban_sync.txt which always show
		// "Pending") — unlike so_kanban_sync.txt's own equivalent Pre_Order_FF create
		// (which explicitly sets Pre_Order_Status="Pending"), this block never put
		// Pre_Order_Status into preOrderData at all, so every record made from this
		// Inventory-Package-triggered path (these rows already carry a real
		// Package_Number, since the whole function fires off a Package creation event)
		// was left with a genuinely blank Pre_Order_Status — not a display bug, the
		// field itself was never written. Same "Pending" default now applied here too.
		preOrderData.put("Pre_Order_Status","Pending");
		info "zero-stock item " + li2.get("sku") + "" + " on package " + pkgNo + " — creating Pre_Order_FF record: " + preOrderData;
		preOrderCreateResp = zoho.creator.v2_1.createRecord(owner,app,"Pre_Order_FF",preOrderData,config,"supply_chain_app_v1");
		info "Pre_Order_FF createRecord response: " + preOrderCreateResp;
	}
}

````
