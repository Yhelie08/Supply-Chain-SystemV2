---
title: "shipment_populate_receiving"
source_file: "shipment_populate_receiving.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 161
tags:
  - deluge
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# shipment_populate_receiving

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `shipment_populate_receiving.txt`
> - **Lines of Code:** 161
> - **Tags:** `#deluge`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Shipments -> Receiving: push-populate on Shipment Created/Edited ==
== Reverse direction of receiving_shipment_populate.txt (that one pulls on user pick;
   this one pushes automatically from the Shipment side) ==

====================================================
WORKFLOW SETUP — Shipment_Populate_Receiving
  Form: Shipments
  Trigger: Created > Successful form submission
  Action: Execute script
====================================================

/* CHANGED 2026-07-20, per user — "same RCV" replacement cycle. A 2nd (or Nth)
   Shipment created for a PO_No that ALREADY has a Receiving record (the cloned
   "replacement shipment", see the Clone Shipment mechanism) must NOT spawn a
   second RCV — it routes into the SAME existing Receiving record instead.
   Deliberately does NOT touch Receiving_Line_Items/Expected_Qty at all: the
   replacement unit(s) aren't a NEW quantity on top of the original order, they
   REPLACE the damaged/missing units on the SAME line — Expected_Qty must stay
   as-is or the Accepted+Damage+Missing=Expected invariant (Receiving_Validate_Qty)
   breaks once the officer re-inspects. Only re-points Receiving.Shipments at the
   new Shipment (so the officer's next open + the Shipment_Mode_When_Received
   reverse-sync both target the shipment actually in flight now). */
existingRecvForPO = Receiving[PO_No == input.PO_No.PO_No];
if(existingRecvForPO.count() > 0)
{
	for each  existingRecvRoute in existingRecvForPO
	{
		update existingRecvRoute
		[
			Shipments = input.ID
		];
	}
	selfRecRoute = Shipments[ID == input.ID];
	selfRecRoute.Receiving_Record_Created = true;
	input.Receiving_Record_Created = true;
	return;
}
newRecvID = insert into Receiving
[
	Shipments = input.ID
	SO_No = input.Sales_Order
	PO_No = input.PO_No.PO_No
	Customer_Name = input.Customer
	Supplier = input.Supplier
];
newRecv = Receiving[ID == newRecvID];
for each  li in input.PO_Shipments
{
	row = Receiving.Receiving_Line_Items();
	row.PR_No = li.PR_No;
	row.SKU = li.SKU;
	row.Item_Name = li.Item_Name;
	row.Expected_Qty = li.Shipment_QTY;
	newRecv.Receiving_Line_Items.insert(row);
}
selfRec = Shipments[ID == input.ID];
selfRec.Receiving_Record_Created = true;
input.Receiving_Record_Created = true;

====================================================
WORKFLOW SETUP — Shipment_Edited_Sync_Receiving
  Form: Shipments
  Trigger: Edited > Successful form submission
  Action: Execute script
====================================================

recvRecs = Receiving[Shipments == input.ID];
for each  r in recvRecs
{
	update r
	[
		SO_No = input.Sales_Order
		PO_No = input.PO_No.PO_No
		Customer_Name = input.Customer
		Supplier = input.Supplier
	];
	/* FIXED 2026-07-23, real bug found live ("wait why the expected here became 1
	   this is 2 right?") — this loop used to unconditionally overwrite an
	   ALREADY-EXISTING line's Expected_Qty with li.Shipment_QTY on every single
	   Shipments edit. Harmless historically (one Shipment was always 1:1 with one
	   fresh Receiving line, so Shipment_QTY genuinely WAS the expected qty) — but
	   broke for real the moment the "same RCV, same PO" replacement-recycle
	   architecture (2026-07-20) made it possible for a 2ND Shipment (the cloned
	   replacement, deliberately a SMALLER qty — only the damaged/missing units,
	   not the full original order) to point at the SAME Receiving record. Any
	   edit on that replacement Shipment (e.g. cloneShipmentForReplacement's own
	   `newShipRec.Receiving_Record_Created=true;` write, made right after
	   re-pointing Receiving.Shipments at it) fired THIS workflow, which then
	   clobbered the original line's real Expected_Qty (2) down to the
	   replacement's own smaller Shipment_QTY (1) — confirmed live via direct API
	   diff, 1+0+1 no longer equalled the record's own Expected_Qty, an invariant
	   Receiving_Validate_Qty is supposed to guarantee. This is the EXACT same
	   principle the sibling Created-trigger action (Shipment_Populate_Receiving,
	   right above this one in the same file) already got right in its own 2026-
	   07-20 fix ("Expected_Qty must stay as-is") — just never applied here too.
	   Fixed: an ALREADY-EXISTING line's Expected_Qty is never touched again once
	   set; only a genuinely NEW line (no existing PR_No+SKU match at all) gets
	   Expected_Qty initialized from Shipment_QTY, same as before. */
	for each  li in input.PO_Shipments
	{
		matched = false;
		for each  existingRow in r.Receiving_Line_Items
		{
			if(existingRow.PR_No == li.PR_No && existingRow.SKU == li.SKU)
			{
				matched = true;
			}
		}
		if(matched == false)
		{
			newRow = Receiving.Receiving_Line_Items();
			newRow.PR_No = li.PR_No;
			newRow.SKU = li.SKU;
			newRow.Item_Name = li.Item_Name;
			newRow.Expected_Qty = li.Shipment_QTY;
			r.Receiving_Line_Items.insert(newRow);
		}
	}
}

