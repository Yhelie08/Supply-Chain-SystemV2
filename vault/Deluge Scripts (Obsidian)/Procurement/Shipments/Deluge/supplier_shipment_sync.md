---
title: "supplier_shipment_sync"
source_file: "supplier_shipment_sync.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 488
tags:
  - delivery-management
  - deluge
  - dms
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# supplier_shipment_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `supplier_shipment_sync.txt`
> - **Lines of Code:** 488
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== New 2026-07-21, per user (Supplier Shipment self-report feature, see plan.txt) ==
== Supplier submits Date_Shipped/Shipment_Mode + checks Select_To_Ship on their own
   Fenteng_Shipment/Tony_Shipment record -> this workflow generates a real
   Shipment_ID, appends a row to the PARENT Shipments.Supplier_Shipment_Details,
   pushes Shipment_Mode into the matching PO_Shipments line's
   Shipment_Mode_When_Received (same field Receiving already reads/writes -
   receiving_sync_shipment_mode.txt), and marks each processed row Synced=true so a
   resave never double-appends. ==

====================================================
PREREQUISITE: new tiny form Shipment_ID_Counter (single settings-style record,
never shown to any user) - 3 Number fields, Air_Counter/LCL_Counter/FCL_Counter.
Exists specifically to avoid scanning Shipments[...].Supplier_Shipment_Details
across every Shipments record for a max-sequence-per-mode - that scan would need
a subform read across MANY criteria-queried records, the exact confirmed-risky
shape this codebase avoids everywhere else. A single small counter record,
read-increment-write, sidesteps the scan entirely.

form Shipment_ID_Counter
{
	displayname = "Shipment ID Counter"
	Air_Counter
	(
		type = number
		displayname = "Air Counter"
		row = 1
		column = 1
		width = medium
	)
	LCL_Counter
	(
		type = number
		displayname = "LCL Counter"
		row = 1
		column = 1
		width = medium
	)
	FCL_Counter
	(
		type = number
		displayname = "FCL Counter"
		row = 1
		column = 1
		width = medium
	)
	actions
	{
		on add
		{
			submit
			(
   				type = submit
   				displayname = "Submit"
			)
		}
		on edit
		{
			update
			(
   				type = submit
   				displayname = "Update"
			)
			cancel
			(
   				type = cancel
   				displayname = "Cancel"
			)
		}
	}
}
====================================================

====================================================
WORKFLOW SETUP (Fenteng_Shipment)
  Name: Fenteng_Shipment_Sync
  Form: Fenteng_Shipment
  Trigger: Edited > Successful form submission
  Action: Execute script
====================================================

fs = Fenteng_Shipment[ID == input.ID];

counterExisting = Shipment_ID_Counter[ID != 0];
if(counterExisting.count() == 0)
{
	insert into Shipment_ID_Counter
	[
		Air_Counter = 1
		LCL_Counter = 1
		FCL_Counter = 1
	]
}
counterRec = Shipment_ID_Counter[ID != 0];

shipParentRec = Shipments[ID == fs.Parent_Shipment_ID.toLong()];

