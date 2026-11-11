---
title: "shipment_previous_status"
source_file: "shipment_previous_status.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 42
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - zoho-creator
---

# shipment_previous_status

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `shipment_previous_status.txt`
> - **Lines of Code:** 42
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Shipments — Previous_Status audit field ==
== New 2026-07-10, per user request ("let's also add a feature in shipment field
   Previous Status") — captures whatever Shipment_Status WAS right before it changes,
   any time it changes, for any reason (manual dropdown edit on the native Shipments
   form, or the new Delivered auto-flip in receiving_status_workflow.txt). Confirmed
   with user: full audit trail on every change, not scoped to just the auto-flip. ==

====================================================
WORKFLOW SETUP
  Form: Shipments
  Trigger: Edited > Validations on form submission
  Action: Execute script — new standalone action, name it Shipment_Track_Previous_Status
====================================================

oldRec = Shipments[ID == input.ID];
if(oldRec != null && oldRec.Shipment_Status != input.Shipment_Status)
{
	input.Previous_Status = oldRec.Shipment_Status;
}

====================================================
NOTES:
- Same fetch-and-compare pattern already proven in this codebase for detecting a field
  transition (`EXC_Status_Timestamps` on Exceptions uses the identical `oldRec =
  Form[ID==input.ID]; if(input.Field != oldRec.Field) {...}` shape).
- "Edited" trigger only — no equivalent needed on Created, since a brand-new Shipment
  has no prior Shipment_Status to capture (Previous_Status stays blank on create,
  correctly).
- This covers MANUAL edits on the native Shipments form/report directly. It does NOT
  necessarily cover `receiving_status_workflow.txt`'s Delivered auto-flip — that script
  writes `shipRecRS.Shipment_Status = "Delivered"` via a plain fetched-record field
  assignment from WITHIN Receiving's own script, and it's unconfirmed in this codebase
  whether that kind of cross-form write reliably re-triggers the target form's own
  Edited-workflow pipeline (no established precedent either way — different from the
  confirmed `zoho.creator.v2_1.createRecord` cross-APP case, which IS confirmed to fire
  target-form Created workflows). To not depend on that uncertainty,
  receiving_status_workflow.txt stamps `Previous_Status` explicitly itself, inline,
  right before setting Shipment_Status — see that file. If it turns out this workflow
  DOES also fire from the auto-flip, the two writes are idempotent/harmless (same
  value), just redundant.
- UNTESTED — not yet pasted into Creator.
====================================================

````
