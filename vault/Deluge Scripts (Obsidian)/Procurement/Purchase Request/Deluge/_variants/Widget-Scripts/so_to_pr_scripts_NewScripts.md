---
title: "so_to_pr_scripts_NewScripts"
source_file: "DMS\DelugeScripts\production\so_to_pr_scripts_NewScripts.txt"
category: "Procurement/Purchase Request/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 1034
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - kanban
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
  - zoho-inventory
---

# so_to_pr_scripts_NewScripts

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\production\so_to_pr_scripts_NewScripts.txt`
> - **Lines of Code:** 1,034
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#kanban`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PRODUCTION COPY — so_to_pr_scripts_NewScripts.txt ==
== Twinned from DelugeScripts/so_to_pr_scripts_NewScripts.txt on 2026-08-04 ==
== Per docs/DevToProd/2026-08-04-deluge-dev-to-prod-cutover.md ==
== Key rule: environment header OMITTED = defaults to Production (confirmed live 2026-08-04) ==
== Do NOT write environment:"production" as a literal — that throws code 2930. ==
== Books SO → Creator Purchase_Request1 (CONDITIONAL VERSION) ==
== Triggered when SO status = "approved" — AND on every subsequent Edit while
   still Approved (added 2026-07-28, per user: "when edited, for example i've
   added another item in approved SO... script will run again to update what's
   in creator") ==
== Gates: (1) Order Type  (2) Services category skip  (3) Stock on hand  (4) INQ routing ==
== REORDERED 2026-07-22 — Services skip now runs BEFORE stock and reads category
   straight from Books, not Creator (see NOTES / GATE 2 comment inline for why the
   old order silently never worked). ==
== DEDUP GUARD added 2026-07-28 — since this now also fires on Edit (not just the
   original one-time Approval), each line first checks whether a Purchase_Request1
   already exists for this SO+SKU and skips if so — only a genuinely new line (e.g.
   one added to the SO after approval) reaches the gates and gets a PR created.
   See inline comment at the guard itself for the full reasoning. ==
== FIELD-EDIT SYNC added 2026-07-31 — an already-existing PR1 is no longer just
   skipped: Qty/Item Name/Description/Unit/Target Date/Rate/Order Value/Sales Owner
   are re-synced from Books to Creator whenever they've changed, unless the PR is
   already Converted to PO. See the DEDUP GUARD's own inline comment + NOTES. ==
== STATUS CHECK MOVED INLINE, 2026-08-01 — confirmed live (user screenshot of the
   real Workflow Rule config) that Books' own "Status is Approved" CRITERION only
   fires the FIRST time Status transitions into Approved, not on later edits where
   Status stays Approved but some other field changes — even with the rule's own
   execution condition set to "Any field is updated". This is a real Books
   criterion-evaluation quirk (edge/transition-triggered for this field, not a live
   level check), not a code bug — nothing in this function was ever wrong. Fixed by
   REMOVING "Status is Approved" from the Books-side Criterion entirely and reading
   the live status straight off the injected `salesorder` map instead, inside the
   function — see the new guard right after the header vars below. The rule's own
   Criterion now only needs the customer-name test condition (or nothing, once
   that's removed for production) — Status is no longer part of it at all. ==

====================================================
WORKFLOW SETUP — SO_To_PR
====================================================
In Zoho Books:
  Settings → Automation → Workflow Rules
  Module: Sales Orders
  Trigger: Create or Edit — "Execute the workflow when Any field is updated"
  Condition: REMOVE "Status is Approved" from Criterion 1 (see STATUS CHECK MOVED
    INLINE note above — this criterion only fires on the FIRST transition into
    Approved, confirmed live, not on later edits). Status is now checked INSIDE
    the function instead — see the guard right after the header vars below.
  Action: Custom Function → SO_To_PR

  (CHANGED 2026-07-28 — was "On Approval" only; now also fires on every Edit,
  so adding a line item later re-runs this function. Safe to fire on unrelated
  edits too — Line items unchanged just re-hit the dedup guard and skip, no
  duplicate PRs. CHANGED AGAIN 2026-08-01 — Status is no longer part of the
  Books-side Criterion at all, see above; the function now runs on every edit
  of a matching-customer SO regardless of status, and returns immediately if
  status isn't currently "approved".)

  TEST CONDITION — REMOVE FOR PRODUCTION (delete this Criterion from the Books Workflow Rule):
    Criterion 1: Customer Name is "(TEST ORDER) BY CPY PAM TAN"
====================================================

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
config = Map();

custName = salesorder.get("customer_name");
custBookId = salesorder.get("customer_id");
soNumber = salesorder.get("salesorder_number");
soTotal = salesorder.get("total");

// ===== STATUS GATE (moved inline 2026-08-01) — replaces the removed Books-side
// "Status is Approved" Criterion (see header NOTES + WORKFLOW SETUP above: that
// criterion only fired once, on the transition INTO Approved, confirmed live —
// not on later edits where Status stays Approved). Reads the live value straight
// off the injected salesorder Map every single run, so an edit long after the
// original approval is checked fresh, not against whatever triggered the workflow
// rule itself. =====
// FIXED 2026-08-07, real bug: Books SO status moves PAST "approved" once an
// invoice is generated against it ("invoiced"/"partially_invoiced"), and this
// gate's exact-match check silently skipped every later edit on an invoiced
// SO — including new line items — instead of only blocking genuinely
// pre-approval/cancelled statuses. Switched to a blocklist of the statuses
// that really should skip (not yet approved, or cancelled/void) instead of a
// single required value.
notYetApprovedStatuses = List();
notYetApprovedStatuses.add("draft");
notYetApprovedStatuses.add("pending_approval");
notYetApprovedStatuses.add("void");
notYetApprovedStatuses.add("cancelled");
soStatus = (salesorder.get("status") + "").toLowerCase();
if(notYetApprovedStatuses.contains(soStatus))
{
	info "SO " + soNumber + " status is '" + soStatus + "', not yet approved (or cancelled) — skipping.";
	return;
}

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
orderTypeNorm = (orderType + "").replaceAll("  ", " ").trim();
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
	url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookId + "%22"
	type: GET
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
	itemRate = item.get("rate");

	info "line " + skuVal + " | inqNo: " + soInqNo;

	// ===== DEDUP GUARD (added 2026-07-28, EXTENDED 2026-07-31) — per user
	// ("when edited, for example i've added another item in approved SO...
	// script will run again to update what's in creator", then later: "how
	// about every edit? it should also reflect new item if have, field edits
	// like qty and everything we need to update in creator's PR"). This
	// function fires on every Edit while the SO stays Approved (see WORKFLOW
	// SETUP above), not just the original one-time Approval. A line that
	// already has a Purchase_Request1 no longer just gets silently skipped —
	// its core fields (Qty/Item Name/Description/Unit/Target Date/Rate/
	// Order Value/Sales Owner) are re-synced from Books to Creator whenever
	// they've actually changed since the PR1 was created. field_config=all
	// added so the comparison below has real current field values to diff
	// against, not just whatever's on the report's default column layout.
	// Skipped entirely (no update attempted) once PR_Status=="Converted to
	// PO" — native PR_Lock_After_PO already blocks Qty/Target_Delivery/etc at
	// the Validations level once a PR becomes a real PO, so a write here
	// would just get rejected anyway — there is nowhere safe left to land a
	// Books-side edit once that has happened. Deliberately does NOT re-route
	// which supplier owns the line (inquiry_reference/Supplier_Selected) —
	// that is an INQ-routing decision made once at creation time; re-routing
	// an already-answered supplier PR on a later unrelated SO edit would be a
	// much bigger, riskier change than what was asked for here. Relies on the
	// existing native PR_Changed workflow (Purchase_Request1, Edited >
	// Successful form submission, see PR1_Created_Edited_Routing.txt) to
	// cascade these same field changes down onto the supplier PR forms — that
	// workflow already unconditionally re-syncs quantity/Description1/
	// description/unit/Target_Delivery/etc into both Fenteng_Lighting_
	// Purchase_Request/Tony_Fan_Purchase_Request on every PR1 edit, no matter
	// what triggered it, and has no Source=="SO" guard — this update call is
	// assumed to fire it the same way zoho.creator.v2_1.createRecord is
	// already confirmed to fire target-form Created workflows (unconfirmed
	// for updateRecords specifically until live-tested; flag if PR_Changed
	// does not fire from this call and the supplier PR forms stay stale). =====
	dupCheckUrl = "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?field_config=all&criteria=(Sales_Order%3D%3D%22" + soNumber + "%22%20%26%26%20sku%3D%3D%22" + skuVal + "%22)";
	dupResp = invokeurl
	[
		url: dupCheckUrl
		type: GET
		connection: "supply_chain"
	];
	if(dupResp.get("data") != null && dupResp.get("data").size() > 0)
	{
		existingPR = dupResp.get("data").get(0);
		existingId = existingPR.get("ID") + "";
		existingStatus = existingPR.get("PR_Status") + "";
		if(existingStatus == "Converted to PO")
		{
			info "PR " + existingId + " (SO " + soNumber + " / SKU " + skuVal + ") already Converted to PO — skipping edit-sync.";
			continue;
		}

		newRateStr = "";
		if(itemRate != null) { newRateStr = itemRate.toLong() + ""; }
		newOrderValStr = "";
		if(soTotal != null) { newOrderValStr = soTotal.toLong() + ""; }

		existingQty = existingPR.get("quantity") + "";
		existingDesc1 = existingPR.get("Description1") + "";
		existingDesc = existingPR.get("description") + "";
		existingUnit = existingPR.get("unit") + "";
		existingTarget = existingPR.get("Target_Delivery") + "";
		existingRate = existingPR.get("SRP_Rate_PR") + "";
		existingOrderVal = existingPR.get("Order_Value") + "";
		existingSalesOwner = existingPR.get("Sales_Owner") + "";

		hasFieldChanges = false;
		if(existingQty != (itemQty + "")) { hasFieldChanges = true; }
		if(existingDesc1 != (itemName + "")) { hasFieldChanges = true; }
		if(existingDesc != (itemDesc + "")) { hasFieldChanges = true; }
		if(existingUnit != (itemUnit + "")) { hasFieldChanges = true; }
		if(targetDate != "" && existingTarget != targetDate) { hasFieldChanges = true; }
		if(newRateStr != "" && existingRate != newRateStr) { hasFieldChanges = true; }
		if(newOrderValStr != "" && existingOrderVal != newOrderValStr) { hasFieldChanges = true; }
		if(salesOwner != "" && existingSalesOwner != salesOwner) { hasFieldChanges = true; }

		if(hasFieldChanges == true)
		{
			updateData = Map();
			updateData.put("quantity", itemQty);
			updateData.put("Description1", itemName);
			updateData.put("description", itemDesc);
			updateData.put("unit", itemUnit);
			if(targetDate != "") { updateData.put("Target_Delivery", targetDate); }
			if(newRateStr != "") { updateData.put("SRP_Rate_PR", itemRate.toLong()); }
			if(newOrderValStr != "") { updateData.put("Order_Value", soTotal.toLong()); }
			if(salesOwner != "") { updateData.put("Sales_Owner", salesOwner); }
			updateCriteria = "ID==" + existingId;
			updateResp = zoho.creator.v2_1.updateRecords(owner, app, "All_Purchase_Request", updateCriteria, updateData, config, "supply_chain");
			info "Edit-sync PR " + existingId + " (SO " + soNumber + " / SKU " + skuVal + "): " + updateResp;
		}
		else
		{
			info "PR " + existingId + " (SO " + soNumber + " / SKU " + skuVal + ") — no field changes, skipping update.";
		}
		continue;
	}

	// ----- Books item detail fetch (used for BOTH category + stock — one call) -----
	itemBooks = zoho.books.getRecordsByID("items", orgId, itemBooksId);
	info "itemBooks response: " + itemBooks;
	booksCategory = "";
	availStock = 0;
	if(itemBooks != null && itemBooks.get("item") != null)
	{
		booksItem = itemBooks.get("item");
		booksCategory = booksItem.get("category_name") + "";
		// CHANGED 2026-07-28, per user request: use the SAME stock basis as
		// so_fulfillment_sync.txt — "actual_available_stock" (top-level, PHYSICAL
		// stock), with a fallback sum over locations[].location_actual_available_stock
		// if the top-level field is blank. Previously used "available_stock" (a
		// different/accounting basis) — same divergence already flagged in
		// so_kanban_sync.txt's own row (accounting stock=0 vs physical stock=3 on the
		// same item, confirmed live).
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
		url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Items?criteria=SKU%3D%3D%22" + skuVal + "%22"
		type: GET
		connection: "supply_chain"
	];
	if(itemResp.get("data") != null && itemResp.get("data").size() > 0)
	{
		itemCreatorId = itemResp.get("data").get(0).get("ID");
		itemCategory = itemResp.get("data").get(0).get("category");
	}
	// ADDED 2026-08-08, per user request ("what if so_to_pr -> scenario: added item
	// in books and that SO doesnt have the item in our supply chain all_items. can
	// we import that non existent item like how add item by ID imports it?") — the
	// All_Items lookup above used to just leave itemCreatorId blank forever on a
	// miss, silently creating the PR with no Items lookup link. Mirrors
	// addItemByIdBooks's own field mapping/upsert exactly (see
	// DelugeScripts/add_item_by_id_custom_api.txt) — reuses itemBooks/booksItem
	// already fetched above (Gate 2's own stock-check call) instead of a 2nd Books
	// invokeurl for the same item. Runs BEFORE Gate 4 so THIS SAME PR-creation pass
	// already gets a populated Items lookup, not just the next edit/run.
	if(itemCreatorId == "" && itemBooks != null && itemBooks.get("item") != null)
	{
		importItem = itemBooks.get("item");
		imItemName = ifnull(importItem.get("name"),"");
		imSku = ifnull(importItem.get("sku"),"");
		imItemRef = ifnull(importItem.get("cf_oldsku"),"");
		imDescription = ifnull(importItem.get("cf_description"),"");
		imUnit = ifnull(importItem.get("unit"),"");
		imRate = ifnull(importItem.get("rate"),0);
		imCategory = ifnull(importItem.get("category_name"),"");
		imWarehouses = importItem.get("warehouses");

		imWarehouseStr = "";
		if(imWarehouses != null)
		{
			for each  imWh in imWarehouses
			{
				imAvail = imWh.get("warehouse_actual_available_stock");
				if(imAvail != null && imAvail != 0)
				{
					imWhName = imWh.get("warehouse_name") + "";
					if(imWarehouseStr == "") { imWarehouseStr = imWhName; } else { imWarehouseStr = imWarehouseStr + ", " + imWhName; }
				}
			}
		}

		// Bin locations — same 3 real storage warehouses addItemByIdBooks checks,
		// same unrolled-not-looped convention (Map.keys() iteration unproven here).
		imBinStr = "";

		imWhMatch1 = null;
		if(imWarehouses != null)
		{
			for each  imWh1 in imWarehouses
			{
				if((imWh1.get("warehouse_id") + "") == "2680178000042173149") { imWhMatch1 = imWh1; }
			}
		}
		if(imWhMatch1 != null && imWhMatch1.get("is_storage_location_enabled") == true)
		{
			imBinResp1 = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000042173149/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
				type :GET
				connection:"zhbooksfullaccessall"
			];
			imLocs1 = imBinResp1.get("storage_locations");
			imRealBins1 = "";
			if(imLocs1 != null)
			{
				for each  imLoc1 in imLocs1
				{
					imLocName1 = imLoc1.get("name") + "";
					if(imLocName1 != "Receiving Area" && imLocName1 != "Package Area" && imLocName1 != "Default Area")
					{
						if(imRealBins1 == "") { imRealBins1 = imLocName1; } else { imRealBins1 = imRealBins1 + ", " + imLocName1; }
					}
				}
			}
			imSeg1 = "";
			if(imRealBins1 != "") { imSeg1 = "HC WH3 BAESA: " + imRealBins1; } else { imSeg1 = "HC WH3 BAESA: Map Bins"; }
			imBinStr = imSeg1;
		}

		imWhMatch2 = null;
		if(imWarehouses != null)
		{
			for each  imWh2 in imWarehouses
			{
				if((imWh2.get("warehouse_id") + "") == "2680178000055220196") { imWhMatch2 = imWh2; }
			}
		}
		if(imWhMatch2 != null && imWhMatch2.get("is_storage_location_enabled") == true)
		{
			imBinResp2 = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000055220196/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
				type :GET
				connection:"zhbooksfullaccessall"
			];
			imLocs2 = imBinResp2.get("storage_locations");
			imRealBins2 = "";
			if(imLocs2 != null)
			{
				for each  imLoc2 in imLocs2
				{
					imLocName2 = imLoc2.get("name") + "";
					if(imLocName2 != "Receiving Area" && imLocName2 != "Package Area" && imLocName2 != "Default Area")
					{
						if(imRealBins2 == "") { imRealBins2 = imLocName2; } else { imRealBins2 = imRealBins2 + ", " + imLocName2; }
					}
				}
			}
			imSeg2 = "";
			if(imRealBins2 != "") { imSeg2 = "HC WH1 BANAWE: " + imRealBins2; } else { imSeg2 = "HC WH1 BANAWE: Map Bins"; }
			if(imBinStr == "") { imBinStr = imSeg2; } else { imBinStr = imBinStr + " | " + imSeg2; }
		}

		imWhMatch3 = null;
		if(imWarehouses != null)
		{
			for each  imWh3 in imWarehouses
			{
				if((imWh3.get("warehouse_id") + "") == "2680178000047672049") { imWhMatch3 = imWh3; }
			}
		}
		if(imWhMatch3 != null && imWhMatch3.get("is_storage_location_enabled") == true)
		{
			imBinResp3 = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000047672049/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
				type :GET
				connection:"zhbooksfullaccessall"
			];
			imLocs3 = imBinResp3.get("storage_locations");
			imRealBins3 = "";
			if(imLocs3 != null)
			{
				for each  imLoc3 in imLocs3
				{
					imLocName3 = imLoc3.get("name") + "";
					if(imLocName3 != "Receiving Area" && imLocName3 != "Package Area" && imLocName3 != "Default Area")
					{
						if(imRealBins3 == "") { imRealBins3 = imLocName3; } else { imRealBins3 = imRealBins3 + ", " + imLocName3; }
					}
				}
			}
			imSeg3 = "";
			if(imRealBins3 != "") { imSeg3 = "INVENTORY: " + imRealBins3; } else { imSeg3 = "INVENTORY: Map Bins"; }
			if(imBinStr == "") { imBinStr = imSeg3; } else { imBinStr = imBinStr + " | " + imSeg3; }
		}

		imData = Map();
		imData.put("ID1", itemBooksId + "");
		imData.put("item_name", imItemName);
		imData.put("SKU", imSku);
		imData.put("Item_ref", imItemRef);
		imData.put("Description", imDescription);
		imData.put("Unit", imUnit);
		imData.put("Rate", imRate);
		imData.put("category", imCategory);
		imData.put("Warehouse", imWarehouseStr);
		imData.put("Bin_location", imBinStr);
		imCreateResp = zoho.creator.v2_1.createRecord(owner, app, "Items", imData, config, "supply_chain");
		info "Auto-imported missing item " + skuVal + " into Items: " + imCreateResp;
		if(imCreateResp != null && imCreateResp.get("data") != null)
		{
			itemCreatorId = imCreateResp.get("data").get("ID") + "";
			itemCategory = imCategory;
		}
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
			if(singleInq == "") { continue; }
			inqResp = invokeurl
			[
				url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Inquiries?criteria=INQ_No%3D%3D%22" + singleInq + "%22"
				type: GET
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
								// FIXED 2026-08-04, real bug found live in Production — sid is a
								// bracketed CREATOR RECORD ID (differs per environment, Dev's
								// hardcoded literals below never matched anything in Prod, silently
								// routing to neither supplier). Resolved via a Creator REST lookup
								// (this is a BOOKS function, no native Suppliers[ID==...] task
								// available) against the Suppliers form's own Supplier_ID field —
								// the real, environment-constant Books Contact ID. Same fix as
								// edit_counter_scripts.txt/PR1_Created_Edited_Routing.txt, adapted
								// for REST since this file calls Creator over invokeurl, not
								// natively.
								sidRawSTP = sid.removeFirstOccurence("[").removeLastOccurence("]");
								quoteBooksIdSTP = "";
								if(sidRawSTP != "")
								{
									supResp = invokeurl
									[
										url: "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Suppliers?criteria=ID%3D%3D%22" + sidRawSTP + "%22"
										type: GET
										connection: "supply_chain"
									];
									if(supResp.get("data") != null && supResp.get("data").size() > 0)
									{
										quoteBooksIdSTP = supResp.get("data").get(0).get("Supplier_ID") + "";
									}
								}
								if(quoteBooksIdSTP == "2680178000049168001") { routeFenteng = true; hasFentengQuote = true; }
								if(quoteBooksIdSTP == "2680178000002735078") { routeTony = true; hasTonyQuote = true; }
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
			fRow.put("Supplier_ID", "4662244000014031308");
			fRow.put("Suppliers", "Fenteng");
			prSupplierRows.add(fRow);
		}
		if(routeTony == true)
		{
			tRow = Map();
			tRow.put("Supplier_ID", "4662244000014031306");
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
	if(soTotal != null) { data.put("Order_Value", soTotal.toLong()); }
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
	if(itemRate != null) { data.put("SRP_Rate_PR", itemRate.toLong()); }
	if(matchedInqNo != "") { data.put("inquiry_reference", matchedInqNo); }
	data.put("Supplier_Selected", prSupplierRows);

	// ===== RECHECK GUARD, added 2026-08-17, per user report ("if i edit and save
	// the SO in the books it duplicate the sync in the PR") — real live bug, SO-16489
	// (both a catalog line and an INQ-routed CUSTOMIZED line duplicated in the same
	// edit-save, one pair landing on 2 different PR numbers, the other pair landing on
	// the SAME PR number twice). The DEDUP GUARD above (2026-07-28) already checks
	// Sales_Order+sku before doing any work, but Gates 2-4 in between (Books item
	// fetch, Creator item lookup, possible Items import/createRecord, INQ/supplier
	// quote lookups) are several sequential API round-trips — if Books' own "Any
	// field is updated" rule fires this function twice for what looks like one Save
	// (a known Books quirk when the edit also recomputes a rollup/total field — see
	// this file's own 2026-08-01 "STATUS CHECK MOVED INLINE" note for a related
	// example), both runs can pass the FIRST dedup check before either one's
	// createRecord has committed/become searchable, and both go on to create a PR.
	// Re-running the exact same SO+sku existence check immediately before THIS
	// create call shrinks that race window from "the whole Gates 2-4 duration" down
	// to one more GET's latency — doesn't fully eliminate a true simultaneous race
	// (Creator has no server-side unique-constraint/"Prevent Duplicate" available on
	// this pair without a form-level formula field change, which is a Creator admin
	// setting, not a Deluge edit — flag to user as the real belt-and-suspenders fix
	// if this recheck alone doesn't fully close it live), but costs one cheap GET
	// only on the create path (never on the far more common "already skipped by the
	// first guard" or "existing PR, field re-sync" paths above). =====
	recheckUrl = "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=(Sales_Order%3D%3D%22" + soNumber + "%22%20%26%26%20sku%3D%3D%22" + skuVal + "%22)";
	recheckResp = invokeurl
	[
		url: recheckUrl
		type: GET
		connection: "supply_chain"
	];
	if(recheckResp.get("data") != null && recheckResp.get("data").size() > 0)
	{
		info "RECHECK caught a race — PR already created for SO " + soNumber + " / SKU " + skuVal + " by a concurrent run, skipping duplicate create.";
		continue;
	}

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
			if(matchedInqNo != "") { fData.put("inquiry_reference_Supplier1", matchedInqNo); }
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
			if(matchedInqNo != "") { tData.put("inquiry_reference_Supplier2", matchedInqNo); }
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
NOTES:
- paste body only — Books auto-injects: Map salesorder, Map organization, Map user
- ORDER_VALUE: soTotal = salesorder.get("total") — the SO's overall total value (not
    per-line). Set once per SO, put into Purchase_Request1.Order_Value (Number) on every
    line's PR1 record (same value repeated per line, since it's an SO-level total, not
    something split per item).
    >>> CONFIRMED BUG (2026-07-01): Books returns "total" as a Decimal (e.g. 10135.0).
        Passing that straight to a Creator "Number" (integer) field fails with
        code 3002 {"Order_Value":"Enter a valid number for Order Value"} — same class of
        bug as quantity/rate needing .toLong()/.toDecimal() elsewhere in this script.
        FIX: soTotal.toLong() before data.put(). Truncates any cents — fine since the
        field is Number, not Decimal/Currency; if cents matter later, change the field
        type to Decimal/Currency and drop the .toLong().
