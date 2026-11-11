---
title: "dms_exception_queue"
source_file: "dms_exception_queue.txt"
category: "Delivery Management/_Deluge"
associated_widget: "[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]"
lines: 339
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
---

# dms_exception_queue

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]
> - **Category:** `Delivery Management/_Deluge`
> - **Source File:** `dms_exception_queue.txt`
> - **Lines of Code:** 339
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== DMS Section E — Exception Queue Logic ==
== New 2026-07-17, per DMS_Full_Build_Plan_v1.1.pdf Section E. New form
   DMS_Exception_Queue built live same day (fields below, for reference — already
   created via Form Builder UI + Application IDE, not something to re-paste). ==

NAMING NOTE: this app already has an existing, UNRELATED `Exceptions`/
`Exceptions_Report` form (Receiving damage/missing-goods tracking, totally different
domain, deeply used elsewhere in this app's own CLAUDE.md). Named this new form
`DMS_Exception_Queue` specifically to avoid any collision/confusion with that one.

ARCHITECTURE DECISION (confirmed with user 2026-07-17): DMS_Exception_Queue is an
AUDIT/WORKLIST layer on top of the already-proven `Exception_Status`/`Exception_Reason`
flag fields on Service_Appointment_Form (which already correctly gate Section B's
Action 1) — NOT a replacement for that gate. Reasoning: the flag was already tested
and working across B/C/D's whole test suite; swapping the gate to a live
DMS_Exception_Queue lookup on every trigger adds real risk (extra cross-form query, a
second place to get wrong) for no functional gain. The drift risk this creates (flag
and queue record could disagree) is closed structurally, not by officer discipline:
- CREATE side: every place that sets Exception_Status="Flagged" (6 points across B/C,
  see below) also inserts the matching DMS_Exception_Queue record in the SAME script
  execution — same `rec`/`r` reference, same save, can't drift apart at creation.
- RESOLVE side: EXC_Resolve_Sync (below) writes Exception_Status="Resolved" back onto
  the linked Service_Appointment the moment the officer resolves/dismisses the
  Exception record — closes the loop from the other direction.
- Remaining manual step, not automated: Revert_to_System=true clears the flag +
  Suggested/Confirmed_Schedule_Date (unblocking the gate + giving a clean slate) but
  does NOT auto-refire the engine — a cross-form write can't trigger Service_
  Appointment_Form's own Successful-form-submission workflow (established limitation,
  see reference-deluge-quirks memory). Officer clicks the existing `Re_Schedule`
  Report Action Item after. Duplicating the whole ~140-line slot-search engine a 3rd
  time just to skip one click wasn't judged worth it.

