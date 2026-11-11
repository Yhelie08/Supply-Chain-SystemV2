---
title: "purchase_request1_full_workflow_dump"
source_file: "purchase_request1_full_workflow_dump.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 410
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
---

# purchase_request1_full_workflow_dump

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `purchase_request1_full_workflow_dump.txt`
> - **Lines of Code:** 410
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Purchase_Request1 — FULL live workflow dump, captured 2026-07-14 ==
== Pasted directly from Creator's workflow editor (via Temp.txt) while diagnosing the
   "Shipping mode selected" ordering bug. This is the first time ALL of Purchase_Request1's
   actions have been seen in one place — several were previously undocumented entirely.
   Order below matches the ACTUAL live action order in Creator (top = runs first). ==

====================================================
1. PR_Generate_Number — on add > Validations
   NEW, never documented before.
====================================================
maxNum = 0;
existingRecords = Purchase_Request1[ID != 0];
for each  rec in existingRecords
{
	try
	{
		currentNum = rec.PR_No.replaceAll("[^0-9]","").toLong();
		if(currentNum > maxNum)
		{
			maxNum = currentNum;
		}
	}	catch (e)
	{
	}
}
newNum = maxNum + 1;
newNum_str = newNum.toString();
if(newNum < 10) { newNum_str = "0000" + newNum_str; }
else if(newNum < 100) { newNum_str = "000" + newNum_str; }
else if(newNum < 1000) { newNum_str = "00" + newNum_str; }
else if(newNum < 10000) { newNum_str = "0" + newNum_str; }
input.PR_No = "PR-" + newNum_str;

====================================================
2. PR_AutoFill_Item_Details — on add or edit > User input of Items
   NEW, never documented before.
====================================================
input.sku = input.Items.SKU;
input.Description1 = input.Items.Description;
input.unit = input.Items.Unit;
input.category = input.Items.category;

====================================================
3. autofill_customer_type — on add or edit > User input of Customer
   NEW, never documented before.
====================================================
input.Customer_Type = input.Customer.Customer_Type;

