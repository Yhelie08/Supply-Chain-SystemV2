---
title: "so_fulfillment_to_readiness_gate"
source_file: "DMS\DelugeScripts\so_fulfillment_to_readiness_gate.txt"
category: "Fulfillment/Order Readiness/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 267
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
  - readiness-gate
  - zoho-books
  - zoho-creator
---

# so_fulfillment_to_readiness_gate

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Fulfillment/Order Readiness/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\so_fulfillment_to_readiness_gate.txt`
> - **Lines of Code:** 267
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#kanban`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== "SO to Readiness" — Sales_Order_Fulfillment -> Sales_Order_Readiness_Gate sync ==
== First captured 2026-08-05 from a live paste (Temp1.txt) — never had a dedicated
   DelugeScripts file before this (only a passing mention in so_kanban_sync.txt's own
   comments). Real live workflow, was already running before this capture. ==

====================================================
WORKFLOW SETUP
  Name: SO to Readiness
  Form: Sales_Order_Fulfillment
  Trigger: Created OR Edited > Successful form submission (per this script's own
    2026-07-28 FIXED note below — must be BOTH, not Created-only, or the
    PACKAGE REQUIRED GUARD permanently blocks re-sync once a package is set later)
  Action: Execute script
====================================================

// FIXED 2026-07-28, per user report ("yung pac# wala", ibang field din daw): kung "On
// Add" LANG ang naka-set na trigger nito sa Zoho Creator (Form > Workflow > Choose form:
// Sales_Order_Fulfillment > Run when a record is: Created), HINDI na ito muling tatakbo
// kapag na-edit/na-update ang record — pero ang Package/PAC# AT Delivery_Type ay
// itinatakda lang mismo sa syncpackagetofulfillment.txt sa pamamagitan ng pag-UPDATE
// (zoho.creator.v2_1.updateRecords) sa record na ito, HINDI bagong Add. Kaya kung
// blangko pa ang Package noong una itong ginawa (karaniwan, dahil so_fulfillment_sync.txt
// ang gumagawa nito bago pa magkaroon ng package), at "On Add" lang ang trigger, ang
// PACKAGE REQUIRED GUARD sa ibaba ay mag-e-early-return at HINDI NA MULING TATAKBO kailan
// man — kaya laging blangko ang Package_Order (at ibang field na kasabay na-a-update,
// tulad ng Delivery_Type) sa Sales_Order_Readiness_Gate.
//
// TAMANG SETUP: Choose form: Sales Order Fulfillment
//               Run when a record is ( Record Event ): Created OR EDITED (parehong dapat
//               naka-check, HINDI Created lang) — para muling tumakbo ang workflow na ito
//               sa sandaling ma-update ng syncpackagetofulfillment.txt ang Package/
//               Delivery_Type, at doon na makikita ng PACKAGE REQUIRED GUARD sa ibaba na
//               may laman na ang Package, saka na ito magpapatuloy sa pag-sync papunta sa
//               Sales_Order_Readiness_Gate.
// When to trigger workflow ( Form Event ): Successful form submission
//
// Field values below are read directly by their Field Link Name, the standard
// convention for Creator form workflows.
// DIAGNOSTIC — log the raw values first so a bad assumption (like the SO ID mixup in
// so_creation_sync.txt) shows up immediately in the Execution Result log instead of
// failing silently or blowing up deeper in the script.
info "SO_No: " + input.SO_No;
info "Package: " + input.Package;
info "order_type: " + input.order_type;
info "Delivery_Type: " + input.Delivery_Type;
info "Status: " + input.Status;
info "Customer: " + input.Customer;
info "PR_No: " + input.PR_No;
info "RR_No: " + input.RR_No;
info "For_Crate: " + input.For_Crate;
info "target_delivery_date: " + input.target_delivery_date;
info "Item_Details1: " + input.Item_Details1;
soNoVal = input.SO_No + "";
packageVal = input.Package + "";
// ===== PACKAGE REQUIRED GUARD (per user request 2026-07-22) — Sales_Order_Fulfillment
// records can exist before a Package/PAC# is assigned (e.g. created straight from
// SO-creation, so_creation_sync.txt), in which case Package is still blank. The
// Readiness Gate is meant to track packages that are actually ready for picking, so a
// record with no Package yet should not sync into it at all. Stop here — no Readiness
// Gate record gets created or updated until this same workflow re-runs later with a
// real Package value (e.g. once so_fulfillment_sync.txt sets it after a package is
// created in Books).
if(packageVal == "" || packageVal == "null")
{
	info "No Package Number yet on this Sales_Order_Fulfillment record (SO " + input.SO_No + "" + ") — skipping Readiness Gate sync until a package exists.";
	return;
}
orderTypeVal = input.order_type + "";
deliveryTypeVal = input.Delivery_Type + "";
statusVal = input.Status + "";
prNoVal = input.PR_No + "";
rrNoVal = input.RR_No + "";
// For_Crate is checkbox-to-checkbox (boolean), no stringify/translation needed.
forCrateVal = input.For_Crate;
// target_delivery_date (Sales_Order_Fulfillment) -> Target_Delivery_Date (Readiness
// Gate), date-to-date, no stringify/translation needed.
targetDeliveryDateVal = input.target_delivery_date;
custTypeVal = input.Customer_Type + "";
billAddrVal = input.Billing_Address + "";
shipAddrVal = input.Shipping_Address + "";
// ===== PAYMENT STATUS =====
// FIXED 2026-08-05, real mismatch found — this used to translate Sales_Order_Fulfillment's
// Status (Yes/No/Partial) into an OLD payment_status label set (Paid/Partially Paid/
// Pending) that Sales_Order_Readiness_Gate.payment_status no longer uses. Per
// UI/FF Widget/ReadinessGate/app/index.html's own header comment: "payment_status's
// picklist values also changed from {"Paid","Partially Paid","Pending"} to
// {"Yes","No","Partial"}" — the widget already only ever reads/writes Yes/No/Partial now
// (translating to a display label client-side only). Since the source field already
// uses the exact same Yes/No/Partial vocabulary, no translation is needed at all — a
// direct passthrough is correct, and writing the old labels here would have been
// silently rejected by a dropdown that no longer offers them as valid choices.
paymentStatusVal = statusVal;
// ===== CUSTOMER NAME LOOKUP (native form query, same app) =====
// Sales_Order_Fulfillment only carries the linked Customer record's ID — fetch the
// Customer record by that ID to get the actual name. custIdVal stays NUMBER (not
// stringified) — the earlier Sales_Order_Fulfillment[ID == recId] fetch errored when
// the right side was TEXT against ID's NUMBER type, same rule applies here.
// Dot-notation on a record errors immediately on a field that doesn't exist (unlike
// Map.get(), which just returns null) — both custRec.Name and custRec.Customer_Name
// errored with "Variable ... does not exist in Customer" (2026-07-20). The original
// Sales_Order_Fulfillment form schema's own Customer field definition
// ("displayformat = [customer_name]") names the real field: lowercase customer_name.
custNameVal = "";
custIdVal = input.Customer;
if(custIdVal != null)
{
	custRecordsList = Customer[ID == custIdVal];
	for each  custRec in custRecordsList
	{
		custNameVal = custRec.customer_name + "";
	}
	if(custNameVal == "null")
	{
		custNameVal = "";
	}
}
// customer_address: prefer Shipping_Address, fall back to Billing_Address — same
// preference order used for Pre_Order_FF's Customer_Address in so_fulfillment_sync.txt.
custAddressVal = shipAddrVal;
if(custAddressVal == "")
{
	custAddressVal = billAddrVal;
}
// ===== RE-FETCH FULL RECORD FOR SUBFORM DATA =====
// The bare "Item_Details1" trigger variable does NOT give the subform's row data —
// confirmed live 2026-07-20: logging it printed a single bare ID number (matching
// the same format as the Customer field's linked-record ID), not a list of rows, so
// every row.Item / row.get("Item") attempt against it came back null. Same fix
// pattern as so_fulfillment_sync.txt's SO detail fetch: re-fetch the full record by
// its own ID and read the subform off THAT instead.
// recId stays NUMBER (ID's own type) — comparing ID (NUMBER) == a stringified ID
// (TEXT) errored with "In Criteria left expression is of type NUMBER and right
// expression is of type TEXT and the operator == is not valid" (2026-07-20).
recId = input.ID;
info "own record ID: " + recId;
itemRows = List();
soFullList = Sales_Order_Fulfillment[ID == recId];
for each  soFullRec in soFullList
{
	itemRows = soFullRec.Item_Details1;
}
info "itemRows (re-fetched): " + itemRows;
// ===== ONE Sales_Order_Readiness_Gate RECORD PER ITEM ROW — UPSERT =====
// Readiness Gate's Item_Name/SKU/Quantity/Bin_Location are plain fields, not a
// subform, so a Fulfillment record with several items becomes several Readiness
// Gate records — same per-item pattern already used for Pre_Order_FF. Matched per
// SO_No + SKU: if a record already exists for that item, update it in place
// (correct native syntax confirmed via Zoho's own docs, 2026-07-20: "update
// <loop_variable> [ field = value ];" — operates on the loop variable itself with
// square brackets, NOT "update FormName[criteria] (...)", which doesn't exist and
// was the source of every earlier save error); only insert if nothing matched.
for each  row in itemRows
{
	itemName = row.Item + "";
	itemSKU = row.SKU + "";
	itemQty = row.Quantity + "";
	itemBin = row.Bin_Location + "";
	// FIXED 2026-08-07, real bug (replacement-package redesign): matched by SO+SKU
	// alone, meaning a 2nd Readiness Gate record for the same SKU (a replacement's own
	// new package) would UPDATE the ORIGINAL's record in place instead of getting its
	// own — silently clobbering Package_Order/Quantity/etc. Widened to SO+SKU+Package,
	// matching this same form's field name already used elsewhere in this workflow
	// (packageVal, from input.Package).
	matchingGateRecords = Sales_Order_Readiness_Gate[sales_order_number == soNoVal && SKU == itemSKU && Package_Order == packageVal];
	foundExisting = false;
	for each  gateRec in matchingGateRecords
	{
		update gateRec
		[
			Order_Type=orderTypeVal
			Package_Order=packageVal
			Delivery_Type=deliveryTypeVal
			For_Crate=forCrateVal
			Target_Delivery_Date=targetDeliveryDateVal
			payment_status=paymentStatusVal
			customer_name=custNameVal
			customer_type=custTypeVal
			customer_address=custAddressVal
			pr_number=prNoVal
			rr_number=rrNoVal
			Item_Name=itemName
			Quantity=itemQty
			Bin_Location=itemBin
		];
		info "Sales_Order_Readiness_Gate record updated, ID: " + gateRec.ID;
		foundExisting = true;
		// ADDED 2026-08-10, real live bug found by user (SO-16438, PAC-16461/RR-driven
		// package) -- this UPDATE corrects the gate record own Quantity (e.g. after an
		// RR redispatch Books-package quantity correction flows back here), but it is a
		// plain native cross-form update gateRec[...] from ANOTHER form workflow
		// (Sales_Order_Fulfillment own trigger) acting on Sales_Order_Readiness_Gate --
		// per this codebase own established platform limit, that does NOT reliably
		// fire Sales_Order_Readiness_Gate own "Release Records to Pick1" trigger. If
		// the item was already Released BEFORE this correction landed, Pick1 silently
		// kept its stale pre-correction quantity forever -- confirmed live (Pick1 showed
		// the ORIGINAL package qty 3 instead of the replacement real 1), only fixed
		// by a manual resave of the gate record via the widget (a real update, which DOES
		// fire reliably). Rather than depend on that unreliable propagation, push the
		// corrected quantity into Pick1 directly here, in the SAME execution, whenever
		// the item is already released -- mirrors release_records_to_pick1_sync.txt own
		// upsert logic exactly (same match key: SO+SKU+Item_Name+Package_Order), just
		// invoked from a path that is actually guaranteed to run.
		if(gateRec.Release == true)
		{
			pickAlreadyExists = false;
			for each  pickRec in Pick1[SO == soNoVal && SKU == itemSKU && Item_Name == itemName && Package_Order == packageVal]
			{
				pickAlreadyExists = true;
				update pickRec
				[
					Package_Order=packageVal
					PR_if_any=prNoVal
					RR=rrNoVal
					Delivery_Type=deliveryTypeVal
					Order_Type=orderTypeVal
					Target_Delivery_Date=targetDeliveryDateVal
					For_Crate=forCrateVal
					Item_Name=itemName
					Bin_Location=itemBin
					SKU=itemSKU
					Quantity_to_Pick=itemQty
					Customer_Name=custNameVal
					Customer_Address=custAddressVal
					Customer_Type=custTypeVal
				];
				info "Pick1 record quantity re-synced from readiness gate correction, ID: " + pickRec.ID + ", Quantity_to_Pick: " + itemQty;
			}
			if(pickAlreadyExists == false)
			{
				info "Item already Released but no matching Pick1 record found yet (SO " + soNoVal + " / SKU " + itemSKU + " / PAC " + packageVal + ") -- Release Records to Pick1 has not created it yet, nothing to re-sync.";
			}
		}
	}
	if(!foundExisting)
	{
		newId = insert into Sales_Order_Readiness_Gate
		[
			sales_order_number=soNoVal
			Order_Type=orderTypeVal
			Package_Order=packageVal
			Delivery_Type=deliveryTypeVal
			For_Crate=forCrateVal
			Target_Delivery_Date=targetDeliveryDateVal
			payment_status=paymentStatusVal
			customer_name=custNameVal
			customer_type=custTypeVal
			customer_address=custAddressVal
			pr_number=prNoVal
			rr_number=rrNoVal
			Item_Name=itemName
			SKU=itemSKU
			Quantity=itemQty
			Bin_Location=itemBin
			Added_User=zoho.loginuser
		];
		info "Sales_Order_Readiness_Gate record created, ID: " + newId;
	}
}

====================================================
NOTES:
- UNTESTED after today's payment_status fix — needs a live resave of a
  Sales_Order_Fulfillment record with a real Package value to confirm
  Sales_Order_Readiness_Gate.payment_status now actually accepts Yes/No/Partial
  (previously silently rejecting Paid/Partially Paid/Pending, per the dropdown
  choices having been changed out from under this script at some earlier point).
====================================================

````
