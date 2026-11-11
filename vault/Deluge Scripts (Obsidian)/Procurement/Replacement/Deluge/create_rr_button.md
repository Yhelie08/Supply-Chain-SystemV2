---
title: "create_rr_button"
source_file: "create_rr_button.txt"
category: "Procurement/Replacement/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 624
tags:
  - custom-api
  - deluge
  - fulfillment
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-books
---

# create_rr_button

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `Procurement/Replacement/Deluge`
> - **Source File:** `create_rr_button.txt`
> - **Lines of Code:** 624
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Exceptions "Create RR" action button — creates Replacement_Request + routes a mirror
   copy to the affected item's supplier-specific RR form ==
== Action 1 pre-existing (pasted from user's Temp.txt, unchanged below) ==
== Action 2/3 (Fenteng/Tony) new 2026-07-07, untested ==
== REWORKED 2026-07-13, per user request: split per ITEM instead of one RR per
   Exception — see NOTES for full rationale and the 2 bugs fixed in the same pass. ==

====================================================
WORKFLOW SETUP
  Form: Exceptions
  Location: Report Action Item, button "Create RR" (Create_RR)
  Action 1: existing/unchanged — creates the aggregate Replacement_Request
  Action 2 (Fenteng_Lighting_Replacement_Request) and Action 3
  (Tony_Fan_Replacement_Request): NEW, SEPARATE actions — same established rule as
  every other duplicated-supplier-form pair in this codebase (Fenteng/Tony subform
  constructors must not be combined in one script).
  Field link names confirmed live via ReplacementRequestFields.txt (root) — see that
  file for the full dump. Key fact used below: Fenteng_Lighting_Replacement_Request and
  Tony_Fan_Replacement_Request use the EXACT SAME field link names as the base
  Replacement_Request form, no _Supplier1/_Supplier2 suffix (unlike every other
  duplicated form pair in this app) — confirmed, not guessed.
====================================================

====================================================
ACTION 1 — Replacement_Request (grouped-per-item, 2026-07-13)
====================================================

// === Create RR button — sa Exceptions form/report ===
// Groups Product_Context1 rows by SKU + Type_field ("item") — each distinct group gets
// its OWN Replacement_Request (RR1 item1, RR2 item2, ...), all sharing the same
// Source_Exception_No (grouped under the same source Exception). Damage rows of the
// SAME SKU are per-unit (Qty=1 each) and get summed into one RR_Qty per item; Missing's
// single bare row already carries its own total Qty.
excRec = Exceptions[ID == input.ID];

groupKeys = List();
groupSku = Map();
groupItem = Map();
groupSupplier = Map();
groupType = Map();
groupQty = Map();
for each  pc in excRec.Product_Context1
{
	/* ADDED 2026-07-21, per user (repair-tracking feature) — a Damage row still
	   under in-house repair (Repairable=Yes, Repair_Outcome not yet "Not Fixed")
	   is excluded from RR creation entirely, not just disabled in the widget's UI.
	   This is the real backend gate — the widget's own canCreateRR() disables the
	   button, but that alone can't stop this native Action or its Custom Function
	   mirror being called directly. Missing rows are unaffected (no Repairable
	   concept). */
	if(pc.Type_field == "Damage" && pc.Repairable == "Yes" && pc.Repair_Outcome != "Not Fixed")
	{
		continue;
	}
	gKey = pc.SKU + "||" + pc.Type_field;
	if(!groupKeys.contains(gKey))
	{
		groupKeys.add(gKey);
		groupSku.put(gKey,pc.SKU);
		groupItem.put(gKey,pc.Item);
		groupSupplier.put(gKey,pc.Supplier);
		groupType.put(gKey,pc.Type_field);
		groupQty.put(gKey,0);
	}
	groupQty.put(gKey, groupQty.get(gKey) + ifnull(pc.Qty,0));
}

// dedup: an RR already covering this exact SKU+Source_Type combo, under this Exception
existingPairs = List();
existingRRsForExc = Replacement_Request[Source_Exception_No == input.Exception_No];
for each  exrr in existingRRsForExc
{
	for each  srow in exrr.Replacement_Summary
	{
		existingPairs.add(srow.SKU + "||" + exrr.Source_Type);
	}
}

maxNum = 0;
existingRRsAll = Replacement_Request[ID != 0];
for each  rr in existingRRsAll
{
	rrNoStr = rr.RR_No;
	if(rrNoStr != null && rrNoStr != "")
	{
		numPart = rrNoStr.removeFirstOccurence("RR-");
		num = numPart.toLong();
		if(num > maxNum)
		{
			maxNum = num;
		}
	}
}

anyCreated = false;
for each  gKey in groupKeys
{
	gSku = groupSku.get(gKey);
	gType = groupType.get(gKey);
	sourceType = "";
	if(input.Source_Module == "Receiving")
	{
		if(gType == "Damage")
		{
			sourceType = "Receiving Damage";
		}
		else
		{
			sourceType = "Receiving Missing";
		}
	}
	else if(input.Source_Module == "Fulfillment QC")
	{
		sourceType = "QC Failure";
	}
	else
	{
		sourceType = "Management Decision";
	}
	pairKey = gSku + "||" + sourceType;
	if(existingPairs.contains(pairKey))
	{
		continue;
	}
	maxNum = maxNum + 1;
	newNum = maxNum;
	if(newNum < 10)
	{
		newRRNo = "RR-0000" + newNum;
	}
	else if(newNum < 100)
	{
		newRRNo = "RR-000" + newNum;
	}
	else if(newNum < 1000)
	{
		newRRNo = "RR-00" + newNum;
	}
	else if(newNum < 10000)
	{
		newRRNo = "RR-0" + newNum;
	}
	else
	{
		newRRNo = "RR-" + newNum;
	}
	/* ADDED 2026-07-20, per user — new plain header fields (NOT the Replacement_Summary
	   subform) mirroring Supplier/SKU/Item/RR_Qty, so the new Clone Shipment mechanism
	   can read them safely later without touching a subform on a criteria-queried
	   record (the confirmed-broken pattern from this whole session's own debug saga).
	   Same "mirror field to route around a platform limit" convention as
	   Sales_Order_Display elsewhere in this app.
	   ADDED 2026-07-23, real bug found live ("some datas are missing" on a cloned
	   Shipment's own PO_Shipments line — PR_No/Ordered_QTY both came back blank) —
	   RR_PR_No is a 5th mirror field, same reasoning, same source as
	   Replacement_Summary.PR_No a few lines below (input.Receiving_Line_ID — this
	   app's own established source for a PR number on an Exception-derived record,
	   despite the field's own name). clone_shipment_for_replacement.txt now reads
	   this to stamp the new Shipment line's own PR_No correctly. */
	newRRID = insert into Replacement_Request
	[
		RR_No=newRRNo
		RR_Date=zoho.currentdate
		RR_Status="Open"
		Source_Type=sourceType
		Source_Exception_No=input.Exception_No
		Last_Updated=zoho.currenttime
		Added_User=zoho.loginuser
		RR_Supplier=groupSupplier.get(gKey)
		RR_SKU=gSku
		RR_Item_Name=groupItem.get(gKey)
		RR_Qty_Value=groupQty.get(gKey)
		RR_PR_No=input.Receiving_Line_ID
	];
	newRR = Replacement_Request[ID == newRRID];
	newRow = Replacement_Request.Replacement_Summary();
	newRow.PR_No=input.Receiving_Line_ID;
	newRow.Supplier=groupSupplier.get(gKey);
	newRow.SKU=gSku;
	newRow.Item=groupItem.get(gKey);
	newRow.SO_No=input.Sales_Order;
	newRow.Original_PO_No=input.PO_No;
	newRow.Priority=input.Priority;
	newRow.RR_Qty=groupQty.get(gKey);
	newRR.Replacement_Summary.insert(newRow);
	anyCreated = true;

	/* ADDED 2026-07-20, per user request ("let's not be dependent on supplier, their
	   only job is to approve and populate ETA/ETD") — the Missing_SKUs stamp / new
	   replacement PO creation used to happen on the SUPPLIER's own "Approve RR" click
	   (approve_rr_supplier.txt). Moved here, to the OFFICER's Create RR click, so the
	   recycle/replacement path no longer depends on the supplier ever clicking
	   anything — it fires the moment the RR itself is raised. See that file's NOTES
	   for the full before/after. */
	if(sourceType == "Receiving Missing")
	{
		targetPOsRR = Purchase_Order[PO_No == input.PO_No];
		for each  poRR in targetPOsRR
		{
			poRR.Missing_SKUs = gSku;
		}
	}
	else
	{
		/* CHANGED 2026-07-20, per user request — real architecture simplification.
		   Damage/QC/Complaint used to spin up a brand-new Creator-only Purchase_Order
		   (RR_Reference_No-tagged) — replaced entirely with the same "stamp a flag on
		   the ORIGINAL PO" pattern the Missing branch already used above. New field
		   Damage_SKUs (mirrors Missing_SKUs) drives the recycle in
		   receiving_create_bin_receiving.txt (generalized to check Missing_SKUs OR
		   Damage_SKUs). The replacement now flows back through a cloned Shipment +
		   the SAME original Receiving record — no second PO, no cross-PO trace-back,
		   no separate Books PO. See CLAUDE.md for the full before/after. */
		targetPOsRRDmg = Purchase_Order[PO_No == input.PO_No];
		for each  poRRDmg in targetPOsRRDmg
		{
			poRRDmg.Damage_SKUs = gSku;
		}
	}
}
if(anyCreated == true)
{
	input.Exception_Status = "Under Review";
	success message "RR(s) created successfully for Exception " + input.Exception_No + ".";
}
else
{
	info "No new RR needed — every item on this Exception already has an RR.";
}

====================================================
ACTION 2 — Fenteng_Lighting_Replacement_Request (grouped-per-item, 2026-07-13)
====================================================

excRecF = Exceptions[ID == input.ID];

groupKeysF = List();
groupSkuF = Map();
groupItemF = Map();
groupSupplierF = Map();
groupTypeF = Map();
groupQtyF = Map();
for each  pc in excRecF.Product_Context1
{
	/* ADDED 2026-07-21 — same repair-tracking gate as Action 1, see that block's
	   own comment. */
	if(pc.Type_field == "Damage" && pc.Repairable == "Yes" && pc.Repair_Outcome != "Not Fixed")
	{
		continue;
	}
	gKeyF = pc.SKU + "||" + pc.Type_field;
	if(!groupKeysF.contains(gKeyF))
	{
		groupKeysF.add(gKeyF);
		groupSkuF.put(gKeyF,pc.SKU);
		groupItemF.put(gKeyF,pc.Item);
		groupSupplierF.put(gKeyF,pc.Supplier);
		groupTypeF.put(gKeyF,pc.Type_field);
		groupQtyF.put(gKeyF,0);
	}
	groupQtyF.put(gKeyF, groupQtyF.get(gKeyF) + ifnull(pc.Qty,0));
}

existingSupPairsF = List();
existingSupRRsF = Fenteng_Lighting_Replacement_Request[Source_Exception_No == input.Exception_No];
for each  esrF in existingSupRRsF
{
	for each  ssrowF in esrF.Replacement_Summary
	{
		existingSupPairsF.add(ssrowF.SKU + "||" + esrF.Source_Type);
	}
}

for each  gKeyF in groupKeysF
{
	// FIXED 2026-08-07, real bug confirmed live: Production's real
	// Receiving.Supplier value is "Tony Fan"/"Fenteng Lighting" (the
	// Suppliers form's own full display name), not the bare "Fenteng"/"Tony"
	// this strict equality expected — only Dev's own test data happened to
	// use the bare literal, masking this in every prior test. Zero supplier
	// RRs were ever created in Production as a result. Matches the defensive
	// == || .contains() pattern already used elsewhere in this codebase for
	// the same field (see receiving_widget_custom_api.txt/
	// receiving_create_bin_receiving.txt). Mirrored from create_rr_custom_api.txt.
	supplierValF = groupSupplierF.get(gKeyF) + "";
	if(supplierValF != "Fenteng" && !supplierValF.contains("Fenteng"))
	{
		continue;
	}
	gSkuF = groupSkuF.get(gKeyF);
	gTypeF = groupTypeF.get(gKeyF);
	sourceTypeF = "";
	if(input.Source_Module == "Receiving")
	{
		if(gTypeF == "Damage")
		{
			sourceTypeF = "Receiving Damage";
		}
		else
		{
			sourceTypeF = "Receiving Missing";
		}
	}
	else if(input.Source_Module == "Fulfillment QC")
	{
		sourceTypeF = "QC Failure";
	}
	else
	{
		sourceTypeF = "Management Decision";
	}
	pairKeyF = gSkuF + "||" + sourceTypeF;
	if(existingSupPairsF.contains(pairKeyF))
	{
		continue;
	}
	parentRRNoF = "";
	parentRRsF = Replacement_Request[Source_Exception_No == input.Exception_No];
	for each  prrF in parentRRsF
	{
		if(prrF.Source_Type == sourceTypeF)
		{
			for each  prsRowF in prrF.Replacement_Summary
			{
				if(prsRowF.SKU == gSkuF)
				{
					parentRRNoF = prrF.RR_No;
				}
			}
		}
	}
	if(parentRRNoF != "")
	{
		newSupRRIDF = insert into Fenteng_Lighting_Replacement_Request
		[
			RR_No=parentRRNoF
			RR_Date=zoho.currentdate
			RR_Status="Open"
			Source_Type=sourceTypeF
			Source_Exception_No=input.Exception_No
			Last_Updated=zoho.currenttime
		];
		newSupRRF = Fenteng_Lighting_Replacement_Request[ID == newSupRRIDF];
		newSupRowF = Fenteng_Lighting_Replacement_Request.Replacement_Summary();
		newSupRowF.PR_No=input.Receiving_Line_ID;
		newSupRowF.Supplier=groupSupplierF.get(gKeyF);
		newSupRowF.SKU=gSkuF;
		newSupRowF.Item=groupItemF.get(gKeyF);
		newSupRowF.SO_No=input.Sales_Order;
		newSupRowF.Original_PO_No=input.PO_No;
		newSupRowF.Priority=input.Priority;
		newSupRowF.RR_Qty=groupQtyF.get(gKeyF);
		newSupRRF.Replacement_Summary.insert(newSupRowF);

		/* ADDED 2026-07-20 — supplier-side counterpart of Action 1's Missing_SKUs
		   stamp / new PO creation, see that Action's own comment for why this moved
		   here instead of approve_rr_supplier.txt. */
		if(sourceTypeF == "Receiving Missing")
		{
			targetSupPOsF2 = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == input.PO_No];
			for each  spoF2 in targetSupPOsF2
			{
				spoF2.Missing_SKUs_Supplier1 = gSkuF;
			}
		}
		else
		{
			/* CHANGED 2026-07-20 — supplier-side counterpart of Action 1's Damage_SKUs
			   change above. No new supplier PO created — stamps the new
			   Damage_SKUs_Supplier1 field on the EXISTING supplier PO instead. */
			targetSupPOsDmgF2 = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == input.PO_No];
			for each  spoDmgF2 in targetSupPOsDmgF2
			{
				spoDmgF2.Damage_SKUs_Supplier1 = gSkuF;
			}
		}
	}
}