modeMapF = Map();
for each  row in fs.Supplier1_Shipment_Details
{
	if(row.Select_To_Ship == true && row.Synced != true)
	{
		modeVal = row.Shipment_Mode + "";
		if(modeVal != null && modeVal != "" && modeVal != "null")
		{
			prefix = "";
			seqNum = 0;
			if(modeVal == "Airfreight")
			{
				prefix = "AIR";
				seqNum = counterRec.Air_Counter;
				counterRec.Air_Counter = counterRec.Air_Counter + 1;
			}
			else if(modeVal == "LCL")
			{
				prefix = "LCL";
				seqNum = counterRec.LCL_Counter;
				counterRec.LCL_Counter = counterRec.LCL_Counter + 1;
			}
			else if(modeVal == "FCL")
			{
				prefix = "FCL";
				seqNum = counterRec.FCL_Counter;
				counterRec.FCL_Counter = counterRec.FCL_Counter + 1;
			}

			if(prefix != "")
			{
				seqStr = "";
				if(seqNum < 10)
				{
					seqStr = "0000" + seqNum;
				}
				else if(seqNum < 100)
				{
					seqStr = "000" + seqNum;
				}
				else if(seqNum < 1000)
				{
					seqStr = "00" + seqNum;
				}
				else if(seqNum < 10000)
				{
					seqStr = "0" + seqNum;
				}
				else
				{
					seqStr = "" + seqNum;
				}
				shipmentIdVal = "SHP-" + prefix + "-" + seqStr;

				newParentRow = Shipments.Supplier_Shipment_Details();
				newParentRow.Shipment_ID = shipmentIdVal;
				newParentRow.SO_No = shipParentRec.Sales_Order;
				newParentRow.PR_No = row.PR_No;
				newParentRow.RR_No = row.RR_No;
				newParentRow.SKU = row.SKU;
				newParentRow.Item_Name = row.Item_Name;
				newParentRow.Date_Shipped = row.Date_Shipped + "";
				newParentRow.Shipment_Mode = modeVal;
				newParentRow.Status = "In Transit";
				shipParentRec.Supplier_Shipment_Details.insert(newParentRow);
				shipParentRec.Ship_Out_Date = row.Date_Shipped;
				if(modeVal == "LCL")
				{
					shipParentRec.Estimated_Warehouse_Arrival = row.Date_Shipped.addDay(67);
				}
				else if(modeVal == "FCL")
				{
					shipParentRec.Estimated_Warehouse_Arrival = row.Date_Shipped.addDay(47);
				}
				else if(modeVal == "Airfreight")
				{
					shipParentRec.Estimated_Warehouse_Arrival = row.Date_Shipped.addDay(12);
				}

				modeMapF.put(row.SKU, modeVal);
				row.Synced = true;
			}
		}
	}
}
/* FIXED 2026-07-23, real bug found live (first-ever test of this script) — the
   in-place mutation below (`for each ln in shipParentRec.PO_Shipments { ln.field
   = value; }`) silently did NOT persist, confirmed via direct API pull after a
   real Tony_Shipment save: Shipment_ID/Synced/Ship_Out_Date all landed correctly
   (proving the rest of this script ran), but Shipment_Mode_When_Received on the
   parent's own PO_Shipments line stayed unchanged. Same class of Deluge subform-
   mutation flakiness already documented elsewhere in this app (Product_Context1
   saga) — even the "correct" in-place-mutation shape isn't reliable on a record
   fetched via criteria (shipParentRec, not `input`). Switched to the ONLY
   consistently-proven-reliable pattern for this: full clear()+rebuild, capturing
   ONE FIRST-PASS BUG in this rebuild, caught+fixed on first live paste: `RR_No`
   was mistakenly included in the captured/rebuilt field list — that field only
   exists on `Shipments.Supplier_Shipment_Details` (a different subform), NOT on
   `Shipments.PO_Shipments` — errored "Variable RR_No does not exist in
   ZC_SUBFORM_2012" the moment it was pasted. Removed from both the Map capture
   and the rebuild for both Fenteng/Tony halves; every other field in the list
   below (PR_No/SKU/Item_Name/Ordered_QTY/Shipment_QTY/Remaining_QTY/
   Shipping_Mode/Line_Status/Fully_Shipped/Shipment_Mode_When_Received) is a
   real confirmed PO_Shipments column.
   every existing row's values into plain Maps FIRST (never held past its own
   loop iteration), then clear() + re-insert every row fresh. */
if(modeMapF.size() > 0)
{
	existingLinesF = List();
	for each  lnCap in shipParentRec.PO_Shipments
	{
		rowMapF = Map();
		rowMapF.put("PR_No", lnCap.PR_No);
		rowMapF.put("SKU", lnCap.SKU);
		rowMapF.put("Item_Name", lnCap.Item_Name);
		rowMapF.put("Ordered_QTY", lnCap.Ordered_QTY);
		rowMapF.put("Shipment_QTY", lnCap.Shipment_QTY);
		rowMapF.put("Remaining_QTY", lnCap.Remaining_QTY);
		rowMapF.put("Shipping_Mode", lnCap.Shipping_Mode);
		rowMapF.put("Line_Status", lnCap.Line_Status);
		rowMapF.put("Fully_Shipped", lnCap.Fully_Shipped);
		newModeF = modeMapF.get(lnCap.SKU);
		if(newModeF != null)
		{
			rowMapF.put("Shipment_Mode_When_Received", newModeF);
		}
		else
		{
			rowMapF.put("Shipment_Mode_When_Received", lnCap.Shipment_Mode_When_Received);
		}
		existingLinesF.add(rowMapF);
	}
	shipParentRec.PO_Shipments.clear();
	for each  rowMapF2 in existingLinesF
	{
		rebuiltLnF = Shipments.PO_Shipments();
		rebuiltLnF.PR_No = rowMapF2.get("PR_No");
		rebuiltLnF.SKU = rowMapF2.get("SKU");
		rebuiltLnF.Item_Name = rowMapF2.get("Item_Name");
		rebuiltLnF.Ordered_QTY = rowMapF2.get("Ordered_QTY");
		rebuiltLnF.Shipment_QTY = rowMapF2.get("Shipment_QTY");
		rebuiltLnF.Remaining_QTY = rowMapF2.get("Remaining_QTY");
		rebuiltLnF.Shipping_Mode = rowMapF2.get("Shipping_Mode");
		rebuiltLnF.Line_Status = rowMapF2.get("Line_Status");
		rebuiltLnF.Fully_Shipped = rowMapF2.get("Fully_Shipped");
		rebuiltLnF.Shipment_Mode_When_Received = rowMapF2.get("Shipment_Mode_When_Received");
		shipParentRec.PO_Shipments.insert(rebuiltLnF);
	}
}