- GATE 1 (Order Type): only runs for "Pre Order" / "(Partly) Pre Order" (real Books
    value confirmed via live log 2026-07-22 — includes parens, not "Partly Pre Order")
    (cf_type_of_transaction)
- GATE 2 (Services category) — REORDERED 2026-07-22, now runs BEFORE stock, sourced
    straight from Books' own item detail (`category_name` on the SAME
    zoho.books.getRecordsByID("items", orgId, itemBooksId) call already needed for
    stock — one fetch, two uses, no extra API call). CONFIRMED LIVE 2026-07-22 (real
    Books items checked directly, e.g. "Deliver & Installation" item_id
    2680178000026505036, `category_name:"Services"` present on both the list AND
    single-item GET response). Case-insensitive match on "Services". Skips the line
    entirely (no Purchase_Request1, no supplier PR) — service line items
    (delivery/installation charges etc.) have nothing to physically procure.
    REAL BUG FIXED by this reorder, not just a cleanup: the OLD version of this gate
    read `itemCategory` off a CREATOR `All_Items` lookup for the SKU — but
    `SyncItemsCust/sync.js` already deliberately skips syncing any Services-category
    item into Creator's Items form at all (confirmed in that file, line ~380), so
    that lookup could NEVER return "Services" for a real service SKU (always came
    back blank, since the Item record simply doesn't exist in Creator) — the old
    gate silently never fired, every Services line was falling through and getting a
    real PR created. ALSO fixes a 2nd real bug this reorder incidentally avoids: a
    Services item's Books `available_stock` comes back null/undefined (confirmed
    live) — the stock gate's own `itemQty <= availStock` comparison would be an
    invalid NUMBER-vs-NULL Deluge comparison for any service line that reached it;
    checking category first (before stock) means a service line never gets there.
    CONFIRMED WORKING as far as live data can prove without an actual SO approval —
    the category value/field name/gate logic are all verified against real Books
    data; still UNTESTED end-to-end (needs a live SO approval with a Services-
    category line item to confirm the whole SO_To_PR run skips it while other lines
    on the same SO still create PRs normally — the actual Books workflow trigger has
    not been re-exercised since this reorder).
