---
title: "so_fulfillment_sync"
source_file: "production\so_fulfillment_sync.txt"
category: "Fulfillment/SO Report/Deluge/_variants/Main-DelugeScripts"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 627
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
---

# so_fulfillment_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Fulfillment/SO Report/Deluge/_variants/Main-DelugeScripts`
> - **Source File:** `production\so_fulfillment_sync.txt`
> - **Lines of Code:** 627
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#kanban`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PRODUCTION COPY — so_fulfillment_sync.txt ==
== Twinned from DelugeScripts/so_fulfillment_sync.txt on 2026-08-04 ==
== Per docs/DevToProd/2026-08-04-deluge-dev-to-prod-cutover.md ==
== Key rule: environment header OMITTED = defaults to Production (confirmed live 2026-08-04) ==
== Do NOT write environment:"production" as a literal — that throws code 2930. ==
Books Custom Function: syncPackageToFulfillment
Module: Packages (Created trigger)

RECAPTURED 2026-07-24 from a live paste (Temp.txt) — the on-disk copy of this file was
STALE, missing the whole 2026-07-21 per-item rewrite (Sales_Order_Fulfillment used to
be one record per PACKAGE with a multi-row Item_Details1 subform; now it's one record
per ITEM, single-row subform, same pattern `so_kanban_sync.txt` also uses). This
capture reflects the real live version as of today, before the change below.

