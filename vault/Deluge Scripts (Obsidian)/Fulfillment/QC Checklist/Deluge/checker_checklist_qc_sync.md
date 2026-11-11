---
title: "checker_checklist_qc_sync"
source_file: "production\checker_checklist_qc_sync.txt"
category: "Fulfillment/QC Checklist/Deluge"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 825
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - notification
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
---

# checker_checklist_qc_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `Fulfillment/QC Checklist/Deluge`
> - **Source File:** `production\checker_checklist_qc_sync.txt`
> - **Lines of Code:** 825
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#notification`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PRODUCTION COPY — checker_checklist_qc_sync.txt ==
== Twinned from DelugeScripts/checker_checklist_qc_sync.txt on 2026-08-04 ==
== Per docs/DevToProd/2026-08-04-deluge-dev-to-prod-cutover.md ==
== Key rule: environment header OMITTED = defaults to Production (confirmed live 2026-08-04) ==
== Do NOT write environment:"production" as a literal — that throws code 2930. ==
== Quality Check form (Checker_Checklist) — QC_Status routing ==
== DISCOVERED live 2026-07-27, NOT built by this session — a real, already-existing ==
== native Deluge workflow, found only because a stray Exception_Control1 record ==
== turned up with a Source_Module value ("Checker_Checklist (QC Rejected)") that no ==
== JS in this codebase ever writes. Captured here for the first time via a live paste ==
== (Temp.txt) so it's documented like every other coworker-built workflow in this app. ==

====================================================
WORKFLOW SETUP — QC Approved sync to Crate or Order Aggregation
  Form: Checker_Checklist (displayname "Quality Check")
  Trigger: Created or Edited > Successful form submission
  This is the SOLE mechanism that routes QC_Status=Approved/Rejected anywhere —
  UI/FF Widget/ExceptionControl (Status=Completed) creates the Checker_Checklist
  record in the first place; this workflow does everything downstream of that.
  A same-day widget-JS duplicate of this exact logic was built in UI/FF Widget/
  QCChecklist, discovered racing with this native workflow (both writing to
  Exception_Control1 with different matching keys), then REMOVED per explicit
  user decision — this native workflow is more complete (matches by Sales_Order+
  SKU+PAC instead of a fragile Exception_Number link, and handles the Approved+
  For_Crate branch the widget-JS version never built at all) and stays enabled.
====================================================

