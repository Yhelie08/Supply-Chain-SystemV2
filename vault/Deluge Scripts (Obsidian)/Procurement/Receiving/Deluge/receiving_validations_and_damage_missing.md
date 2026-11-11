---
title: "receiving_validations_and_damage_missing"
source_file: "receiving_validations_and_damage_missing.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]"
lines: 664
tags:
  - custom-api
  - deluge
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-creator
---

# receiving_validations_and_damage_missing

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `receiving_validations_and_damage_missing.txt`
> - **Lines of Code:** 664
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Receiving form — 4 previously-undocumented Validations workflows + Damage_Missing_Details ==
== Captured 2026-07-10, pasted live by the user into Temp.txt (all built by a coworker
   except Damage_Missing_Details, see receiving_check_fulfillment_ready.txt for the
   "coworker builds workflows too" context). Bodies were flagged as "not yet captured"
   in receiving_check_fulfillment_ready.txt since 2026-07-08 — now captured here.
   Needed for the new UI/EndUser/Receiving widget: Compute_Totals/Set_Line_Result/
   Validate_Qty/Auto_Exception all fire naturally via API writes (Validations-type
   trigger, confirmed elsewhere in this project to fire on ZOHO.CREATOR.DATA.
   updateRecordById same as native form saves) so the widget doesn't need to
   reimplement them server-side — it only mirrors them CLIENT-SIDE for live preview
   before save. Damage_Missing_Details is the one the widget takes over for real (see
   receiving_widget_custom_api.txt NOTES + UI/EndUser/Receiving/app/index.html). ==

====================================================
Receiving | Created or Edited | Validations on form submission | Receiving_Compute_Totals
====================================================
totalExpected = 0;
totalAccepted = 0;
totalDamage = 0;
totalMissing = 0;
totalLines = 0;
incompleteLines = 0;
readyForFulfillment = 0;
for each  ln in input.Receiving_Line_Items
{
	totalLines = totalLines + 1;
	totalExpected = totalExpected + ifnull(ln.Expected_Qty,0);
	totalAccepted = totalAccepted + ifnull(ln.Accepted_Qty,0);
	totalDamage = totalDamage + ifnull(ln.Damage_Qty,0);
	totalMissing = totalMissing + ifnull(ln.Missing_Qty,0);
	if(ln.Line_Result == "Incomplete")
	{
		incompleteLines = incompleteLines + 1;
	}
	if(ln.Ready_for_Fulfillment == true)
	{
		readyForFulfillment = readyForFulfillment + 1;
	}
}
input.Total_Expected_Qty = totalExpected;
input.Total_Accepted_Qty = totalAccepted;
input.Total_Damage_Qty = totalDamage;
input.Total_Missing_Qty = totalMissing;
input.Total_Lines = totalLines;
input.Incomplete_Lines = incompleteLines;
input.Ready_for_Fulfillment1 = readyForFulfillment;

====================================================
Receiving | Created or Edited | Validations on form submission | Receiving_Set_Line_Result
====================================================
for each  ln in input.Receiving_Line_Items
{
	accepted = ifnull(ln.Accepted_Qty,0);
	damaged = ifnull(ln.Damage_Qty,0);
	missing = ifnull(ln.Missing_Qty,0);
	expected = ifnull(ln.Expected_Qty,0);
	totalReceived = accepted + damaged + missing;
	if(totalReceived == expected && accepted == expected)
	{
		ln.Line_Result="Complete";
		ln.Ready_for_Fulfillment=true;
	}
	else
	{
		ln.Line_Result="Incomplete";
		ln.Ready_for_Fulfillment=false;
	}
}

====================================================
Receiving | Created or Edited | Validations on form submission | Receiving_Validate_Qty
====================================================
for each  ln in input.Receiving_Line_Items
{
	accepted = ifnull(ln.Accepted_Qty,0);
	damaged = ifnull(ln.Damage_Qty,0);
	missing = ifnull(ln.Missing_Qty,0);
	expected = ifnull(ln.Expected_Qty,0);
	totalReceived = accepted + damaged + missing;
	// RELAXED 2026-07-30, per user ("we can input below the expected qty but
	// not more than") — was a strict equality block (totalReceived != expected),
	// which made partial receiving impossible: a shipment that only had 5 of 10
	// units arrive couldn't be saved at all until the remaining 5 showed up.
	// Now only blocks a genuine OVER-receive (more than was ever ordered) —
	// under-receiving (a real partial) is allowed and just leaves the line
	// Incomplete (see Receiving_Set_Line_Result above), receivable again later.
	if(expected > 0 && totalReceived > expected)
	{
		alert "Quantity mismatch on line " + ln.PR_No + " — Accepted + Damaged + Missing (" + totalReceived + ") cannot exceed Expected Qty (" + expected + "). Please correct before saving.";
		cancel submit;
	}
}

