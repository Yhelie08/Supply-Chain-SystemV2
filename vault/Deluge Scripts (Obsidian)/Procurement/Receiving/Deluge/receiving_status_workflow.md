---
title: "receiving_status_workflow"
source_file: "receiving_status_workflow.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]"
lines: 161
tags:
  - deluge
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# receiving_status_workflow

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `receiving_status_workflow.txt`
> - **Lines of Code:** 161
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Receiving — new header field Receive_Status (Pending/Incomplete/Completed) +
   Shipments.Shipment_Status auto-flip to "Delivered" + Shipments.Need_Attention1
   auto-flag on exceptions ==
== New 2026-07-10, per user request — Receive_Status is a real stored status field
   mirroring the same 3-tier model already built into UI/EndUser/Receiving's list view
   (Pending Inspection/Incomplete Receive/Complete Receive), formalized as an actual
   field instead of a client-computed display bucket. Same script also auto-flips the
   LINKED Shipments record's Shipment_Status to "Delivered" the moment real inspection
   activity starts (Receive_Status moves off "Pending") — scope deliberately limited to
   just this one transition, per user's explicit "keep scope to just Delivered
   auto-flip for now": In Transit/Delayed/Pending stay manual, nothing in this app
   tracks carrier/logistics data to derive those automatically. ==