CHANGED 2026-07-24, per user request ("dont populate other fields except - Package # ,
Package Date, Delivery Type") — real architecture shift, not just a field-list trim.
Since `so_kanban_sync.txt` now ALREADY creates one Sales_Order_Fulfillment record per
item at SO-CREATION time (Item/SKU/Quantity/Bin_Location/Fulfillment_Stage, no package
data yet since no package exists then), this function creating a SECOND full record per
item at PACKAGE-creation time was a real duplication risk — same item would end up with
2 Sales_Order_Fulfillment records, one from each function. Fixed: this function no
longer CREATES records at all — it finds the EXISTING record so_kanban already made
(matched by SO_No + the package line's own SKU, read out of the SO_No-scoped
`existingResp` query already fetched earlier in this same script for the stale-cleanup
pass — no extra query needed) and UPDATES just 3 fields on it: `Package`, `Package_Date`,
`Delivery_Type` (all 3 link names already confirmed from this script's own prior CREATE
payload, no need to re-ask). If no matching record is found (so_kanban hasn't run for
this item yet, or ran before this feature existed), it's skipped with a log line, not
silently created with partial data. `zoho.creator.v2_1.updateRecords` (plural,
criteria-based `"ID==" + matchedRecId`) used — same task/param shape already proven in
`books_estimate_sync.txt` (`(owner, app, report, criteria, data, config, connection)`),
no confirmed precedent in this codebase for a singular by-ID update task. Everything
else in this file (stale-package cleanup, duplicate-package guard, the whole zero-stock
→ Pre_Order_FF routing section) is UNCHANGED — only the Sales_Order_Fulfillment
per-item block itself was rewritten from create to update.

UNTESTED after this change — needs a live package creation on the test SO to confirm
the matching existing Sales_Order_Fulfillment records get Package/Package_Date/
Delivery_Type stamped, with every other field left exactly as so_kanban set it.

===============================================================================
FUNCTION BODY — paste over the live syncPackageToFulfillment function
===============================================================================

owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
config = Map();
pkgNo = package.get("package_number") + "";
soId = package.get("salesorder_id") + "";
soNumber = package.get("salesorder_number") + "";
custBookId = package.get("customer_id") + "";
pkgDate = package.get("date") + "";
pkgStatus = package.get("status") + "";
// TEST GATE REMOVED — this is the Production copy. All packages are processed.
// ===== SO DETAIL FETCH (custom fields + live packages[] list + live invoices[] list —
// all needed below) =====
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
// ===== STALE-RECORD CLEANUP (per user's company workflow: "update a package" =
// delete old + create new, always within the same SO — see this file's own top NOTES).
// Books workflow rules don't support an On-Delete trigger for Packages, so this
// self-heals instead: every time a NEW package is created for an SO, delete any
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
	connection:"supply_chain"
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
				connection:"supply_chain"
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
// (confirmed 2026-07-16 via the form's actual .form schema dump — the earlier
// double-space workaround was based on stale info and has been removed), so pass
// through as-is.
orderType = orderTypeRaw;
// ===== PACKAGE-LEVEL CUSTOM FIELD (delivery type) =====
// Creator's `delivery_type` is plain Single Line — passes through Books' raw
// `cf_delivery_type` value as-is (e.g. "Delivery - Metro Manila").
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
// ===== PR_No LOOKUP — still computed (used by Pre_Order_FF routing further down). =====
prNoJoined = "";
shipMode = "";
prResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=Sales_Order%3D%3D%22" + soNumber + "%22&field_config=all"
	type :GET
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
// ===== ITEM MATCH + UPDATE (Package / Package_Date / Delivery_Type ONLY) =====
// CHANGED 2026-07-24 — see this file's own top NOTES for the full architecture
// reasoning. Matches each package line by SKU against the ALREADY-fetched
// existingResp (Sales_Order_Fulfillment records so_kanban created at SO-creation
// time, one per item, one row in Item_Details1 each) — no new query needed.
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
	updateResp = zoho.creator.v2_1.updateRecords(owner,app,"Sales_Order_Fulfillment_Report",updateCriteria,updateData,config,"supply_chain");
	info "updateRecords response: " + updateResp;
}
// ===== ZERO-STOCK -> PRE ORDER ROUTING (per user request 2026-07-18: an item with no
// Stock on Hand can't get a PAC# yet since it hasn't been received. Books' package/SO
// line_items don't carry stock info — only the standalone Items endpoint does, as
// "stock_on_hand" (the item's aggregate across all warehouse locations; confirmed via
// Zoho Books API docs, since the location-wise breakdown ("locations" array with
// location_stock_on_hand) lives there too but isn't needed when the aggregate is
// available). UNCHANGED by the 2026-07-24 update above — Pre_Order_FF still gets its
// own record per zero-stock item, same as before. =====
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
// Pre_Order_FF's Status picklist uses "Partially" where the rest of this script uses
// "Partial" for the same concept — translate just for this form.
preOrderStatus = paymentStatus;
if(preOrderStatus == "Partial")
{
	preOrderStatus = "Partially";
}
for each  li2 in pkgLineItems
{
	itemId = li2.get("item_id") + "";
	stockOnHand = 0;
	if(itemId != "" && itemId != "null")
	{
		// CHANGED 2026-07-29, per user ("actual_available_stock - can we use
		// this as main bin location in every bin location occurrence... like
		// so_to_pr") — was reading "stock_on_hand" (accounting), switched to
		// "actual_available_stock" (physical), matching the already-
		// established convention in so_to_pr_scripts_NewScripts.txt/
		// so_kanban_sync.txt. `stockOnHand` variable name kept as-is (used
		// throughout the rest of this block) — only the SOURCE field changed.
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
	if(stockOnHand <= 0)
	{
		// ===== DUPLICATE GUARD (same SO + same Item already has a Pre_Order_FF record —
		// re-trigger safety, same pattern as the Sales_Order_Fulfillment guard above) =====
		skuVal2 = li2.get("sku") + "";
		existingPreOrderResp = invokeurl
		[
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Pre_Order1_Report?criteria=SO%3D%3D%22" + soNumber + "%22%26%26SKU%3D%3D%22" + skuVal2 + "%22"
			type :GET
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
		if(prNoJoined != "")
		{
			preOrderData.put("PR",prNoJoined);
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
		info "zero-stock item " + li2.get("sku") + "" + " on package " + pkgNo + " — creating Pre_Order_FF record: " + preOrderData;
		preOrderCreateResp = zoho.creator.v2_1.createRecord(owner,app,"Pre_Order_FF",preOrderData,config,"supply_chain");
		info "Pre_Order_FF createRecord response: " + preOrderCreateResp;
	}
}

````