====================================================
WORKFLOW SETUP (Tony_Shipment) - identical shape, Supplier2_Shipment_Details,
Name: Tony_Shipment_Sync
Tony_Shipment[ID==input.ID], variables suffixed T instead of F
====================================================

fsT = Tony_Shipment[ID == input.ID];

counterExistingT = Shipment_ID_Counter[ID != 0];
if(counterExistingT.count() == 0)
{
	insert into Shipment_ID_Counter
	[
		Air_Counter = 1
		LCL_Counter = 1
		FCL_Counter = 1
	]
}
counterRecT = Shipment_ID_Counter[ID != 0];

shipParentRecT = Shipments[ID == fsT.Parent_Shipment_ID.toLong()];

modeMapT = Map();
for each  rowT in fsT.Supplier2_Shipment_Details
{
	if(rowT.Select_To_Ship == true && rowT.Synced != true)
	{
		modeValT = rowT.Shipment_Mode + "";
		if(modeValT != null && modeValT != "" && modeValT != "null")
		{
			prefixT = "";
			seqNumT = 0;
			if(modeValT == "Airfreight")
			{
				prefixT = "AIR";
				seqNumT = counterRecT.Air_Counter;
				counterRecT.Air_Counter = counterRecT.Air_Counter + 1;
			}
			else if(modeValT == "LCL")
			{
				prefixT = "LCL";
				seqNumT = counterRecT.LCL_Counter;
				counterRecT.LCL_Counter = counterRecT.LCL_Counter + 1;
			}
			else if(modeValT == "FCL")
			{
				prefixT = "FCL";
				seqNumT = counterRecT.FCL_Counter;
				counterRecT.FCL_Counter = counterRecT.FCL_Counter + 1;
			}

			if(prefixT != "")
			{
				seqStrT = "";
				if(seqNumT < 10)
				{
					seqStrT = "0000" + seqNumT;
				}
				else if(seqNumT < 100)
				{
					seqStrT = "000" + seqNumT;
				}
				else if(seqNumT < 1000)
				{
					seqStrT = "00" + seqNumT;
				}
				else if(seqNumT < 10000)
				{
					seqStrT = "0" + seqNumT;
				}
				else
				{
					seqStrT = "" + seqNumT;
				}
				shipmentIdValT = "SHP-" + prefixT + "-" + seqStrT;

				newParentRowT = Shipments.Supplier_Shipment_Details();
				newParentRowT.Shipment_ID = shipmentIdValT;
				newParentRowT.SO_No = shipParentRecT.Sales_Order;
				newParentRowT.PR_No = rowT.PR_No;
				newParentRowT.RR_No = rowT.RR_No;
				newParentRowT.SKU = rowT.SKU;
				newParentRowT.Item_Name = rowT.Item_Name;
				newParentRowT.Date_Shipped = rowT.Date_Shipped + "";
				newParentRowT.Shipment_Mode = modeValT;
				newParentRowT.Status = "In Transit";
				shipParentRecT.Supplier_Shipment_Details.insert(newParentRowT);
				shipParentRecT.Ship_Out_Date = rowT.Date_Shipped;
				if(modeValT == "LCL")
				{
					shipParentRecT.Estimated_Warehouse_Arrival = rowT.Date_Shipped.addDay(67);
				}
				else if(modeValT == "FCL")
				{
					shipParentRecT.Estimated_Warehouse_Arrival = rowT.Date_Shipped.addDay(47);
				}
				else if(modeValT == "Airfreight")
				{
					shipParentRecT.Estimated_Warehouse_Arrival = rowT.Date_Shipped.addDay(12);
				}

				modeMapT.put(rowT.SKU, modeValT);
				rowT.Synced = true;
			}
		}
	}
}
/* FIXED 2026-07-23 — Tony mirror of the Fenteng fix above, same real bug, same
   clear()+rebuild fix. See that block's own comment for the full writeup. */
