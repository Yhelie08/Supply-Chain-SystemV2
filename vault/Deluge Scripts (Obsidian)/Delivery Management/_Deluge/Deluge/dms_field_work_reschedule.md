---
title: "dms_field_work_reschedule"
source_file: "dms_field_work_reschedule.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]"
lines: 154
tags:
  - delivery-management
  - deluge
  - dms
  - procurement
  - purchase-order
  - purchase-request
---

# dms_field_work_reschedule

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `dms_field_work_reschedule.txt`
> - **Lines of Code:** 154
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#procurement`, `#purchase-order`, `#purchase-request`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== DMS — Field Work "Reschedule Requested" → Exception (requeue happens on RESOLVE) ==
== New 2026-08-01, per user ("if it is reschedule put it in exception but needs
   override reason mandatory field for reason of rescheduling. then process that
   record for reschedule as another record in delivery queue"). Closes the
   Dispatch-stage gap dms_exception_queue.txt's own NOTES flagged as never wired:
   "Dispatch-stage exceptions (Delivery failed, Team no-show) have no trigger
   source at all yet." Confirmed with user (AskUserQuestion) before building: (1)
   fires automatically the moment the field tech sets Status="Reschedule Requested"
   — no separate officer click needed to raise the Exception; (2) reason lives in
   a NEW dedicated field, not the general Logistic_Notes; (3) Exception_Stage =
   "Dispatch". ==

== REVISED 2026-08-07, per user correction ("wait i think were not in the sa path
   ... we have already existing reschedule, it will go to DMS exception after
   resolving the it, it will go to Delivery Queue. it should have tag that the
   resched is from exception and it will be priority and add[ ]another tab and
   [al]l the priority are all there"). Original 2026-08-01 version did BOTH the
   Exception raise AND the clone-into-Delivery-Queue in the SAME execution,
   immediately on "Reschedule Requested" — confirmed via AskUserQuestion this was
   the wrong sequencing. This file now does ONLY the Exception raise. The actual
   requeue (clone fresh Service_Appointment + close original + stamp Priority/tag)
   now lives in dms_exception_queue.txt's EXC_Resolve_Sync, gated on the officer
   actually RESOLVING this exception — see that file for the requeue logic and its
   own prerequisite fields (Priority, Rescheduled_Via_Exception, Requeue_Processed
   all moved there). ==

====================================================
PREREQUISITE FIELDS — create manually before pasting either workflow below
====================================================
On Field_Work (report Field_Work_Report):
  Reschedule_Reason     (Multi Line Text) — mandatory whenever Status is set to
                          "Reschedule Requested", enforced by the Validations
                          workflow below. Copied straight into the new
                          DMS_Exception_Queue record's own Exception_Reason.
  Reschedule_Processed  (Decision Box, default No) — idempotency guard. Without
                          this, every subsequent Edited save while Status stays
                          "Reschedule Requested" would re-fire the whole block
                          below and spawn a DUPLICATE Exception each time — same
                          class of re-fire risk already documented for
                          dms_site_confirmation.txt's own "No Contact Info" branch.

(Service_Appointment_Form's Rescheduled_From_SA/Priority/Rescheduled_Via_Exception
fields are NOT needed by this file anymore — see dms_exception_queue.txt.)

====================================================
WORKFLOW SETUP — FW_Validate_Reschedule_Reason
  Form: Field_Work
  Trigger: Created or Edited > Validations
====================================================

--- Action 1 ---

if(input.Status == "Reschedule Requested" && (input.Reschedule_Reason == null || input.Reschedule_Reason == ""))
{
	alert "Reschedule Reason is required when Status is set to Reschedule Requested.";
	cancel submit;
}

====================================================
WORKFLOW SETUP — FW_Reschedule_To_Exception_And_Requeue
  Form: Field_Work
  Trigger: Created or Edited > Successful form submission
====================================================

--- Action 1 ---

if(input.Status == "Reschedule Requested" && input.Reschedule_Processed != true)
{
	processedReschedule = false;
	for each sa in Service_Appointment_Form[Sales_Order == input.Sales_Order]
	{
		if(processedReschedule == true)
		{
			break;
		}

		// FIXED live 2026-08-01 — "Error at line number: 14 zc_display_value doesn't
		// exist in Customer_Name field": .zc_display_value is a REST-API JSON key
		// (what a Name-type field serializes to over getRecords), NOT a valid Deluge
		// server-side accessor on the in-memory Name object — Deluge only exposes
		// .prefix/.first_name/.last_name/.suffix on a Name field. Built the display
		// text manually instead.
		custDisplay = "";
		if(sa.Customer_Name != null)
		{
			fnPart = sa.Customer_Name.first_name;
			lnPart = sa.Customer_Name.last_name;
			if(fnPart == null) { fnPart = ""; }
			if(lnPart == null) { lnPart = ""; }
			custDisplay = (fnPart + " " + lnPart).trim();
		}

		// ----- Raise the Exception (Dispatch stage — closes the previously-flagged
		// "no trigger source yet" gap for this stage). REVISED 2026-08-07: this is
		// now the ONLY thing this workflow does — no clone, no closing the original
		// SA. The actual reschedule happens later, when an officer resolves this
		// Exception (see dms_exception_queue.txt's EXC_Resolve_Sync). The original
		// Service_Appointment stays exactly as it was until then — it is NOT closed
		// as Failed here anymore, since the whole point of gating on resolution is
		// that nothing about the delivery's real state changes until an officer has
		// actually reviewed/acted on the reschedule request. -----
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = sa.ID
			Customer_Name = custDisplay
			Exception_Stage = "Dispatch"
			Exception_Reason = input.Reschedule_Reason
			Severity = "Medium"
			Raised_By = "Officer"
			Date_Raised = zoho.currenttime
			Assigned_To = "Delivery Officer"
			Status = "Open"
		];

		processedReschedule = true;
	}

	input.Reschedule_Processed = true;
}

====================================================
NOTES:
- This is the 7th DMS_Exception_Queue integration point overall (6 already wired
  2026-07-17, see dms_exception_queue.txt's own INTEGRATION POINTS section) — the
  first and only one sourced from Field Work / Dispatch stage rather than
  Site Confirmation or Scheduling.
- REVISED 2026-08-07 — see dms_exception_queue.txt's EXC_Resolve_Sync for the
  actual requeue (clone + close-original + Priority + tag). This file's own scope
  is now exactly what dms_exception_queue.txt's ARCHITECTURE DECISION note already
  established for every OTHER exception source: raise the Exception, nothing else.
  Dispatch-stage exceptions are (as of this revision) the ONLY exception stage
  whose resolution has a side effect beyond flipping Exception_Status back on the
  linked record — confirmed acceptable since Exception_Stage="Dispatch" still has
  exactly one source (this workflow), same inference already relied on by the
  DMSExceptionQueue widget's own "🔄 Reschedule" chip.
- Item_Details subform copy — REMOVED from this file, moved to
  dms_exception_queue.txt (see that file for the current safe-shape implementation,
  a for-each loop variable, not a bare Form[criteria] assignment).
- `input.Reschedule_Processed = true;` direct mutation of `input` from within the
  SAME record's own Successful-form-submission action is an already-proven pattern
  in this codebase (see PR1_Created_Edited_Routing.txt).
- UNTESTED — needs, in order: (1) the 2 prerequisite fields created live
  (Reschedule_Reason/Reschedule_Processed — unchanged from the original build);
  (2) both workflows re-pasted (Action 1 simplified — clone/close logic removed);
  (3) a live Field Work save with Status="Reschedule Requested" and a blank
  Reschedule Reason — confirm it's genuinely refused (Validations gate); (4) same
  save with a real reason filled in — confirm a new DMS_Exception_Queue record
  appears (Exception_Stage="Dispatch", Severity="Medium", Reason = whatever was
  typed) and confirm the ORIGINAL Service_Appointment is completely UNCHANGED
  (still whatever status it was before — no Failed flip, no clone yet); (5)
  re-save the same Field Work record again without changing Status — confirm it
  does NOT create a second Exception (dedup guard); (6) go resolve that Exception
  in DMSExceptionQueue (see dms_exception_queue.txt's own test steps for what
  should happen next).

````
