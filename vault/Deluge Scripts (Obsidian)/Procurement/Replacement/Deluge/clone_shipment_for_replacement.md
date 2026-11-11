---
title: "clone_shipment_for_replacement"
source_file: "clone_shipment_for_replacement.txt"
category: "Procurement/Replacement/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 782
tags:
  - custom-api
  - deluge
  - fulfillment
  - kanban
  - order-aggregation
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-books
---

# clone_shipment_for_replacement

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `Procurement/Replacement/Deluge`
> - **Source File:** `clone_shipment_for_replacement.txt`
> - **Lines of Code:** 782
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#kanban`, `#order-aggregation`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== New 2026-07-20, per user request — "Clone Shipment" mechanism ==
== Part of the same-RCV/same-PO replacement recycle redesign this session ==
== (see receiving_create_bin_receiving.txt, create_rr_button.txt, shipment_populate_receiving.txt) ==

====================================================
PREREQUISITE — fields needed BEFORE this can work (see CLAUDE.md's consolidated
checklist for the full list shared with the other files touched this session):
  Replacement_Request.Cloned_Shipment_No (Single Line Text) — ADDED 2026-07-23, real
    bug found live: "clicked again, no duplication block" — clicking Log Replacement
    Shipment twice created 2 separate real Shipments records for the same RR, nothing
    stopped it. This field stores the new Shipment's own Shipment_No the first time
    one is successfully created, and the function refuses to run again once it's set.
  Replacement_Request.RR_PR_No (Single Line Text) — ADDED 2026-07-23, real bug found
    live ("some datas are missing" — the cloned Shipment's own PO_Shipments line had
    a genuinely blank PR_No, breaking the PR_No-keyed bidirectional Shipment-Mode/
    Status syncs for that line). 5th header mirror field, same reasoning/pattern as
    RR_Supplier/RR_SKU/RR_Item_Name/RR_Qty_Value below — stamped by create_rr_
    button.txt/create_rr_custom_api.txt from the same source Replacement_Summary.PR_No
    already uses (input.Receiving_Line_ID / r.Receiving_Line_ID).
  Purchase_Order.Damage_SKUs (Single Line Text) — already required by the recycle
    rework, not by this file directly, but part of the same build.
  Fenteng_Lighting_Purchase_Order.Damage_SKUs_Supplier1 (Single Line Text)
  Tony_Fan_Purchase_Order.Damage_SKUs_Supplier2 (Single Line Text)
  Replacement_Request.RR_Supplier (Single Line Text)
  Replacement_Request.RR_SKU (Single Line Text)
  Replacement_Request.RR_Item_Name (Single Line Text)
  Replacement_Request.RR_Qty_Value (Number)
  (The last 4 are stamped by create_rr_button.txt/create_rr_custom_api.txt at RR
  creation time — see those files' own NOTES for why: plain header-field mirrors of
  Replacement_Summary's Supplier/SKU/Item/RR_Qty columns, so THIS function can read
  them without touching a subform on a criteria-queried record — the confirmed
  platform limitation documented at length in this session's own CLAUDE.md Deluge
  Gotchas entry.)
  Replacement_Request.RR_SO (Single Line Text) — NOT new, already existed (stamped
    by Exception Control's own createReplacementRequest()/the Replacement widget's
    createSupplierSideRR() at RR creation). Newly RELIED ON by this file as of
    2026-08-12's stock-item fallback below (Sales_Order source when there's no
    origShip to copy Sales_Order off of).
====================================================