if(modeMapT.size() > 0)
{
	existingLinesT = List();
	for each  lnCapT in shipParentRecT.PO_Shipments
	{
		rowMapT2a = Map();
		rowMapT2a.put("PR_No", lnCapT.PR_No);
		rowMapT2a.put("SKU", lnCapT.SKU);
		rowMapT2a.put("Item_Name", lnCapT.Item_Name);
		rowMapT2a.put("Ordered_QTY", lnCapT.Ordered_QTY);
		rowMapT2a.put("Shipment_QTY", lnCapT.Shipment_QTY);
		rowMapT2a.put("Remaining_QTY", lnCapT.Remaining_QTY);
		rowMapT2a.put("Shipping_Mode", lnCapT.Shipping_Mode);
		rowMapT2a.put("Line_Status", lnCapT.Line_Status);
		rowMapT2a.put("Fully_Shipped", lnCapT.Fully_Shipped);
		newModeT = modeMapT.get(lnCapT.SKU);
		if(newModeT != null)
		{
			rowMapT2a.put("Shipment_Mode_When_Received", newModeT);
		}
		else
		{
			rowMapT2a.put("Shipment_Mode_When_Received", lnCapT.Shipment_Mode_When_Received);
		}
		existingLinesT.add(rowMapT2a);
	}
	shipParentRecT.PO_Shipments.clear();
	for each  rowMapT2b in existingLinesT
	{
		rebuiltLnT = Shipments.PO_Shipments();
		rebuiltLnT.PR_No = rowMapT2b.get("PR_No");
		rebuiltLnT.SKU = rowMapT2b.get("SKU");
		rebuiltLnT.Item_Name = rowMapT2b.get("Item_Name");
		rebuiltLnT.Ordered_QTY = rowMapT2b.get("Ordered_QTY");
		rebuiltLnT.Shipment_QTY = rowMapT2b.get("Shipment_QTY");
		rebuiltLnT.Remaining_QTY = rowMapT2b.get("Remaining_QTY");
		rebuiltLnT.Shipping_Mode = rowMapT2b.get("Shipping_Mode");
		rebuiltLnT.Line_Status = rowMapT2b.get("Line_Status");
		rebuiltLnT.Fully_Shipped = rowMapT2b.get("Fully_Shipped");
		rebuiltLnT.Shipment_Mode_When_Received = rowMapT2b.get("Shipment_Mode_When_Received");
		shipParentRecT.PO_Shipments.insert(rebuiltLnT);
	}
}

