---
title: "approve_rr_custom_api"
source_file: "approve_rr_custom_api.txt"
category: "Procurement/Replacement/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 179
tags:
  - custom-api
  - deluge
  - fulfillment
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
---

# approve_rr_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `Procurement/Replacement/Deluge`
> - **Source File:** `approve_rr_custom_api.txt`
> - **Lines of Code:** 179
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== 2 Deluge Custom Functions (approveRRFenteng/approveRRTony) + Custom API setup,
   mirroring approve_rr_supplier.txt's 2 native "Approve RR" Report Action Items —
   same conversion pattern already used for create_rr_custom_api.txt/
   acknowledge_po_custom_api.txt/pr_approve_po_custom_api.txt (Report Action Items
   can't be invoked via any Creator API/SDK call). New 2026-07-13, built for the
   UI/EndUser/ReplacementRequest widget's "Approve RR" button, also used by
   UI/SupplierPortal/Fenteng-RR & Tony-RR. SLIMMED 2026-07-20, per user request
   ("their only job is to approve and populate ETA/ETD") — the Missing_SKUs/new-PO
   logic that used to live here moved to create_rr_custom_api.txt (officer-triggered
   Create RR). Now takes 2 new REQUIRED args, expectedShipDate/eta, rejects the call
   if either is blank, and writes them straight onto Expected_Ship_Date/ETA alongside
   the status flip — mirrors acknowledge_po_custom_api.txt's etd/eta pattern exactly
   (plain String assignment, no `.toDate()`, proven working there). MANUALLY-
   MAINTAINED MIRROR — any future edit to approve_rr_supplier.txt's 2 Actions needs a
   matching edit here. ==

====================================================
CUSTOM FUNCTION 1 SETUP:
  Name: approveRRFenteng
  Arguments: String rrRecordId, String expectedShipDate, String eta
  Paste FULL block below INCLUDING the `map approveRRFenteng(...)` signature line —
  Creator Custom Functions need the full signature (established convention, see
  CLAUDE.md Deluge Gotchas).
====================================================

map approveRRFenteng(String rrRecordId, String expectedShipDate, String eta)
{
	response = Map();
	r = Fenteng_Lighting_Replacement_Request[ID == rrRecordId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Replacement Request not found.");
		return response;
	}
	if(r.RR_Status != "Open")
	{
		response.put("status","error");
		response.put("message","Already approved.");
		return response;
	}
	if(expectedShipDate == null || expectedShipDate == "" || eta == null || eta == "")
	{
		response.put("status","error");
		response.put("message","Expected Ship Date and ETA are both required to approve.");
		return response;
	}

	r.RR_Status = "Acknowledged";
	r.Expected_Ship_Date = expectedShipDate;
	r.ETA = eta;
	r.Supplier_Acknowledgement1 = true;
	r.Supplier_Acknowledge_Date = zoho.currenttime;
	r.Last_Updated = zoho.currenttime;
	// ADDED 2026-07-28, per user ("it should reflect after acknowledge") — real
	// gap found live: approving on the supplier's own portal correctly advanced
	// THIS record, but the buyer-side AGGREGATE Replacement_Request stayed
	// Open/unacknowledged forever (confirmed via direct API pull — RR-00004's
	// aggregate copy showed Supplier_Acknowledgement1=false, RR_Status=Open,
	// even after the supplier record itself was genuinely Acknowledged). The
	// "supplier's own record is the only one that ever advances" design was
	// intentional up to now (2026-07-20, "let's not be dependent on supplier"),
	// but never included pushing the RESULT back onto the aggregate for
	// display — only PO-side effects moved off it, not this. Plain header-field
	// update, no subform involved, matched by RR_No (same join key every other
	// aggregate<->supplier RR match in this app already uses).
	update Replacement_Request[RR_No == r.RR_No]
	[
		RR_Status = "Acknowledged"
		Expected_Ship_Date = expectedShipDate
		ETA = eta
		Supplier_Acknowledgement1 = true
		Supplier_Acknowledge_Date = zoho.currenttime
		Last_Updated = zoho.currenttime
	];
	response.put("status","success");
	response.put("message","Replacement Request approved — Expected Ship " + expectedShipDate + ", ETA " + eta + ".");
	return response;
}

====================================================
CUSTOM FUNCTION 2 SETUP:
  Name: approveRRTony
  Arguments: String rrRecordId, String expectedShipDate, String eta
====================================================

map approveRRTony(String rrRecordId, String expectedShipDate, String eta)
{
	response = Map();
	r = Tony_Fan_Replacement_Request[ID == rrRecordId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Replacement Request not found.");
		return response;
	}
	if(r.RR_Status != "Open")
	{
		response.put("status","error");
		response.put("message","Already approved.");
		return response;
	}
	if(expectedShipDate == null || expectedShipDate == "" || eta == null || eta == "")
	{
		response.put("status","error");
		response.put("message","Expected Ship Date and ETA are both required to approve.");
		return response;
	}

	r.RR_Status = "Acknowledged";
	r.Expected_Ship_Date = expectedShipDate;
	r.ETA = eta;
	r.Supplier_Acknowledgement1 = true;
	r.Supplier_Acknowledge_Date = zoho.currenttime;
	r.Last_Updated = zoho.currenttime;
	// ADDED 2026-07-28 — same aggregate sync-back as approveRRFenteng, see that
	// function's own comment for the full writeup.
	update Replacement_Request[RR_No == r.RR_No]
	[
		RR_Status = "Acknowledged"
		Expected_Ship_Date = expectedShipDate
		ETA = eta
		Supplier_Acknowledgement1 = true
		Supplier_Acknowledge_Date = zoho.currenttime
		Last_Updated = zoho.currenttime
	];
	response.put("status","success");
	response.put("message","Replacement Request approved — Expected Ship " + expectedShipDate + ", ETA " + eta + ".");
	return response;
}

====================================================
CUSTOM API SETUP (both):
  Creator → Settings → Custom APIs → New Custom API
  Name: approve_rr_fenteng / approve_rr_tony
  Function: approveRRFenteng / approveRRTony
  Method: POST
  Arguments (String): rrRecordId, expectedShipDate, eta — EXISTING live Custom APIs
  need these 2 new parameters added (Settings → Custom APIs → edit → Arguments), same
  re-save-with-new-params step already done for acknowledge_po_custom_api.txt's ETD/ETA
  addition.
  Same Draft-state gotcha hit repeatedly in this app — confirm Enabled, not left in
  Draft, before testing.
  After creation, copy each public key into
  UI/EndUser/ReplacementRequest/app/index.html's
  CUSTOM_API_APPROVE_RR_FENTENG_KEY / CUSTOM_API_APPROVE_RR_TONY_KEY.
====================================================

NOTES:
- Built for UI/EndUser/ReplacementRequest — the aggregate Replacement_Request record
  doesn't itself carry an Approve action (the native "Approve RR" button lives only on
  Fenteng_Lighting_Replacement_Request_Report/Tony_Fan_Replacement_Request_Report,
  confirmed via approve_rr_supplier.txt). The widget resolves which supplier record to
  approve by matching RR_No between the aggregate record it's showing and the correct
  supplier report (Replacement_Summary.Supplier tells it which one), then passes that
  supplier record's own ID as rrRecordId.