====================================================
CUSTOM FUNCTION SETUP:
  Name: cloneShipmentForReplacement
  Arguments: String rrRecordId  (the AGGREGATE Replacement_Request's own ID —
    not the Fenteng/Tony supplier RR's ID)
====================================================

map cloneShipmentForReplacement(String rrRecordId)
{
	response = Map();
	r = Replacement_Request[ID == rrRecordId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Replacement Request not found.");
		return response;
	}
	/* ADDED 2026-07-23, real bug found live ("clicked again, no duplication block") —
	   nothing previously stopped a 2nd click from creating a 2nd real Shipments
	   record for the same RR. Guard first, before any of the tracing/lookup work
	   below even runs. */
	if(r.Cloned_Shipment_No != null && r.Cloned_Shipment_No != "")
	{
		response.put("status","error");
		response.put("message","A replacement shipment (" + r.Cloned_Shipment_No + ") was already logged for this RR.");
		return response;
	}
	/* FIXED 2026-07-23, real bug found live: this used to check r.RR_Status (the
	   AGGREGATE record's own status) — but the aggregate NEVER auto-syncs from the
	   supplier's approval (only Fenteng_Lighting_Replacement_Request/
	   Tony_Fan_Replacement_Request advance, per the 2026-07-20 "supplier's only job
	   is to approve" redesign) — so this gate could never pass as originally written,
	   confirmed via a live RR that was genuinely Acknowledged on the supplier's own
	   portal (Shipment_Mode/Expected_Ship_Date/ETA all filled) but still blocked here
	   because the aggregate's own RR_Status stayed "Open". Fixed: look up the correct
	   supplier form via r.RR_Supplier (plain header field, safe read) and check THAT
	   record's own RR_Status instead — same RR_No join key already proven reliable
	   elsewhere in this app (supplier records reuse the aggregate's RR_No verbatim). */
	supStatus = "";
	supShipMode = "";
	/* FIXED 2026-08-07, real bug found via codebase-wide audit (same class as the
	   already-fixed approvePOMain crash): r.RR_Supplier (Replacement_Request.RR_Supplier,
	   copied verbatim from create_rr's own Product_Context1.Supplier read) can be the
	   short name or the full Suppliers-form name depending on record history — confirmed
	   live in Production. The old strict == silently left supStatus blank for the
	   full-name case, unconditionally blocking every such RR from ever being logged as
	   shipped, even after real supplier acknowledgment. */
	rrSupplierValCS1 = r.RR_Supplier + "";
	if(rrSupplierValCS1 == "Fenteng" || rrSupplierValCS1.contains("Fenteng"))
	{
		supMatch = Fenteng_Lighting_Replacement_Request[RR_No == r.RR_No];
		for each  sm in supMatch
		{
			supStatus = sm.RR_Status;
			supShipMode = sm.Shipment_Mode;
		}
	}
	else if(rrSupplierValCS1 == "Tony" || rrSupplierValCS1.contains("Tony"))
	{
		supMatchT = Tony_Fan_Replacement_Request[RR_No == r.RR_No];
		for each  smT in supMatchT
		{
			supStatus = smT.RR_Status;
			supShipMode = smT.Shipment_Mode;
		}
	}
	if(supStatus != "Acknowledged" && supStatus != "In Production" && supStatus != "Shipped" && supStatus != "Completed")
	{
		response.put("status","error");
		response.put("message","This RR must be Acknowledged by the supplier (Shipment Mode/Expected Ship Date/ETA filled on their own portal) before a replacement shipment can be logged.");
		return response;
	}
	/* Trace back to the original PO the same way receiving_create_bin_receiving.txt
	   does — RR's own Source_Exception_No (plain header field) -> Exceptions.PO_No
	   (also plain header field), both safe reads, no subform involved. */
	origPONo = "";
	excMatch = Exceptions[Exception_No == r.Source_Exception_No];
	for each  em in excMatch
	{
		origPONo = em.PO_No;
	}
	/* ADDED 2026-07-27, per user — Exception_Control1 ("Fulfillment EXC" module,
	   UI/FF Widget/ExceptionControl) is a SEPARATE source, not a native Exceptions
	   record, so the lookup above finds nothing for it. Fallback: same
	   Source_Exception_No, but resolved as an Exception_Control1.Exception_Number
	   instead, chained through its own PR field -> Purchase_Request1.Link_PO_No
	   (the exact same plain-text PO_No value origPONo already expects — confirmed
	   via pr_to_po_grouping.txt: `prLoop.Link_PO_No = targetPO.PO_No;`). Both hops
	   are plain header-field reads, same platform-limitation-safe shape as the
	   Exceptions path above. Gated on r.Source_Module so this never even attempts
	   the fallback for a normal Damage/Missing/QC RR. */
	if(origPONo == "" && r.Source_Module == "Fulfillment EXC")
	{
		ecMatch = Exception_Control1[Exception_Number == r.Source_Exception_No];
		ecPrNo = "";
		for each  ecm in ecMatch
		{
			ecPrNo = ecm.PR;
		}
		if(ecPrNo != "")
		{
			pr1Match = Purchase_Request1[PR_No == ecPrNo];
			for each  pr1m in pr1Match
			{
				origPONo = pr1m.Link_PO_No;
			}
		}
	}
	/* ADDED 2026-08-12, per user ("item 1 is already have stock... there's no
	   existing PR or PO. how can we route this or bypass this PO to create
	   shipment?") — a Fulfillment EXC item that already had stock on hand never
	   went through a PR/PO at all, so origPONo above legitimately resolves to ""
	   with nothing wrong upstream (not a data gap to error out on, unlike a
	   Damage/Missing RR — those always trace to a real PO by construction, so
	   THEIR blank-origPONo case stays a hard error below, scope confirmed with
	   user). poFreeCustomerName sourced primarily from Sales_Order_Fulfillment by
	   SO_No — CORRECTED 2026-08-12, real bug found live (SHP-00006, real SO
	   SO-16440, still blank Customer): so_kanban_sync.txt (Books custom
	   function) is the actual authority here — it creates ONE Sales_Order_
	   Fulfillment record per non-service line item for ANY item, stock or not,
	   and ONLY additionally routes zero-physical-stock items (or a whole "Pre
	   Order" type SO) into Pre_Order_FF as a separate, parallel sync — Pre_
	   Order_FF is NOT the general customer-lookup source it was first assumed
	   to be. An item that already has stock (this feature's whole reason for
	   existing) predictably has NO Pre_Order_FF row, hence always-blank
	   Customer. Sales_Order_Fulfillment.Customer is a lookup (to the Customer
	   form) — dot-chained + "" for its display text, same convention used
	   elsewhere in this codebase (e.g. input.Customer.Customer_Type in
	   purchase_request1_full_workflow_dump.txt). Pre_Order_FF kept as a second
	   fallback (not removed) for the genuine zero-stock/Pre-Order-type edge
	   case. Sales_Order_Fulfillment has no Sales_Owner field either, same as
	   Pre_Order_FF, so Sales_Owner still stays honestly blank on this path. */
	poFreeCustomerName = "";
	if(origPONo == "" && r.Source_Module == "Fulfillment EXC")
	{
		sofMatchNoPO = Sales_Order_Fulfillment[SO_No == r.RR_SO];
		for each  sofmNoPO in sofMatchNoPO
		{
			/* .Customer alone is a lookup and "+"" just stringifies its raw ID
			   (confirmed live — SHP-00006 showed a bare ID number, not a name).
			   customer_name (lowercase, Books-style field name) is the proven
			   dot-chain used elsewhere in this codebase for the exact same
			   Customer lookup — see pr_to_po_grouping.txt's own
			   customerRec.customer_name. */
			sofCustValNoPO = sofmNoPO.Customer.customer_name + "";
			if(sofCustValNoPO != "" && sofCustValNoPO != "null")
			{
				poFreeCustomerName = sofCustValNoPO;
			}
		}
		if(poFreeCustomerName == "")
		{
			preOrderMatchNoPO = Pre_Order_FF[SO == r.RR_SO];
			for each  pomNoPO in preOrderMatchNoPO
			{
				pomCustValNoPO = pomNoPO.Customer_Name + "";
				if(pomCustValNoPO != "" && pomCustValNoPO != "null")
				{
					poFreeCustomerName = pomCustValNoPO;
				}
			}
		}
	}
	else if(origPONo == "")
	{
		response.put("status","error");
		response.put("message","Could not trace back to the original PO — check Source_Exception_No on this RR and PO_No on the linked Exception (or PR on the linked Exception_Control1 item).");
		return response;
	}
	origShip = null;
	if(origPONo != "")
	{
		origPOMatch = Purchase_Order[PO_No == origPONo];
		origPOIdForShip = 0;
		for each  opm in origPOMatch
		{
			origPOIdForShip = opm.ID;
		}
		if(origPOIdForShip == 0)
		{
			response.put("status","error");
			response.put("message","Could not resolve the original Purchase_Order record for " + origPONo + ".");
			return response;
		}
		/* Clone from whichever existing Shipment for this PO has the highest ID (most
		   recently created) — same "last write wins" simplification already accepted
		   elsewhere in this codebase, avoids needing a real sort/limit on the query. */
		origShips = Shipments[PO_No == origPOIdForShip];
		highestIdSeen = 0;
		for each  os in origShips
		{
			if(os.ID > highestIdSeen)
			{
				highestIdSeen = os.ID;
				origShip = os;
			}
		}
		if(origShip == null)
		{
			response.put("status","error");
			response.put("message","No existing Shipment found for PO " + origPONo + " to clone from.");
			return response;
		}
	}
	/* Deliberately does NOT copy Shipment_Status/ETD/ETA/Arrival_Date/Ship_Out_Date/
	   Receiving_Record_Created/Required_Days_Lead/Remaining_Days/Shipment_Days from
	   the original — this is a fresh trip, those fields start blank/default so the
	   officer fills/computes them for real once real dates exist. Target_Date/
	   Supplier_Target_Date ADDED 2026-07-23 (real gap found live, "some datas are
	   missing") — these are PO-level commitments, not trip progress, so they DO
	   still apply to a replacement shipment on the same PO. Everything else here is
	   identity/context (same PO/SO/Customer/Sales_Owner). */
	/* ADDED 2026-07-27, per user ("indicate in shp and rcv that this record is from
	   Fulfillment's Exception") — new fields, tags this Shipment with its own real
	   source, not just Fulfillment-EXC-specific (any RR-driven clone gets an
	   honest Source_Module/Exception_Number, since the same insert block covers
	   every Source_Type). r.Source_Exception_No is already the real Exception
	   number regardless of source (Exceptions.Exception_No or
	   Exception_Control1.Exception_Number). */
	/* FIXED 2026-08-07, real live paste error ("Error at line number: 155 Improper
	   Statement... missing ';'") — this standalone `//` comment block was sitting
	   INSIDE the insert into Shipments[...] bracket block below. Confirmed,
	   recurring gotcha (see reference-deluge-quirks.md / CLAUDE.md Deluge Gotchas):
	   a `//` comment inside an insert/update bracket literal breaks parsing for the
	   WHOLE script, surfacing as a misleading "Improper Statement" at an unrelated
	   line number. Moved outside the brackets, no content changed. Original note,
	   ADDED 2026-07-28, per user ("incomplete data" — screenshot of a cloned
	   Shipment showing blank ETD/ETA/"No timeline data"): the aggregate RR (r)
	   already carries real committed dates by the time this function runs (Log
	   Replacement Shipment is only reachable once the supplier has Approved, and
	   approve_rr_custom_api.txt now pushes Expected_Ship_Date/ETA onto the
	   aggregate too, see that file's own 2026-07-28 fix) — pull them straight
	   across instead of leaving a genuinely-known date blank. Remaining_Days/
	   Shipment_Days/Production_Date deliberately still left blank (policy-based
	   scheduling calcs, not applicable here — explicit user decision, not an
	   oversight). */
	if(origShip != null)
	{
		newShipID = insert into Shipments
		[
			PO_No=origShip.PO_No
			Sales_Order=origShip.Sales_Order
			Customer=origShip.Customer
			Supplier=r.RR_Supplier
			Sales_Owner=origShip.Sales_Owner
			Shipment_Status="Pending"
			Target_Date=origShip.Target_Date
			Supplier_Target_Date=origShip.Supplier_Target_Date
			ETD=r.Expected_Ship_Date
			ETA=r.ETA
			Source_Module=r.Source_Module
			Exception_Number=r.Source_Exception_No
		];
	}
	else
	{
		/* No original PO/Shipment to clone from (stock item, see the poFreeCustomerName
		   block above) — build a fresh Shipment instead. PO_No/Sales_Owner/Target_Date/
		   Supplier_Target_Date genuinely have no source here, left unset rather than
		   guessed. */
		newShipID = insert into Shipments
		[
			Sales_Order=r.RR_SO
			Customer=poFreeCustomerName
			Supplier=r.RR_Supplier
			Shipment_Status="Pending"
			ETD=r.Expected_Ship_Date
			ETA=r.ETA
			Source_Module=r.Source_Module
			Exception_Number=r.Source_Exception_No
		];
	}
	newShipRec = Shipments[ID == newShipID];

	/* FIXED 2026-07-23, real bug found live ("it created a clone blank" — Shipment #
	   column showed genuinely empty, Receiving column showed "No" instead of
	   "Created"): a Deluge `insert into` from inside a Custom Function does NOT
	   reliably fire the target form's own Created workflows — same confirmed,
	   already-documented gotcha this whole app has hit before (Fenteng_Shipment/
	   Tony_Shipment creation, receiving_create_bin_receiving.txt's cross-form
	   inserts, etc). Live-confirmed via direct API pull: the new Shipment's own
	   `Shipment_No` was a genuinely empty string and `Receiving_Record_Created` was
	   false — neither `Shipment_Generate_Number` nor `Shipment_Populate_Receiving`
	   (both native, Shipments-form, Created-trigger only) ran for this record. Fixed
	   by inlining both, same "manually-maintained mirror" convention used
	   everywhere else in this codebase for this exact class of problem. */

	/* Mirrors Shipment_Generate_Number's own plain max+1 scan over every existing
	   Shipment_No (format "SHP-#####"), zero-padded to 5 digits. */
	maxShipNum = 0;
	allShipsForNum = Shipments[ID != 0];
	for each  sfn in allShipsForNum
	{
		snVal = sfn.Shipment_No;
		if(snVal != null && snVal.startsWith("SHP-"))
		{
			numPart = snVal.removeFirstOccurence("SHP-");
			numPartInt = 0;
			try
			{
				numPartInt = numPart.toLong();
			}
			catch (e)
			{
				numPartInt = 0;
			}
			if(numPartInt > maxShipNum)
			{
				maxShipNum = numPartInt;
			}
		}
	}
	/* FIXED 2026-07-23, real error found live: "Error at line number: 159 Improper
	   Statement" — traced to the `while` loop this replaced. No `while` loop exists
	   anywhere else in this entire codebase's Deluge scripts (grepped to confirm) —
	   Deluge's control structures used throughout are if/else and `for each` only.
	   Rewritten as a plain if/else-if chain on string length instead (caps at 5
	   digits / 99999 — the same range the "SHP-#####" format itself assumes). */
	nextShipNumStr = (maxShipNum + 1) + "";
	padLen = nextShipNumStr.length();
	if(padLen == 1)
	{
		nextShipNumStr = "0000" + nextShipNumStr;
	}
	else if(padLen == 2)
	{
		nextShipNumStr = "000" + nextShipNumStr;
	}
	else if(padLen == 3)
	{
		nextShipNumStr = "00" + nextShipNumStr;
	}
	else if(padLen == 4)
	{
		nextShipNumStr = "0" + nextShipNumStr;
	}
	newShipRec.Shipment_No = "SHP-" + nextShipNumStr;

	newShipLine = Shipments.PO_Shipments();
	newShipLine.SKU=r.RR_SKU;
	newShipLine.Item_Name=r.RR_Item_Name;
	newShipLine.Shipment_QTY=r.RR_Qty_Value;
	/* FIXED 2026-07-23, real gap found live ("some datas are missing") — PR_No and
	   Ordered_QTY/Remaining_QTY came back genuinely blank on the cloned line,
	   confirmed via direct API pull. PR_No is a real match key (receiving_sync_
	   shipment_mode.txt / shipments_sync_shipment_mode_to_receiving.txt /
	   shipment_status_back_sync.txt / receiving_sync_shipment_arrived.txt all key
	   off it) — leaving it blank meant none of those bidirectional syncs could ever
	   find this line. RR_PR_No is a new 5th header mirror field (see create_rr_
	   button.txt/create_rr_custom_api.txt's own NOTES), same platform-limitation
	   workaround as RR_SKU/RR_Item_Name/RR_Qty_Value. Remaining_QTY starts equal to
	   Ordered_QTY — nothing shipped against this fresh trip yet. */
	newShipLine.PR_No=r.RR_PR_No;
	newShipLine.Ordered_QTY=r.RR_Qty_Value;
	newShipLine.Remaining_QTY=r.RR_Qty_Value;
	/* REVERSED 2026-07-23, real bug found live ("why the ship mode turns from
	   airfreight to LCL. airfreight is still the original, use that") — this
	   USED to carry the supplier's own RR-level Shipment_Mode pick onto the new
	   line's planned Shipping_Mode, overwriting the PO's actual original mode
	   (Airfreight) with whatever the supplier picked while acknowledging the RR
	   (LCL) — wrong: the RR's Shipment_Mode represents what the supplier will
	   ACTUALLY use for this replacement trip, which belongs on Receiving's own
	   Shipment_Mode_When_Received (already handled separately, client-side, by
	   pushShipmentModeToReceiving() in Fenteng-RR/Tony-RR) — not on the new
	   Shipment's own PLANNED Shipping_Mode, which should stay consistent with the
	   original PO line it's replacing. Fixed: look up the matching line on
	   origShip itself (same PR_No, falling back to the first line if no match)
	   and carry ITS Shipping_Mode forward instead. */
	if(origShip != null)
	{
		origLineShipMode = "";
		for each  olsm in origShip.PO_Shipments
		{
			if(olsm.PR_No == r.RR_PR_No)
			{
				origLineShipMode = olsm.Shipping_Mode;
			}
		}
		if(origLineShipMode == "")
		{
			for each  olsmFallback in origShip.PO_Shipments
			{
				origLineShipMode = olsmFallback.Shipping_Mode;
			}
		}
		if(origLineShipMode != null && origLineShipMode != "")
		{
			newShipLine.Shipping_Mode=origLineShipMode;
		}
	}
	else if(supShipMode != null && supShipMode != "")
	{
		/* No original PO line to inherit a planned Shipping_Mode from (stock item) —
		   the supplier's own RR-level pick (already fetched above for the RR_Status
		   gate) is the only mode information that exists for this trip, so it's used
		   for both the planned mode and Shipment_Mode_When_Received here (the block
		   right below already does the latter for Fulfillment EXC). */
		newShipLine.Shipping_Mode=supShipMode;
	}
	/* ADDED 2026-07-27, real bug found live ("supplier's RR chosen shipment mode
	   is still not in new SHP") — for a Fulfillment EXC replacement, the officer
	   never gets to pick a mode on Receiving separately (that whole path is
	   internal-only, no Books, closes automatically) and the existing
	   pushShipmentModeToReceiving() (Fenteng-RR/Tony-RR, fires at Approve RR time)
	   is now too early for this architecture — the dedicated new Receiving record
	   this function creates doesn't exist until THIS click, later than Approve.
	   supShipMode (the RR's own Shipment_Mode, already fetched above for the
	   RR_Status gate) is stamped directly here instead — both the new Shipment's
	   own line AND the new Receiving line below get it, no separate sync needed. */
	if(r.Source_Module == "Fulfillment EXC" && supShipMode != null && supShipMode != "")
	{
		newShipLine.Shipment_Mode_When_Received=supShipMode;
	}
	newShipRec.PO_Shipments.insert(newShipLine);

	/* CHANGED 2026-07-27, per user ("create another new RCV instead of reusing" +
	   "dont put it in books") — a Fulfillment-EXC replacement no longer re-points
	   the existing Receiving record at all. Real reason: that record's own Books
	   PO line is often already fully received (Accepted==Ordered from the
	   original fulfillment), so a replacement unit has no headroom to receive
	   against on the SAME Books PO line — confirmed live, real `code 36012
	   "Quantity recorded cannot be more than quantity ordered"` rejection on
	   RR-00004/PO-00003. Fulfillment EXC is internal-only anyway (never sent to
	   Books at all, per the same user decision — see receiving_create_bin_
	   receiving.txt/receiving_widget_custom_api.txt's own new early-return
	   branch), so there's no reason to share the original RCV's Books-linked
	   bookkeeping in the first place. Every OTHER source (Damage/Missing/QC via
	   native Exceptions) keeps the original re-point behavior unchanged. */
	if(r.Source_Module == "Fulfillment EXC")
	{
		origRecvForIdentity = null;
		if(origPONo != "")
		{
			origRecvsForIdentity = Receiving[PO_No == origPONo];
			for each  idRecv in origRecvsForIdentity
			{
				origRecvForIdentity = idRecv;
			}
		}
		/* Falls back to poFreeCustomerName (stock-item path, "" when origPONo is
		   populated normally — no behavior change on the existing PO path). Comment
		   kept OUTSIDE the insert bracket below on purpose — see this file's own
		   2026-08-07 FIXED note above on why a `//`/comment inside one breaks parsing
		   for the whole script. */
		newFulfRecvId = insert into Receiving
		[
			Shipments = newShipID
			SO_No = newShipRec.Sales_Order
			PO_No = origPONo
			Customer_Name = if(origRecvForIdentity != null, origRecvForIdentity.Customer_Name, poFreeCustomerName)
			Supplier = r.RR_Supplier
			Source_Module = "Fulfillment EXC"
			Exception_Number = r.Source_Exception_No
		];
		newFulfRecv = Receiving[ID == newFulfRecvId];
		newFulfLine = Receiving.Receiving_Line_Items();
		newFulfLine.PR_No = r.RR_PR_No;
		newFulfLine.SKU = r.RR_SKU;
		newFulfLine.Item_Name = r.RR_Item_Name;
		newFulfLine.Expected_Qty = r.RR_Qty_Value;
		if(supShipMode != null && supShipMode != "")
		{
			newFulfLine.Shipment_Mode_When_Received = supShipMode;
		}
		newFulfRecv.Receiving_Line_Items.insert(newFulfLine);
		/* FIXED 2026-07-27, real bug found live ("new rcv but there is no RCV
		   number?") — same class of gotcha this whole file already hit for
		   Shipment_No/Fenteng_Shipment/Tony_Shipment: an `insert into` from inside
		   a Custom Function does not reliably fire the target form's own Created
		   workflows, so Receiving's own auto-numbering (Receive_No1) AND its
		   rollup fields (Total_Lines/Total_Expected_Qty/etc, normally computed by
		   Receiving_Compute_Totals on Validations) both stayed blank/0 — the
		   widget showed a blank Receive # and "0/0" lines despite the line above
		   genuinely being inserted. Inlines both, same already-proven patterns
		   used elsewhere in this codebase (max+1 scan for the number, the exact
		   rollup formula already proven in pr_to_po_grouping.txt's own matching
		   fix for this same class of bug). */
		maxRecvNum = 0;
		allRecvsForNum = Receiving[ID != 0];
		for each  rfn in allRecvsForNum
		{
			rnVal = rfn.Receive_No1;
			if(rnVal != null && rnVal.startsWith("RCV-"))
			{
				rnPart = rnVal.removeFirstOccurence("RCV-");
				rnPartInt = 0;
				try
				{
					rnPartInt = rnPart.toLong();
				}
				catch (e)
				{
					rnPartInt = 0;
				}
				if(rnPartInt > maxRecvNum)
				{
					maxRecvNum = rnPartInt;
				}
			}
		}
		nextRecvNumStr = (maxRecvNum + 1) + "";
		recvPadLen = nextRecvNumStr.length();
		if(recvPadLen == 1)
		{
			nextRecvNumStr = "0000" + nextRecvNumStr;
		}
		else if(recvPadLen == 2)
		{
			nextRecvNumStr = "000" + nextRecvNumStr;
		}
		else if(recvPadLen == 3)
		{
			nextRecvNumStr = "00" + nextRecvNumStr;
		}
		else if(recvPadLen == 4)
		{
			nextRecvNumStr = "0" + nextRecvNumStr;
		}
		newFulfRecv.Receive_No1 = "RCV-" + nextRecvNumStr;
		newFulfRecv.Total_Expected_Qty = r.RR_Qty_Value;
		newFulfRecv.Total_Accepted_Qty = 0;
		newFulfRecv.Total_Damage_Qty = 0;
		newFulfRecv.Total_Missing_Qty = 0;
		newFulfRecv.Total_Lines = 1;
		newFulfRecv.Incomplete_Lines = 1;
		newFulfRecv.Ready_for_Fulfillment1 = 0;
		newFulfRecv.Receive_Status = "Pending";
	}
	else
	{
		/* Mirrors shipment_populate_receiving.txt's own "already exists" branch —
		   re-points the SAME Receiving record (found earlier as excMatch/origPONo's
		   own linked receive) at this new Shipment, per the "same RCV, same PO"
		   recycle architecture. Always expected to find one here (a replacement RR
		   only ever exists because a Receiving record already flagged an Exception
		   for it) — the count() guard is defensive, matching the native script's
		   own shape, not expected to hit the empty case in practice. */
		existingRecvForPO2 = Receiving[PO_No == origPONo];
		if(existingRecvForPO2.count() > 0)
		{
			for each  existingRecvRoute2 in existingRecvForPO2
			{
				/* ADDED 2026-08-11, per user ("flag/clean it so future datas dont look
				   misleading") — real gap found live: this re-point orphans whichever
				   Shipment was PREVIOUSLY linked here (SHP-00002 in the live case that
				   surfaced this — sat permanently "Pending" forever after being
				   superseded by SHP-00003, since nothing ever pointed back to it again
				   to sync its Shipment_Status/PO_Shipments.Line_Status). Captured BEFORE
				   the re-point overwrites it. REVISED same day, per user pointing at the
				   "Shipment Grouping" tab (reads supplier-side Supplier1/2_Shipment_
				   Details per-line status, a separate data source from this field) —
				   that view already showed the old shipment's own line as genuinely
				   "Arrived" (the supplier-side Arrived sync in Receiving/Receivingv2
				   correctly flips it while a shipment IS the active pointer, before a
				   later re-point moves on) — so "Delivered" is factually accurate here,
				   not just a simpler stand-in for an invented "Superseded" status. Using
				   the real existing picklist value means no native Form Builder change
				   needed. Iterate-and-string-compare, not a bracket [ID==...] criteria
				   lookup or .toLong() — both are documented BIGINT gotchas in this
				   codebase (see CLAUDE.md Deluge Gotchas). */
				oldShipIdForSupersede = existingRecvRoute2.Shipments + "";
				update existingRecvRoute2
				[
					Shipments = newShipID
				];
				if(oldShipIdForSupersede != "" && oldShipIdForSupersede != "null" && oldShipIdForSupersede != (newShipID + ""))
				{
					for each  oldShipRecForSupersede in Shipments[ID != 0]
					{
						if(oldShipRecForSupersede.ID + "" == oldShipIdForSupersede)
						{
							update oldShipRecForSupersede
							[
								Shipment_Status = "Delivered"
							];
						}
					}
				}
			}
		}
	}
	newShipRec.Receiving_Record_Created = true;

	/* ADDED 2026-07-23, per user ("we should populate this to supplier's shipment")
	   — every OTHER Shipments record in this app gets a matching Fenteng_Shipment/
	   Tony_Shipment self-report record created alongside it (see pr_to_po_grouping.txt
	   Actions 2/3), but this Custom Function only ever inserted into Shipments, never
	   the supplier form — the supplier would never have seen this replacement trip
	   on their own portal at all. Mirrors pr_to_po_grouping.txt's own block exactly
	   (same field set, same RR_No-always-blank convention, same Shipment_No+
	   Parent_Shipment_ID+Added_User1 header shape) — just branching on r.RR_Supplier
	   instead of a separate isNewShipmentF/T flag, since this function only ever
	   creates ONE new Shipment per call (no batch-multiple-lines case to guard
	   against re-creating a duplicate supplier record for). */
	/* FIXED 2026-08-07 — same real bug/fix as the supStatus branch earlier in this
	   function (r.RR_Supplier can be short or full Suppliers-form name). */
	rrSupplierValCS2 = r.RR_Supplier + "";
	if(rrSupplierValCS2 == "Fenteng" || rrSupplierValCS2.contains("Fenteng"))
	{
		newSuppRecIDCS = insert into Fenteng_Shipment
		[
			Shipment_No=newShipRec.Shipment_No
			Parent_Shipment_ID=newShipRec.ID + ""
			Added_User1=zoho.loginuser
		];
		newSuppRecCS = Fenteng_Shipment[ID == newSuppRecIDCS];
		for each  shLnCS in newShipRec.PO_Shipments
		{
			newSuppRowCS = Fenteng_Shipment.Supplier1_Shipment_Details();
			newSuppRowCS.SKU=shLnCS.SKU;
			newSuppRowCS.Item_Name=shLnCS.Item_Name;
			newSuppRowCS.PR_No=shLnCS.PR_No;
			newSuppRowCS.RR_No="";
			newSuppRecCS.Supplier1_Shipment_Details.insert(newSuppRowCS);
		}
	}
	else if(rrSupplierValCS2 == "Tony" || rrSupplierValCS2.contains("Tony"))
	{
		newSuppRecIDCST = insert into Tony_Shipment
		[
			Shipment_No=newShipRec.Shipment_No
			Parent_Shipment_ID=newShipRec.ID + ""
			Added_User1=zoho.loginuser
		];
		newSuppRecCST = Tony_Shipment[ID == newSuppRecIDCST];
		for each  shLnCST in newShipRec.PO_Shipments
		{
			newSuppRowCST = Tony_Shipment.Supplier2_Shipment_Details();
			newSuppRowCST.SKU=shLnCST.SKU;
			newSuppRowCST.Item_Name=shLnCST.Item_Name;
			newSuppRowCST.PR_No=shLnCST.PR_No;
			newSuppRowCST.RR_No="";
			newSuppRecCST.Supplier2_Shipment_Details.insert(newSuppRowCST);
		}
	}

	/* Stamp the duplication guard — same fetched-record header-field-write pattern
	   already proven safe elsewhere in this codebase (e.g. apoF.PO_Status="Confirmed"
	   in pr_to_po_grouping.txt). Must happen AFTER Shipment_No is actually set. */
	r.Cloned_Shipment_No = newShipRec.Shipment_No;
	response.put("status","success");
	if(origShip != null)
	{
		response.put("message","Replacement Shipment " + newShipRec.Shipment_No + " created for PO " + origPONo + ".");
	}
	else
	{
		response.put("message","Replacement Shipment " + newShipRec.Shipment_No + " created (stock item — no original PO, PO_No/Sales_Owner left blank).");
	}
	response.put("shipmentId", newShipID + "");
	return response;
}

====================================================
CUSTOM API SETUP:
  Link Name: clone_shipment_for_replacement
  Method: POST
  Parameter: rrRecordId
  Function: cloneShipmentForReplacement
  Response Type: Standard
  Confirm Enabled, not stuck in Draft (same recurring gotcha every other Custom
  API in this app has hit at least once).
====================================================

NOTES:
- ADDED 2026-08-12, per user ("item 1 is already have stock... there's no existing
  PR or PO. how can we route this or bypass this PO to create shipment?") — a
  Fulfillment EXC item that already had stock on hand (no PR/PO ever raised for it)
  used to hard-error here ("Could not trace back to the original PO"), a genuine
  dead end — Log Replacement Shipment simply couldn't be used for these. Scope
  confirmed with user via AskUserQuestion: Fulfillment EXC only (native Damage/
  Missing RRs still always trace to a real PO by construction, so their blank-
  origPONo case is unchanged/still a hard error). When origPONo resolves blank for
  a Fulfillment EXC RR, this now takes a "fresh Shipment" path instead of erroring:
  builds a new Shipments/Receiving record straight from the RR + a Pre_Order_FF[SO==
  r.RR_SO] lookup for Customer (same SO-keyed enrichment pattern already used
  elsewhere in this app, e.g. Exception Control widget's own syncCompletedToOrderAggregation)
  — Sales_Owner/PO_No/Target_Date/Supplier_Target_Date are left genuinely blank on
  this path (no real source without a PR/PO), and Shipping_Mode falls back to the
  supplier's own RR-level pick (supShipMode) since there's no original PO line to
  inherit a planned mode from either. The existing clone-from-PO path (origPONo
  populated) is completely UNCHANGED — every branch above is purely additive
  (`if(origShip != null){...same as before...} else {...new...}`), same standing
  rule this whole app follows about not touching a confirmed-working path.
  **UNTESTED** — needs a live Fulfillment EXC RR whose source Exception really has
  no PR (confirm via the Replacement widget: pick a supplier on an unresolved-
  Supplier RR first if needed, get it Acknowledged on the supplier portal, then
  click Log Replacement Shipment) — confirm a real Shipment/Receiving get created
  with blank PO_No, populated Customer (if Pre_Order_FF has a matching SO row),
  and the response toast reads the new "stock item" message.
- This function is what makes "new Shipment copies exact details of the original
  Shipment" real — PO_No/Sales_Order/Customer/Sales_Owner all come straight off
  the existing Shipment record for the same PO, no re-derivation/guessing.
- shipment_populate_receiving.txt's own Created-trigger action then detects that a
  Receiving record already exists for this PO_No (it will, since the original
  Shipment/Receiving already went through the normal flow) and routes this new
  Shipment's own Shipments-link onto that SAME existing Receiving record instead
  of creating a second RCV — see that file's own NOTES for why Expected_Qty is
  deliberately left untouched.
- Once this new Shipment exists, the officer edits its own Shipment_Mode_When_Received
  per line as normal (same field, same bidirectional sync already built in
  receiving_sync_shipment_mode.txt / shipments_sync_shipment_mode_to_receiving.txt) —
  no new sync logic needed, it already targets Receiving by matching PR_No, and the
  Receiving record it now targets is the SAME one the officer will re-inspect and
  re-click Create Receive on.
- Widget wiring: a "Log Replacement Shipment" button on the RR detail view
  (Fenteng-RR/Tony-RR, shown only once RR_Status is Acknowledged), calling this
  Custom API with the AGGREGATE Replacement_Request's own ID — NOT the supplier
  RR's own ID (the widget currently only has the supplier RR record loaded; needs
  to resolve the matching aggregate RR by RR_No first, same pattern
  loadMatchedSupplierRecord() already uses in reverse in
  UI/EndUser/ReplacementRequest).
- CONFIRMED creates a real Shipment 2026-07-23 after the RR_Status gate fix above —
  user tested live on RR-00003. Same test also surfaced 2 more real bugs, both
  fixed in this same pass: (1) "clicked again, no duplication block" — fixed via
  Cloned_Shipment_No (see PREREQUISITE + the guard right after the null-check);
  (2) "it created a clone blank" — the new Shipment's own Shipment_No came back
  genuinely empty and Receiving_Record_Created stayed false, because `insert into
  Shipments[...]` from inside a Custom Function does not reliably fire that form's
  own Created workflows (Shipment_Generate_Number / Shipment_Populate_Receiving) —
  same class of gotcha this app has hit before. Fixed by inlining both directly
  after the insert (see the FIXED comment right after `newShipRec = Shipments[ID
  == newShipID];`). CONFIRMED WORKING 2026-07-23 after the `while`-loop syntax fix
  (real Shipment_No generated — SHP-00019 — and Receiving_Record_Created flipped
  true) — user's own retest then flagged 2 more real gaps, both fixed in this same
  pass: (3) the cloned line's own PR_No/Ordered_QTY/Remaining_QTY were genuinely
  blank (see the new RR_PR_No mirror field + the FIXED comment right before
  `newShipLine.PR_No=r.RR_PR_No;`) — this one mattered functionally, not just
  cosmetically, since PR_No is the match key every Shipment<->Receiving mode/status
  sync in this app keys off; (4) "we should populate this to supplier's shipment" —
  this function only ever created the Shipments record, never the matching
  Fenteng_Shipment/Tony_Shipment self-report record every OTHER Shipment in this
  app gets — fixed by inlining the same block pr_to_po_grouping.txt's Actions 2/3
  already use (see the new `if(r.RR_Supplier=="Fenteng"){...} else if(...=="Tony")`
  block right after the Receiving re-point). Needs: Cloned_Shipment_No + RR_PR_No
  both added to Replacement_Request, RR_PR_No stamp added to create_rr_button.txt/
  create_rr_custom_api.txt (re-paste those 2 as well, not just this file), then a
  fresh end-to-end test: click Log Replacement Shipment once → confirm the new
  Shipment has a real Shipment_No, its own line has PR_No/Ordered_QTY/Remaining_QTY
  filled, Receiving is re-pointed to it, AND a matching Fenteng_Shipment/
  Tony_Shipment record now exists with the right SKU/PR_No — click again → blocked.
====================================================

````