====================================================
NOTES:
- DESIGN CHOICE (confirmed by user 2026-07-02, final answer after weighing both options):
  Edited sync only UPDATES Expected_Qty on matching rows (matched by PR_No + SKU) and
  ADDS rows for new lines. Never touches Accepted_Qty, Damage_Qty, Missing_Qty,
  Bin_location, Line_Result, or any other inspection field already filled in on
  Receiving_Line_Items. (Briefly tried full-rebuild-on-edit per an earlier answer, then
  reverted back to this once the data-loss tradeoff was spelled out — full rebuild wipes
  in-progress inspection work any time the Shipment is edited for any reason, e.g. ETA.)
- Does NOT remove Receiving_Line_Items rows for lines removed from the Shipment (e.g.
  a PR line deleted from Shipment Line Items) — deleting inspection rows automatically
  felt riskier than leaving a stale row. Manual cleanup if a line is fully removed.
- Created path guards nothing explicitly (it's a Created trigger, fires once naturally)
  but still sets Receiving_Record_Created = true afterward, matching the checkbox
  already present on the Shipments form (per form-builder screenshot) — in case other
  workflows/reports depend on that flag.
- Same input.field + fetched-record double-set pattern as create_estimates_button.txt's
  Trigger_Estimate reset (input.field=value alone is not trusted to persist reliably
  post-submission in this codebase's established pattern — fetch self and set both).
- Uses plain `insert into Receiving [...]` / `Receiving[Shipments == input.ID]` — NOT
  zoho.creator.v2_1.* or invokeurl — because Shipments and Receiving are in the SAME
  Creator app (unlike the Books-side SO_To_PR cross-app calls).
- Receiving[Shipments == input.ID]: Shipments field on Receiving is itself a
  lookup/picklist (values = Shipments.ID), so comparing it against input.ID (a NUMBER,
  this Shipment's own ID) is NUMBER == NUMBER — not the STRING/lookup BIGINT mismatch
  case documented in CLAUDE.md Deluge Gotchas (that one is about comparing a lookup
  field to a STRING).
- `update r [...]` multi-column task confirmed OK in "Edited > Successful form
  submission" (unlike Load of form / User input of X) — same as PR_Changed in
  purchase_request_scripts1.txt.
- Subform field link names: input.PO_Shipments (label "Shipment Line Items" on
  Shipments) with columns PR_No/SKU/Item_Name/Ordered_QTY/Shipment_QTY/Remaining_QTY/
  Shipping_Mode/Line_Status/Fully_Shipped (confirmed, ShipmentLineItemsFields.txt).
  Receiving.Receiving_Line_Items columns per raw form dump — only PR_No/SKU/Item_Name/
  Expected_Qty populated here, same subset as receiving_shipment_populate.txt.
- This script does NOT depend on receiving_shipment_populate.txt's "User input of
  Shipments" trigger — backend `insert into Receiving [...]` does not fire that
  client-side trigger type, so the population logic is duplicated here directly
  (same pattern as PR_Populate_From_PR / SO_To_PR both independently building supplier
  PR records rather than one triggering the other).
====================================================

````
