---
title: "receiving_sync_shipment_mode"
source_file: "receiving_sync_shipment_mode.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 76
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
---

# receiving_sync_shipment_mode

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `receiving_sync_shipment_mode.txt`
> - **Lines of Code:** 76
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Receiving_Sync_Shipment_Mode ==
== New 2026-07-16, per user request ==

WORKFLOW SETUP:
  Form: Receiving
  Trigger: Created or Edited > Successful form submission
  Action name: Receiving_Sync_Shipment_Mode

PREREQUISITE (already done by user): new Dropdown field `Shipment_Mode_When_Received`
(choices: Airfreight / LCL / FCL) added to BOTH `Receiving_Line_Items` (Receiving's own
subform) and `Shipments.PO_Shipments` (Shipments' own subform). Same 3 choices as the
existing `Shipping_Mode` field (PO_Line_Items / PO_Shipments) — this is a SEPARATE field,
capturing what mode was actually used at receiving/inspection time, not the originally
planned/quoted mode carried down from the PO.

====================================================
PASTE BELOW (Created or Edited > Successful form submission, Receiving form)
====================================================

modeMap = Map();
for each  rl in input.Receiving_Line_Items
{
	if(rl.PR_No != null && rl.PR_No != "" && rl.Shipment_Mode_When_Received != null && rl.Shipment_Mode_When_Received != "")
	{
		modeMap.put(rl.PR_No, rl.Shipment_Mode_When_Received);
	}
}
if(modeMap.size() > 0)
{
	shipRecSM = Shipments[ID == input.Shipments];
	if(shipRecSM != null)
	{
		for each  shipLine in shipRecSM.PO_Shipments
		{
			modeVal = modeMap.get(shipLine.PR_No);
			if(modeVal != null)
			{
				shipLine.Shipment_Mode_When_Received = modeVal;
			}
		}
	}
}

====================================================
NOTES:
- Populated by the Receiving widget (UI/EndUser/Receiving/app/index.html) — new per-line
  "Ship Mode Received" dropdown in the Line Items table (static 3-choice list, no live
  Books lookup needed unlike Bin_location), included in saveReceiving()'s payload as
  Receiving_Line_Items.Shipment_Mode_When_Received. Also settable via the native form
  directly if ever used that way — this action fires either way (Successful form
  submission covers both native-UI saves and widget updateRecordById calls, confirmed
  elsewhere in this app that updateRecordById fires target-report workflows by default).
- MATCHING KEY: PR_No, same key already used everywhere else in this app to correlate a
  Receiving line back to its originating Shipment line (both ultimately trace back to the
  same Purchase_Request1 record).
- DELUGE GOTCHA AVOIDED (see CLAUDE.md's reference-deluge-quirks): mutating an EXISTING
  subform row's field only reliably works as a SINGLE, non-nested `for each` — confirmed
  dead end when nested two levels deep (Product_Context1 saga, several rounds of
  debugging). Two things were done specifically to stay inside the one proven-safe shape:
  (1) `shipRecSM = Shipments[ID == input.Shipments];` is a plain direct assignment, NOT
  wrapped in its own `for each` (same pattern already proven in
  receiving_status_workflow.txt's `shipRecRS = Shipments[ID == input.Shipments];`) — so
  the subsequent `for each shipLine in shipRecSM.PO_Shipments {...}` is a genuinely
  top-level loop, not nested inside another `for each`. (2) The PR_No->mode lookup is
  built into a plain Map FIRST (`modeMap`), in its own separate, un-nested loop over
  `input.Receiving_Line_Items` — avoids ever nesting a Receiving-line loop inside the
  Shipments-line loop (or vice versa), which is the exact shape that silently failed to
  persist in the Product_Context1 case even though no error was thrown.
- Does not touch any other PO_Shipments column (Shipping_Mode, Required_Days_Lead, etc.)
  — only ever writes Shipment_Mode_When_Received, and only for lines with a real PR_No
  match and a non-blank incoming value (a line with the dropdown left at "-Select-" is
  skipped, doesn't clear anything already set).
- UNTESTED — needs a live Receiving save (native or widget) with this dropdown set on at
  least one line, then a check on the matching Shipments record's own PO_Shipments
  subform to confirm the value landed on the right line.
====================================================

````