====================================================
ACTION 3 — Tony_Fan_Replacement_Request (grouped-per-item, 2026-07-13)
====================================================

excRecT = Exceptions[ID == input.ID];

groupKeysT = List();
groupSkuT = Map();
groupItemT = Map();
groupSupplierT = Map();
groupTypeT = Map();
groupQtyT = Map();
for each  pc in excRecT.Product_Context1
{
	/* ADDED 2026-07-21 — same repair-tracking gate as Action 1, see that block's
	   own comment. */
	if(pc.Type_field == "Damage" && pc.Repairable == "Yes" && pc.Repair_Outcome != "Not Fixed")
	{
		continue;
	}
	gKeyT = pc.SKU + "||" + pc.Type_field;
	if(!groupKeysT.contains(gKeyT))
	{
		groupKeysT.add(gKeyT);
		groupSkuT.put(gKeyT,pc.SKU);
		groupItemT.put(gKeyT,pc.Item);
		groupSupplierT.put(gKeyT,pc.Supplier);
		groupTypeT.put(gKeyT,pc.Type_field);
		groupQtyT.put(gKeyT,0);
	}
	groupQtyT.put(gKeyT, groupQtyT.get(gKeyT) + ifnull(pc.Qty,0));
}

existingSupPairsT = List();
existingSupRRsT = Tony_Fan_Replacement_Request[Source_Exception_No == input.Exception_No];
for each  esrT in existingSupRRsT
{
	for each  ssrowT in esrT.Replacement_Summary
	{
		existingSupPairsT.add(ssrowT.SKU + "||" + esrT.Source_Type);
	}
}