====================================================
4. PR_Sync_Supplier_Load_Balancing — on add or edit > Validations
   NEW, never documented before. Builds/maintains the Supplier_Load_Balancing subform
   (Match_Category/Active_POs/Percent/Load_Status/Eligible_Supplier) that the PRs widget
   reads directly (see CLAUDE.md's PRs widget row — "REAL native subform... already
   computed/populated server-side"). Runs BEFORE PR_Sync_Supplier_Selected (which reads
   this subform's Match_Category) — correct order already.
====================================================
prCategory = input.category;
eligibleSupplierIDs = List();
for each  sup in Suppliers[ID != 0]
{
	matched = false;
	if(sup.Handles_All) { matched = true; }
	else if(sup.Supported_Categories != null && sup.Supported_Categories != "")
	{
		catList = sup.Supported_Categories.toList(",");
		for each  c in catList { if(c.trim() == prCategory) { matched = true; } }
	}
	if(matched) { eligibleSupplierIDs.add(sup.ID.toString()); }
}
existingSupplierIDs = List();
for each  qr in input.Supplier_Load_Balancing
{
	existingSupplierIDs.add(qr.Suppliers.toString());
	if(!eligibleSupplierIDs.contains(qr.Suppliers.toString()))
	{
		qr.Match_Category="Not Match";
		qr.Eligible_Supplier="Removed";
	}
}
for each  sid in eligibleSupplierIDs
{
	if(!existingSupplierIDs.contains(sid))
	{
		supName = "";
		for each  supRec in Suppliers { if(supRec.ID + "" == sid) { supName = supRec.Supplier_Name.first_name + ""; if(supName == "" || supName == "null") { supName = supRec.Supplier_Name.last_name + ""; } } }
		newRow = Purchase_Request1.Supplier_Load_Balancing();
		newRow.Suppliers=sid;
		newRow.Match_Category="Match";
		input.Supplier_Load_Balancing.insert(newRow);
	}
}
recommendedID = "";
lowestCount = -1;
for each  sid in eligibleSupplierIDs
{
	cnt = 0;
	for each  supRec in Suppliers { if(supRec.ID + "" == sid) { cnt = ifnull(supRec.Active_PO_Count,0); } }
	if(lowestCount == -1 || cnt < lowestCount) { lowestCount = cnt; recommendedID = sid; }
}
for each  qr in input.Supplier_Load_Balancing
{
	sidStr = qr.Suppliers.toString();
	if(eligibleSupplierIDs.contains(sidStr))
	{
		qr.Match_Category="Match";
		for each  supRec in Suppliers { if(supRec.ID + "" == sidStr) { qr.Active_POs=supRec.Active_PO_Count; qr.Percent=supRec.Utilization; qr.Load_Status=supRec.Status; } }
		if(sidStr == recommendedID) { qr.Eligible_Supplier="Recommended"; }
		else { qr.Eligible_Supplier="Available (Higher load)"; }
	}
}

====================================================
5. PR_Sync_Supplier_Selected — on add or edit > Validations
   Already captured/fixed in pr_sync_supplier_selected.txt — CONFIRMED this dump shows
   the FIXED version already live (2026-07-14 comment present), so the user has already
   pasted that fix. Not re-included here, see that file.
====================================================

====================================================
6. PR_Check_Readiness — on add or edit > Validations
   Already captured in pr_check_readiness.txt, confirmed byte-identical (unfixed version
   — the collateral bug fix that file mentions doesn't apply here, that was Inquiry-side).
   THIS IS THE ACTION THAT NEEDS REORDERING — see NOTES at bottom of this file.
====================================================

====================================================
7. Select_Unselect_Supplier — on add or edit > User input of Supplier_Selected.Selected
   NEW, never documented before. Native-form-only client action (enforces single-winner
   selection live in the UI) — separate from PR_Sync_Supplier_Selected's own Step 4,
   which does the same enforcement server-side on every Validations pass. Redundant by
   design (belt-and-suspenders), not a bug.
====================================================
if(row.Selected == true)
{
	for each  sq in input.Supplier_Selected
	{
		if(sq.ID != row.ID) { sq.Selected=false; }
	}
}

====================================================
8. PR_Set_Default_Status — on add or edit > Validations
   NEW, never documented before. Sets PR_Status Open/Converted to PO from Link_PO_No.
====================================================
if(input.Link_PO_No == null || input.Link_PO_No == "")
{
	input.PR_Status = "Open";
}
else
{
	input.PR_Status = "Converted to PO";
}

====================================================
9. PR_Lock_After_PO — on add or edit > Validations
   Referenced by name elsewhere in this project (PRs widget's enterEditMode, e.g.) but
   never captured verbatim before. Blocks edits to Qty/Selected_Supplier/Shipment_Mode/
   Target_Delivery/Selcted_Final_Cost/Production_Date/Supplier_Selected once converted.
====================================================
if(input.PR_Status == "Converted to PO")
{
	oldRec = Purchase_Request1[ID == input.ID];
	if(oldRec.PR_Status == "Converted to PO")
	{
		blocked = false;
		if(input.quantity != oldRec.quantity) { blocked = true; }
		if(input.Selected_Supplier != oldRec.Selected_Supplier) { blocked = true; }
		if(input.Shipment_Mode != oldRec.Shipment_Mode) { blocked = true; }
		if(input.Target_Delivery != oldRec.Target_Delivery) { blocked = true; }
		if(input.Selcted_Final_Cost != oldRec.Selcted_Final_Cost) { blocked = true; }
		if(input.Production_Date != oldRec.Production_Date) { blocked = true; }
		newCount = 0;
		for each  nsel in input.Supplier_Selected { newCount = newCount + 1; }
		oldCount = 0;
		for each  osel in oldRec.Supplier_Selected { oldCount = oldCount + 1; }
		if(newCount != oldCount) { blocked = true; }
		else
		{
			oldRowMap = Map();
			for each  osel in oldRec.Supplier_Selected
			{
				snapshot = osel.Selected + "|" + ifnull(osel.Final_Price,0) + "|" + osel.Status + "|" + osel.Suppliers;
				oldRowMap.put(osel.Supplier_ID.toString(),snapshot);
			}
			for each  nsel in input.Supplier_Selected
			{
				newSnapshot = nsel.Selected + "|" + ifnull(nsel.Final_Price,0) + "|" + nsel.Status + "|" + nsel.Suppliers;
				oldSnapshot = oldRowMap.get(nsel.Supplier_ID.toString());
				if(oldSnapshot == null) { blocked = true; }
				else if(newSnapshot != oldSnapshot) { blocked = true; }
			}
		}
		if(blocked)
		{
			alert "Warning: this PR is already locked because it has been converted to a PO. The Qty, Supplier, Shipping Mode, Target Date, Final Cost, or Production Date should not be changed. Please revert the changes before saving.";
			cancel submit;
		}
	}
}

====================================================
10. PR_Lock_UI_Fields — on add or edit > Load of form
    NEW, never documented before. Disables the same fields PR_Lock_After_PO blocks,
    at form-load time, so a converted PR's fields are visibly locked in the native UI
    (mirrors the widget's own enterEditMode disable logic, per CLAUDE.md's PRs row).
====================================================
if(input.PR_Status == "Converted to PO")
{
	disable quantity;
	disable Selected_Supplier;
	disable Shipment_Mode;
	disable Target_Delivery;
	disable Selcted_Final_Cost;
	disable Supplier_Selected.Supplier_ID;
	disable Supplier_Selected.Suppliers;
	disable Supplier_Selected.Availability;
	disable Supplier_Selected.Initial_Price;
	disable Supplier_Selected.Negotiated;
	disable Supplier_Selected.Final_Price;
	disable Supplier_Selected.Lead_Time;
	disable Supplier_Selected.Status;
	disable Supplier_Selected.Selected;
	disable Production_Date;
}
else
{
	enable quantity;
	enable Selected_Supplier;
	enable Shipment_Mode;
	enable Target_Delivery;
	enable Selcted_Final_Cost;
	enable Supplier_Selected.Supplier_ID;
	enable Supplier_Selected.Suppliers;
	enable Supplier_Selected.Availability;
	enable Supplier_Selected.Initial_Price;
	enable Supplier_Selected.Negotiated;
	enable Supplier_Selected.Final_Price;
	enable Supplier_Selected.Lead_Time;
	enable Supplier_Selected.Status;
	enable Supplier_Selected.Selected;
	enable Production_Date;
}

====================================================
11. PR_Populate_From_PR — on add > Successful form submission (2 Actions)
    Already captured in PR1_Created_Edited_Routing.txt — confirmed matches (byte-level
    diff not run, but structure/fields match that file's documented version). Not
    re-included here.
====================================================

====================================================
12. PR_Changed — on edit > Successful form submission (2 Actions)
    Already captured in PR1_Created_Edited_Routing.txt — confirmed matches. Not
    re-included here.
====================================================

====================================================
13. PR_Deleted — on delete > Successful form submission
    Already captured in purchase_request_scripts1.txt's documented delete script.
====================================================

====================================================
14. PR_Export_Selected_Supplier — on edit > Validations
    NEW, never documented before. REAL BUG FOUND (flagged, not fixed — user hasn't
    asked for this one yet): middle line writes to a bare local variable
    `Selected_Final_Cost` (no `input.` prefix, and wrong casing vs the real field
    `Selcted_Final_Cost`) instead of the actual record field — this line does NOTHING
    to the saved record, silently. The other two lines in the same action
    (`input.Selected_Supplier`/`input.Required_Days_Lead`) DO work correctly. Likely
    harmless in practice since `PR_Sync_Supplier_Selected` (action 5) already does the
    same job correctly and runs earlier — this action may be fully redundant dead code
    at this point, not confirmed either way.
====================================================
for each  row in input.Supplier_Selected
{
	if(row.Selected == true)
	{
		input.Selected_Supplier = row.Suppliers;
		Selected_Final_Cost = row.Final_Price;
		input.Required_Days_Lead = row.Lead_Time;
	}
}

====================================================
15. PR_Compute_Shipment_Timeline — on add or edit > Validations
    NEW, never documented before. Computes Remaining_Days/Delay_Status, defaults
    Production_Date to today unless already Converted to PO.
====================================================
if(input.PR_Status == "Converted to PO")
{
	effectiveProductionDate = input.Production_Date;
}
else
{
	effectiveProductionDate = zoho.currentdate;
	input.Production_Date = zoho.currentdate;
}
if(effectiveProductionDate != null)
{
	shipDays = 14;
	if(input.Shipment_Mode == "LCL" || input.Shipment_Mode == "FCL") { shipDays = 30; }
	productionEndDate = effectiveProductionDate.addDay(input.Required_Days_Lead);
	Supplier_Target_Date = productionEndDate.addDay(shipDays);
	today = zoho.currentdate;
	currentTarget = productionEndDate;
	if(today > productionEndDate) { currentTarget = Supplier_Target_Date; }
	rawDiff = (currentTarget - today);
	input.Remaining_Days = (rawDiff / 86400000).round(0);
	if(today > input.Supplier_Target_Date) { input.Delay_Status = "Delayed"; }
	else if(input.Remaining_Days <= 3) { input.Delay_Status = "At Risk"; }
	else { input.Delay_Status = "On Track"; }
}

====================================================
16. PR_Set_Shipment_Mode — on add or edit > Validations
    NEW, never documented before. THIS IS THE ACTION THAT SETS Shipment_Mode — runs
    AFTER PR_Check_Readiness in the current live action order, which is the root cause
    of the "Shipping mode selected" bug — see NOTES at bottom.
====================================================
if(input.Target_Delivery != null)
{
	input.supplier_target_date = input.Target_Delivery.addDay(-4);
}
if(input.PR_Status != "Converted to PO")
{
	targetDate = input.supplier_target_date;
	if(targetDate != null)
	{
		remainingDays = (targetDate - zoho.currentdate);
		remainingDaysNum = (remainingDays / 86400000).round(0);
		if(remainingDaysNum >= 30)
		{
			input.Shipment_Mode = "LCL";
			input.Shipment_Days = 30;
		}
		else
		{
			input.Shipment_Mode = "Airfreight";
			input.Shipment_Days = 14;
		}
	}
}

====================================================
17. PR_Compute_Priority — on add or edit > Validations
    NEW, never documented before. Scores Priority (High/Medium/Low) from delivery
    urgency, order value, and aging.
====================================================
score = 0;
today = zoho.currentdate;
if(input.Target_Delivery != null)
{
	urgencyDiff = (input.Target_Delivery - today);
	daysToDelivery = (urgencyDiff / 86400000).round(0);
	if(daysToDelivery <= 3) { score = score + 50; }
	else if(daysToDelivery <= 7) { score = score + 30; }
	else if(daysToDelivery <= 14) { score = score + 15; }
}
orderValue = ifnull(input.Order_Value,0);
if(orderValue >= 500000) { score = score + 20; }
if(input.Last_Update != null)
{
	agingDiff = (today - input.Last_Update.toDate());
	daysIdle = (agingDiff / 86400000).round(0);
	if(daysIdle > 5) { score = score + 20; }
}
if(score >= 70) { input.Priority = "High"; }
else if(score >= 40) { input.Priority = "Medium"; }
else { input.Priority = "Low"; }
input.Priority_Score = score;

====================================================
18. PR1_Sync_Own_Image — on add or edit > Successful form submission
    Already captured/documented in PR1_Created_Edited_Routing.txt. Not re-included here.
====================================================

====================================================
NOTES:
- BUG FOUND + DIAGNOSED 2026-07-14 (the reason this whole dump was captured): "Shipping
  mode selected" in the Readiness Checklist stayed unchecked on brand-new PRs even though
  Shipment_Mode visibly showed a real value ("Airfreight") the moment you opened them —
  user confirmed a plain resave (Update, no changes) flips it to checked immediately,
  proving it's a same-save ORDERING bug, not a data/field-name bug. Root cause: action 16
  (`PR_Set_Shipment_Mode`, which actually sets `Shipment_Mode`) runs AFTER action 6
  (`PR_Check_Readiness`, which reads it) in the live action list — so on the very first
  Validations pass (at Create), `PR_Check_Readiness` sees `Shipment_Mode` still blank and
  computes `Shipping_mode_selected=false`, and that never gets recomputed again until the
  NEXT edit (by which point `PR_Set_Shipment_Mode` has already run once and the value
  sticks). Exact same class of bug as the `quote_group` self-heal issue found earlier the
  same day on the Inquiry side (`inquiry_check_readiness.txt`) — a Validations action
  reading a field whose real value comes from a DIFFERENT action later in the same list.
  FIX: pure action-reordering in Creator's live workflow editor, no Deluge code change at
  all — move `PR_Check_Readiness` (action 6) to run AFTER `PR_Set_Shipment_Mode` (action
  16). Confirm no other condition it reads is similarly out-of-order: `Selected_Supplier`/
  `Selcted_Final_Cost` come from `PR_Sync_Supplier_Selected` (action 5, already runs
  BEFORE — correct), `SRP_Rate_PR` is set at creation time via `SO_To_PR`'s own
  `createRecord` payload (already present before ANY Validations runs — correct),
  `Target_Delivery` is also set at creation via that same payload (correct). So moving
  `PR_Check_Readiness` past just `PR_Set_Shipment_Mode` is the ONLY reorder needed.
  UNTESTED — needs the live reorder + a fresh SO approval (or a genuinely new PR) to
  confirm Shipping mode selected is correct on the FIRST save, no dummy edit required.
- SEPARATE BUG FOUND, flagged only (not fixed, not asked for yet): action 14
  (`PR_Export_Selected_Supplier`) has a dead line — `Selected_Final_Cost = row.
  Final_Price;` is missing the `input.` prefix (and uses the wrong casing vs the real
  field `Selcted_Final_Cost`), so it silently writes to a throwaway local variable
  instead of the actual record field. The other 2 lines in the same action work fine.
  Likely harmless since `PR_Sync_Supplier_Selected` (action 5) already does the identical
  job correctly and runs earlier in the list — this action may be fully redundant at this
  point. Not touched — flag to user before assuming it's fixed if it's ever relied on.
====================================================

````