- GATE 3 (Stock): CHANGED 2026-07-28, per user — now reads Books item
    `actual_available_stock` (physical stock, top-level), falling back to a summed
    `locations[].location_actual_available_stock` if the top-level field is blank —
    matches the exact same basis so_fulfillment_sync.txt already uses. Previously
    read `available_stock` (a different/accounting basis) — real divergence already
    seen elsewhere in this app (so_kanban_sync.txt's own NOTES: accounting stock 0
    vs physical stock 3 on the same item). Confirmed audited against a live paste
    (Temp.txt, 2026-07-28) — this was the ONLY functional change in that paste, every
    other gate/PR-create block matched this file byte-for-byte (Creator's own
    whitespace/brace reformatting aside). Same fetch Gate 2 uses. RULE DIFFERS BY
    ORDER TYPE, added 2026-07-22 per user:
      "Pre Order"        -> skip (no PR) only when itemQty <= availStock (stock fully
                            covers the order — original rule, unchanged).
      "Partly Pre Order" -> skip (no PR) whenever availStock > 0, ANY stock at all,
                            even partial — does NOT require full coverage. Only
                            availStock == 0 or negative creates a PR. Per user's
                            explicit instruction: "dont skip all items... skip items
                            with stock > 0. dont skip items stock = 0 or < 0".
    >>> IF zoho.books.getRecordsByID errors: arg order is ("items", recordId, orgId).
        Try ("items", orgId, recordId) or swap to invokeurl Books API with a Books connection.
    UNTESTED — needs a live "Partly Pre Order" SO approval with a mixed-stock line
    (partial stock, e.g. availStock=2 ordered=10) to confirm it now correctly skips
    (old rule would have created a PR here; new rule for this order type skips since
    stock>0), and a zero/negative-stock line on the same order type to confirm it
    still creates a PR.