for each  gKeyT in groupKeysT
{
	// FIXED 2026-08-07 — same real bug/fix as the Fenteng loop above.
	supplierValT = groupSupplierT.get(gKeyT) + "";
	if(supplierValT != "Tony" && !supplierValT.contains("Tony"))
	{
		continue;
	}
	gSkuT = groupSkuT.get(gKeyT);
	gTypeT = groupTypeT.get(gKeyT);
	sourceTypeT = "";
	if(input.Source_Module == "Receiving")
	{
		if(gTypeT == "Damage")
		{
			sourceTypeT = "Receiving Damage";
		}
		else
		{
			sourceTypeT = "Receiving Missing";
		}
	}
	else if(input.Source_Module == "Fulfillment QC")
	{
		sourceTypeT = "QC Failure";
	}
	else
	{
		sourceTypeT = "Management Decision";
	}
	pairKeyT = gSkuT + "||" + sourceTypeT;
	if(existingSupPairsT.contains(pairKeyT))
	{
		continue;
	}
	parentRRNoT = "";
	parentRRsT = Replacement_Request[Source_Exception_No == input.Exception_No];
	for each  prrT in parentRRsT
	{
		if(prrT.Source_Type == sourceTypeT)
		{
			for each  prsRowT in prrT.Replacement_Summary
			{
				if(prsRowT.SKU == gSkuT)
				{
					parentRRNoT = prrT.RR_No;
				}
			}
		}
	}
	if(parentRRNoT != "")
	{
		newSupRRIDT = insert into Tony_Fan_Replacement_Request
		[
			RR_No=parentRRNoT
			RR_Date=zoho.currentdate
			RR_Status="Open"
			Source_Type=sourceTypeT
			Source_Exception_No=input.Exception_No
			Last_Updated=zoho.currenttime
		];
		newSupRRT = Tony_Fan_Replacement_Request[ID == newSupRRIDT];
		newSupRowT = Tony_Fan_Replacement_Request.Replacement_Summary();
		newSupRowT.PR_No=input.Receiving_Line_ID;
		newSupRowT.Supplier=groupSupplierT.get(gKeyT);
		newSupRowT.SKU=gSkuT;
		newSupRowT.Item=groupItemT.get(gKeyT);
		newSupRowT.SO_No=input.Sales_Order;
		newSupRowT.Original_PO_No=input.PO_No;
		newSupRowT.Priority=input.Priority;
		newSupRowT.RR_Qty=groupQtyT.get(gKeyT);
		newSupRRT.Replacement_Summary.insert(newSupRowT);

		/* ADDED 2026-07-20 — supplier-side counterpart of Action 1's Missing_SKUs
		   stamp / new PO creation, see that Action's own comment for why this moved
		   here instead of approve_rr_supplier.txt. */
		if(sourceTypeT == "Receiving Missing")
		{
			targetSupPOsT2 = Tony_Fan_Purchase_Order[PO_No_Supplier2 == input.PO_No];
			for each  spoT2 in targetSupPOsT2
			{
				spoT2.Missing_SKUs_Supplier2 = gSkuT;
			}
		}
		else
		{
			/* CHANGED 2026-07-20 — supplier-side counterpart of Action 1's Damage_SKUs
			   change above. No new supplier PO created — stamps the new
			   Damage_SKUs_Supplier2 field on the EXISTING supplier PO instead. */
			targetSupPOsDmgT2 = Tony_Fan_Purchase_Order[PO_No_Supplier2 == input.PO_No];
			for each  spoDmgT2 in targetSupPOsDmgT2
			{
				spoDmgT2.Damage_SKUs_Supplier2 = gSkuT;
			}
		}
	}
}

