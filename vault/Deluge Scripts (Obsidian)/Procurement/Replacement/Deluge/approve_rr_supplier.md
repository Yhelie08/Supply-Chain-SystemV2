---
title: "approve_rr_supplier"
source_file: "approve_rr_supplier.txt"
category: "Procurement/Replacement/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 183
tags:
  - custom-api
  - deluge
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-books
---

# approve_rr_supplier

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `Procurement/Replacement/Deluge`
> - **Source File:** `approve_rr_supplier.txt`
> - **Lines of Code:** 183
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== "Approve RR" action button — Fenteng_Lighting_Replacement_Request_Report /
   Tony_Fan_Replacement_Request_Report ==
== New 2026-07-07, untested — planned via AskUserQuestion, see NOTES for the
   confirmed design decisions ==

====================================================
PREREQUISITE — already done by user before this file was written:
  Purchase_Order:                       new field RR_Reference_No (Single Line)
  Fenteng_Lighting_Purchase_Order:      new field RR_Reference_No_Supplier1 (Single Line)
  Tony_Fan_Purchase_Order:              new field RR_Reference_No_Supplier2 (Single Line)
  Purchase_Order:                       new field Missing_SKUs (Single Line, HEADER
    field — NOT a PO_Line_Items column)
  Fenteng_Lighting_Purchase_Order:      new field Missing_SKUs_Supplier1 (Single Line,
    header field)
  Tony_Fan_Purchase_Order:              new field Missing_SKUs_Supplier2 (Single Line,
    header field)
  SUPERSEDED (added, then replaced same day, TWICE): first PO_Status's "Replacement -
  Missing" dropdown choice, then a per-line Item_Status/Item_Status_Supplier1/2
  subform column — see NOTES for why both were abandoned. The header dropdown choice
  and the Item_Status columns can stay in Creator unused (harmless) or be removed
  later; nothing in the current scripts reads them.
====================================================

====================================================
WORKFLOW SETUP — Approve_RR_Supplier1
  Form: Fenteng_Lighting_Replacement_Request
  Location: Report Action Item, "Approve RR" button (already exists per screenshot —
  this is the intended script body; if it already does something else, fold that in
  rather than dropping it)
  Trigger: On click of action item
====================================================

/* SLIMMED 2026-07-20, per user request ("let's not be dependent on supplier — their
   only job is to approve and populate ETA/ETD"): every bit of Missing_SKUs stamping /
   new replacement PO creation that used to live here moved to create_rr_button.txt
   (officer-triggered Create RR, fires the moment the RR is raised — no longer waits
   on the supplier clicking anything). This button's only remaining job is the status
   + audit-date flip. ETA/Expected_Ship_Date themselves are NOT written here — the
   native Action Item has no click-time input to collect them with (same limitation
   already documented for PO Acknowledge); they're entered via the widget's own
   "Update Progress" fields, and the widget-side Approve flow (approve_rr_custom_api.txt)
   requires both to be filled before it'll call this same logic. This native copy is
   reference/parity only — this whole app is confirmed widget-only in deployment. */
if(input.RR_Status != "Open")
{
	info "Already approved.";
	return;
}
input.RR_Status = "Acknowledged";
input.Supplier_Acknowledgement1 = true;
input.Supplier_Acknowledge_Date = zoho.currenttime;
input.Last_Updated = zoho.currenttime;
success message "Replacement Request approved.";

====================================================
WORKFLOW SETUP — Approve_RR_Supplier2
  Form: Tony_Fan_Replacement_Request
  Location: Report Action Item, "Approve RR" button
  Trigger: On click of action item
====================================================

/* SLIMMED 2026-07-20 — see Approve_RR_Supplier1's matching comment above. */
if(input.RR_Status != "Open")
{
	info "Already approved.";
	return;
}
input.RR_Status = "Acknowledged";
input.Supplier_Acknowledgement1 = true;
input.Supplier_Acknowledge_Date = zoho.currenttime;
input.Last_Updated = zoho.currenttime;
success message "Replacement Request approved.";

