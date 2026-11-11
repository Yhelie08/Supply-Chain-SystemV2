---
title: "receiving_sync_shipment_arrived"
source_file: "receiving_sync_shipment_arrived.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 133
tags:
  - custom-api
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# receiving_sync_shipment_arrived

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `receiving_sync_shipment_arrived.txt`
> - **Lines of Code:** 133
> - **Tags:** `#custom-api`, `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Receiving_Sync_Shipment_Arrived ==
== New 2026-07-22, per user request ==
== When a Receiving line is fully accounted for physically (nothing Missing — Damage
   is fine, damaged goods still arrived), auto-flip that item's Status on the parent
   Shipments.Supplier_Shipment_Details row to "Arrived", and push the same onto the
   matching Fenteng_Shipment/Tony_Shipment row so the supplier sees it too (same
   "reflect to supplier" loop shipment_status_back_sync.txt already does for a manual
   buyer-set status — this is the automatic trigger for the same outcome). ==

====================================================
WORKFLOW SETUP
  Name: Receiving_Sync_Shipment_Arrived
  Form: Receiving
  Trigger: Created or Edited > Successful form submission
  Action: Execute script
  (separate NAMED action, same trigger type as this form's existing
  Receiving_Sync_Shipment_Mode / Receiving_Sync_Product_Context / Damage_Missing_Details
  actions — no ordering dependency on any of them, reads only from input directly)
====================================================

arrMapRA = Map();
for each  rlRA in input.Receiving_Line_Items
{
	if(rlRA.PR_No != null && rlRA.PR_No != "" && rlRA.Expected_Qty != null && rlRA.Expected_Qty > 0)
	{
		missingQtyRA = rlRA.Missing_Qty;
		if(missingQtyRA == null)
		{
			missingQtyRA = 0;
		}
		if(missingQtyRA == 0)
		{
			keyRA = (rlRA.PR_No + "") + "|" + (rlRA.RR_No + "") + "|" + (rlRA.SKU + "");
			arrMapRA.put(keyRA, true);
		}
	}
}

if(arrMapRA.size() > 0)
{
	/* FIXED 2026-08-05, real bug found live in Production: Shipments.Supplier_Shipment_Details
	   (the subform this used to loop here) does NOT have PR_No/RR_No/SKU/Status columns at
	   all — confirmed via a live API dump, it only ever holds one field, Shipment_ID (see
	   supplier_shipment_sync.txt's own header comment, "appends a row to the PARENT
	   Shipments.Supplier_Shipment_Details, [holding] Shipment_ID"). The old code below dot-read
	   spLineRA.PR_No/.RR_No/.SKU/.Status off that subform — none of those fields exist there,
	   so every key computed was just the garbage string "||" and never matched arrMapRA's real
	   keys (built from Receiving_Line_Items, which DOES have these fields) — this whole block
	   silently did nothing on every run, regardless of Missing_Qty. Confirmed live: both
	   SHP-00001 and SHP-00004's Receiving lines have Missing_Qty=0 (should have auto-flipped),
	   but Tony_Shipment.Supplier2_Shipment_Details.Status stayed "In Transit"/blank on both.
	   FIX: skip the parent Supplier_Shipment_Details subform read entirely (it was never the
	   right place to look) — go straight from arrMapRA (already correctly keyed, built from
	   Receiving's own line data above) to the supplier-side subform, same as before. */
	shipRecRA = Shipments[ID == input.Shipments];
	/* FIXED 2026-08-07, real bug found via codebase-wide audit (same class as the
	   already-fixed approvePOMain crash): Shipments.Supplier can be the short name
	   or the full Suppliers-form name (replacement shipments inherit RR_Supplier,
	   which can hold either shape, confirmed live in Production). Old strict ==
	   silently skipped the Arrived auto-flip for any replacement shipment that hit
	   the full-name shape. */
	shipSupplierValRA = shipRecRA.Supplier + "";
	if(shipSupplierValRA == "Fenteng" || shipSupplierValRA.contains("Fenteng"))
	{
		suppRecRA = Fenteng_Shipment[Parent_Shipment_ID == shipRecRA.ID + ""];
		for each  rowRA in suppRecRA.Supplier1_Shipment_Details
		{
			rowKeyRA = (rowRA.PR_No + "") + "|" + (rowRA.RR_No + "") + "|" + (rowRA.SKU + "");
			okRA = arrMapRA.get(rowKeyRA);
			if(okRA == true && rowRA.Status != "Arrived")
			{
				rowRA.Status = "Arrived";
			}
		}
	}
	else if(shipSupplierValRA == "Tony" || shipSupplierValRA.contains("Tony"))
	{
		suppRecRAT = Tony_Shipment[Parent_Shipment_ID == shipRecRA.ID + ""];
		for each  rowRAT in suppRecRAT.Supplier2_Shipment_Details
		{
			rowKeyRAT = (rowRAT.PR_No + "") + "|" + (rowRAT.RR_No + "") + "|" + (rowRAT.SKU + "");
			okRAT = arrMapRA.get(rowKeyRAT);
			if(okRAT == true && rowRAT.Status != "Arrived")
			{
				rowRAT.Status = "Arrived";
			}
		}
	}
}

====================================================
NOTES:
- RULE (confirmed with user via AskUserQuestion 2026-07-22): a line auto-flips to
  "Arrived" when Missing_Qty == 0 — i.e. Accepted_Qty + Damage_Qty >= Expected_Qty.
  Damage does NOT block the flip — damaged goods still physically arrived, only
  Missing (truly absent) means the shipment isn't fully arrived. Deliberately NOT
  `Accepted_Qty == Expected_Qty` (would wrongly withhold Arrived on a line with real,
  legitimate Damage).
- ONE-WAY ONLY: `spLineRA.Status != "Arrived"` guard means this never downgrades an
  already-Arrived row, and never touches a row this map doesn't cover (a partial line
  with real Missing_Qty > 0 is silently left alone, not reset to blank/In Transit).
- MATCHING KEY: PR_No|RR_No|SKU, same 3-part key as shipment_status_back_sync.txt
  (not Shipment_ID — same reasoning as that file: the supplier form never stores the
  generated Shipment_ID, and RR_No is included so a replacement-shipment row and a
  normal row for the same PR_No+SKU can never collide).
- WHY THIS PUSHES TO THE SUPPLIER FORM DIRECTLY, not just Shipments: this script runs
  on RECEIVING's own workflow and writes cross-form into Shipments — per this app's
  own documented gotcha, a Deluge cross-form write does NOT reliably trigger the
  target form's own workflows, so relying on Shipment_Status_Back_Sync (Shipments
  Edited > Successful form submission) to cascade from here would silently no-op.
  This script pushes to Fenteng_Shipment/Tony_Shipment directly instead, duplicating
  shipment_status_back_sync.txt's own small push block inline (same manually-
  maintained-mirror convention used elsewhere in this app, e.g. pr_approve_po_
  custom_api.txt mirroring pr_to_po_grouping.txt).
- SHAPE: map-built-first-then-single-non-nested-loop, same proven-safe pattern as
  receiving_sync_shipment_mode.txt / shipment_status_back_sync.txt. 3 separate
  top-level loops (arrMapRA build, shipRecRA.Supplier_Shipment_Details mutate,
  suppRecRA's own subform mutate) — never nested inside each other, avoids the
  confirmed-broken nested-subform-mutation shape (Product_Context1 saga).
- Record variables (`shipRecRA`, `suppRecRA`, `suppRecRAT`) are direct-assigned and
  used immediately with NO null-check — confirmed via this app's own saga (see
  reference-deluge-quirks memory) that `if(recordVar != null)` fails to parse in a
  native workflow Execute Script box. Safe here since `input.Shipments` always points
  to a real Shipments record, and `shipRecRA.Shipment_No` always matches a real
  supplier record once creation is correctly paired (see the 2026-07-22 stale-
  Shipment_No data-drift fix — this is exactly why keeping Shipment_No in sync
  matters going forward).
- UNTESTED — first time this workflow has been written or pasted. Needs: paste as a
  new named action on Receiving (Created or Edited > Successful form submission),
  then a live Receiving save where a line's Missing_Qty is 0 and Expected_Qty > 0,
  confirm the matching Shipments.Supplier_Shipment_Details row flips to "Arrived" and
  the matching Fenteng_Shipment/Tony_Shipment row reflects it too.
====================================================

````