====================================================
NOTES:
- REWORKED 2026-07-13, per user request: "from exception -> grouped items right? when
  RR is created we should separate the RR's per item -> RR1 item1 in exception, RR2
  item2 in same grouped exception and so on". All 3 Actions changed from "1 RR per
  Exception" (old: block entirely if ANY RR already exists for this Exception, take the
  LAST Product_Context1 row's values only) to "1 RR per distinct item" — grouped by
  `SKU + "||" + Type_field` across the Exception's Product_Context1 rows. Multiple
  Damage rows of the SAME SKU (per-unit rows from the 2026-07-13 per-damage-unit rework,
  see receiving_validations_and_damage_missing.txt) are summed into ONE item-group's
  RR_Qty, not one RR per physical unit — a replacement request per unit wouldn't be
  operationally meaningful, per item is. Dedup changed to match: per (SKU, Source_Type)
  pair within the Exception instead of "any RR exists" — re-clicking Create RR only
  creates RR(s) for items that don't have one yet, doesn't block entirely just because
  ONE item on a multi-item Exception already got its RR. Actions 2/3 independently
  re-derive the same grouping (separate actions don't share local vars, established
  pattern elsewhere in this codebase) and re-match each group's parent RR_No by
  (SKU, Source_Type) rather than assuming exactly one RR per Exception like before.
