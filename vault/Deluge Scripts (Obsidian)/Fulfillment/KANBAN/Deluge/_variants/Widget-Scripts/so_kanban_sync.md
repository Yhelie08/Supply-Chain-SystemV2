---
title: "so_kanban_sync"
source_file: "DMS\DelugeScripts\production\so_kanban_sync.txt"
category: "Fulfillment/KANBAN/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 986
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - kanban
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - readiness-gate
  - zoho-books
  - zoho-creator
  - zoho-inventory
---

# so_kanban_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Fulfillment/KANBAN/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\production\so_kanban_sync.txt`
> - **Lines of Code:** 986
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#kanban`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#readiness-gate`, `#zoho-books`, `#zoho-creator`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PRODUCTION COPY — so_kanban_sync.txt ==
== Twinned from DelugeScripts/so_kanban_sync.txt, last re-synced 2026-08-07 ==
== Per docs/DevToProd/2026-08-04-deluge-dev-to-prod-cutover.md ==
== Key rule: environment header OMITTED = defaults to Production (confirmed live 2026-08-04) ==
== Do NOT write environment:"production" as a literal — that throws code 2930. ==
== so_kanban — Books custom function, Module: Sales Order ==
== RE-SYNCED 2026-08-07, per user report ("it is saving in development mode
   not in production") — the actually-pasted-live copy (JV's own Temp1.txt)
   had drifted to carry config.put("environment","development") + a
   headers:{"environment":"development"} on every invokeurl call, meaning
   the live function was writing to Development regardless of which
   environment's Workflow Rule invoked it. Not a regression in THIS on-disk
   twin (which already had environment correctly omitted) — the live-pasted
   copy had silently reverted, most likely from being re-copied out of the
   Dev-targeted DelugeScripts/so_kanban_sync.txt at some point after the
   2026-08-04 cutover. Re-synced from that (now-fixed) Temp1.txt to also pick
   up the 2026-08-06 Email/City relay addition this twin was missing (see
   emailVal/cityVal below) — same recapture-drift risk documented in
   [[project-zoho-coworker]], always re-capture from a fresh live paste (or
   diff against the Dev twin) before assuming this file is current. ==

== STATUS FILTER MOVED INLINE, 2026-08-07, per user ("let's put the only
   approved/invoiced filter in the script instead of workflow rule ... like
   the so_to_pr") — same fix as so_to_pr_scripts_NewScripts.txt: a Books
   Workflow Rule Criterion checking Status only fires ONCE on the transition
   INTO that status, not on later edits. If this function's Workflow Rule has
   any Status condition in its Criterion, REMOVE it — the STATUS GATE below
   now reads the live status fresh off the injected salesorder Map every
   run instead. ==

On SO create/edit, creates one Sales_Order_Fulfillment record per non-service
line item (or UPDATEs it in place if one already exists for that SO+SKU), and
routes zero-physical-stock items into Pre_Order_FF. No test gate — this is
the Production copy, all customers are processed (the Dev twin keeps a
customer_id test gate, see DelugeScripts/so_kanban_sync.txt).


owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
config = Map();
soId = salesorder.get("salesorder_id") + "";
soNumber = salesorder.get("salesorder_number") + "";
custBookId = salesorder.get("customer_id") + "";
info "raw salesorder trigger map: " + salesorder;
info "soId resolved to: [" + soId + "]";
// TEST GATE REMOVED — this is the Production copy. All customers are processed.
// ===== SO DETAIL FETCH — MOVED before the status gate, 2026-08-10, real live bug
// (SO-16440): the injected `salesorder` trigger Map can be a STALE snapshot from
// whenever the Workflow Rule queued this run, not the SO's status AT EXECUTION
// TIME — this function is slow/API-heavy (many sequential invokeurl/Books calls
// per line item across 3 warehouses), so a real gap between queue-time and
// execution-time is plausible. Confirmed live: SO-16440 showed status "draft"
// with NO further edits after its own last_modified_time, yet a
// Sales_Order_Fulfillment record was created ~9 seconds after that same
// timestamp — the gate, when it trusted salesorder.get("status") directly, must
// have been acting on a stale pre-revert snapshot. Fetching fresh here and
// gating on THAT instead closes the gap (same re-fetch-for-reliability pattern
// so_fulfillment_sync.txt already uses, just moved earlier so the gate can use
// it too, instead of being fetched again further down). =====
soResp = zoho.books.getRecordsByID("salesorders",orgId,soId);
soRec = soResp.get("salesorder");
// ===== STATUS GATE, added 2026-08-07 per user ("let's put the only
// approved/invoiced filter in the script instead of workflow rule ... like
// the so_to_pr") — moves this filter off the Books Workflow Rule's own
// Criterion (which only fires ONCE on the transition INTO a matching status,
// confirmed live on so_to_pr_scripts_NewScripts.txt's identical bug: an
// invoiced SO's later edits kept getting silently skipped) and into the
// function itself. Same blocklist approach as so_to_pr: only skip genuinely
// pre-approval or cancelled statuses, so approved/invoiced/partially_invoiced/
// closed all still pass through. CHANGED 2026-08-10 (see SO DETAIL FETCH
// comment above) — now reads the FRESHLY-FETCHED soRec's own status, not the
// injected salesorder Map. Fails CLOSED (skips) if the fresh fetch itself comes
// back empty — better to skip a run we can't verify than risk processing a
// genuinely-invalid SO off a stale snapshot. =====
notYetApprovedStatuses = List();
notYetApprovedStatuses.add("draft");
notYetApprovedStatuses.add("pending_approval");
notYetApprovedStatuses.add("void");
notYetApprovedStatuses.add("cancelled");
soStatus = "";
if(soRec != null)
{
	soStatus = (soRec.get("status") + "").toLowerCase();
}
else
{
	info "SO " + soNumber + " — fresh Books fetch returned no record, cannot verify current status — skipping (fail closed).";
	return;
}
if(notYetApprovedStatuses.contains(soStatus))
{
	info "SO " + soNumber + " status is '" + soStatus + "', not yet approved (or cancelled) — skipping.";
	return;
}
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
existingResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report?criteria=SO_No%3D%3D%22" + soNumber + "%22"
	type :GET
	connection:"supply_chain"
];
orderType = orderTypeRaw;
// ===== FULFILLMENT STAGE =====
// FIXED 2026-07-28, live bug found via Execution Result log (createRecord error code
// 3001 "Invalid column value for Fulfillment_Stage"): "Received" ay HINDI valid value
// sa Fulfillment_Stage picklist ng Sales_Order_Fulfillment form.
// UPDATED 2026-07-28 (2nd pass), per user + naka-check sa form file mismo: dinagdag ng
// user ang "Waiting For Package" bilang BAGONG UNANG value sa picklist (values ngayon,
// UPDATED 2026-07-29 nang tanggalin ang "To Ship" pabor sa "Crate" = {"Waiting For
// Package","Order Readiness","Picking","Pack","Quality Checking","Crate","For Delivery"}).
// Ito na ang tamang paunang stage ng record na ito — bago pa man may
// Package/PAC# (na kailangan bago pumasok sa Sales_Order_Readiness_Gate, see "SO to
// Readiness" workflow's Package-blank guard sa [[project_so_creation_sync_locked_state]]
// memory). Sa sandaling magkaroon ng Package at ma-sync sa Sales_Order_Readiness_Gate, ang
// pipeline automation mismo (readiness_gate_release_to_picker.txt's FULFILLMENT_STAGE SYNC
// block) na ang bahalang mag-bump nito papuntang "Order Readiness" — hindi na kailangang
// baguhin pa ang pipeline scripts.
fulfillmentStage = "Waiting For Package";
// ===== SO STATUS ===== (bagong field default, per user + form's own "initial value =
// Preparing" — sinisigurado pa rin nang explicit dito dahil API createRecord ito, hindi UI)
soStatusVal = "Preparing";
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
if(hasPartial || hasYes && hasNo)
{
	paymentStatus = "Partial";
}
else if(hasYes)
{
	paymentStatus = "Yes";
}
// ===== CUSTOMER LOOKUP =====
custCreatorId = "";
custType = "";
contactNo = "";
billAddr = "";
shipAddr = "";
// ADDED 2026-08-06, per user request ("why other fields is not auto
// populated? like the city email contact") — City/Email were fetched by this
// function's own custRecMap lookup already but never captured into their own
// variables (city was folded into the combined billAddr/shipAddr string,
// discarded as a separate value; email was never read at all despite the
// Customer form having the field). Threaded through to Pre_Order_FF below,
// then relayed by checker_checklist_qc_sync.txt -> Order_Aggregation1 ->
// OrderAggregation widget's dispatchRecord() -> Service_Appointment_Form
// (which already had City/Email/Contact fields defined, just never written).
emailVal = "";
cityVal = "";
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
	emailVal = custRecMap.get("Email") + "";
	if(emailVal == "null")
	{
		emailVal = "";
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
	// ADDED 2026-08-06, per user request ("why other fields is not auto
	// populated? like the city email contact") — district_city was already
	// being extracted above (sf3/bf3) but only ever folded into the combined
	// billAddr/shipAddr string, never kept as its own value. Deliberately
	// placed as a SIBLING to the if(shipMap3 != null)/if(billMap3 != null)
	// blocks above (not nested inside either) so the billMap3 fallback still
	// runs even when shipMap3 is null — an earlier version of this edit
	// nested it inside if(shipMap3 != null) by mistake, which would have
	// silently skipped the fallback whenever a customer had a billing
	// address but no shipping address. Prefer Shipping over Billing, same
	// preference order preOrderCustAddress below already uses.
	if(shipMap3 != null)
	{
		cityRaw = shipMap3.get("district_city") + "";
		if(cityRaw != "" && cityRaw != "null")
		{
			cityVal = cityRaw;
		}
	}
	if(cityVal == "" && billMap3 != null)
	{
		cityRawB = billMap3.get("district_city") + "";
		if(cityRawB != "" && cityRawB != "null")
		{
			cityVal = cityRawB;
		}
	}
}
// ===== Shipment_Mode LOOKUP =====
// CHANGED 2026-08-03, real bug found live (SO-16364/PAC-16373: Purchase_Request1 had
// a real matching PR-00001 for Calimwen, yet BOTH Sales_Order_Fulfillment.PR_No and
// Pre_Order_FF.PR showed blank — even for the item whose PR genuinely still existed,
// not just the one whose PR was later deleted). Root cause: this whole-SO prNoJoined
// lookup was NEVER actually written into either downstream create call's data Map —
// pure dead code, confirmed via grep across the whole file. Removed the dead
// prNoJoined accumulation entirely — Shipment_Mode is the only thing this lookup was
// ever actually used for, kept unchanged. A real per-item (SO+SKU) PR lookup is added
// separately below, right before each place PR_No/PR is actually written, instead of
// reviving this whole-SO version — a whole-SO match would show Calimwen's PR-00001 on
// the Floor Lamp row too, which is wrong now that the Floor Lamp's own PR record has
// been deleted (per user, likely coworker test-data cleanup).
shipMode = "";
prRespShip = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=Sales_Order%3D%3D%22" + soNumber + "%22&field_config=all"
	type :GET
	connection:"supply_chain"
];
if(prRespShip.get("data") != null)
{
	for each  prRecShip in prRespShip.get("data")
	{
		if(shipMode == "")
		{
			shipModeVal = prRecShip.get("Shipment_Mode") + "";
			if(shipModeVal != "" && shipModeVal != "null")
			{
				shipMode = shipModeVal;
			}
		}
	}
}
// ===== RR_No LOOKUP =====
rrNoJoined = "";
rrResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Replacement_Requests?field_config=all"
	type :GET
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
// Bin location resolution — CHANGED 2026-07-24, per user request, real fix not a
// guess: the item's own `warehouses[].storages` (used before) is a DIFFERENT,
// often-empty concept from the item's actual per-warehouse bin assignment. The
// PROVEN-correct source is the same one `sync.js` already uses for the Items
// catalog: GET /settings/warehouses/{warehouseId}/storagelocations?item_id={itemId}
// per warehouse, filtered to real (balance_quantity>0) bins only — generic-name
// exclusion (Receiving/Package/Default Area, sync.js's own convention) was tried
// then REMOVED same day, see the CHANGED note further down. Checked across
// all 3 real storage warehouses (same list `sync.js`'s own STORAGE_WAREHOUSES uses),
// joined "WH Name: bin1, bin2 | WH Name: bin1" — but UNLIKE sync.js (which always
// shows "Map Bins" as a staff call-to-action), a warehouse with no real bin is
// simply OMITTED here, and if NONE of the 3 warehouses have a real bin, the whole
// field stays blank — per explicit "if genuinely no bin location, just blank".
STORAGE_WH_IDS = {"2680178000042173149","2680178000055220196","2680178000047672049"};
STORAGE_WH_NAMES = {"HC WH3 BAESA","HC WH1 BANAWE","INVENTORY"};
// FIXED 2026-07-28, per user: dapat GUMAWA PA RIN ng Sales_Order_Fulfillment record ANG
// LAHAT ng item, kahit anong Order Type (Normal, Pre Order, o (Partly) Pre Order) at kahit
// may stock o wala — binawi ang naunang "skip kapag full Pre Order" na logic (na dating
// nag-iiwas gumawa ng Sales_Order_Fulfillment record kapag "Pre Order" ang buong SO). Ang
// ZERO-STOCK -> PRE ORDER ROUTING loop sa ibaba (papunta Pre_Order_FF) ay TULOY PA RIN
// tumatakbo nang HIWALAY/DAGDAG (hindi na-eexclude sa isa't isa) para sa mga item na
// walang stock o full Pre Order — pareho na lang silang gagana.
for each  li in soLineItems
{
	skuVal = li.get("sku") + "";
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
		}
		allBinNames = List();
		whIdx = 0;
		for each  whIdBin in STORAGE_WH_IDS
		{
			whNameBin = STORAGE_WH_NAMES.get(whIdx);
			whIdx = whIdx + 1;
			// CONFIRMED 2026-07-24 via live test: implicit same-org auth does NOT work
			// for raw invokeurl inside a Books function (every call returned
			// {"code":14,"message":"...authentication value...invalid"}, confirmed via
			// diagnostic raw-response logging, not guessed). Needs a real Books-side
			// Connection — create one in BOOKS (not Creator): Settings → Automation →
			// Connections → New → Zoho Books → scope ZohoBooks.fullaccess.all →
			// self-authorize to this same org → name it. Real link name confirmed
			// created live 2026-07-24: "zhbooksfullaccessall".
			binResp = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/settings/warehouses/" + whIdBin + "/storagelocations?organization_id=" + orgId + "&item_id=" + itemIdSof
				type :GET
				connection:"zhbooksfullaccessall"
			];
			binLocs = binResp.get("storage_locations");
			if(binLocs != null)
			{
				for each  binLoc in binLocs
				{
					binNameVal = binLoc.get("name") + "";
					binQtyVal = binLoc.get("balance_quantity") + "";
					binQtyDec = 0;
					if(binQtyVal != "" && binQtyVal != "null")
					{
						binQtyDec = binQtyVal.toDecimal();
					}
					// CHANGED 2026-07-24, real bug found live: the storagelocations?item_id=
					// endpoint can return a bin with balance_quantity:0 for this item (e.g.
					// "R4K2S2") even though Books' own UI shows "Mapped Bins: 0" for that
					// warehouse and that bin holds none of this item's stock — confirmed via
					// a live Books UI screenshot. A zero-balance bin isn't really "where the
					// item is," so it's excluded. Generic-name exclusion (Receiving/Package/
					// Default Area) REMOVED same day, per user decision (Option A of 2) — a
					// live test showed an item's ENTIRE physical stock (19 units) sitting in
					// "Default Area" with no more specific bin at all, and excluding it just
					// produced an empty Bin_Location despite the item genuinely having a real,
					// known location. Any bin with real stock now counts, generic name or not.
					// CHANGED 2026-07-24, per user request — dedupe across warehouses too
					// (e.g. Table Lamp has a real "Receiving Area" bin at BOTH WH3 BAESA and
					// WH1 BANAWE — was showing "Receiving Area | Receiving Area", now shows
					// it once). Accumulates into one flat list across all 3 warehouses
					// instead of a per-warehouse grouped list.
					if(binNameVal != "" && binNameVal != "null" && binQtyDec > 0 && !allBinNames.contains(binNameVal))
					{
						allBinNames.add(binNameVal);
					}
				}
			}
		}
		for each  bn in allBinNames
		{
			if(binLocationVal == "")
			{
				binLocationVal = bn;
			}
			else
			{
				binLocationVal = binLocationVal + ", " + bn;
			}
		}
		info "bin check — SKU [" + skuVal + "] item_id [" + itemIdSof + "] resolved Bin_Location: [" + binLocationVal + "]";
	}
	if(categoryNameSof == "Services")
	{
		info "SKU " + skuVal + " category=Services — skipping Sales_Order_Fulfillment.";
		continue;
	}
	// ===== PR_No LOOKUP, PER ITEM (SO+SKU) — ADDED 2026-08-03, see the "Shipment_Mode
	// LOOKUP" comment above for the full root-cause writeup. Computed once here (per
	// item, before the UPDATE/CREATE branch split below) so BOTH paths can write it —
	// an item's PR can legitimately change/appear AFTER this record was first created
	// (e.g. approved later), so the UPDATE branch needs this just as much as CREATE.
	prNoForItemSof = "";
	prLookupSof = invokeurl
	[
		url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=Sales_Order%3D%3D%22" + soNumber + "%22%26%26sku%3D%3D%22" + skuVal + "%22&field_config=all"
		type :GET
		connection:"supply_chain"
	];
	if(prLookupSof.get("data") != null)
	{
		for each  prRecSof in prLookupSof.get("data")
		{
			prNoValSof = prRecSof.get("PR_No") + "";
			if(prNoValSof != "" && prNoValSof != "null")
			{
				prNoForItemSof = prNoValSof;
			}
		}
	}
	// Item_Details1 row — kinukuha na DITO (bago pa ang alreadyExists branch) para
	// magamit ng PAREHONG UPDATE at CREATE path sa ibaba (per user 2026-07-29: "okay
	// lang isama ang item details, dapat kung ano ang nasa zoho books dapat magreflect
	// sa zoho creator" — dating hindi kasama sa UPDATE path, ngayon kasama na).
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
	alreadyExists = false;
	matchedRecId = "";
	if(existingResp.get("data") != null)
	{
		for each  existingRec in existingResp.get("data")
		{
			existingItems = existingRec.get("Item_Details1");
			if(existingItems != null)
			{
				for each  eiRow in existingItems
				{
					if(eiRow.get("SKU") + "" == skuVal)
					{
						alreadyExists = true;
						matchedRecId = existingRec.get("ID") + "";
					}
				}
			}
		}
	}
	if(alreadyExists == true)
	{
		// ===== UPDATE (dinagdag 2026-07-29, per user: "pag may iupdate na field sa SO
		// dapat mag update din yung nasa Kanban") — kapag na-edit ang SO record mismo sa
		// Books (hindi na bagong SO), dapat i-propagate ang pagbabago papunta sa existing
		// Sales_Order_Fulfillment ("Kanban") record ng item na ito, sa halip na basta
		// i-skip nang walang ginagawa. HINDI kasama dito:
		//   - Fulfillment_Stage / SO_Status — pinamamahalaan ng pipeline automation
		//     (Readiness Gate/Pick/Pack/QC/atbp.), hindi dapat ma-overwrite/ma-reset ng
		//     isang SO edit na walang kinalaman doon.
		//   - Package / Package_Date / Delivery_Type — pinamamahalaan ng
		//     syncpackagetofulfillment.txt (Package-triggered), wala namang ganitong
		//     data ang SO record mismo.
		// UPDATE 2026-07-29, per user: kasama na ngayon ang Item_Details1 (Item/SKU/
		// Quantity/Bin_Location) sa update — dati ay iniwasan ito dahil ang NATIVE
		// Deluge "update Form[criteria][field=value]" statement ay hindi tumatanggap
		// ng subform field ([[deluge_creator_gotchas]] point 8), PERO iba ang code
		// path dito: zoho.creator.v2_1.updateRecordById ay REST-API-style na task
		// (parehong pathway na ginagamit na ng createRecord sa CREATE branch sa
		// ibaba, na matagumpay nang gumagana kasama ang Item_Details1) — hindi ito
		// apektado ng restriction na iyon.
		updateData = Map();
		updateData.put("Item_Details1",lineRows);
		if(orderType != "")
		{
			updateData.put("order_type",orderType);
		}
		updateData.put("For_Crate",forCrate);
		if(rrNoJoined != "")
		{
			updateData.put("RR_No",rrNoJoined);
		}
		if(shipMode != "")
		{
			updateData.put("Shipment_Mode",shipMode);
		}
		if(prNoForItemSof != "")
		{
			updateData.put("PR_No",prNoForItemSof);
		}
		if(targetDate != "")
		{
			updateData.put("target_delivery_date",targetDate);
		}
		if(custCreatorId != "")
		{
			updateData.put("Customer",custCreatorId);
		}
		if(custType != "")
		{
			updateData.put("Customer_Type",custType);
		}
		if(billAddr != "")
		{
			updateData.put("Billing_Address",billAddr);
		}
		if(shipAddr != "")
		{
			updateData.put("Shipping_Address",shipAddr);
		}
		if(contactNo != "")
		{
			updateData.put("Contact_No",contactNo);
		}
		updateData.put("Status",paymentStatus);
		info "Sales_Order_Fulfillment record " + matchedRecId + " already exists for SO " + soNumber + " / SKU " + skuVal + " — updating sa pinakabagong SO field values: " + updateData;
		updateResp = zoho.creator.v2_1.updateRecordById(owner,app,"Sales_Order_Fulfillment_Report",matchedRecId,updateData,config,"supply_chain");
		info "updateRecordById response: " + updateResp;
		continue;
	}
	data = Map();
	data.put("SO_No",soNumber);
	data.put("Fulfillment_Stage",fulfillmentStage);
	data.put("SO_Status",soStatusVal);
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
	if(prNoForItemSof != "")
	{
		data.put("PR_No",prNoForItemSof);
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
// ===== ZERO-STOCK -> PRE ORDER ROUTING, PLUS FULL "Pre Order" ORDER TYPE (LAHAT ng item,
// kahit may stock) — DAGDAG na sync ito, hindi kapalit ng Sales_Order_Fulfillment loop
// sa itaas; parehong tumatakbo. =====
custNameForPreOrder = "";
if(custResp.get("data") != null && custResp.get("data").size() > 0)
{
	custRecMapPO = custResp.get("data").get(0);
	// FIXED 2026-07-28, per user report ("sa pre order di nasasama yung customer name"):
	// "Name" at "Customer_Name" ay HINDI totoong field sa Customer form — kumpirmado sa
	// "SO to Readiness" file's sariling comment ("both custRec.Name and custRec.Customer_
	// Name" ay mali, "displayformat = [customer_name]" ang nagpapakita ng totoong field:
	// lowercase "customer_name"). Kaya laging blangko dati ang custNameForPreOrder,
	// walang customer name na naisasama sa Pre_Order_FF record.
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
	info "stock check — SKU [" + li2.get("sku") + "" + "] item_id [" + itemId + "] stockOnHand=" + stockOnHand + " category_name=[" + categoryName + "] item_type=[" + itemType + "] (" + itemLookupNote + ")";
	if(categoryName == "Services" || itemType == "service" || itemType == "digital_service")
	{
		info "SKU " + li2.get("sku") + "" + " category=" + categoryName + "/type=" + itemType + " — skipping Pre_Order_FF (services don't carry stock).";
		continue;
	}
	// FIXED 2026-07-28, per user: "Pag actual Stock yung item di dapat papasok sa Pre
	// order" — binawi ang naunang "O kung 'Pre Order' ang buong Order Type" na dagdag
	// condition. Ngayon, STOCK LANG (stockOnHand <= 0) ang basehan kung papasok sa
	// Pre_Order_FF — kahit "Pre Order" ang buong Order Type ng SO, kung may ACTUAL stock
	// na ang particular item na ito, HINDI na ito papasok sa Pre_Order_FF.
	if(stockOnHand <= 0)
	{
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
		// ===== PR LOOKUP, PER ITEM (SO+SKU) — ADDED 2026-08-03, same fix/reasoning as
		// the Sales_Order_Fulfillment block above (see the "Shipment_Mode LOOKUP"
		// comment further up for the full root-cause writeup).
		prNoForItemPo = "";
		prLookupPo = invokeurl
		[
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=Sales_Order%3D%3D%22" + soNumber + "%22%26%26sku%3D%3D%22" + skuVal2 + "%22&field_config=all"
			type :GET
			connection:"supply_chain"
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
		// ADDED 2026-08-06, per user request — relayed onward by
		// checker_checklist_qc_sync.txt -> Order_Aggregation1 ->
		// OrderAggregation widget's dispatchRecord() -> Service_Appointment_Form.
		if(cityVal != "")
		{
			preOrderData.put("City",cityVal);
		}
		if(emailVal != "")
		{
			preOrderData.put("Email",emailVal);
		}
		if(contactNo != "")
		{
			preOrderData.put("Contact",contactNo);
		}
		preOrderData.put("Item_Name",li2.get("name") + "");
		preOrderData.put("SKU",skuVal2);
		preOrderData.put("Qty",li2.get("quantity") + "");
		preOrderData.put("Status",preOrderStatus);
		if(prNoForItemPo != "")
		{
			preOrderData.put("PR",prNoForItemPo);
		}
		// Idinagdag 2026-07-28, per user: dapat laging "Pending" ang Pre_Order_Status kapag
		// bagong pumasok sa Pre_Order_FF (form's own picklist values: "Pending","Received").
		// Kahit may "initial value = Pending" na sa form itself, sinisigurado pa rin ito
		// dito nang explicit dahil pumapasok ang record via API createRecord, hindi via UI —
		// mas maaasahan kung nakalagay diretso sa data.
		preOrderData.put("Pre_Order_Status","Pending");
		preOrderCreateResp = zoho.creator.v2_1.createRecord(owner,app,"Pre_Order_FF",preOrderData,config,"supply_chain");
		info "Pre_Order_FF createRecord response: " + preOrderCreateResp;
	}
}

````