====================================================
Receiving | Created or Edited | Validations on form submission | Receiving_Auto_Exception
====================================================
== CHANGED 2026-07-13, per user request: Damage rows get real Product_Context1 detail
   rows now; Missing STAYS AS-IS otherwise (user: "leave missing as is, just plain
   exception no detail rows") — Missing still creates/reuses an Exception exactly like
   before, AND still gets exactly one bare Product_Context1 row per line (PR_No/SKU/
   Item/Category/Qty/Type_field="Missing"/Supplier only, no detail fields) — same as the
   pre-2026-07-13 behavior. RESTORED same day after first cutting Missing's
   Product_Context1 row to zero — that broke `create_rr_button.txt`'s Create RR button,
   which loops Product_Context1 to build RR line data; a Missing exception with zero
   rows there produced an empty RR. Fixed by giving Missing its own dedup-by-existence
   (one row per PR_No, not per-unit like Damage) bare-row insert instead. BUG found live
   2026-07-13 (real test, line PR-00002 with BOTH Damage_Qty=1 and Missing_Qty=1): the
   Damage branch's dedup count (`existingPCCount`) counted ALL existing Product_Context1
   rows for that PR_No, not just Damage-type ones — once the Missing branch had already
   inserted its 1 bare row, the Damage branch saw `existingPCCount==1` and computed
   `pcNeeded = dmgRowsForLine.size()(1) - existingPCCount(1) = 0`, silently skipping the
   Damage row forever (even across resaves) whenever a line had both Damage AND Missing
   on it. FIXED: `existingPCCount` now filters `pc.Type_field == "Damage"` too, so it
   only counts prior Damage rows, independent of the Missing branch's own row. Damage
   side:
   Product_Context1 now built PER DAMAGE UNIT straight from Damage_Missing_Details' own
   Damage rows (1:1), instead of one aggregate row per Receiving line — carries over the
   detail fields the user fills in on Damage_Missing_Details (Affected_Missing_Part,
   Damage_Missing_Category, Root_Cause_Category, Description, Action_Required, Photo).
   Dedup is additive-by-count, same established pattern as Damage_Missing_Details' own
   skeleton-row insertion below — never removes a Product_Context1 row if Damage_Qty is
   later decreased (same accepted gap, see NOTES). Also fixes a real stale-field bug:
   old code wrote `newPCRow.Affected_Qty=...` — that field does not exist on
   Product_Context1 (fresh schema dump confirmed the real field is `Qty`), so every
   prior Product_Context1 insert had been silently dropping that value (same
   "createRecord/insert silently drops mismatched key" class of gotcha documented
   elsewhere in this project).
   MOVED OUT 2026-07-13 (later same day): all of the above Product_Context1-building
   logic (the whole clear-and-rebuild block, including the update-in-place saga
   documented in NOTES) has been RELOCATED out of this Validations action into a new
   separate Successful-form-submission action, `Receiving_Sync_Product_Context` — see
   that action further down this file. Reason: this action runs on Validations
   (pre-save, reads `input`), but Damage_Missing_Details' skeleton rows are only
   inserted by a separate POST-save action — so `input.Damage_Missing_Details` was
   always one save behind, and combined with the clear()-based rebuild this meant a
   fresh Damage/Missing entry would visibly WIPE Product_Context1 to empty for one save
   before self-healing on the next (confirmed live 2026-07-13, user asked directly "can
   we fix that?" instead of accepting the 2-saves-needed workaround). Fixed for real by
   moving the whole rebuild to run AFTER Damage_Missing_Details in the Successful-form-
   submission action order, reading a freshly re-queried `Receiving[ID==input.ID]`
   instead of `input` — see that action's own header comment for full detail. This
   action (`Receiving_Auto_Exception`) now ONLY creates/finds the Exception record and
   sets `Has_Exceptions`/`Exception_Count` — neither of which depend on
   Damage_Missing_Details, so no lag risk remains here. ==
for each  ln in input.Receiving_Line_Items
{
	damaged = ifnull(ln.Damage_Qty,0);
	missing = ifnull(ln.Missing_Qty,0);
	if(damaged > 0 || missing > 0)
	{
		excExists = false;
		existingEXCId = 0;
		existingEXC = Exceptions[Receiving_Line_ID == ln.PR_No && Receive_No == input.Receive_No1];
		for each  exc in existingEXC
		{
			excExists = true;
			existingEXCId = exc.ID;
		}
		if(excExists == false)
		{
			maxNum = 0;
			existingEXCs = Exceptions[ID != 0];
			for each  exc in existingEXCs
			{
				excNoStr = exc.Exception_No;
				if(excNoStr != null && excNoStr != "")
				{
					numPart = excNoStr.removeFirstOccurence("EXC-");
					num = numPart.toLong();
					if(num > maxNum)
					{
						maxNum = num;
					}
				}
			}
			newNum = maxNum + 1;
			if(newNum < 10)
			{
				newEXCNo = "EXC-0000" + newNum;
			}
			else if(newNum < 100)
			{
				newEXCNo = "EXC-000" + newNum;
			}
			else if(newNum < 1000)
			{
				newEXCNo = "EXC-00" + newNum;
			}
			else if(newNum < 10000)
			{
				newEXCNo = "EXC-0" + newNum;
			}
			else
			{
				newEXCNo = "EXC-" + newNum;
			}
			existingEXCId = insert into Exceptions
			[
				Exception_No=newEXCNo
				Source_Module="Receiving"
				Exception_Status="Open"
				Sales_Order=input.SO_No
				PO_No=input.PO_No
				Shipment_No=input.Shipments.Shipment_No
				Receive_No=input.Receive_No1
				Receiving_Line_ID=ln.PR_No
				Opened_On=zoho.currentdate.toString("dd-MMM-yyyy")
				Added_User=zoho.loginuser
			];
		}
		ln.Has_Exceptions=true;
	}
}
excCount = 0;
for each  ln in input.Receiving_Line_Items
{
	if(ln.Has_Exceptions == true)
	{
		excCount = excCount + 1;
	}
}
input.Exception_Count = excCount;

====================================================
Receiving | Created or Edited | Successful form submission | Damage_Missing_Details
(internally: Receiving_Populate_Damage_Details)
====================================================
recRec = Receiving[ID == input.ID];
for each  ln in recRec.Receiving_Line_Items
{
	damaged = ifnull(ln.Damage_Qty,0);
	missing = ifnull(ln.Missing_Qty,0);
	if(damaged > 0 || missing > 0)
	{
		existingDmgCount = 0;
		existingMisCount = 0;
		for each  dd in recRec.Damage_Missing_Details
		{
			if(dd.PR_No == ln.PR_No)
			{
				if(dd.Type_field == "Damage")
				{
					existingDmgCount = existingDmgCount + 1;
				}
				else if(dd.Type_field == "Missing")
				{
					existingMisCount = existingMisCount + 1;
				}
			}
		}
		dmgNeeded = damaged - existingDmgCount;
		dmgIdx = 1;
		for each  dmgItem in {1,2,3,4,5,6,7,8,9,10}
		{
			if(dmgIdx <= dmgNeeded)
			{
				newDmgRow = Receiving.Damage_Missing_Details();
				newDmgRow.PR_No=ln.PR_No;
				newDmgRow.SKU=ln.SKU;
				newDmgRow.Type_field="Damage";
				newDmgRow.Qty=1;
				recRec.Damage_Missing_Details.insert(newDmgRow);
				dmgIdx = dmgIdx + 1;
			}
		}
		misNeeded = missing - existingMisCount;
		misIdx = 1;
		for each  misItem in {1,2,3,4,5,6,7,8,9,10}
		{
			if(misIdx <= misNeeded)
			{
				newMisRow = Receiving.Damage_Missing_Details();
				newMisRow.PR_No=ln.PR_No;
				newMisRow.SKU=ln.SKU;
				newMisRow.Type_field="Missing";
				newMisRow.Qty=1;
				recRec.Damage_Missing_Details.insert(newMisRow);
				misIdx = misIdx + 1;
			}
		}
	}
}

====================================================
Receiving | Created or Edited | Successful form submission | Receiving_Sync_Product_Context
(NEW 2026-07-13 — MUST be positioned to run AFTER Damage_Missing_Details/
Receiving_Populate_Damage_Details in the action order for this same trigger, since it
depends on that action's inserts already being committed. See NOTES for why this exists
as a separate action instead of living inside Receiving_Auto_Exception.)
====================================================
recRec2 = Receiving[ID == input.ID];
for each  ln in recRec2.Receiving_Line_Items
{
	damaged = ifnull(ln.Damage_Qty,0);
	missing = ifnull(ln.Missing_Qty,0);
	if(damaged > 0 || missing > 0)
	{
		existingEXC = Exceptions[Receiving_Line_ID == ln.PR_No && Receive_No == recRec2.Receive_No1];
		existingEXCId = 0;
		for each  exc in existingEXC
		{
			existingEXCId = exc.ID;
		}
		if(existingEXCId != 0)
		{
			excRec = Exceptions[ID == existingEXCId];
			itemCategory = "";
			itemRec = Items[SKU == ln.SKU];
			for each  ir in itemRec
			{
				itemCategory = ir.category;
			}
			descParts = List();

			// ADDED 2026-07-16, per user ("photos in exception are gone" after an
			// unrelated Receiving save that never touched damage/missing data) — this
			// action used to clear()+rebuild Product_Context1 UNCONDITIONALLY on every
			// single Receiving save. Since photos are physically attached to specific
			// subform rows, any clear() orphans already-uploaded evidence photos
			// regardless of relevance. Fix: compute what the rows SHOULD look like
			// (newSig) and compare against what's CURRENTLY there (oldSig) — only
			// clear()+rebuild when they actually differ. A no-op save (e.g. just picking
			// Shipment Mode Received) now leaves Product_Context1 — and its photos —
			// untouched.
			newSig = "";
			if(damaged > 0)
			{
				for each  dd in recRec2.Damage_Missing_Details
				{
					if(dd.PR_No == ln.PR_No && dd.Type_field == "Damage")
					{
						/* ADDED 2026-07-21, per user (repair-tracking feature) — Repairable
						   folded into the signature so a change to it alone (no other
						   detail field touched) still triggers a rebuild. */
						newSig = newSig + "Damage|" + dd.SKU + "|" + dd.Qty + "|" + dd.Affected_Missing_Part + "|" + dd.Damage_Missing_Category + "|" + dd.Root_Cause_Category + "|" + dd.Description + "|" + dd.Action_Required + "|" + dd.Repairable + ";;";
						if(dd.Description != null && dd.Description != "")
						{
							descParts.add(dd.Description);
						}
					}
				}
			}
			misAP = "";
			misCat = "";
			misRC = "";
			misDesc = "";
			misAR = "";
			if(missing > 0)
			{
				// FIXED 2026-07-15, per user: Missing rows never carried the 5 detail
				// fields (Affected/Missing Part, Category, Root Cause, Description,
				// Action Required) even though the Receiving widget collects them for
				// Missing rows the same as Damage rows — only the Damage branch above
				// ever copied them. Find this line's own Missing-type Damage_Missing_
				// Details row (same lookup shape as the Damage loop, just Type_field==
				// "Missing" and no per-unit looping since Missing is always 1 row/line).
				for each  mdd in recRec2.Damage_Missing_Details
				{
					if(mdd.PR_No == ln.PR_No && mdd.Type_field == "Missing")
					{
						misAP=mdd.Affected_Missing_Part;
						misCat=mdd.Damage_Missing_Category;
						misRC=mdd.Root_Cause_Category;
						misDesc=mdd.Description;
						misAR=mdd.Action_Required;
						if(mdd.Description != null && mdd.Description != "")
						{
							descParts.add(mdd.Description);
						}
					}
				}
				newSig = newSig + "Missing|" + ln.SKU + "|" + missing + "|" + misAP + "|" + misCat + "|" + misRC + "|" + misDesc + "|" + misAR + ";;";
			}

			oldSig = "";
			for each  pcRow in excRec.Product_Context1
			{
				if(pcRow.PR_No == ln.PR_No)
				{
					oldSig = oldSig + pcRow.Type_field + "|" + pcRow.SKU + "|" + pcRow.Qty + "|" + pcRow.Affected_Missing_Part + "|" + pcRow.Damage_Missing_Category + "|" + pcRow.Root_Cause_Category + "|" + pcRow.Description + "|" + pcRow.Action_Required + "|" + pcRow.Repairable + ";;";
				}
			}

			if(newSig != oldSig)
			{
				/* ADDED 2026-07-21, per user (repair-tracking feature) — Repair_Outcome
				   is an EXCEPTION-side decision (set later, independently, via the
				   Exception widget) that this rebuild has no source data for at all — it
				   only ever derives fields from Damage_Missing_Details. Without this
				   capture, the clear()+rebuild below would silently wipe an officer's
				   already-made "Fixed"/"Not Fixed" call the next time this Receiving
				   record gets resaved for ANY reason (even an unrelated field). Captures
				   existing values by position-within-this-PR_No-group (same convention
				   already used elsewhere in this app for photo-slot pairing) BEFORE
				   clearing, re-applies them after rebuild by matching the same position;
				   a genuinely new row (no prior position match) defaults to "Pending". */
				existingRepairOutcomeMap = Map();
				posIdxOld = 0;
				for each  pcRowOld in excRec.Product_Context1
				{
					if(pcRowOld.PR_No == ln.PR_No)
					{
						existingRepairOutcomeMap.put(ln.PR_No + "||" + posIdxOld, pcRowOld.Repair_Outcome);
						posIdxOld = posIdxOld + 1;
					}
				}
				excRec.Product_Context1.clear();
				posIdxNew = 0;
				if(damaged > 0)
				{
					for each  dd in recRec2.Damage_Missing_Details
					{
						if(dd.PR_No == ln.PR_No && dd.Type_field == "Damage")
						{
							newPCRow = Exceptions.Product_Context1();
							newPCRow.PR_No=ln.PR_No;
							newPCRow.SKU=dd.SKU;
							newPCRow.Item=ln.Item_Name;
							newPCRow.Category=itemCategory;
							newPCRow.Qty=dd.Qty;
							newPCRow.Type_field="Damage";
							newPCRow.Supplier=recRec2.Supplier;
							newPCRow.Affected_Missing_Part=dd.Affected_Missing_Part;
							newPCRow.Damage_Missing_Category=dd.Damage_Missing_Category;
							newPCRow.Root_Cause_Category=dd.Root_Cause_Category;
							newPCRow.Description=dd.Description;
							newPCRow.Action_Required=dd.Action_Required;
							newPCRow.Repairable=dd.Repairable;
							preservedOutcome = existingRepairOutcomeMap.get(ln.PR_No + "||" + posIdxNew);
							if(preservedOutcome == null || preservedOutcome == "")
							{
								newPCRow.Repair_Outcome = "Pending";
							}
							else
							{
								newPCRow.Repair_Outcome = preservedOutcome;
							}
							posIdxNew = posIdxNew + 1;
							excRec.Product_Context1.insert(newPCRow);
						}
					}
				}
				if(missing > 0)
				{
					newMisPCRow = Exceptions.Product_Context1();
					newMisPCRow.PR_No=ln.PR_No;
					newMisPCRow.SKU=ln.SKU;
					newMisPCRow.Item=ln.Item_Name;
					newMisPCRow.Category=itemCategory;
					newMisPCRow.Qty=missing;
					newMisPCRow.Type_field="Missing";
					newMisPCRow.Supplier=recRec2.Supplier;
					newMisPCRow.Affected_Missing_Part=misAP;
					newMisPCRow.Damage_Missing_Category=misCat;
					newMisPCRow.Root_Cause_Category=misRC;
					newMisPCRow.Description=misDesc;
					newMisPCRow.Action_Required=misAR;
					/* Missing rows have no "repairable" concept — always blank/N-A. */
					excRec.Product_Context1.insert(newMisPCRow);
				}
			}
			// ADDED 2026-07-15, per user request ("carry the value into Exception's
			// Problem Details") — auto-fill Exception_Title/Exception_Description from
			// this line's own receiving evidence, but ONLY when currently blank, so an
			// analyst's own manual edit is never clobbered by a later Receiving save
			// (same "don't overwrite human work" principle as the Completed-state guard
			// elsewhere in this app). Exception_Title was converted from a placeholder
			// picklist to plain text for this (see UI/EndUser/Exception/app/index.html
			// NOTES) — must be pasted AFTER that field-type change or this errors.
			// Deliberately OUTSIDE the newSig!=oldSig guard above — independently
			// blank-checked already, safe/cheap to run every time regardless of whether
			// Product_Context1 itself needed a rebuild this save.
			if(excRec.Exception_Title == null || excRec.Exception_Title == "")
			{
				if(damaged > 0 && missing > 0)
				{
					excRec.Exception_Title = "Damage + Missing — " + ln.Item_Name;
				}
				else if(damaged > 0)
				{
					excRec.Exception_Title = "Damage — " + ln.Item_Name;
				}
				else
				{
					excRec.Exception_Title = "Missing — " + ln.Item_Name;
				}
			}
			if((excRec.Exception_Description == null || excRec.Exception_Description == "") && descParts.size() > 0)
			{
				joinedDesc = "";
				for each  dp in descParts
				{
					if(joinedDesc != "")
					{
						joinedDesc = joinedDesc + "; ";
					}
					joinedDesc = joinedDesc + dp;
				}
				excRec.Exception_Description = joinedDesc;
			}
		}
	}
}

====================================================
NOTES:
- Damage_Missing_Details is capped at 10 rows added per line per save (the hardcoded
  {1..10} loop) — matches "realistically nobody damages/loses 10+ units of one line in
  one receiving," not a hard platform limit.
- Damage_Missing_Details is ADDITIVE/dedup-by-count only — it never REMOVES rows if
  Damage_Qty/Missing_Qty is later decreased (e.g. corrected from 3 to 1) — stale excess
  rows stay forever. The new widget's client-side version fixes this (full recompute-
  and-replace every save) — see receiving_widget_custom_api.txt NOTES.
- Exception auto-creation (Receiving_Auto_Exception) dedups by
  `Receiving_Line_ID == ln.PR_No && Receive_No == input.Receive_No1` — one Exception per
  PR line per Receiving record, regardless of how many times damaged/missing qty is
  resaved afterward.
- Field `Type_field` (not `Type` — reserved word workaround, same pattern as
  `Override_Reason`/other renamed-to-avoid-reserved-word fields elsewhere in this app)
  on Damage_Missing_Details, values "Damage" / "Missing".
- `input.Shipments.Shipment_No` (dot-through a lookup field directly on `input`) used
  successfully here — same "input context direct dot-through" allowance already
  documented in CLAUDE.md's Deluge Gotchas (works on `input`, not on a re-fetched
  record).