- Also fixed 2 real bugs found in the same pass, both pre-existing (not introduced by
  the grouping rework):
  (1) All 3 Actions read `pc.Affected_Qty` off Product_Context1 — that field doesn't
      exist (real field is `Qty`, same stale-name bug found and fixed in
      receiving_validations_and_damage_missing.txt on the same day) — `RR_Qty` on every
      Replacement_Summary row this script ever inserted has been blank/0. Fixed:
      `groupQty`/`groupQtyF`/`groupQtyT` now sum `ifnull(pc.Qty,0)`.
  (2) Old code looped ALL of Product_Context1 but only kept the LAST row's
      Supplier/SKU/Item/Type_field (plain variable overwrite each iteration, no
      per-row handling) — silently lost data for any Exception with more than one
      Product_Context1 row, which became a real/common case once Damage went per-unit.
      The grouping rework above fixes this as a side effect (every row is now visited
      and folded into its group instead of just the last one surviving).
- BUG caught by user before first test (2026-07-07): Action 1's `rrExists` duplicate
  guard only stops Action 1 itself — `return` inside one Action of a multi-action
  workflow does NOT skip the other Actions, they're separate scripts under the same
  trigger. So without their own guard, clicking Create_RR again on an Exception that
  already has an RR would still let Actions 2/3 insert a SECOND Fenteng/Tony RR record
  every time, even though Action 1 correctly blocked the duplicate aggregate one. FIXED
  originally by giving Actions 2/3 their own duplicate check — SUPERSEDED 2026-07-13 by
  the per-(SKU,Source_Type) dedup above, which covers the same concern at finer grain.