====================================================
NOTES:
- SLIMMED 2026-07-20, per user request ("let's not be dependent on supplier — their
  only job is to approve and populate ETA/ETD"): both Actions gutted from ~140 lines
  of Missing_SKUs stamping / new replacement PO creation each down to a plain status
  + audit-date flip. That whole PO-side flow moved to `create_rr_button.txt` (officer's
  Create RR click) — see that file's own NOTES for the full before/after and the
  cross-action PO-number lookup it uses instead of the (now-removed) self-contained
  version this file used to have. Added a `RR_Status != "Open"` idempotency guard that
  didn't exist before (old version had none — re-clicking Approve would have silently
  re-run, harmless before since it only overwrote the same status, but worth having now
  that Supplier_Acknowledge_Date shouldn't shift on a re-click). Also added
  `Supplier_Acknowledgement1`/`Supplier_Acknowledge_Date` stamps — real fields already
  on this form (per ReplacementRequestFields.txt) but never previously written by this
  button. ETA/`Expected_Ship_Date` themselves are NOT written here — no native
  click-time input path exists (same limitation as PO Acknowledge); the widget-side
  mirror (`approve_rr_custom_api.txt`) takes them as real args and requires both
  non-blank before approving. UNTESTED.
- Design confirmed via AskUserQuestion (2026-07-07), 4 questions (see the CORRECTED
  note below for how #1 actually ended up implemented after a follow-up correction):
  1. "Receiving Missing" update = EDIT the existing Books Purchase Receive's line
     quantity directly (GET then PUT the same purchasereceive_id), not a second separate
     receive. User picked this over the "create a 2nd receive" alternative despite it
     being flagged as touching a possibly-already-billed receive — no auto-bill/void
     handling added, matches user's explicit choice. (This GET/PUT logic itself now
     lives in receiving_create_bin_receiving.txt, not here — see CORRECTED note below.)
  2. RR_Status -> "Acknowledged" (existing dropdown value, no new field/value needed).
  3. Damage/QC/Complaint branch skips PR1 entirely — direct Purchase_Order + supplier PO
     insert only, since everything after PO creation (acknowledge/receive/Books sync
     for THESE replacement POs) is explicitly deferred to a later session.
  4. "Replacement - Missing" originally added as a new choice in the EXISTING PO_Status/
     PO_Status_Supplier1/PO_Status_Supplier2 dropdowns — SUPERSEDED same day, see the
     PER-LINE Item_Status note below for why and what replaced it.
- CHANGED 2026-07-07 (attempt #2, same day, before first live test — user wanted
  per-item visibility AND wanted PO_Status to behave normally on Acknowledge, which the
  header flag couldn't do at the same time): tried moving the flag to a PER-LINE
  `Item_Status`/`Item_Status_Supplier1/2` column on PO_Line_Items/PO_Line_Items_
  Supplier1/2, set by finding the row whose SKU matches the RR's SKU. BUG confirmed
  live: in-place row mutation (`poLn.Item_Status = "Missing"`) silently didn't
  persist. Tried the fix of rebuilding the subform as a new List and reassigning the
  whole field (`po.PO_Line_Items = updatedLines;`) — this ALSO failed, with a real
  error this time ("An error occurred while updating the field 'PO_Line_Items'").
  Root cause found via official Zoho Deluge docs: the native `update` task explicitly
  does NOT support Subform-type fields at all ("Signature, Subform, and Add Notes
  field types cannot be specified") — this is a hard platform limitation, not a bug in
  either attempt. Zoho's REST API v2.1 might support subform updates, but the docs
  don't clearly document how to reference an existing row vs. creating a duplicate,
  too risky to guess against live data.
- CHANGED 2026-07-07 (attempt #3, FINAL — abandoned per-line entirely): dropped the
  subform-column idea altogether. `Missing_SKUs`/`Missing_SKUs_Supplier1/2` are plain
  HEADER (top-level) Single Line fields instead — top-level field updates via
  `po.field = value` ARE fully supported natively (proven throughout this whole
  codebase already) so this sidesteps the subform-update wall completely. Since RR
  processing already assumes one SKU at a time (same "last row wins" simplification
  already used for Product_Context1 elsewhere in this project), the field just stores/
  overwrites the single currently-missing SKU as plain text rather than a multi-value
  list — simpler, matches this codebase's existing convention for this class of
  problem. `purchase_order_scripts.txt`'s Acknowledged_PO_Supplier1/2 reverted to
  always setting PO_Status="Confirmed" unconditionally (its original behavior, no
  guard) since header PO_Status no longer needs to survive re-acknowledgment for
  anything to detect it — Missing_SKUs carries that signal instead now.
- CORRECTED 2026-07-07 (user caught this before first test): this file originally had
  Approve_RR_Supplier1/2 do the Books GET/PUT quantity update AND the Creator
  Receiving_Line_Items Accepted_Qty bump directly, itself, immediately on click —
  skipping the whole Acknowledge -> Create Receive cycle entirely. User corrected: it
  should NOT skip that cycle. The "Receiving Missing" branch now does ONLY the minimum —
  flip RR_Status to "Acknowledged" and flag both the aggregate and supplier PO's status
  to "Replacement - Missing" — nothing else. That status flip is what naturally
  re-opens the existing Acknowledge button (its report condition is already
  `PO_Status_Supplier1/2 != "Confirmed"`, and "Replacement - Missing" satisfies that).
  The supplier clicks Acknowledge again -> normal cycle -> warehouse then manually edits
  `Accepted_Qty` on the existing Receiving record and clicks Create Receive again. The
  actual Books quantity-update logic (GET existing receive, bump the matching SKU line,
  PUT back) moved OUT of this file entirely and into
  `receiving_create_bin_receiving.txt`'s new update branch — see that file's NOTES.
- Corresponding fix required in `purchase_order_scripts.txt`'s `Acknowledged_PO_
  Supplier1/2`: it unconditionally sets `PO_Status_Supplier1/2 = "Confirmed"` on every
  click, which would silently erase the visible "Replacement - Missing" flag the moment
  the supplier re-acknowledges — before `Create Receive` ever gets a chance to see it.
  Fixed there: only overwrite to "Confirmed" when the status isn't already
  "Replacement - Missing", so the flag stays visible (and detectable by Create Receive)
  all the way through re-acknowledgment.
- Original_PO_No / PO_No text-matching used throughout (`Purchase_Order[PO_No ==
  origPONoF]`) — both are plain TEXT fields per earlier confirmed field dumps, no
  BIGINT/lookup risk.
- Same one-row-per-RR assumption as create_rr_button.txt's Product_Context1 loop:
  `for each row in input.Replacement_Summary` takes whatever the LAST row's values are
  if there's more than one row — matches this codebase's existing pattern elsewhere,
  not a new limitation introduced here.
- CHANGED 2026-07-08 (closing 2 of the gaps flagged when this branch's downstream was
  first scoped): Final_Price/Line_Total on the new PO_Line_Items row(s) now explicitly
  set to `0` (both aggregate and supplier PO copies) instead of left unset — a
  replacement item has no negotiated price, but an explicit 0 gives Books PO sync a
  clean rate to send instead of an undefined value. `Final_Price_Supplier1/2` on the
  supplier PO_Line_Items_Supplier1/2 subform is set by naming-convention assumption
  (mirrors the aggregate's own `Final_Price` with the usual `_Supplier1/2` suffix) —
  not independently confirmed against a live field dump, flag if it errors.
  Sales_Owner also now set on the NEW replacement Purchase_Order at creation time —
  copied from the ORIGINAL PO (`Purchase_Order[PO_No == origPONoF/T]`, same field
  already read for the "Receiving Missing" branch) rather than left blank. This exists
  so `Acknowledged_PO_Supplier1/2`'s Shipment/Receiving creation (which normally sources
  Sales_Owner from `Purchase_Request1` per PR_No) has something to fall back to for
  these PR-less replacement lines — see the new fallback added in
  purchase_order_scripts.txt NOTES same day. `Unit` still deliberately left unset — no
  natural source, not addressed by this change.
- `Purchase_Order`'s new-PO insert here does NOT set Customer/Customer_Type/SO_No
  (unlike pr_to_po_grouping.txt's version) — RR doesn't carry that context and it
  wasn't asked for. Sales_Owner is the one exception now (see above). Add the rest
  later if the deferred downstream work needs it.
====================================================

````