- CHANGED 2026-07-13, per user correction ("leave missing as is, just plain exception
  no detail rows"): Missing-only lines STILL auto-create/reuse an Exception exactly like
  before, AND still get exactly one bare Product_Context1 row per line (PR_No/SKU/Item/
  Category/Qty/Type_field="Missing"/Supplier — no detail fields), same as pre-2026-07-13
  behavior. RESTORED same day: first cut had Missing getting ZERO Product_Context1 rows,
  which broke `create_rr_button.txt`'s Create RR button (loops Product_Context1 to build
  Replacement_Summary/supplier-RR line data — zero rows there meant an empty RR on any
  Missing exception, even though the Exception record itself still created fine). Fixed
  by re-adding a dedicated Missing branch: dedup-by-existence (one row per PR_No, not
  per-unit — mirrors how it always worked before this whole rework), inserted right
  after the Damage per-unit block, guarded on `missing > 0` independently of `damaged`.
- CHANGED 2026-07-13: Product_Context1 is now built PER DAMAGE UNIT, sourced from
  Damage_Missing_Details (Type_field=="Damage") instead of one aggregate row per
  Receiving line — see the script block above for the full rationale.
  ORDERING LAG — FOUND AND FIXED, 2026-07-13 (same day): this logic originally lived
  inside `Receiving_Auto_Exception` itself, a Validations action (pre-save, reads
  `input`) — but the skeleton `Damage_Missing_Details` rows are inserted by a separate
  Successful-form-submission action (post-save), so on the SAME save a NEW damage/
  missing qty is entered, those skeleton rows didn't exist in `input.Damage_Missing_
  Details` yet. Combined with the clear()-based rebuild (below), this meant Product_
  Context1 visibly went EMPTY for one save before self-healing on the next — confirmed
  live 2026-07-13 (user: "so need 2 saves before reflecting in exception... can we fix
  that?"). FIXED for real, not just documented: the whole Product_Context1-building
  block moved OUT of `Receiving_Auto_Exception` into a NEW separate action,
  `Receiving_Sync_Product_Context` (Successful form submission, positioned to run AFTER
  Damage_Missing_Details in the action order) — re-queries `Receiving[ID==input.ID]`
  fresh instead of reading `input`, so it sees Damage_Missing_Details' rows already
  committed by the sibling action earlier in the same save's post-save phase. No more
  lag, single save now fully syncs Product_Context1. See that action's own script block
  + header comment.
  LIVE PASTE MIX-UP, found 2026-07-13 (right after the split above): user pasted the
  `Receiving_Sync_Product_Context` body into BOTH the Validations action AND the
  Successful-form-submission action — so `Receiving_Auto_Exception` (Validations) ended
  up with the find-only logic (`if(existingEXCId != 0) {...}`, no `insert into
  Exceptions` at all) instead of its own create-or-find logic. Symptom: after the user
  deleted a prior test's Exception record and resaved a line with Damage_Qty=2, the
  Receiving form's own `Exception_Count` rollup showed 1 (since `Has_Exceptions` is set
  unconditionally off `damaged>0||missing>0`, independent of whether an Exception
  actually got created) but the Exceptions Report showed nothing for that line —
  `existingEXCId` stayed 0 forever since nothing ever created a fresh record to find.
  Root cause was purely a copy-paste mix-up between the 2 similarly-shaped new/changed
  actions, not a script bug — confirmed by re-diffing the file's own correct Validations
  body (this exact action, lines above) against what was live (paste dumped via
  Temp.txt). Lesson: when 2 actions in the same trigger group get edited/split in the
  same session, double-check which body went into which action before testing — don't
  assume a "nothing happened" symptom means the NEW code is wrong before verifying the
  OLD/correct code actually landed where it was supposed to.
  UPDATE-IN-PLACE ATTEMPTS, 2026-07-13 — 3 tries before landing on the real fix, all
  same day, same live test (Product_Context1's Damage row stayed blank even after
  filling Affected_Missing_Part/Category/Root_Cause/Description/Action_Required on the
  matching Damage_Missing_Details row and resaving):
  (1) Stored existing Product_Context1 rows into a `List()` and retrieved via
      `.get(index)` to update — errored live: `"Error at line number: 100 Variable
      'pcToUpdate' is not defined."` Confirmed via web search: official Deluge docs only
      document `row.field=value` for subform fields inside CLIENT ACTIONS (On Load/On
      User Input); a Zoho community thread ("Fetch, Update and Delete Subform records
      using criteria in Deluge") shows update-subform-by-criteria is still an OPEN
      FEATURE REQUEST, not shipped — pulling a subform row into a `List`/`.get()` and
      mutating it isn't supported.
  (2) Rewrote with no `List()` at all — nested `for each` (outer over source rows, inner
      over `excRec.Product_Context1`) matching by position counter, mutating the live
      loop variable directly. The SAME technique applied to Missing's bare-row Qty via
      `missingPCRow = pc2;` (a plain variable copy, no List) ALSO errored:
      `"Error at line number: 165 Variable 'missingPCRow' is not defined."` — refining
      the rule: it's not List-specific, ANY reassignment of a subform-row loop variable
      to another variable loses the mutable type, only the ORIGINAL loop variable name,
      mutated inside its own iteration, survives. Fixed the Missing case by inlining the
      mutation (`pc2.Qty=missing;` directly inside the matching `if`, no intermediate
      variable) — this part DID stop erroring.
  (3) But the Damage side's nested-`for each` version (inner loop mutating `pc` directly,
      same "inline, no intermediate variable" shape) still produced NO ERROR yet ALSO
      NO PERSISTED CHANGE — a silent no-op, confirmed via 2 live retests after fully
      re-pasting the script. So even a live loop variable mutated inline doesn't reliably
      persist once nested two levels deep inside another `for each`/subform-row context —
      a real, previously-undocumented-in-this-project limitation beyond what the errors
      in (1)/(2) had already revealed.
  FINAL FIX: abandoned in-place mutation entirely. Uses `.clear()` (official documented
  Deluge subform method — `rec.Subform.clear();` removes ALL rows in a blank/inline
  subform) + the already-proven `.insert()`: every time a line has `damaged>0` or
  `missing>0`, `excRec.Product_Context1.clear();` wipes the whole subform, then it's
  freshly rebuilt from scratch (all current Damage_Missing_Details "Damage" rows +
  one bare Missing row if applicable) — same "full recompute-and-replace" pattern this
  codebase's own Receiving widget already uses client-side for Damage_Missing_Details
  (see `receiving_widget_custom_api.txt` NOTES). Safe to clear the WHOLE subform (not
  just this line's rows) because each Exception maps 1:1 to exactly one Receiving line
  (dedup on `Receiving_Line_ID`+`Receive_No`) — every Product_Context1 row in a given
  Exception already belongs to the same PR_No, so there's nothing else in there to
  preserve. Only proven operations used now (read, `.clear()`, `.insert()`) — no more
  subform-row mutation of any kind. Side effect, now the ACTUAL behavior (supersedes
  the "never removes a stale row" gap noted earlier in this file for the old additive
  design): a decrease in Damage_Qty/Missing_Qty now correctly shrinks Product_Context1
  too, since it's rebuilt from current state every time, not just added to. Also means
  Product_Context1 is now fully system-owned for Receiving-sourced exceptions — any
  manual edit made directly on Product_Context1 in the Exceptions form gets wiped on the
  next Receiving save, by design.
  `Photo` copy DROPPED after live test:
  `newPCRow.Photo=dd.Photo` errored "Adding or updating files in the Multi File upload
  field Photo within a subform using workflows is not supported" — CONFIRMED platform
  limit (real error, not guessed), same class as the
  multi-image-field gotcha already in CLAUDE.md (workflows can't write a multi-file/
  multi-image field at all, subform or not). Removed the line entirely — Product_Context1
  rows sync every other detail field except Photo; user attaches that manually if
  needed. See CLAUDE.md Deluge Gotchas for the general form of this limit.
- CHANGED 2026-07-10, per user request: `Exceptions.Exception_Type` (header field,
  values Damaged/Missing/Wrong Item/Wrong Qty/Delayed Shipment) is being REMOVED from
  the form — `Product_Context1.Type_field` (already existed on the subform, values
  Damage/Missing, previously never actually populated by this script) is now the single
  source of truth for an Exception's type instead. `Receiving_Auto_Exception` updated:
  no longer sets `Exception_Type` on the `insert into Exceptions` block, `excType`'s
  values changed from "Damaged"/"Missing" (header's plural enum) to "Damage"/"Missing"
  (subform's actual enum, matches Receiving's own `Damage_Missing_Details.Type_field`
  values 1:1 — same word, same casing, genuinely the same concept now), and the new
  `Product_Context1` row now sets `newPCRow.Type_field = excType`. `create_rr_button.txt`
  (Create RR button, reads `input.Exception_Type` 3x to route Source_Type) updated in the
  same pass to read `Type_field` off the looped `Product_Context1` row instead — see that
  file's own NOTES. UNTESTED — Exception_Type still needs to be actually deleted from the
  live Exceptions form in Creator (this script-side change alone doesn't remove the
  field), and this script needs re-pasting.
- FIXED 2026-07-16, per user ("photos in exception are gone" after saving Receiving for
  something entirely unrelated — testing the new Shipment_Mode_When_Received dropdown):
  `Receiving_Sync_Product_Context` was clear()+rebuilding Product_Context1 on EVERY
  Receiving save unconditionally, not just saves that actually changed damage/missing
  data. Root cause confirmed via live screenshots (Receiving's own `Damage_Missing_
  Details.Photo_N` still showed "2/5 uploaded" fine — untouched — but the Exception's
  mirrored `Product_Context1` photos showed "preview unavailable", since clear() deletes
  the ROWS the photos were physically attached to, and a plain field-rebuild can't carry
  file attachments across to fresh rows — same underlying platform limit as the
  Multi-File-Upload-in-subform gotcha already documented in CLAUDE.md, just approached
  from the row-deletion angle instead of a direct write attempt). Fix: build a signature
  string of what Product_Context1 SHOULD contain (`newSig`, from the current
  Damage_Missing_Details data) and compare it against what's CURRENTLY sitting in
  Product_Context1 (`oldSig`) — only clear()+rebuild when they differ. A save that never
  touched damage/missing content now leaves Product_Context1 (and its photos) completely
  untouched. Does NOT retroactively recover photos already orphaned before this fix
  shipped — those need one manual re-upload; going forward, only a save that actually
  changes damage/missing detail fields will trigger a rebuild. UNTESTED — needs a live
  resave with a value-only change (e.g. just Shipment Mode Received) to confirm
  Product_Context1/photos survive, and a real Damage/Missing detail edit to confirm the
  rebuild still fires correctly when it should.
====================================================

````