DMS_Exception_Queue FIELDS (built live, for reference):
Exception_ID (Auto-number), Sales_Order_Reference (Lookup -> Service_Appointment_Form,
via a NEW hidden field Sales_Order_Display on that form — Sales_Order itself is
Multi Line, which Zoho Creator does not allow as a lookup display field, confirmed via
web search + a live community thread hitting the same wall; the official workaround is
a mirrored Single Line field, not converting the real one — see the new
SA_Sync_Sales_Order_Display workflow below), Customer_Name (Text, auto-fill),
Exception_Stage (Dropdown: Site Confirmation/Scheduling/Calendar/Dispatch/Manual),
Exception_Reason (Text), Severity (Dropdown: High/Medium/Low), Raised_By (Dropdown:
System/Officer), Date_Raised (DateTime), Assigned_To (Dropdown: Delivery Officer/
Dispatch Staff/Delivery Manager/System Admin — plan says Lookup, but no Officer/User
master form exists anywhere in this app, so this is a deliberate deviation to a plain
dropdown using the same role names as Section F's own Access Control table), Status
(Dropdown: Open/In Progress/Resolved/Dismissed), Resolution_Action (Multi Line),
Resolution_Date (DateTime), Revert_to_System (Checkbox).

====================================================
NEW FIELD + WORKFLOW — Service_Appointment_Form
  (needed BEFORE the Lookup above could be built — see NAMING NOTE on Sales_Order)
====================================================

Field added via Application IDE: Sales_Order_Display (Single Line Text).

Workflow name: SA_Sync_Sales_Order_Display
  Trigger: Created or Edited > Successful form submission

if(input.Sales_Order != null && input.Sales_Order != input.Sales_Order_Display)
{
	rec = Service_Appointment_Form[ID == input.ID];
	rec.Sales_Order_Display = input.Sales_Order;
}

====================================================
PREREQUISITE FIELDS — NEW 2026-08-07, create manually before re-pasting EXC_Resolve_Sync
====================================================
On DMS_Exception_Queue:
  Requeue_Processed        (Decision Box, default No) — idempotency guard on the
                             new Dispatch-stage requeue-on-resolve logic below.
                             Same purpose as Field_Work's own Reschedule_Processed.

  Application IDE snippet (paste alongside the other DMS_Exception_Queue fields,
  pure additive — safe per this build's own confirmed AppIDE limits):

  Requeue_Processed
  (
      type = checkbox
      displayname = "Requeue Processed"
      initial value = false
  )

On Service_Appointment_Form, Delivery_Details_Section:
  Rescheduled_From_SA      (Single Line Text) — the ORIGINAL Service_Appointment's
                             own ID, stamped on the freshly re-queued record so
                             there's a durable trace of which attempt it came from
                             (same back-reference convention as Source_Module/
                             Exception_Number elsewhere in this app). Carried over
                             unchanged from the original 2026-08-01 build.
  Priority                 (Decision Box, default No) — set true only on a record
                             created by the requeue-on-resolve block below, never
                             on the original (which closes as Failed). Surfaced in
                             DeliveryQueue as a badge + sort-to-top + its own
                             dedicated "Priority" filter tab. Does NOT feed back
                             into dms_scheduling_engine.txt's slot-SEARCH — see
                             that file's own Action 1 for the separate change that
                             makes a Priority record auto-CONFIRM once a slot is
                             found (2 different concerns: which slot gets picked
                             vs. whether the officer still has to manually approve
                             it).
  Rescheduled_Via_Exception (Single Line Text) — the resolved DMS_Exception_Queue
                             record's own Exception_ID, stamped on the freshly
                             re-queued record purely for officer-facing
                             traceability ("this delivery exists because Exception
                             #N got resolved") — shown in DeliveryQueue's Detail
                             view as "Rescheduled Via".

  Application IDE snippet (paste inside Delivery_Details_Section, same section as
  Rescheduled_From_SA — pure additive, safe per this build's own confirmed AppIDE
  limits: new fields/sections always work, only TYPE changes/deletions don't):

  Priority
  (
      type = checkbox
      displayname = "Priority"
      initial value = false
      row = 1
      column = 1
      width = medium
  )
  Rescheduled_Via_Exception
  (
      type = text
      displayname = "Rescheduled Via Exception"
      row = 1
      column = 1
      width = medium
  )

====================================================
WORKFLOW SETUP — DMS_Exception_Queue
  Trigger: Created or Edited > Successful form submission
  Workflow name: EXC_Resolve_Sync — 1 action block
====================================================

--- Action 1 ---

/* FIXED 2026-07-23, real bug found via a live paste diff (user pasted the actual
   live script into Temp.txt) — the live version was MISSING the parentheses
   around (Status=="Resolved" || Status=="Dismissed"), same operator-precedence
   class of bug already documented once in this app (INQ_Check_Readiness's Step H,
   2026-07-14) — && binds tighter than || in Deluge, so the unparenthesized form
   actually meant "Resolved OR (Dismissed AND has-reference)", not "(Resolved OR
   Dismissed) AND has-reference". Harmless for a plain Resolved case (short-
   circuits true either way) but would wrongly skip a genuinely-empty-reference
   Dismissed case, or wrongly fire the block for other combinations. NOT the cause
   of "resolved it but Service_Appointment still shows Flagged" reported live the
   same day — that turned out to be the Scheduling Engine legitimately re-flagging
   "Calendar Full" on a fresh scheduling attempt (Site_Confirmation_Status saved
   as Confirmed re-triggered it), not this script failing — but fixed anyway,
   genuinely wrong either way. */
if((input.Status == "Resolved" || input.Status == "Dismissed") && input.Sales_Order_Reference != null)
{
	rec = DMS_Exception_Queue[ID == input.ID];
	if(input.Status == "Resolved" && input.Resolution_Date == null)
	{
		rec.Resolution_Date = zoho.currenttime;
	}

	sa = Service_Appointment_Form[ID == input.Sales_Order_Reference];
	sa.Exception_Status = "Resolved";
	if(input.Revert_to_System == true)
	{
		sa.Suggested_Schedule_Date = null;
		sa.Suggested_Time_Slot = null;
		sa.Confirmed_Schedule_Date = null;
		sa.Confirmed_Time_Slot = null;
		// Officer clicks the existing Re_Schedule Report Action Item next — see the
		// ARCHITECTURE DECISION note above for why this isn't further automated.
	}

	// ---- NEW 2026-08-07 — Dispatch-stage requeue-on-resolve, per user correction
	// ("we have already existing reschedule, it will go to DMS exception after
	// resolving the it, it will go to Delivery Queue. it should have tag that the
	// resched is from exception and it will be priority"). Moved here (out of
	// dms_field_work_reschedule.txt) so the actual re-queue only happens once an
	// officer has reviewed and RESOLVED the reschedule request, not the instant
	// the field tech submits it. Exception_Stage=="Dispatch" is still, as of this
	// writing, the ONLY source that ever creates a Dispatch-stage exception (same
	// inference already relied on by DMSExceptionQueue widget's "🔄 Reschedule"
	// chip) — if a 2nd Dispatch-stage source is ever added, this gate would need a
	// real distinguishing field instead of inferring from Stage alone. Gated on
	// Status=="Resolved" specifically, NOT "Dismissed" — a dismissed reschedule
	// request is treated as "no requeue needed" (officer decided the delivery
	// doesn't actually need to be re-attempted), matching how a Dismissed outcome
	// reads for every other exception type in this app (closed, no further action).
	// Requeue_Processed guards against a duplicate clone if this Exception record
	// gets saved again while already Resolved.
	if(input.Exception_Stage == "Dispatch" && input.Status == "Resolved" && input.Requeue_Processed != true)
	{
		// for-each (not a bare Form[criteria] assignment) — matches this app's own
		// proven-safe shape for reading a subform (Item_Details below) off a record
		// that isn't `input`, same pattern the original 2026-08-01 build already
		// used successfully before this logic moved here.
		for each saLoop in Service_Appointment_Form[ID == input.Sales_Order_Reference]
		{
			newId = insert into Service_Appointment_Form
			[
				Sales_Order = saLoop.Sales_Order
				Sales_Order_Display = saLoop.Sales_Order
				Customer_Address = saLoop.Customer_Address
				City = saLoop.City
				Contact = saLoop.Contact
				Email = saLoop.Email
				Type_of_Delivery = saLoop.Type_of_Delivery
				Package_Number = saLoop.Package_Number
				Appointment_Status = "Queued"
				Rescheduled_From_SA = saLoop.ID
				Rescheduled_Via_Exception = rec.Exception_ID + ""
				Priority = true
			];
			newSA = Service_Appointment_Form[ID == newId];
			if(saLoop.Customer_Name != null)
			{
				newSA.Customer_Name = saLoop.Customer_Name;
			}
			for each it in saLoop.Item_Details
			{
				newRow = Service_Appointment_Form.Item_Details();
				newRow.Item_Name = it.Item_Name;
				newRow.SKU = it.SKU;
				newRow.Quantity = it.Quantity;
				newSA.Item_Details.insert(newRow);
			}

			// The original attempt didn't complete — close it out as Failed so it
			// moves into Archived instead of sitting stale, while the fresh Queued
			// record (tagged Rescheduled_From_SA + Rescheduled_Via_Exception) carries
			// the story forward. Same judgment call as the original 2026-08-01 build.
			saLoop.Appointment_Status = "Failed";
		}

		rec.Requeue_Processed = true;
	}
}

====================================================
WORKFLOW SETUP — DMS_Exception_Queue
  Trigger: Created or Edited > Validations
  Workflow name: EXC_Validate_Resolution — 1 action block
  Added 2026-07-17, per user question ("what about validations on required fields?") —
  a real gap: neither this form nor the widget had ever required Resolution_Action
  before marking something Resolved/Dismissed, unlike every other form in this app
  (Mandatory_PR_Fields_Supplier1/2, SA_Site_Confirmation_Validate, etc. all enforce
  their own required-field rules natively, not just client-side). Matches the plan's
  own E.1 framing of Resolution Action as "what officer did to resolve" — implicitly
  mandatory once actually resolving/dismissing, not optional.
====================================================

--- Action 1 ---

if((input.Status == "Resolved" || input.Status == "Dismissed") && (input.Resolution_Action == null || input.Resolution_Action == ""))
{
	alert "Resolution Action is required when marking an exception Resolved or Dismissed.";
	cancel submit;
}

====================================================
INTEGRATION POINTS — 6 total, all wired 2026-07-17 (replacing the TODO comments left
in place when B/C/D were originally built)
====================================================

DelugeScripts/dms_scheduling_engine.txt (Section B):
1. Action 1, Multi-Day Install -> Exception_Stage="Scheduling", Severity="Medium",
   Reason="Requires Manual Planning"
2. Action 1, Calendar Full (no eligible team in the whole search window) ->
   Exception_Stage="Scheduling", Severity="Medium", Reason="Calendar Full"
3. Action 1, Overtime Declined -> Exception_Stage="Scheduling", Severity="Medium",
   Reason="Slot Pushed — Overtime Declined"
4. Action 2, Calendar Conflict (Section D's own capacity-based No-Overlap check) ->
   Exception_Stage="Calendar", Severity="High", Reason="Calendar Conflict"

DelugeScripts/dms_site_confirmation.txt (Section C):
5. Workflow 1 Action 1, No Contact Info -> Exception_Stage="Site Confirmation",
   Severity="High", Reason="No Contact Info". Needed a dedup guard
   (`if(input.Exception_Status != "Flagged")`) since this branch never sets
   Outreach_Sent_Date and therefore re-fires on every subsequent edit while the
   record stays Pending with no contact info — without the guard this would insert a
   fresh Exception on every single save.
6. DMS_Site_Confirmation_FollowUp (daily Schedule), Customer unreachable after max
   attempts -> Exception_Stage="Site Confirmation", Severity="High", Reason="Customer
   unreachable after max attempts". No dedup guard needed — self-terminating (once
   Site_Confirmation_Status flips to "Unreachable" the record falls out of the
   Schedule's own Pending/Not-Ready filter on every future run).

NOT BUILT, flagged deliberately (matches every other section's own "flag gaps, don't
silently skip" convention):
- E.3 "Officer Action Options Per Exception Type" (Call customer/Set follow-up/
  Escalate/Cancel/Approve overtime/etc.) — these read as a UI button/menu spec for a
  future widget, not Deluge logic. No widget exists yet for any DMS module (matches
  the deferred-UI decision made at the very start of this whole build).
- E.4 "Exception Queue Board View" color coding (Red/Orange/Yellow by severity) — pure
  UI/display concern, same as Section D's own calendar color coding, deferred the
  same way (a future widget reads Severity and renders the color, no field needed).
- E.5's same-day/2-day/5-day resolution-time SLA by severity is a policy VALUE
  (already seeded in Section F: high_severity_same_day_resolution) but has no
  enforcement workflow (e.g. an overdue-alert Schedule) — not built, would need its
  own daily scan similar to DMS_Site_Confirmation_FollowUp; flagged as a gap, not
  attempted, since the plan doesn't explicitly require automatic escalation, only
  that the SLA be a known/visible policy value.
- Dispatch-stage exceptions (Delivery failed, Team no-show) had no trigger source at
  all — **CLOSED 2026-08-01**, see `dms_field_work_reschedule.txt` (7th integration
  point): Field Work's own Status="Reschedule Requested" now raises a real
  Exception_Stage="Dispatch" record automatically. **REVISED 2026-08-07** — the
  requeue itself (clone a fresh Service_Appointment, close the original as Failed,
  stamp Priority + Rescheduled_Via_Exception) moved OUT of that file and INTO this
  workflow (EXC_Resolve_Sync, above), gated on the officer actually resolving the
  Exception rather than firing immediately when the reschedule is first requested.
  Team no-show still has no trigger source (no distinct field for it anywhere in
  this build) — Manual stage is still fully supported via the native form directly
  (Raised_By="Officer").

UNTESTED — needs: (1) EXC_Resolve_Sync pasted live (now includes the Dispatch-stage
requeue block); (2) trigger one of the 6 original integration points (easiest:
re-use the Section D conflict-test setup — TEST-SO-DMS-005 already has an Open
"Calendar Conflict" exception sitting on Service_Appointment, confirm a matching
DMS_Exception_Queue record also exists with the right Stage/Severity/Reason); (3)
resolve that Exception record (Status=Resolved, Revert_to_System=true), confirm the
linked Service_Appointment's Exception_Status flips back to "Resolved" and
Suggested/Confirmed_Schedule_Date both clear; (4) click Re_Schedule on that same
now-unblocked record, confirm the engine runs again cleanly (this whole flow is
UNCHANGED by the 2026-08-07 revision — only Dispatch-stage exceptions get the new
requeue behavior, every other stage still works exactly as before).

**NEW test sequence, Dispatch-stage requeue-on-resolve specifically**: (5) trigger
`dms_field_work_reschedule.txt` (Field Work Status="Reschedule Requested" + a real
reason) — confirm a new DMS_Exception_Queue record appears (Exception_Stage=
"Dispatch") and the ORIGINAL Service_Appointment is completely untouched (no Failed
flip yet, this is the key behavior change from the 2026-08-01 version); (6) resolve
that Exception with Status="Dismissed" — confirm NOTHING gets cloned (Dismissed
deliberately does not requeue, see the code comment); (7) create a 2nd reschedule
request the same way, this time resolve with Status="Resolved" + a Resolution_Action
— confirm: a brand-new Service_Appointment appears with Priority=true and
Rescheduled_Via_Exception set to this Exception's own Exception_ID, the ORIGINAL
Service_Appointment flips to Appointment_Status="Failed", and per
dms_scheduling_engine.txt's own 2026-08-07 change, once that new record's Site
Confirmation completes it should auto-schedule itself with zero manual Confirm step;
(8) re-save the same now-Resolved Exception again without changing anything — confirm
it does NOT create a second clone (Requeue_Processed dedup guard).

````