Real behavior, by branch:
- QC_Status == "Rejected": UPDATE-or-CREATE an Exception_Control1 record,
  matched by Sales_Order+SKU+PAC (not Exception_Number — that field, added to
  Checker_Checklist this same session for the now-removed widget-JS version, is
  unused by this workflow). Stamps Source_Module="Checker_Checklist (QC
  Rejected)" — the exact value that revealed this workflow's existence. ALL
  rows of the Spare_part_type subform are merged into Exception_Control1's own
  Item_to_Replace1 (a real type=list multi-select field, no subform needed —
  fixed 2026-07-27 from an earlier first-row-only version, see the script's own
  inline NOTES) and Quantity_of_damage_spare_s (comma-joined text, since that
  field is plain text on Exception_Control1). CONFIRMED WORKING LIVE 2026-07-27 after a long debugging saga
  (real root cause never conclusively pinned down — the user resolved it
  independently while investigating in Creator's own UI; symptom the whole time
  was that the Approved branches fired reliably but Rejected never touched
  Exception_Control1 at all, despite no workflow-level Condition gating it and
  identical trigger/save mechanism for both). ADDED same day, per user request
  ("Item to Replace = Exception_Control1.Item to Replace... Quantity_of_Damage_
  Items... photos and video. signature no need. remarks too... most important
  is Whole Fixture vs Spare Parts"): confirmed `Item_to_Replace3=input.Item_
  to_Replace` (the real Whole-Fixture/Spare-Parts field — note Exception_
  Control1 confusingly has 4 similarly-named fields, `Item_to_Replace`/`
  Item_to_Replace1`/`Item_to_Replace2`/`Item_to_Replace3` — only `_3` is the
  actual picklist matching Checker_Checklist's own `Item_to_Replace`, the
  others are a section, the spare-part-type list, and another section),
  `Quantity=input.Quantity_of_Damage_Items`, and `Remarks=input.Remarks` were
  ALL ALREADY correctly mapped — no change needed for those. Signature
  deliberately NOT added, per explicit "no need." Photos/Video were a genuine
  gap — NEVER mapped anywhere in this workflow before (both branches) — added
  `Image_max_10_JPG_JPEG_PNG=input.Image_Upload_max_10_JPG_JPEG_PNG` and
  `Video_Upload_max_3_min_30_sec=input.Video_Upload_max_3_min_30_sec1` to BOTH
  the update-existing and create-new blocks (real field names on each form
  confirmed via a fresh live AppIDE dump the same day — Checker_Checklist's own
  upload fields are named with an extra "Upload_"/trailing "1" that a first
  glance could easily miss, Exception_Control1's are the plain
  "Image_max_10_JPG_JPEG_PNG"/"Video_Upload_max_3_min_30_sec" names already
  used elsewhere in this app e.g. UI/FF Widget/ExceptionControl's own CONFIG).
  UNCONFIRMED, flagged not assumed: whether a plain Deluge field-to-field
  assignment between two DIFFERENT top-level (non-subform) Upload File fields
  across forms actually carries the real file content — this exact shape has
  never been tested anywhere in this codebase before (every prior file-field
  gotcha in this app involved a SUBFORM file field specifically, a different,
  confirmed-broken case; a plain header-to-header assignment is genuinely
  untested territory). If it silently no-ops (same failure MODE as the
  multi-image gotcha elsewhere in this app, even though the mechanism would be
  different), the fallback is a real SDK-level file copy (download from one
  form, re-upload to the other) — not built here, only reach for it if this
  simple assignment is confirmed not to work.
- QC_Status == "Approved" && For_Crate == true: UPDATE-or-CREATE a
  Crate_Checklist record, matched by SO+SKU+Package_Order.
- QC_Status == "Approved" && For_Crate == false: appends to Order_Aggregation1
  (one record per SO, Item_Details grid) — genuinely more sophisticated than
  the version this session built and then removed: if a record for this SO
  already exists, its top-level fields (PAC/Order_Type/Target_Date/PR/Demo/
  Delivery_Type/Customer_*) are refreshed from the LATEST Checker_Checklist
  input rather than just copied back unchanged (so a later edit to the QC
  record, e.g. adding Target Delivery Date after Approval, actually propagates)
  — except For_Crate and Dispatch_Selected, deliberately PRESERVED from the
  existing record since both are independent/manual decisions that shouldn't
  reset just because a different item on the same SO got approved. A same-SKU
  existing Item_Details row gets its own values UPDATED in place rather than
  duplicated. Real confirmed platform limits driving the implementation shape:
  "The field(s) 'Item_Details' isn't supported for Update MultiColumn task" —
  a subform field can't be set via `update Form[criteria][field=value]`, so a
  changed Order_Aggregation1 record is DELETE-then-RE-INSERT, never a plain
  update (same class of limitation already documented elsewhere in this app,
  just first confirmed here for this specific task type).
- Anything else (QC_Status blank/other) — no-op, logged only.

Related native workflows referenced by this file's own comments, NOT yet
captured verbatim in this codebase (same "coworker builds workflows
independently" gap — flagged, not chased down this session, out of scope):
pick1_to_pack_sync.txt, pack_to_checker_checklist_sync.txt,
crate_checklist_to_order_aggregation_sync.txt (referenced by name/behavior in
this workflow's own code comments, e.g. "For_Crate dahil manual/independent na
desisyon ito... posibleng itinakda ng TRUE ng ibang crate item ng parehong SO
via crate_checklist_to_order_aggregation_sync.txt").

== BODY (verbatim, as pasted live 2026-07-27 — Tagalog code comments preserved
   as-is, not translated, matching the source) ==

// Ang Form Event ay tatakbo lang PAGKATAPOS ma-save ang record — kaya kailangan pa
// rin ng sariling check dito kung TALAGANG "Approved" o "Rejected" na ang QC_Status,
// para hindi ito tumakbo kapag ibang field lang ang na-edit o kapag blangko pa.
soVal = input.SO + "";
skuVal = input.SKU + "";
pacVal = input.PAC + "";
qtyVal = input.Quantity + "";
qtyNum = 0;
if(qtyVal != "" && qtyVal != "null")
{
	qtyNum = qtyVal.toLong();
}
// ADDED 2026-07-28, real gap found live — Exception_Control1.Supplier was never
// set anywhere in this script (Checker_Checklist has no Supplier field of its own
// at all), so ExceptionControl widget's Create RR ("Unknown Supplier — can't route
// this RR") always dead-ended on a Fulfillment-EXC-sourced exception. Resolved via
// the same PR-No chain every other trace-back in this codebase already uses:
// Purchase_Request1[PR_No==input.PR].Selected_Supplier. Plain header-field read,
// no subform involved — same platform-limitation-safe shape as every other
// PR-No-based trace in this app. Fails blank (not blocking) if PR is missing or
// unresolvable — Supplier just stays blank same as before this fix, no regression.
prSupplierVal = "";
if(input.PR != null && (input.PR + "") != "")
{
	for each  prRec in Purchase_Request1[PR_No == input.PR]
	{
		prSupplierVal = prRec.Selected_Supplier + "";
		if(prSupplierVal == "null")
		{
			prSupplierVal = "";
		}
	}
}
if(input.QC_Status == "Rejected")
{
	// ===== REJECTED -> Exception_Control1 =====
	// Per-item, matched SO+SKU+PAC — UPDATE-or-CREATE, parehong pattern gaya ng
	// Crate_Checklist branch sa ibaba.
	// CHANGED 2026-07-27, real gap found live ("2 missing spare parts... only
	// showing Shade") — the original version only ever read the FIRST row of
	// the Spare_part_type grid, silently dropping every row after it (a
	// deliberate simplification at the time, since Exception_Control1's own
	// fields looked flat/scalar). Now collects EVERY row's own Spare_Part_Type
	// (list-typed at the grid-column level, one value per row after the
	// user's own single-select conversion) and Quantity_of_damage_spare_s,
	// comma-joining both into plain strings.
	// FIXED same day, real bug found live — first attempt assigned a raw
	// List() object directly to Item_to_Replace1 inside the `update Form[...]
	// [...]` block, which errored "Invalid expressions found in update multi-
	// column Expression Line" (confirmed via a live console capture of the
	// updateRecords response) — unlike `insert into`, the multi-column
	// `update` task apparently can't take a List() value there, only a plain
	// scalar. Reverted to a comma-joined STRING for Item_to_Replace1 too (same
	// proven-safe shape Quantity_of_damage_spare_s already used, and the same
	// shape a single value already worked in before this whole change) — a
	// real Deluge type=list field DOES accept a plain string value via this
	// task shape (confirmed by the original single-row version working fine),
	// so this sacrifices nothing over the List() attempt except being briefly
	// less "technically a list" internally.
	// FIXED AGAIN same day, real gap found live ("qty of damage spares. blank.
	// can you just indicate quantity per item?") — the type list and quantity
	// list were built as two SEPARATE comma-joined strings, but the quantity
	// list only ever ADDED an entry when a row's own quantity was non-blank —
	// meaning if row 2 had a type but blank qty and row 3 had both, the type
	// list ends up longer than the qty list and the two can no longer be
	// paired by position at all (also the literal cause of the blank display
	// in this specific test, which genuinely had no quantity typed on either
	// row). Real fix: build ONE paired string per row ("Shade: 1, Base: 2")
	// in a single pass — Item_to_Replace1 stays a clean comma-joined list of
	// just the real choice values (unchanged, still needs to only contain
	// valid picklist choices), but Quantity_of_damage_spare_s (plain text,
	// no choice constraint) now carries the full "Type: Qty" pairing instead
	// of a bare quantity list — this is what the widget's own QC Rejection
	// Details card parses back into a real 2-column table.
	// FIXED 2026-07-27, real root cause found via a live debug dump (Remarks
	// field, temporary — see git history / this session's own notes): the
	// inner `for each t in row.Spare_Part_Type` assumed this column was still
	// type=list (multi-select) — but the user's own field-type conversion
	// ("single choose dropdown, same choices, can add new choice") made it a
	// plain SCALAR. A `for each` over a scalar in Deluge silently iterates
	// ZERO times (no error) — so spareTypeParts/sparePairParts stayed
	// permanently empty regardless of real row data, confirmed via the debug
	// dump showing clean scalar values (`SPT=Shade`, `SPT=Base`, not a
	// List-toString mess). Fixed: read row.Spare_Part_Type directly as a
	// scalar, no inner for-each.
	spareTypeParts = List();
	sparePairParts = List();
	for each  row in input.Spare_part_type
	{
		rowType = row.Spare_Part_Type + "";
		if(rowType != "" && rowType != "null")
		{
			spareTypeParts.add(rowType);
			rowQty = row.Quantity_of_damage_spare_s + "";
			if(rowQty == "null" || rowQty == "")
			{
				rowQty = "—";
			}
			sparePairParts.add(rowType + ": " + rowQty);
		}
	}
	spareTypeVal = "";
	spareTypeFirst = true;
	for each  t2 in spareTypeParts
	{
		if(spareTypeFirst == true)
		{
			spareTypeVal = t2;
			spareTypeFirst = false;
		}
		else
		{
			spareTypeVal = spareTypeVal + ", " + t2;
		}
	}
	spareQtyVal = "";
	spareQtyFirst = true;
	for each  pair in sparePairParts
	{
		if(spareQtyFirst == true)
		{
			spareQtyVal = pair;
			spareQtyFirst = false;
		}
		else
		{
			spareQtyVal = spareQtyVal + ", " + pair;
		}
	}
	// REWORKED 2026-07-29, real bug found live by user ("exception control qty 2?
	// it should be qty 1 with 2 records right? 1 qty per line items in Damaged
	// Items — Exception Module records") — this branch used to write ONE
	// Exception_Control1 record with Qty=qtyNum (the full rejected quantity).
	// That contradicts this app's own established Exception_Control1 doctrine
	// (see UI/FF Widget/ExceptionControl's own CLAUDE.md row — "every record
	// should be 1 qty only regardless", one record PER REJECTED UNIT, same
	// convention every manually-seeded EXC-FF-##### record already follows).
	// Surfaced by the new 2026-07-29 QC split-approve/reject feature (a
	// rejectedQty=2 line rejected via one write), but the bug predates that —
	// any qty>1 full-Reject would have hit the same wrong single-record shape.
	// Fixed: count how many Exception_Control1 records ALREADY represent a
	// rejected unit for this SO+SKU+PAC, refresh their shared (non-Qty) fields
	// on every save (so a later Remarks/spare-parts edit still propagates to
	// all of them), then INSERT fresh Qty=1 records for the deficit only —
	// grow-only, idempotent on a plain resave with the same qtyNum.
	existingCount = 0;
	for each  existingExceptionRec in Exception_Control1[Sales_Order == soVal && SKU == skuVal && PAC == pacVal]
	{
		existingCount = existingCount + 1;
		update existingExceptionRec
		[
			RR_No=input.RR
			PR=input.PR
			Supplier=prSupplierVal
			Demo1=input.Demo
			Order_Type=input.Order_Type
			DELIVERY_TYPE=input.Delivery_Type
			Source_Module="Checker_Checklist (QC Rejected)"
			Checker=input.Quality_Checker
			Remarks=input.Remarks
			Customer_Name=input.Customer_Name
			Customer_Type=input.Customer_Type
			Customer_Address=input.Customer_Address
			Item_to_Replace3=input.Item_to_Replace
			Quantity=input.Quantity_of_Damage_Items
			Item_to_Replace1=spareTypeVal
			Quantity_of_damage_spare_s=spareQtyVal
			Item_Name=input.Item_Name
		];
	}
	info "Exception_Control1: " + existingCount + " existing record(s) for SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + " refreshed.";

	unitsNeeded = qtyNum - existingCount;
	// Deluge has no counted for-loop (confirmed via official docs 2026-07-29 —
	// only `for each`/`for each index` over an ALREADY-sized collection; `while`
	// is a confirmed platform limit in this codebase too, see CLAUDE.md Deluge
	// Gotchas) — inserting N new records for an arbitrary N has to be unrolled
	// by hand instead of looped. Capped at 5 per single save (covers every real
	// line-item qty seen in this app's data so far); a rejectedQty needing more
	// than 5 NEW records in one save just creates the first 5 and logs a
	// warning — a plain resave (same QC_Status, same Quantity) picks up the
	// remainder next time, since existingCount/unitsNeeded is recomputed fresh.
	if(unitsNeeded > 5)
	{
		info "WARNING: " + unitsNeeded + " new Exception_Control1 records needed for SO " + soVal + " / SKU " + skuVal + " but only 5 are created per save — re-save (or edit+save again) to create the remainder.";
		unitsNeeded = 5;
	}

	if(unitsNeeded >= 1)
	{
		// ADDED 2026-07-28, real gap found live ("Exception # auto numbering is
		// not on Exception control when the item in QC is rejected") — max+1-scan
		// convention already used everywhere else in this app for client/native-
		// numbered entities — "EXC-FF-00001" format, matching this form's own
		// existing real records. Re-scanned fresh for each unit below so 2+ new
		// records in the same save get consecutive, non-colliding numbers.
		maxExcNum = 0;
		for each  existingExcRec in Exception_Control1[ID != 0]
		{
			existingExcNoStr = existingExcRec.Exception_Number;
			if(existingExcNoStr != null && existingExcNoStr.startsWith("EXC-FF-"))
			{
				numPart = existingExcNoStr.removeFirstOccurence("EXC-FF-");
				numVal = numPart.toLong();
				if(numVal > maxExcNum)
				{
					maxExcNum = numVal;
				}
			}
		}

		// CHANGED 2026-07-27, per user ("can we just use Exception_Control_Media")
		// — Photos/Video no longer travel via any Deluge field copy at all
		// (uploaded directly by the QCChecklist widget into the separate
		// Exception_Control_Media form instead) — nothing to carry here.
		if(unitsNeeded >= 1)
		{
			maxExcNum = maxExcNum + 1;
			if(maxExcNum < 10)
			{
				nextExcNo = "EXC-FF-0000" + maxExcNum;
			}
			else if(maxExcNum < 100)
			{
				nextExcNo = "EXC-FF-000" + maxExcNum;
			}
			else if(maxExcNum < 1000)
			{
				nextExcNo = "EXC-FF-00" + maxExcNum;
			}
			else if(maxExcNum < 10000)
			{
				nextExcNo = "EXC-FF-0" + maxExcNum;
			}
			else
			{
				nextExcNo = "EXC-FF-" + maxExcNum;
			}
			newExceptionId = insert into Exception_Control1
			[
				Sales_Order=soVal
				SKU=skuVal
				PAC=pacVal
				Exception_Number=nextExcNo
				RR_No=input.RR
				PR=input.PR
				Supplier=prSupplierVal
				Demo1=input.Demo
				Order_Type=input.Order_Type
				DELIVERY_TYPE=input.Delivery_Type
				Source_Module="Checker_Checklist (QC Rejected)"
				Checker=input.Quality_Checker
				Remarks=input.Remarks
				Customer_Name=input.Customer_Name
				Customer_Type=input.Customer_Type
				Customer_Address=input.Customer_Address
				Item_to_Replace3=input.Item_to_Replace
				Quantity=input.Quantity_of_Damage_Items
				Item_to_Replace1=spareTypeVal
				Quantity_of_damage_spare_s=spareQtyVal
				Item_Name=input.Item_Name
				Qty=1
				Added_User=zoho.loginuser
			];
			info "Exception_Control1 record 1 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;
			// ADDED 2026-08-03, per user — ExceptionControl notification bell.
			newExcNotifId = insert into ExceptionControl_Notifications
			[
				Recipient_Email="homecartelff@gmail.com"
				Notification_Type="Exception Record Created"
				Message="New Exception Control record — " + soVal + " (" + input.Item_Name + ") — " + nextExcNo + "."
				Created_On=zoho.currenttime
				Read=false
				Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Exception_Control2?excRecordId=" + newExceptionId
				Source_Record_No=soVal
				Source_Record_ID=newExceptionId
			];
		}
		if(unitsNeeded >= 2)
		{
			maxExcNum = maxExcNum + 1;
			if(maxExcNum < 10)
			{
				nextExcNo = "EXC-FF-0000" + maxExcNum;
			}
			else if(maxExcNum < 100)
			{
				nextExcNo = "EXC-FF-000" + maxExcNum;
			}
			else if(maxExcNum < 1000)
			{
				nextExcNo = "EXC-FF-00" + maxExcNum;
			}
			else if(maxExcNum < 10000)
			{
				nextExcNo = "EXC-FF-0" + maxExcNum;
			}
			else
			{
				nextExcNo = "EXC-FF-" + maxExcNum;
			}
			newExceptionId = insert into Exception_Control1
			[
				Sales_Order=soVal
				SKU=skuVal
				PAC=pacVal
				Exception_Number=nextExcNo
				RR_No=input.RR
				PR=input.PR
				Supplier=prSupplierVal
				Demo1=input.Demo
				Order_Type=input.Order_Type
				DELIVERY_TYPE=input.Delivery_Type
				Source_Module="Checker_Checklist (QC Rejected)"
				Checker=input.Quality_Checker
				Remarks=input.Remarks
				Customer_Name=input.Customer_Name
				Customer_Type=input.Customer_Type
				Customer_Address=input.Customer_Address
				Item_to_Replace3=input.Item_to_Replace
				Quantity=input.Quantity_of_Damage_Items
				Item_to_Replace1=spareTypeVal
				Quantity_of_damage_spare_s=spareQtyVal
				Item_Name=input.Item_Name
				Qty=1
				Added_User=zoho.loginuser
			];
			info "Exception_Control1 record 2 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;
			// ADDED 2026-08-03, per user — ExceptionControl notification bell.
			newExcNotifId = insert into ExceptionControl_Notifications
			[
				Recipient_Email="homecartelff@gmail.com"
				Notification_Type="Exception Record Created"
				Message="New Exception Control record — " + soVal + " (" + input.Item_Name + ") — " + nextExcNo + "."
				Created_On=zoho.currenttime
				Read=false
				Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Exception_Control2?excRecordId=" + newExceptionId
				Source_Record_No=soVal
				Source_Record_ID=newExceptionId
			];
		}
		if(unitsNeeded >= 3)
		{
			maxExcNum = maxExcNum + 1;
			if(maxExcNum < 10)
			{
				nextExcNo = "EXC-FF-0000" + maxExcNum;
			}
			else if(maxExcNum < 100)
			{
				nextExcNo = "EXC-FF-000" + maxExcNum;
			}
			else if(maxExcNum < 1000)
			{
				nextExcNo = "EXC-FF-00" + maxExcNum;
			}
			else if(maxExcNum < 10000)
			{
				nextExcNo = "EXC-FF-0" + maxExcNum;
			}
			else
			{
				nextExcNo = "EXC-FF-" + maxExcNum;
			}
			newExceptionId = insert into Exception_Control1
			[
				Sales_Order=soVal
				SKU=skuVal
				PAC=pacVal
				Exception_Number=nextExcNo
				RR_No=input.RR
				PR=input.PR
				Supplier=prSupplierVal
				Demo1=input.Demo
				Order_Type=input.Order_Type
				DELIVERY_TYPE=input.Delivery_Type
				Source_Module="Checker_Checklist (QC Rejected)"
				Checker=input.Quality_Checker
				Remarks=input.Remarks
				Customer_Name=input.Customer_Name
				Customer_Type=input.Customer_Type
				Customer_Address=input.Customer_Address
				Item_to_Replace3=input.Item_to_Replace
				Quantity=input.Quantity_of_Damage_Items
				Item_to_Replace1=spareTypeVal
				Quantity_of_damage_spare_s=spareQtyVal
				Item_Name=input.Item_Name
				Qty=1
				Added_User=zoho.loginuser
			];
			info "Exception_Control1 record 3 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;
			// ADDED 2026-08-03, per user — ExceptionControl notification bell.
			newExcNotifId = insert into ExceptionControl_Notifications
			[
				Recipient_Email="homecartelff@gmail.com"
				Notification_Type="Exception Record Created"
				Message="New Exception Control record — " + soVal + " (" + input.Item_Name + ") — " + nextExcNo + "."
				Created_On=zoho.currenttime
				Read=false
				Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Exception_Control2?excRecordId=" + newExceptionId
				Source_Record_No=soVal
				Source_Record_ID=newExceptionId
			];
		}
		if(unitsNeeded >= 4)
		{
			maxExcNum = maxExcNum + 1;
			if(maxExcNum < 10)
			{
				nextExcNo = "EXC-FF-0000" + maxExcNum;
			}
			else if(maxExcNum < 100)
			{
				nextExcNo = "EXC-FF-000" + maxExcNum;
			}
			else if(maxExcNum < 1000)
			{
				nextExcNo = "EXC-FF-00" + maxExcNum;
			}
			else if(maxExcNum < 10000)
			{
				nextExcNo = "EXC-FF-0" + maxExcNum;
			}
			else
			{
				nextExcNo = "EXC-FF-" + maxExcNum;
			}
			newExceptionId = insert into Exception_Control1
			[
				Sales_Order=soVal
				SKU=skuVal
				PAC=pacVal
				Exception_Number=nextExcNo
				RR_No=input.RR
				PR=input.PR
				Supplier=prSupplierVal
				Demo1=input.Demo
				Order_Type=input.Order_Type
				DELIVERY_TYPE=input.Delivery_Type
				Source_Module="Checker_Checklist (QC Rejected)"
				Checker=input.Quality_Checker
				Remarks=input.Remarks
				Customer_Name=input.Customer_Name
				Customer_Type=input.Customer_Type
				Customer_Address=input.Customer_Address
				Item_to_Replace3=input.Item_to_Replace
				Quantity=input.Quantity_of_Damage_Items
				Item_to_Replace1=spareTypeVal
				Quantity_of_damage_spare_s=spareQtyVal
				Item_Name=input.Item_Name
				Qty=1
				Added_User=zoho.loginuser
			];
			info "Exception_Control1 record 4 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;
			// ADDED 2026-08-03, per user — ExceptionControl notification bell.
			newExcNotifId = insert into ExceptionControl_Notifications
			[
				Recipient_Email="homecartelff@gmail.com"
				Notification_Type="Exception Record Created"
				Message="New Exception Control record — " + soVal + " (" + input.Item_Name + ") — " + nextExcNo + "."
				Created_On=zoho.currenttime
				Read=false
				Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Exception_Control2?excRecordId=" + newExceptionId
				Source_Record_No=soVal
				Source_Record_ID=newExceptionId
			];
		}
		if(unitsNeeded >= 5)
		{
			maxExcNum = maxExcNum + 1;
			if(maxExcNum < 10)
			{
				nextExcNo = "EXC-FF-0000" + maxExcNum;
			}
			else if(maxExcNum < 100)
			{
				nextExcNo = "EXC-FF-000" + maxExcNum;
			}
			else if(maxExcNum < 1000)
			{
				nextExcNo = "EXC-FF-00" + maxExcNum;
			}
			else if(maxExcNum < 10000)
			{
				nextExcNo = "EXC-FF-0" + maxExcNum;
			}
			else
			{
				nextExcNo = "EXC-FF-" + maxExcNum;
			}
			newExceptionId = insert into Exception_Control1
			[
				Sales_Order=soVal
				SKU=skuVal
				PAC=pacVal
				Exception_Number=nextExcNo
				RR_No=input.RR
				PR=input.PR
				Supplier=prSupplierVal
				Demo1=input.Demo
				Order_Type=input.Order_Type
				DELIVERY_TYPE=input.Delivery_Type
				Source_Module="Checker_Checklist (QC Rejected)"
				Checker=input.Quality_Checker
				Remarks=input.Remarks
				Customer_Name=input.Customer_Name
				Customer_Type=input.Customer_Type
				Customer_Address=input.Customer_Address
				Item_to_Replace3=input.Item_to_Replace
				Quantity=input.Quantity_of_Damage_Items
				Item_to_Replace1=spareTypeVal
				Quantity_of_damage_spare_s=spareQtyVal
				Item_Name=input.Item_Name
				Qty=1
				Added_User=zoho.loginuser
			];
			info "Exception_Control1 record 5 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;
			// ADDED 2026-08-03, per user — ExceptionControl notification bell.
			newExcNotifId = insert into ExceptionControl_Notifications
			[
				Recipient_Email="homecartelff@gmail.com"
				Notification_Type="Exception Record Created"
				Message="New Exception Control record — " + soVal + " (" + input.Item_Name + ") — " + nextExcNo + "."
				Created_On=zoho.currenttime
				Read=false
				Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Exception_Control2?excRecordId=" + newExceptionId
				Source_Record_No=soVal
				Source_Record_ID=newExceptionId
			];
		}
	}
	return;
}
if(input.QC_Status != "Approved")
{
	info "QC Status is not Approved or Rejected — skipping sync.";
	return;
}
if(input.For_Crate == true)
{
	// ===== APPROVED + FOR CRATE -> Crate_Checklist =====
	// Per-item, matched SO+SKU+PAC. UPDATE-or-CREATE (2026-07-27, was skip-only
	// before): kung existing na ang Crate_Checklist record, ina-UPDATE ang lahat ng
	// field sa pinakabagong input, dahil possible na ma-edit ulit ang Checker_Checklist
	// record (hal. dinagdag lang ang Target Delivery Date matapos ma-Approve) at dapat
	// mag-propagate ang pagbabagong iyon papunta sa Crate_Checklist. Parehong pattern
	// gaya ng pick1_to_pack_sync.txt at pack_to_checker_checklist_sync.txt.
	alreadyExists = false;
	for each  existingRec in Crate_Checklist[SO == soVal && SKU == skuVal && Package_Order == pacVal]
	{
		alreadyExists = true;
		update existingRec
		[
			PR_if_any=input.PR
			RR_if_any=input.RR
			Order_Type=input.Order_Type
			Target_Delivery_Date=input.Target_Delivery_Date
			Delivery_Type=input.Delivery_Type
			Customer_Name=input.Customer_Name
			Customer_Address=input.Customer_Address
			Customer_Type=input.Customer_Type
			Item_Name=input.Item_Name
			Quantity=input.Quantity
			Assigned_Checker=input.Quality_Checker
		];
		info "Updated existing Crate_Checklist record for SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal;
	}
	if(alreadyExists == false)
	{
		newCrateId = insert into Crate_Checklist
		[
			SO=soVal
			Package_Order=pacVal
			PR_if_any=input.PR
			RR_if_any=input.RR
			Order_Type=input.Order_Type
			Target_Delivery_Date=input.Target_Delivery_Date
			Delivery_Type=input.Delivery_Type
			Customer_Name=input.Customer_Name
			Customer_Address=input.Customer_Address
			Customer_Type=input.Customer_Type
			Item_Name=input.Item_Name
			SKU=skuVal
			Quantity=input.Quantity
			Assigned_Checker=input.Quality_Checker
			Added_User=zoho.loginuser
		];
		info "Crate_Checklist record created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newCrateId;
	}
}
else
{
	// ===== APPROVED + NOT FOR CRATE -> Order_Aggregation1 (isang record per SO,
	// item rows idinadagdag sa Item_Details grid) =====
	// Bagong row na isusulat papunta sa grid, common sa both branches sa ibaba.
	newRow = Order_Aggregation1.Item_Details();
	newRow.Item_Name=input.Item_Name;
	newRow.SKU=skuVal;
	newRow.QTY=qtyNum;
	newRow.Bin_Location=input.Bin_Location;
	matchingAgg = Order_Aggregation1[SO == soVal];
	foundAgg = false;
	aggId = 0;
	for each  rec in matchingAgg
	{
		foundAgg = true;
		aggId = rec.ID;
	}
	if(foundAgg == false)
	{
		// ===== WALA PANG Order_Aggregation1 record sa SO na ito — gumawa ng bago,
		// may kasamang unang item row. =====
		rows = Collection();
		rows.insert(newRow);
		newAggId = insert into Order_Aggregation1
		[
			SO=soVal
			PAC=pacVal
			ORDER_TYPE=input.Order_Type
			Target_Date=input.Target_Delivery_Date
			PR=input.PR
			DEMO=input.Demo
			DELIVERY_TYPE=input.Delivery_Type
			Customer_Name=input.Customer_Name
			Customer_Address=input.Customer_Address
			Customer_Type=input.Customer_Type
			Item_Details=rows
			Added_User=zoho.loginuser
		];
		info "Order_Aggregation1 record created for SO " + soVal + ", new ID: " + newAggId + ", item " + skuVal + " added.";
	}
	else
	{
		// ===== MAY EXISTING Order_Aggregation1 record na sa SO na ito. =====
		// CONFIRMED SA LIVE TEST (2026-07-25): hindi pwedeng i-assign ang subform
		// field sa loob ng "update Form[criteria][field=value]" — Zoho error:
		// "The field(s) 'Item_Details' isn't supported for Update MultiColumn
		// task." Kaya sa halip na i-update ang record sa lugar, DELETE-then-
		// RE-INSERT na lang ang buong record.
		// UPDATE (2026-07-27): dati, basta kinokopya lang PABALIK ang LUMANG halaga ng
		// lahat ng top-level field (parang walang nagbago) — kaya kung na-edit ang
		// Checker_Checklist record pagkatapos ma-Approve (hal. dinagdag lang ang Target
		// Delivery Date), hindi ito na-uupdate sa Order_Aggregation1. Ngayon, ang mga
		// field na may live source sa Checker_Checklist (PAC, Order Type, Target Date,
		// PR, Demo, Delivery Type, Customer details) ay kinukuha na sa PINAKABAGONG
		// input sa halip na sa lumang record. For_Crate at Dispatch_Selected LANG ang
		// tunay na pina-preserve: For_Crate dahil manual/independent na desisyon ito sa
		// Order_Aggregation1 mismo (posibleng itinakda ng TRUE ng ibang crate item ng
		// parehong SO via crate_checklist_to_order_aggregation_sync.txt — hindi dapat
		// ma-reset kahit ang kasalukuyang item ay hindi For Crate), at Dispatch_Selected
		// dahil manual-only field ito ng Order Aggregation team, walang source kahit saan.
		fullAgg = Order_Aggregation1[ID == aggId];
		existingRows = List();
		forCratePreserved = "";
		dispatchSelectedPreserved = "";
		for each  fullRec in fullAgg
		{
			existingRows = fullRec.Item_Details;
			forCratePreserved = fullRec.For_Crate;
			dispatchSelectedPreserved = fullRec.Dispatch_Selected;
		}
		// I-rebuild ang bawat existing row gamit ang parehong CONFIRMED-safe paraan
		// (Form.Subform() + field assignment) na ginamit sa "wala pang record" na
		// branch sa itaas. Kung PAREHONG SKU ng kasalukuyang item ang isang row,
		// i-UPDATE ang laman nito (Item_Name/QTY/Bin_Location) sa halip na magdagdag ng
		// duplicate row.
		rebuiltRows = Collection();
		rowUpdated = false;
		for each  rowItem in existingRows
		{
			r = Order_Aggregation1.Item_Details();
			r.Item_Name=rowItem.Item_Name;
			r.SKU=rowItem.SKU;
			r.QTY=rowItem.QTY;
			r.Bin_Location=rowItem.Bin_Location;
			r.Select1=rowItem.Select1;
			existingSku = rowItem.SKU + "";
			if(existingSku == skuVal)
			{
				r.Item_Name=input.Item_Name;
				r.QTY=qtyNum;
				r.Bin_Location=input.Bin_Location;
				rowUpdated = true;
			}
			rebuiltRows.insert(r);
		}
		if(rowUpdated == false)
		{
			rebuiltRows.insert(newRow);
		}
		delete from Order_Aggregation1[ID == aggId];
		newAggId = insert into Order_Aggregation1
		[
			SO=soVal
			PAC=pacVal
			ORDER_TYPE=input.Order_Type
			Target_Date=input.Target_Delivery_Date
			For_Crate=forCratePreserved
			PR=input.PR
			DEMO=input.Demo
			DELIVERY_TYPE=input.Delivery_Type
			Dispatch_Selected=dispatchSelectedPreserved
			Customer_Name=input.Customer_Name
			Customer_Address=input.Customer_Address
			Customer_Type=input.Customer_Type
			Item_Details=rebuiltRows
			Added_User=zoho.loginuser
		];
		if(rowUpdated == true)
		{
			info "Order_Aggregation1 record for SO " + soVal + " updated — item " + skuVal + " row refreshed, top-level fields synced (old ID " + aggId + " deleted, new ID " + newAggId + ").";
		}
		else
		{
			info "Item " + skuVal + " added — Order_Aggregation1 record for SO " + soVal + " recreated (old ID " + aggId + " deleted, new ID " + newAggId + ").";
		}
	}
}

````