- Actions 2/3 independently re-fetch `Exceptions[ID == input.ID]` and re-loop
  Product_Context1 rather than reusing Action 1's local variables — separate Actions
  don't share local variables in this codebase (only `input.field` writes persist
  across them), same established pattern as every other multi-action workflow here
  (pr_to_po_grouping.txt, etc.).
- Actions 2/3 find each matching aggregate RR's own RR_No by re-querying
  `Replacement_Request[Source_Exception_No == input.Exception_No]` and matching on
  (Source_Type, Replacement_Summary.SKU) rather than reading it off any `input.field` —
  Action 1 never writes RR_No back onto `input` (it inserts brand new records, all
  locals are Action 1's own), so there's nothing to read cross-action. Assumes Action
  1's inserts are already committed and visible by the time Action 2/3 run — same
  sequential-action assumption already used elsewhere in this codebase (e.g.
  pr_to_po_grouping.txt Actions 2/3 reading `input.Link_PO_No` set by Action 1), not
  independently re-verified here specifically.
- Only items whose Product_Context1 `Supplier` group value is exactly "Fenteng"/"Tony"
  produce a row in the respective Action 2/3 — matches Action 1's own existing behavior
  of reading that same subform's Supplier field, per user's original instruction "only
  selected supplier in Product_Context1 (Subform) Supplier".
- `sourceType`/`sourceTypeF`/`sourceTypeT` computed identically (and separately) in all
  3 actions from `input.Source_Module` (direct input context, safe) + each group's
  `Type_field` — no cross-action variable needed.
- `Exceptions.Exception_Type` header field was removed 2026-07-10 — all 3 actions read
  `Product_Context1.Type_field` instead (values "Damage"/"Missing", singular — matches
  Receiving's own `Damage_Missing_Details.Type_field` enum, see
  receiving_validations_and_damage_missing.txt).
- Field link names for Fenteng_Lighting_Replacement_Request/Tony_Fan_Replacement_Request
  confirmed via a live field-builder dump (see ReplacementRequestFields.txt) — they are
  IDENTICAL to the base Replacement_Request form's own link names, no _Supplier1/2
  suffix. This is the opposite convention from every other duplicated-supplier-form pair
  in this app (Fenteng_Lighting_Purchase_Request uses PR_No_Supplier1 etc.) — don't
  assume the suffix pattern carries over here, it was checked and confirmed not to.
- `newRow.PR_No=input.Receiving_Line_ID` (also mirrored into Actions 2/3) stores a
  Receiving line ID into a field literally called PR_No — pre-existing naming mismatch
  in the original script, not something introduced by either the 2026-07-13 rework or
  the 2 bug fixes above, left as-is.
- ADDED 2026-07-20, per user request ("let's not be dependent on supplier — their only
  job is to approve and populate ETA/ETD"): the Missing_SKUs stamp (Receiving Missing
  case) and the new replacement Purchase_Order + supplier PO creation (Damage/QC/
  Complaint case) — both previously gated on the SUPPLIER's own "Approve RR" click
  (approve_rr_supplier.txt) — now fire immediately in Actions 1/2/3, at RR CREATION
  time (officer-triggered, no supplier action needed). Action 1 handles the aggregate
  Purchase_Order side for every group (stamps Missing_SKUs on the original PO by
  `input.PO_No`, or creates a new aggregate replacement PO tagged `RR_Reference_No=
  newRRNo`) using `groupSupplier.get(gKey)` for the new line's Supplier — same as the
  old script, just supplier-agnostic since Action 1 processes every group regardless
  of which supplier it belongs to. Actions 2/3 (already filtered to their own
  supplier's groups) do the matching supplier-side half — for the Damage/etc case,
  they look up the aggregate PO Action 1 just created via `Purchase_Order[
  RR_Reference_No == parentRRNoF/T]` (no cross-action shared variables, same
  query-based coordination pattern already used elsewhere in this file) to get its
  PO_No, then insert the mirroring Fenteng/Tony supplier PO with that same number.
  `approve_rr_supplier.txt`'s Approve RR button is now stripped down to just status +
  audit-date bookkeeping — see that file's own NOTES. Mirrored into
  `create_rr_custom_api.txt`'s `createRRMain`/`createRRFenteng`/`createRRTony` (widget
  path). UNTESTED — needs a live Create RR click on both a Missing-type and a
  Damage-type Exception to confirm the PO-side effects now happen without ever
  touching the supplier's Approve RR button.
- UNTESTED as of writing — this is a from-scratch rework of grouping/dedup logic, needs
  a live test covering: (1) single-item Exception (should behave like before, 1 RR), (2)
  multi-unit-same-SKU Damage Exception (should still produce 1 RR with summed RR_Qty,
  not N RRs), (3) re-clicking Create RR after only some items got an RR (should only
  backfill the missing ones, not duplicate the existing one), (4) an Exception with a
  genuinely different-SKU second item if that scenario is reachable in this app (should
  produce 2 separate RRs, RR1/RR2).
====================================================

````