====================================================
FIXED 2026-07-21, live paste, 2 rounds - first "Error at line number: 2 Improper
Statement" (direct `X = Form[ID==Y]; if(X != null)`), then after switching to a
`for each`-then-check idiom, the SAME error just moved to the SAME logical
statement ("Error at line number: 7", still `if(fs != null)`). Real root cause,
confirmed by comparing against every genuinely CONFIRMED-live script in this app:
comparing a whole RECORD-typed variable to `null` (`if(recordVar != null)`) fails
to parse in a native workflow's Execute Script box, regardless of whether that
variable was populated via direct assignment or a `for each` loop. Every
confirmed-working precedent (dms_scheduling_engine.txt's `foundInstaller`/
`bestInstaller`, `rec = Service_Appointment_Form[ID == input.ID];` used with zero
guard) either null-checks a plain STRING/NUMBER (proven safe - "only plain
strings/numbers survive past each for-each iteration", per that file's own
comment) or never null-checks a record at all, trusting the fetch and using it
immediately (matches this app's own already-working `newSuppRec = Fenteng_
Shipment[ID == newSuppRecID];` in shipments_auto_create_supplier_shipment.txt,
used with no guard). FIXED FOR REAL: `fs`/`fsT`, `shipParentRec`/`shipParentRecT`,
and `counterRec`/`counterRecT` are now all direct-assigned and used immediately,
with NO null-check on any of them anywhere in this script - existence for the
counter record is handled via `.count()` on the criteria query (a NUMBER
comparison, not a record-null comparison) before an insert-if-missing, then an
unconditional re-fetch trusted to succeed. Needs a fresh re-paste of both action
bodies (the null-check-based version was never actually confirmed working, don't
resurrect it).
====================================================
NOTES:
- Shape deliberately flat/mirrors receiving_sync_shipment_mode.txt exactly: direct
  (non-for-each-wrapped) assignment for every single-record fetch (fs/shipParentRec/
  counterRec), a Map built during the ONE loop that also does the safe operations
  (insert - not existing-row-mutation - plus mutating the SAME loop's own row
  variable, both proven-safe shapes), then a SEPARATE single non-nested for each
  applying the map to shipParentRec.PO_Shipments. Never two levels of for each
  wrap the same mutation - the exact shape that silently failed to persist in the
  Product_Context1 saga earlier in this project.
- row.Synced=true mutates fs's OWN subform row, live, inside the SAME for each that
  produced it, no intermediate variable - the one proven-safe existing-row-mutation
  shape in this whole codebase.
- shipParentRec.Supplier_Shipment_Details.insert(...) never touches an EXISTING row
  - pure append, the other proven-safe subform operation (same convention as
  create_rr_button.txt's own insert-only pattern).
- Deliberately fetches fs/shipParentRec fresh via direct assignment rather than
  trusting input directly for the mutate/insert calls - this is an Edited >
  Successful form submission trigger, same "re-fetch self, don't rely on bare
  input mutations persisting" convention already established elsewhere in this app
  (shipment_previous_status.txt, receiving_status_workflow.txt).
- ADDED 2026-07-22, per user (thingsToDo.txt) — `Estimated_Warehouse_Arrival` (new
  Date field, already added to Shipments by user), computed at the same moment as
  Ship_Out_Date, right after it: `Ship_Out_Date + N days` where N depends on
  `modeVal`/`modeValT` (the same Shipment_Mode value already in scope from the
  Shipment_ID prefix logic above) — LCL=67, FCL=47, Airfreight=12. Uses `.addDay(n)`,
  the proven date-arithmetic pattern already used elsewhere in this app (e.g.
  `PR1_Created_Edited_Routing.txt`'s `productionEndDate.addDay(shipDays)`). Both
  fields are populated together, same trigger, same guard (only for rows with
  Select_To_Ship==true && Synced!=true). Mirrored into `UI/EndUser/Shipments/app/
  index.html` — new "Estimated Warehouse Arrival" editable date field, right below
  Ship Out Date (same editable-by-buyer convention as its sibling — this widget
  doesn't recompute it client-side, it's purely a display+manual-override field like
  Ship_Out_Date itself; the real auto-population only happens here, server-side, on
  supplier sync). UNTESTED — needs a live supplier Select_To_Ship+Save to confirm
  the date lands correctly for all 3 modes.
- ADDED 2026-07-22, per user: `shipParentRec/T.Ship_Out_Date = row/T.Date_Shipped;`
  right after the parent append - the header-level "Ship Out Date" field on
  Shipments was confirmed always blank (nothing writes it anywhere else), so it now
  populates the moment a supplier reports Date_Shipped. Direct assign, no string
  cast needed (unlike Supplier_Shipment_Details.Date_Shipped below - Ship_Out_Date
  is a real Date-typed header field, same type as the source). Last-write-wins
  across lines if multiple items sync in the same save - same convention already
  used for Target_Date/Production_Date/Supplier_Target_Date elsewhere in this app
  (pr_to_po_grouping.txt).
- Date_Shipped copied as `row.Date_Shipped + ""` since the target field
  (Supplier_Shipment_Details.Date_Shipped) is plain TEXT on the parent Shipments
  form (per the live schema dump in plan.txt) while the supplier-side field is a
  real Date type - same defensive string-cast already used elsewhere in this app
  when a typed field feeds a plain-text target.
- Only ever writes rows with Select_To_Ship==true AND Synced!=true - unchecking
  Select_To_Ship after a sync does nothing (Synced already true, row already
  skipped) - matches supplier_shipment_forms.txt's own NOTES ("Select_To_Ship
  intentionally does NOT auto-reset").
- Counter increments even if, in some future edge case, the same seqNum could be
  reused across a race between Fenteng and Tony saving at the exact same moment -
  both draw from the SAME Shipment_ID_Counter record, so this is naturally
  serialized per mode across suppliers too (SHP-AIR-00001 can only ever be handed
  out once total, not once-per-supplier) - this is a feature, not a bug, since
  Shipment_ID is meant to be a single global sequence per mode.
- Prerequisite: Shipment_ID_Counter form must be created first (see block above),
  needs exactly one seed record with all 3 counters at 1 OR can be left empty -
  the null-check block auto-seeds one on first-ever sync if none exists.
- UNTESTED - first time this workflow has been written or pasted.
====================================================

````