- Gate condition used by the widget: `RR_Status == "Open"` — same as the native Report
  Action Item's presumed visibility condition, but NOT independently confirmed (native
  approve_rr_supplier.txt's own NOTES say the button "already exists per screenshot",
  its exact condition expression was never captured). Flag if a live RR that should be
  approvable doesn't show the button, or vice versa.
- SLIMMED 2026-07-20, per user request — both functions now take 2 new REQUIRED
  String args (`expectedShipDate`/`eta`), rejected server-side with an error response
  if either is blank (mirrors `acknowledge_po_custom_api.txt`'s etd/eta pattern
  exactly). All Missing_SKUs/new-PO logic removed — see create_rr_custom_api.txt,
  where it moved to (officer-triggered Create RR, no longer supplier-dependent). Added
  an explicit `RR_Status != "Open"` guard (returns an error response instead of
  silently re-running) — the old version had no idempotency check at all. Both
  UI/EndUser/ReplacementRequest AND UI/SupplierPortal/Fenteng-RR & Tony-RR call these
  functions — ALL THREE widget call sites need updating to pass `expectedShipDate`/
  `eta` now that they're required, not just the 2 supplier-portal ones. Flag if
  UI/EndUser/ReplacementRequest's own Approve RR button isn't updated to collect these
  2 fields too — it will otherwise always get rejected with the new required-fields
  error.
- UNTESTED — needs live Custom Function + Custom API param updates (both), then a
  real approve-from-widget test on both a "Receiving Missing" RR and a Damage/QC/
  Complaint RR, confirming the PO-side effects now happen at Create RR time (not
  Approve RR) and that Approve is genuinely blocked without both dates filled.
====================================================

````
