---
title: "shipment_status_back_sync"
source_file: "shipment_status_back_sync.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 122
tags:
  - deluge
  - fulfillment
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
---

# shipment_status_back_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `shipment_status_back_sync.txt`
> - **Lines of Code:** 122
> - **Tags:** `#deluge`, `#fulfillment`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== New 2026-07-21, per user (Supplier Shipment self-report feature, see plan.txt) ==
== Buyer/shipment team sets Status ("In Transit"/"Arrived") on the parent
   Shipments.Supplier_Shipment_Details row -> pushes back onto the matching
   Fenteng_Shipment/Tony_Shipment row so the supplier sees it reflected in their
   own widget, per plan.txt lines 553-554 ("Arrived... it will reflect to supplier
   when save"). ==

====================================================
WORKFLOW SETUP
  Name: Shipment_Status_Back_Sync
  Form: Shipments
  Trigger: Edited > Successful form submission
  Action: Execute script
====================================================

/* FIXED 2026-08-05, real bug found live in Production, same root cause as
   receiving_sync_shipment_arrived.txt's own matching fix (see that file's NOTES for
   the full writeup) — this used to read input.Supplier_Shipment_Details expecting
   per-line PR_No/RR_No/SKU/Status columns, but that subform genuinely only has ONE
   field, Shipment_ID (confirmed live via API dump) — every key computed was the
   garbage string "||" and this whole workflow silently did nothing since the day it
   was pasted. The REAL buyer-editable per-line status field is Line_Status on the
   PO_Shipments subform (confirmed live: choices In Transit/Partial/Arrived/Received,
   see UI/EndUser/Shipments/app/index.html's own field dump) — switched to read that
   instead. PO_Shipments has no RR_No column at all, so the match key here drops RR_No
   (PR_No+SKU only) — a real, accepted precision loss vs the supplier-side subform's
   own RR_No, but there's no RR_No data available on PO_Shipments to match with in the
   first place. */
statusMapBS = Map();
for each  sr in input.PO_Shipments
{
	if(sr.Line_Status != null && sr.Line_Status != "")
	{
		keyBS = (sr.PR_No + "") + "|" + (sr.SKU + "");
		statusMapBS.put(keyBS, sr.Line_Status);
	}
}

if(statusMapBS.size() > 0)
{
	/* FIXED 2026-08-07, real bug found via codebase-wide audit (same class as the
	   already-fixed approvePOMain crash): Shipments.Supplier is the bare short name
	   for a normal PR-approval-created shipment, but a REPLACEMENT shipment (created
	   by clone_shipment_for_replacement.txt via Supplier=r.RR_Supplier) can carry the
	   full Suppliers-form name instead — confirmed live in Production that this whole
	   chain (Product_Context1.Supplier -> RR_Supplier -> Shipments.Supplier) can hold
	   either shape. Old strict == silently skipped the status-sync-back for any
	   replacement shipment that hit the full-name shape. */
	inputSupplierValBS = input.Supplier + "";
	if(inputSupplierValBS == "Fenteng" || inputSupplierValBS.contains("Fenteng"))
	{
		suppRecBS = Fenteng_Shipment[Parent_Shipment_ID == input.ID + ""];
		for each  row in suppRecBS.Supplier1_Shipment_Details
		{
			rowKeyBS = (row.PR_No + "") + "|" + (row.SKU + "");
			newStatusBS = statusMapBS.get(rowKeyBS);
			if(newStatusBS != null)
			{
				row.Status = newStatusBS;
			}
		}
	}
	else if(inputSupplierValBS == "Tony" || inputSupplierValBS.contains("Tony"))
	{
		suppRecBST = Tony_Shipment[Parent_Shipment_ID == input.ID + ""];
		for each  rowT in suppRecBST.Supplier2_Shipment_Details
		{
			rowKeyBST = (rowT.PR_No + "") + "|" + (rowT.SKU + "");
			newStatusBST = statusMapBS.get(rowKeyBST);
			if(newStatusBST != null)
			{
				rowT.Status = newStatusBST;
			}
		}
	}
}

====================================================
FIXED 2026-07-21, before this was ever pasted live - caught proactively while
prepping the next deploy step, after `supplier_shipment_sync.txt` hit real live
errors on the identical shape twice: `suppRecBS = Fenteng_Shipment[...]; if(suppRecBS
!= null) {...}` (direct single-record assignment immediately followed by a
null-check on a RECORD-typed variable) fails to parse in a native workflow's
Execute Script box - confirmed root cause, see supplier_shipment_sync.txt's own
FIXED note for the full writeup. Removed both null-checks (`suppRecBS`/
`suppRecBST`) - now direct-assigned and used immediately with no guard, matching
this app's dominant proven convention (trust the fetch, e.g.
shipments_auto_create_supplier_shipment.txt's `newSuppRec`). Safe here since
`input.Shipment_No` always matches a real supplier record - it's the same
Shipments record that auto-created it. `newStatusBS`/`newStatusBST` null-checks
are UNCHANGED and fine - those are PRIMITIVES (Map.get() results), not records,
the confirmed-safe case.
====================================================
NOTES:
- Matching key deliberately PR_No+RR_No+SKU, not Shipment_ID - the supplier's own
  form (Fenteng_Shipment/Tony_Shipment) never stores the generated Shipment_ID
  anywhere (it's only ever written onto the PARENT's Supplier_Shipment_Details row
  at sync time, per supplier_shipment_sync.txt) - adding it back would need a
  4th field + another sync leg for no real benefit, since PR_No+RR_No+SKU already
  uniquely identifies one supplier-side row in practice (one row = one line item on
  one PO, RR_No blank string for a normal non-replacement shipment - two blank
  RR_Nos with the same PR_No+SKU shouldn't coexist since a PO only lists a given
  SKU once per PR_No).
- Same flat/single-loop-then-single-loop shape as supplier_shipment_sync.txt -
  statusMapBS built from `input` (always safe), then ONE non-nested for each per
  supplier branch mutates that branch's own live loop variable directly - proven
  safe existing-row-mutation shape, no nesting.
- Only pushes rows that have a real Status value in the map AND a matching row on
  the supplier side - a Shipments row with a blank Status, or one that doesn't
  match any supplier row (e.g. stale data), is silently left alone, doesn't clear
  anything.
- Fires on every Shipments edit, not just ones that actually touch Status - cheap
  no-op for edits that don't change Supplier_Shipment_Details (statusMapBS just
  gets rebuilt identically, no writes happen unless something actually changed
  value... note this DOES re-write every synced row's Status on every unrelated
  Shipments save, since there's no diff-check - harmless (same value written back)
  but not a true no-op at the API level. Acceptable per this app's existing
  "the last-write-wins recompute is fine, it's the same value" convention used in
  several other always-recompute workflows (Shipment/Receiving totals etc.) - flag
  if this ever needs tightening to an equality-guarded write instead.
- UNTESTED - first time this workflow has been written or pasted.
====================================================

````