- GATE 4 (INQ routing): reads line custom field cf_inq_no from item_custom_fields.
    INQ set  -> look up All_Inquiries, find Supplier_Quotes row Selected==true,
                map Supplier_ID -> Fenteng [4662244000012469015] / Tony [4662244000012938023],
                create only that supplier's PR.
    INQ blank OR no winner row OR INQ not found -> create both supplier PRs.
    When a winner row exists, its Availability/Initial_Price/Negotiated/Final_Price/Lead_Time/Selected
    are copied from the Inquiry's Supplier_Quotes row into:
      - Purchase_Request1.Supplier_Selected (plain field names)
      - Fenteng_Lighting_Purchase_Request.Supplier_Selected_Supplier1 (_Supplier1 suffix)
      - Tony_Fan_Purchase_Request.Supplier_Selected_Supplier2 (_Supplier2 suffix)
    Response_Status on the routed supplier PR is set to "Selected" instead of "Waiting" when
    a winner quote was copied in (hasFentengQuote / hasTonyQuote flags).
- PRODUCT IMAGE: deliberately NOT handled in this Books function. Tried it inline here
    first (fetch via download URL + zoho.creator.v2_1.createRecord + separate Upload File
    API call) and hit a dead end confirmed by live testing: Zoho's v2.1 Upload File API
    allows only ONE successful multipart upload per Books custom function execution — every
    upload attempt after the first one in the same run fails with code 3700 "Unable to
    upload a file", even on a freshly-fetched file variable. Since one SO approval can
    create several supplier PR records in a single execution, this makes Books-side upload
    unreliable by design, not fixable by retrying/adjusting the call.
    FIX: image population moved entirely to Creator-native "Created or Edited > Successful
    form submission" triggers on Fenteng_Lighting_Purchase_Request / Tony_Fan_Purchase_Request
    (Fenteng_Sync_Image_PR / Tony_Sync_Image_PR, see sideUpdateScriptPR.txt) — native Deluge
    field assignment (Items[ID==...].Image, single Image field, no List()), no REST upload
    API involved, and each trigger firing is its own isolated execution so the one-upload-
    per-run limit never applies.
    CONFIRMED (web search, 2026-07-02): zoho.creator.v2_1.createRecord fires the target
    form's workflows by default — only skipped if a `skip_workflow` param is explicitly
    passed in `config`, which this script does not do (config only sets "environment").
    So the createRecord calls to Fenteng_Lighting_Purchase_Request / Tony_Fan_Purchase_Request
    below DO fire Fenteng_Sync_Image_PR / Tony_Sync_Image_PR automatically — no extra image
    code needed in this Books function. Same trigger covers both this SO path and manual
    PR_Populate_From_PR inserts identically.