====================================================
WORKFLOW SETUP
  Form: Receiving
  Trigger: Created or Edited > Validations on form submission
  Action: Execute script — NEW standalone action, name it Receiving_Set_Receive_Status
  ORDERING NOTE: deliberately self-contained (recomputes totals/incomplete-count
  directly from Receiving_Line_Items itself, does NOT read the header fields
  Total_Lines/Incomplete_Lines/Total_Accepted_Qty that Receiving_Compute_Totals sets)
  specifically to avoid any Validations-action-ordering dependency — same class of bug
  already documented elsewhere in this project (INQ_Check_Readiness needed a specific
  action order relative to INQ_Auto_Populate_Supplier_Quotes; this script sidesteps
  that risk entirely by not depending on another action's output). Safe to place
  anywhere in the Validations action order, before or after Receiving_Compute_Totals/
  Receiving_Set_Line_Result.
====================================================

totalLinesRS = 0;
incompleteLinesRS = 0;
totalAcceptedRS = 0;
totalDamageRS = 0;
totalMissingRS = 0;
hasExceptionLineRS = false;
for each  ln in input.Receiving_Line_Items
{
	totalLinesRS = totalLinesRS + 1;
	accepted = ifnull(ln.Accepted_Qty,0);
	damaged = ifnull(ln.Damage_Qty,0);
	missing = ifnull(ln.Missing_Qty,0);
	expected = ifnull(ln.Expected_Qty,0);
	totalAcceptedRS = totalAcceptedRS + accepted;
	totalDamageRS = totalDamageRS + damaged;
	totalMissingRS = totalMissingRS + missing;
	totalReceived = accepted + damaged + missing;
	if(!(totalReceived == expected && accepted == expected))
	{
		incompleteLinesRS = incompleteLinesRS + 1;
	}
	if(damaged > 0 || missing > 0)
	{
		hasExceptionLineRS = true;
	}
}
receiveStatusResult = "Pending";
if(totalLinesRS == 0)
{
	receiveStatusResult = "Pending";
}
else if(totalAcceptedRS == 0 && totalDamageRS == 0 && totalMissingRS == 0)
{
	receiveStatusResult = "Pending";
}
else if(incompleteLinesRS == 0)
{
	receiveStatusResult = "Received";
}
else
{
	receiveStatusResult = "Partial Received";
}
input.Receive_Status = receiveStatusResult;

// Shipment_Status auto-flip to "Delivered" — per user request 2026-07-10, scope
// deliberately limited to JUST this one transition (In Transit/Delayed stay manual,
// nothing in this app tracks carrier/logistics data to derive those). Real inspection
// activity (Receive_Status moving off "Pending") only happens once the shipment has
// actually physically arrived, so it's a reliable "Delivered" signal.
if(receiveStatusResult != "Pending" && input.Shipments != null)
{
	shipRecRS = Shipments[ID == input.Shipments];
	if(shipRecRS != null)
	{
		if(shipRecRS.Shipment_Status != "Delivered")
		{
			shipRecRS.Previous_Status = shipRecRS.Shipment_Status;
			shipRecRS.Shipment_Status = "Delivered";
		}
		// Need_Attention1 — per user request 2026-07-10: flag the linked Shipment
		// once this Receiving has any exception-worthy line (Damage_Qty>0 or
		// Missing_Qty>0), same trigger condition as native Receiving_Auto_Exception's
		// own Exceptions-creation check, computed independently here rather than
		// reading input.Exception_Count (avoids the same ordering risk already
		// designed around for Receive_Status). One-directional — never auto-clears
		// back to false once set, matching Receiving_Record_Created's own
		// one-directional convention; resolving the underlying exception(s) doesn't
		// automatically mean the shipment no longer needs a human to have looked at it.
		if(hasExceptionLineRS == true && shipRecRS.Need_Attention1 != true)
		{
			shipRecRS.Need_Attention1 = true;
		}
	}
}

====================================================
STATE TABLE (confirmed with user before building; choice VALUES changed 2026-07-10
after the field was already built — user renamed the dropdown choices from
Completed/Incomplete/Pending to Received/Partial Received/Pending, same logic
underneath, values updated to match):
  Pending           — Total_Lines==0, OR every line still has Accepted/Damage/Missing
                       all 0 (nothing entered yet)
  Partial Received  — at least one qty entered somewhere, but not every line satisfies
                       Accepted==Expected && Damage==0 && Missing==0 yet
  Received          — every line satisfies Accepted==Expected && Damage==0 &&
                       Missing==0 (matches native Receiving_Set_Line_Result's own
                       per-line "Complete" condition, just rolled up to the whole
                       record)

NOTES:
- SHIPMENT_STATUS AUTO-FLIP: `Shipments[ID == input.Shipments]` uses the direct
  input-context lookup allowance already documented in CLAUDE.md's Deluge Gotchas
  (`input.X` with `[ID == input.X]` works; a re-fetched record's own field would
  BIGINT-error the same lookup) — safe here since `input.Shipments` is used directly.
  Only writes when the shipment ISN'T already "Delivered", avoiding redundant writes on
  every subsequent Receiving save once delivered. Does NOT downgrade Shipment_Status
  back to anything if Receive_Status somehow reverts toward Pending (shouldn't happen
  in practice — qty entered doesn't get un-entered — but flagging the one-directional
  nature of this flip in case that assumption ever breaks). Explicitly out of scope
  (per user, "keep scope to just Delivered auto-flip for now"): auto-setting
  "In Transit" or "Delayed" — those stay fully manual dropdown picks.
- Also stamps `shipRecRS.Previous_Status = shipRecRS.Shipment_Status` right before
  overwriting it — per user request same session (`shipment_previous_status.txt`, full
  audit trail on every Shipment_Status change). Done here explicitly rather than
  relying on that other file's own Shipments-form Edited-workflow to fire from this
  cross-form write — see that file's NOTES for why that's uncertain.
- `Need_Attention1` (confirmed by user to be a Decision Box/checkbox, same type as
  `Receiving_Record_Created`) flags the linked Shipment whenever this Receiving has any
  line with Damage_Qty>0 or Missing_Qty>0 — same condition native
  `Receiving_Auto_Exception` uses to create an Exception record, computed independently
  here (not read from `input.Exception_Count`) for the same self-containment/no-
  ordering-dependency reasoning as `Receive_Status` itself. Deliberately outside the
  `Shipment_Status != "Delivered"` guard — exceptions should flag attention regardless
  of whether the shipment's already marked Delivered. One-directional: never auto-clears
  back to false once set (resolving the exception via the RR flow doesn't retroactively
  mean nobody needed to look at it).
- Deliberately does NOT fold in Books_Receive_ID ("sent to Books") — per user decision,
  that stays a fully separate concern tracked by its own field. This field is ONLY
  about physical inspection completeness. The widget layers "Sent to Books" on top as
  its own display bucket (takes priority over Receive_Status in the list view) rather
  than this field trying to represent both.
- Field link name `Receive_Status` is an educated guess matching the display label
  "Receive Status" shown live in the field builder screenshot — not independently
  confirmed via a schema dump the way most other fields in this project have been.
  Flag if the paste errors with a field-not-found message.
- Duplicates the same per-line completeness formula as native Receiving_Set_Line_Result
  (`accepted==expected && total==expected`) rather than reading that script's own
  `Line_Result`/`Ready_for_Fulfillment` output fields — same self-containment reasoning
  as above (no ordering dependency on a coworker-owned script).
- UNTESTED — not yet pasted into Creator.
====================================================

````
