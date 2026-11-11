---
title: "shipments_auto_create_supplier_shipment"
source_file: "shipments_auto_create_supplier_shipment.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 133
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# shipments_auto_create_supplier_shipment

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `shipments_auto_create_supplier_shipment.txt`
> - **Lines of Code:** 133
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== New 2026-07-21, per user (Supplier Shipment self-report feature, see plan.txt) ==
== Auto-creates the matching Fenteng_Shipment/Tony_Shipment record the moment a
   Shipments record is created, pre-populated with that supplier's own line items
   so the supplier only has to check boxes and fill dates — never add rows
   themselves. ==

====================================================
WORKFLOW SETUP
  Name: Shipment_Populate_Receiving (NEW, standalone — see FIXED note below for
  why this moved off the original Shipment_Populate_Receiving workflow)
  Form: Shipments
  Trigger: Created > Successful form submission
  Contains BOTH Action 1 (Receiving creation, copied verbatim from
  shipment_populate_receiving.txt, unchanged) and Action 2 (this file's own body,
  below) as two script blocks in this one workflow.
  IMPORTANT: once this is confirmed working, DISABLE (don't delete) the original
  Shipment_Populate_Receiving workflow — leaving both enabled would fire Action 1's
  Receiving-creation logic twice per Shipment (once from each workflow), risking
  duplicate Receiving records.
====================================================

/* resolves RR_No ONCE here, off `input` (safe direct dot-through on a lookup field,
   per this app's own established "works on input, not on a re-fetched record"
   convention) — only real when this Shipment traces back to a replacement PO.
   Deliberately NOT re-derived later at sync time by reading a subform off a
   criteria-queried record (confirmed-unreliable elsewhere in this codebase) —
   computed once here, stamped onto each row, done. */
rrNoForShip = input.PO_No.RR_Reference_No + "";
if(rrNoForShip == "null")
{
	rrNoForShip = "";
}

/* Shipments is per-supplier at the HEADER level (input.Supplier is a plain text
   field on the aggregate record itself — confirmed via the live schema dump in
   plan.txt, no per-line Supplier column exists on PO_Shipments) — so the WHOLE
   PO_Shipments list belongs to one supplier, no need to split it. NOTE: both forms'
   real link name for this field is Added_User1 (not Added_User) — confirmed live on
   BOTH Fenteng_Shipment and Tony_Shipment (an earlier version of this note wrongly
   said Tony's was plain Added_User — corrected by the user directly). */
/* FIXED 2026-08-12, real bug found live (SHP-00004, stock-item replacement
   shipment never appeared in Tony Fan's Supplier Portal) — input.Supplier can
   hold the short code ("Tony"/"Fenteng") or the full Suppliers-form name
   ("Tony Fan"/"Fenteng Lighting") depending on record history, same root
   cause already fixed in clone_shipment_for_replacement.txt's supStatus/
   Tony_Shipment branches on 2026-08-07. Old strict == silently matched
   NEITHER branch for the full-name case, so no Fenteng_Shipment/Tony_Shipment
   record was created at all for that Shipment — confirmed live via the
   supplier's own portal tiles showing 0 pending / one shipment short. Cast to
   string once, match with contains() as a fallback, same pattern as the rest
   of this codebase. */
shipSupplierVal = input.Supplier + "";
if(shipSupplierVal == "Fenteng" || shipSupplierVal.contains("Fenteng"))
{
	newSuppRecID = insert into Fenteng_Shipment
	[
		Shipment_No = input.Shipment_No
		Added_User1 = zoho.loginuser
	];
	newSuppRec = Fenteng_Shipment[ID == newSuppRecID];
	for each  li in input.PO_Shipments
	{
		row = Fenteng_Shipment.Supplier1_Shipment_Details();
		row.SKU = li.SKU;
		row.Item_Name = li.Item_Name;
		row.PR_No = li.PR_No;
		row.RR_No = rrNoForShip;
		newSuppRec.Supplier1_Shipment_Details.insert(row);
	}
}
else if(shipSupplierVal == "Tony" || shipSupplierVal.contains("Tony"))
{
	newSuppRecID = insert into Tony_Shipment
	[
		Shipment_No = input.Shipment_No
		Added_User1 = zoho.loginuser
	];
	newSuppRec = Tony_Shipment[ID == newSuppRecID];
	for each  li in input.PO_Shipments
	{
		row = Tony_Shipment.Supplier2_Shipment_Details();
		row.SKU = li.SKU;
		row.Item_Name = li.Item_Name;
		row.PR_No = li.PR_No;
		row.RR_No = rrNoForShip;
		newSuppRec.Supplier2_Shipment_Details.insert(row);
	}
}

====================================================
FIXED 2026-07-21, real multi-round bug found live, several rounds of debugging:
(1) Original diagnosis: `insert into Fenteng_Shipment[...]`/`insert into
   Tony_Shipment[...]` header blocks had gained an extra `Added_User=zoho.loginuser`
   line, a field neither form actually had — aborting the whole insert for BOTH
   suppliers (confirmed via direct API check, zero records either side). Also, the
   Fenteng branch's row-insert had been mangled to a bare `insert(row);` instead of
   `newSuppRec.Supplier1_Shipment_Details.insert(row);`.
(2) Removed `Added_User` and re-pasted — confirmed working via a manually
   API-created test Shipment (Tony_Shipment got a real record with correct SKU/
   PR_No data). BUT on the next real "Create PO" flow test, the line had REAPPEARED
   in the live saved action on its own, breaking it again — confirmed genuinely
   reproducible (not a one-off paste mistake) even after creating a brand NEW
   workflow (Shipment_Populate_Receiving_V2) from scratch and pasting fresh: Creator's
   own script editor auto-reinserts `Added_User=zoho.loginuser` into `insert into
   Form[...]` blocks, apparently because that's a common field pattern across other
   forms in this app (confirmed used successfully in 8 other files, e.g.
   pr_to_po_grouping.txt's `insert into Purchase_Order[...]`) — some kind of
   editor-level autocomplete/suggestion that self-applies regardless of manual
   deletion. Never resolved WHY it does this, only worked around it.
(3) REAL FIX: stopped fighting the auto-insert — added a genuine `Added_User` field
   to both forms instead (Single Line Text, Form Builder UI), so the auto-inserted
   line becomes harmless rather than fatal. Discovered live the two forms got
   DIFFERENT real link names for it: `Fenteng_Shipment.Added_User1` (note the "1"
   suffix — Creator auto-appended it, unclear why) vs `Tony_Shipment.Added_User`
   (no suffix). Script above now explicitly uses the correct name per branch.
Also fixed in the same pass: the Fenteng branch's broken `insert(row);` call.
====================================================
NOTES:
- Deliberately does NOT pre-fill Date_Shipped/Shipment_Mode/Select_To_Ship/Synced —
  those start blank/false, the supplier fills them in via their own widget.
- Matches this Shipment_No field back onto the new supplier record's own
  Shipment_No (plain text mirror, not a lookup — same convention as PO_No_Supplier1
  elsewhere) — this is the link key `supplier_shipment_sync.txt` and
  `shipment_status_back_sync.txt` both use to find each other.
- Prerequisite: `Fenteng_Shipment`/`Tony_Shipment` forms must exist first — see
  `supplier_shipment_forms.txt`.
- Fires alongside (not instead of) `Shipment_Populate_Receiving`'s own Action 1 body
  — pasted as Action 2 of that SAME workflow (see WORKFLOW SETUP above), doesn't
  touch the Receiving-creation logic in Action 1 at all.
- No dedup guard — Created triggers fire exactly once per record by nature, same
  as every other Created-trigger action in this app.
- UNTESTED — first time this action has been written or pasted.
====================================================

````