- SRP_RATE_PR (added 2026-07-06, flip-flopped same day — briefly moved to a subform
    `Item_Subform`, then reverted): flat Purchase_Request1 Number field. Since PR1 is already
    1 record per SO line item (this for-each loop creates one PR1 per line), a subform was
    unnecessary — user confirmed "every PR = one item so its fine if it is outside subform".
    Field link name `SRP_Rate_PR`. Pulled straight from the SO line item's own `rate`
    (confirmed live via API check on SO-16145, line rate 10370 — matches item price at time
    SO was approved). Same Decimal->Number cast issue as Order_Value: Books line rate can come
    back as Decimal, so `.toLong()` before data.put() (truncates cents — if cents matter
    later, change SRP_Rate_PR to Decimal/Currency and drop the cast). Only set on
    SO_To_PR-created PR1 records — manually-created PRs (PR1_Created_Edited_Routing.txt) have
    no SO to pull from, left blank there, not backfilled from Items.Rate (different concept —
    that's current catalog price, not the historical approved SO rate).
- TRIED THEN REVERTED 2026-07-14 (full saga, kept as a design note — PR-00002/Acantha
  Deux/INQ-00003, Tony selected as winner but his own Supplier_Quotes row had a blank
  Final_Price): first attempt added a `finalPriceForPR` fallback (winning quote's own
  Final_Price, else the Inquiry's own `SRP_Approved1`) written to
  `Purchase_Request1.Selcted_Final_Cost` at creation. This actually worked (confirmed via
  live log — value computed correctly, createRecord succeeded with it in the payload) but
  got silently zeroed right back out by a SEPARATE native workflow, `PR_Sync_Supplier_
  Selected` (see `pr_sync_supplier_selected.txt`, fires in the same Created cascade and
  unconditionally overwrote `Selcted_Final_Cost` from the winner's own blank price) — fixed
  that workflow too. THEN the user raised a real concern: `Selcted_Final_Cost` is a
  Currency(CNY)-typed field, while the source value (`SRP_Approved1`/Items.Rate) is a
  PHP-denominated number — writing one into the other risked a currency-type mismatch.
  Pivoted to a cleaner fix instead: `SRP_Rate_PR` (a few lines below, already reliably
  populated at creation from the SO line's own rate, plain Number type — no currency
  ambiguity, no collision with any other workflow) already effectively holds the same
  reference number for these cases. Reverted ALL of this file's own changes (the
  `finalPriceForPR` block, its `Selcted_Final_Cost` write, and the `inqSrpApproved` /
  `SRP_Approved1` lookup) — this file needs NO changes at all for the Acantha case.
  Fix moved entirely to the PRs widget instead (`UI/EndUser/PRs/app/index.html`,
  display-only: shows `SRP_Rate_PR` as a fallback when `Selcted_Final_Cost` is blank).
  The `PR_Sync_Supplier_Selected` fix was kept regardless — genuinely correct on its own,
  independent of this reversal (see that file's own NOTES).
- ADDED 2026-07-14, per user: `inquiry_reference` previously only ever reached
  Purchase_Request1 itself (and its widget) — never the supplier PR forms, even when a
  PR was routed from a real Inquiry. Now also sent as `inquiry_reference_Supplier1`/
  `inquiry_reference_Supplier2` (Single Line, new fields user is adding manually) in the
  Fenteng/Tony `createRecord` calls, only when `matchedInqNo != ""` (an unrouted/no-INQ
  line leaves it blank, matching current `inquiry_reference` behavior on PR1 itself).
  Purpose: once a supplier PR form has this set, its own widget should lock ALL fields
  to view-only — the supplier already answered via the Inquiry flow, the PR-level quote
  flow shouldn't be independently editable for that record. Mirrored into
  `PR1_Created_Edited_Routing.txt`'s `PR_Populate_From_PR` (native create path for
  manually-created PRs) and `PR_Changed` (keeps it in sync on every PR1 edit) — see that
  file's own NOTES. UNTESTED — needs the 2 new fields created live first, then a fresh
  SO approval with a routed INQ to confirm they populate.
- RE-RUN ON EDIT (added 2026-07-28): trigger changed from "On Approval" only to
    "Create or Edit" + condition Status="Approved" — so adding a new line to an
    already-approved SO (or any other edit) re-fires this function. Per-line dedup
    guard (`All_Purchase_Request?criteria=Sales_Order==X && sku==Y`) skips any line
    that already has a PR1, checked BEFORE the Books item-detail fetch (saves that
    call too for already-processed lines) — only a genuinely new line reaches the
    gates. A line that was gate-skipped on a prior run (e.g. Services category, or
    had enough stock at the time) has NO PR1 yet, so a later edit re-evaluates its
    gates fresh — if stock has since dropped, it can now correctly get a PR on the
    re-run; this is intentional, not a bug. UNTESTED — needs a live SO edit (add a
    new line to an already-approved SO) to confirm only the new line gets a PR and
    existing lines aren't duplicated.
- FIELD-EDIT SYNC (added 2026-07-31), per user ("my pr_to_po script in books. triggers
    every approve SO for the first time only how about every edit? it should also
    reflect new item if have, field edits like qty and everything we need to update in
    creator's PR"): the dedup guard above no longer just skips an already-processed
    line — it now diffs the Books line's current Qty/Item Name/Description/Unit/Target
    Date/Rate against the matching Purchase_Request1's own stored values (fresh
    `field_config=all` fetch) and, if anything actually changed, pushes the update via
    `zoho.creator.v2_1.updateRecords` (same confirmed pattern as `books_estimate_sync.txt`/
    `so_fulfillment_sync.txt`). SO-header values (Order_Value/Sales_Owner) are diffed and
    updated the same way, no extra API call needed since they're already computed earlier
    in the script. Skipped entirely once `PR_Status=="Converted to PO"` — native
    `PR_Lock_After_PO` would reject a write to a converted PR anyway, and there's nowhere
    safe left for a Books-side edit to land once that's happened. Deliberately does NOT
    touch INQ routing (inquiry_reference/Supplier_Selected/which supplier got the PR) —
    that's a creation-time decision, re-routing it on a later unrelated edit is out of
    scope for what was asked. Downstream propagation to the Fenteng/Tony supplier PR
    forms is NOT duplicated here — relies on the existing native `PR_Changed` workflow
    (Purchase_Request1, Edited > Successful form submission, see
    `PR1_Created_Edited_Routing.txt`) firing off this `updateRecords` call the same way
    `zoho.creator.v2_1.createRecord` is already confirmed to fire target-form Created
    workflows — UNCONFIRMED specifically for `updateRecords`, flag if the supplier PR
    forms don't pick up the change. UNTESTED — needs a live edit on an already-approved,
    already-PR'd SO (bump a line's Qty, or edit its description) to confirm: (1) the
    existing PR1 record updates in place (not a duplicate), (2) the matching
    Fenteng/Tony supplier PR record's own quantity/description/etc reflects it too via
    PR_Changed, (3) a line whose PR is already Converted to PO is correctly skipped.
- Reports: All_Customers, All_Items, All_Inquiries, All_Purchase_Request
- Supplier_Quotes subform on Inquiry: fields Supplier_ID, Suppliers, Selected
- Connection name: supply_chain (lowercase)
- Customer matched by Books customer_id == Creator All_Customers.ID1
- Items matched by SKU == Creator All_Items.SKU
- Test condition (Books workflow rule): Customer Name = "(TEST ORDER) BY CPY PAM TAN" — remove after testing
====================================================

````
