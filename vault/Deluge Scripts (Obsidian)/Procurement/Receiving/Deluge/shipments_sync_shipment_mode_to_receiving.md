---
title: "shipments_sync_shipment_mode_to_receiving"
source_file: "shipments_sync_shipment_mode_to_receiving.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 76
tags:
  - deluge
  - fulfillment
  - procurement
  - purchase-order
  - purchase-request
  - qc
---

# shipments_sync_shipment_mode_to_receiving

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `shipments_sync_shipment_mode_to_receiving.txt`
> - **Lines of Code:** 76
> - **Tags:** `#deluge`, `#fulfillment`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Shipments_Sync_Shipment_Mode_To_Receiving ==
== New 2026-07-17, per user request ("update in shipments: Ship Mode Received -
   editable in shipments too. when save reflect to receiving. so it works end to end
   now") — reverse direction of receiving_sync_shipment_mode.txt (Receiving->Shipments).
   Together these two scripts make Shipment_Mode_When_Received bidirectionally synced:
   editing it from either the Shipments widget or the Receiving widget propagates to
   the other side. ==

WORKFLOW SETUP:
  Form: Shipments
  Trigger: Edited > Successful form submission
  Action name: Shipments_Sync_Shipment_Mode_To_Receiving

====================================================
PASTE BELOW (Edited > Successful form submission, Shipments form)
====================================================

recvRecs = Receiving[Shipments == input.ID];
for each  r in recvRecs
{
	for each  li in input.PO_Shipments
	{
		if(li.PR_No != null && li.PR_No != "" && li.Shipment_Mode_When_Received != null && li.Shipment_Mode_When_Received != "")
		{
			for each  rl in r.Receiving_Line_Items
			{
				if(rl.PR_No == li.PR_No && rl.Shipment_Mode_When_Received != li.Shipment_Mode_When_Received)
				{
					rl.Shipment_Mode_When_Received = li.Shipment_Mode_When_Received;
				}
			}
		}
	}
}

====================================================
NOTES:
- Populated by the Shipments widget (UI/EndUser/Shipments/app/index.html) — "Ship Mode
  Received" column changed from read-only display to an editable dropdown (same 3
  choices — Airfreight/LCL/FCL — as Receiving's own). Included in saveShipment()'s
  existing PO_Shipments payload (no widget-side payload change needed — that field was
  already being sent, just was never user-editable before).
- MATCHING KEY: PR_No — same key receiving_sync_shipment_mode.txt uses for the reverse
  direction, and the same key this whole app already uses everywhere to correlate a
  Receiving line back to its originating Shipment line.
- STRUCTURE deliberately mirrors the ALREADY-LIVE, already-proven
  Shipment_Edited_Sync_Receiving action (shipment_populate_receiving.txt) — same
  recvRecs=Receiving[Shipments==input.ID] outer loop, same nested-inner-loop shape
  matching by PR_No — rather than the stricter single-non-nested-loop shape
  receiving_sync_shipment_mode.txt used (which was UNTESTED and deliberately
  conservative). Shipment_Edited_Sync_Receiving's own nested mutation of
  r.Receiving_Line_Items rows is confirmed live/working in this codebase, so this
  script reuses that exact proven shape instead of a second, different pattern.
- EQUALITY GUARD (`rl.Shipment_Mode_When_Received != li.Shipment_Mode_When_Received`):
  only writes when the value actually differs. Two reasons: (1) avoids a needless write
  on every single Shipments edit even when nothing about ship mode changed; (2) bounds
  any potential ping-pong with receiving_sync_shipment_mode.txt's own reverse write —
  it's UNCONFIRMED in this codebase whether a cross-form field write from inside a
  workflow reliably re-triggers the target form's own "Successful form submission"
  workflows (see shipment_previous_status.txt's own same caveat) or not; if it does,
  this guard means the round-trip write stops the instant both sides already agree,
  instead of looping.
- Does not touch any other Receiving_Line_Items column (Accepted_Qty, Damage_Qty,
  Bin_location, etc.) or create/remove rows — only ever updates
  Shipment_Mode_When_Received on an already-existing, PR_No-matched row.
- If a Receiving record hasn't been created yet for this Shipment (recvRecs empty), or
  a given Shipments line has no matching Receiving_Line_Items row yet (e.g. Receiving's
  own line list hasn't synced this PR_No in), that line is silently skipped — same
  "self-heals on the next relevant save, no error" tolerance already accepted elsewhere
  for this exact subform pairing.
- UNTESTED — needs a live edit of Ship Mode Received from the Shipments widget, save,
  then check the matching Receiving record's own Receiving_Line_Items to confirm the
  value landed on the right line; and the reverse (edit from Receiving widget, confirm
  it still lands on Shipments, per receiving_sync_shipment_mode.txt's own still-open
  UNTESTED note) to confirm both directions now work end to end.
====================================================

````
