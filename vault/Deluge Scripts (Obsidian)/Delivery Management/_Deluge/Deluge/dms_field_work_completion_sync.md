---
title: "dms_field_work_completion_sync"
source_file: "dms_field_work_completion_sync.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 311
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - procurement
  - purchase-order
---

# dms_field_work_completion_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `dms_field_work_completion_sync.txt`
> - **Lines of Code:** 311
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== DMS — Field Work Completion → Real-Time Schedule Sync (Phase 1B) ==
== New 2026-09-08, per user request. Phase 1A (dms_scheduling_engine.txt) chains
   Suggested_Time_Slot off ESTIMATED duration only — that file's own NOTES flagged
   the real gap this closes: no field/workflow ever pushed a completed Field Work's
   REAL finish time back onto Service_Appointment_Form, and no downstream same-day
   job for the same team ever got corrected once the real finish time was known.

   Builds on 2 fields already confirmed LIVE via OngoingService's own working
   app/index.html (Widget\DMS\OngoingService) — no new fields needed:
     - Field_Work.Schedule_End_Date_and_Time — real DateTime, not an estimate.
     - Field_Work.Service_Appointment_ID — the CORRECT modern join back to
       Service_Appointment_Form (added 2026-08-07 for an unrelated bug — see that
       widget's own header comment). Deliberately used here INSTEAD OF the older
       Sales_Order-based join dms_field_work_reschedule.txt still uses — that
       file's own 2026-08-01 comment documents the SO join as unreliable when a
       Sales Order has more than one Field_Work/Service_Appointment row. ==

DECISION, confirmed with user 2026-09-08 before building: a job that is only
SUGGESTED (not yet officer-Confirmed) for the same Installer/day gets its
Suggested_Time_Slot auto-corrected to the real finish time — safe, nobody has
committed to it yet (same "only Confirmed bookings are locked in" philosophy
Phase 1A already established for foundUsed). A job that is ALREADY CONFIRMED for
later the same day is NEVER auto-changed — the driver/installer may already be en
route to the old confirmed time — instead flagged as a new "Schedule Drift"
Exception, and ONLY when the real finish time would actually run PAST that
confirmed job's own start (a genuine conflict), not for any/every timing
difference. The officer decides what to do from there via the normal Exception
Queue / DeliveryQueue flow.

====================================================
PREREQUISITE: none. Schedule_End_Date_and_Time, Installation_Status, and
Service_Appointment_ID all already exist live on Field_Work.
====================================================

====================================================
WORKFLOW SETUP — FW_Completion_Schedule_Sync
  Form: Field_Work
  Trigger: Created or Edited > Successful form submission
====================================================

--- Action 1 ---

if(input.Installation_Status == "Complete" && input.Schedule_End_Date_and_Time != null && input.Service_Appointment_ID != null && input.Service_Appointment_ID != "")
{
	saId = input.Service_Appointment_ID.toLong();
	saRec = Service_Appointment_Form[ID == saId];

	// SAFETY CHECK, added 2026-09-08 — real live bug found: 2 Service_Appointment
	// records sharing one Sales_Order (2 packages/deliveries under the same SO)
	// resolved to the SAME Field_Work row via OngoingService's own FW_BY_SO
	// fallback (that widget's own 2026-08-07 comment already flagged this as a
	// legacy-record risk) — meaning a Field_Work save could carry a stale/wrong
	// Service_Appointment_ID pointing at a SIBLING delivery, not the one actually
	// being worked on. Cross-checking Sales_Order here is cheap and catches
	// exactly that class of mismatch: a genuinely correct ID always has its own
	// Service_Appointment's Sales_Order matching the Field_Work's own Sales_Order.
	// On a mismatch, do NOT complete/touch the wrong record — flag it instead so
	// an officer notices, rather than silently marking a sibling delivery done.
	idMismatch = (saRec != null && input.Sales_Order != null && saRec.Sales_Order != input.Sales_Order);
	if(idMismatch)
	{
		mismatchRec = Service_Appointment_Form[ID == saId];
		mismatchRec.Exception_Status = "Flagged";
		mismatchRec.Exception_Reason = "Field Work ID Mismatch — resolved Service_Appointment's SO doesn't match the Field Work's own SO, completion not applied";
		custNameMismatch = "";
		if(mismatchRec.Customer_Name != null)
		{
			fNameMismatch = mismatchRec.Customer_Name.first_name;
			lNameMismatch = mismatchRec.Customer_Name.last_name;
			if(fNameMismatch == null){ fNameMismatch = ""; }
			if(lNameMismatch == null){ lNameMismatch = ""; }
			custNameMismatch = (fNameMismatch + " " + lNameMismatch).trim();
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = mismatchRec.ID
			Customer_Name = custNameMismatch
			Exception_Stage = "Dispatch"
			Exception_Reason = "Field Work ID Mismatch — resolved Service_Appointment's SO doesn't match the Field Work's own SO, completion not applied"
			Severity = "High"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
	}

	// Idempotency guard: only the FIRST save that transitions this Service
	// Appointment into Completed runs the block below. A later resave of the
	// same (already-Completed) Field Work record — e.g. officer editing notes
	// afterward — finds saRec.Appointment_Status already "Completed" and skips
	// entirely, so downstream jobs never get re-pushed/re-flagged repeatedly.
	if(saRec != null && !idMismatch && saRec.Appointment_Status != "Completed" && saRec.Appointment_Status != "Failed")
	{
		saRec.Appointment_Status = "Completed";

		// NEW 2026-09-08, per user ("bat di nakukuha kung kailan talaga nag-start
		// at nag-end?") — the real actual Schedule_Start/End_Date_and_Time from
		// Field_Work was only visible via the widget's own "View Field Report"
		// popup, not on the Delivery Queue's "ON THE CALENDAR" summary (which
		// kept showing the ORIGINALLY-Confirmed planned time even after
		// completion — can differ by days from what actually happened on a job
		// that ran late/early). Appends the real actual times directly onto
		// Calendar_Event_Summary so they're visible without an extra click.
		// UNTESTED: .toString("MMM dd, yyyy hh:mm a") format pattern support on a
		// native DateTime value, same "flag deliberately" as the HH:mm parsing
		// below.
		actualStartDT = input.Schedule_Start_Date_and_Time;
		actualEndDTForNote = input.Schedule_End_Date_and_Time;
		actualTimeNote = " | Actual: ";
		if(actualStartDT != null)
		{
			actualTimeNote = actualTimeNote + actualStartDT.toString("MMM dd, yyyy hh:mm a");
		}
		else
		{
			actualTimeNote = actualTimeNote + "?";
		}
		actualTimeNote = actualTimeNote + " - ";
		if(actualEndDTForNote != null)
		{
			actualTimeNote = actualTimeNote + actualEndDTForNote.toString("hh:mm a");
		}
		else
		{
			actualTimeNote = actualTimeNote + "?";
		}
		baseSummaryFW = saRec.Calendar_Event_Summary;
		if(baseSummaryFW == null)
		{
			baseSummaryFW = "";
		}
		saRec.Calendar_Event_Summary = baseSummaryFW + actualTimeNote;

		teamInstaller = saRec.Installer;
		teamDate = saRec.Confirmed_Schedule_Date;
		if(teamInstaller != null && teamDate != null)
		{
			actualEndDT = input.Schedule_End_Date_and_Time;

			// Real finish time, minutes-since-midnight — same minute-math idiom as
			// Phase 1A's computedTimeSlot (dms_scheduling_engine.txt), just anchored
			// on a real DateTime value (24-hour "HH:mm") instead of parsing an
			// existing "H:MM AM/PM" placeholder string.
			// UNTESTED: .toString("HH:mm") on a native DateTime field value is the
			// standard Deluge date-formatting idiom, but not yet confirmed live in
			// THIS app specifically — flag if it errors or returns an unexpected
			// shape, same "flag deliberately" habit as everywhere else in this file.
			actualEndTimeStr24 = actualEndDT.toString("HH:mm");
			aeParts = actualEndTimeStr24.toList(":");
			actualEndMin = 0;
			if(aeParts.size() == 2)
			{
				actualEndMin = (aeParts.get(0).toLong() * 60) + aeParts.get(1).toLong();
			}
			aeHr24 = actualEndMin / 60;
			aeMinRem = actualEndMin - (aeHr24 * 60);
			aeDispHr = aeHr24;
			if(aeHr24 == 0){ aeDispHr = 12; }
			if(aeHr24 > 12){ aeDispHr = aeHr24 - 12; }
			aeDispAmPm = "AM";
			if(aeHr24 >= 12){ aeDispAmPm = "PM"; }
			aeMinStr = aeMinRem + "";
			if(aeMinRem < 10){ aeMinStr = "0" + aeMinRem; }
			actualEndTimeStr = aeDispHr + ":" + aeMinStr + " " + aeDispAmPm; // "H:MM AM/PM" — same display convention as Suggested_Time_Slot elsewhere in this app

			// ---- Branch A: not-yet-confirmed suggestions for the same team/day —
			// safe to auto-correct, nobody has committed to them yet. ----
			pendingSameDay = Service_Appointment_Form[Installer == teamInstaller && Suggested_Schedule_Date == teamDate && Confirmed_Schedule_Date == null && Appointment_Status != "Failed" && ID != saRec.ID];
			if(pendingSameDay != null)
			{
				for each psd in pendingSameDay
				{
					pendRec = Service_Appointment_Form[ID == psd.ID];
					pendRec.Suggested_Time_Slot = actualEndTimeStr;
				}
			}

			// ---- Branch B: already-CONFIRMED jobs for the same team/day — NEVER
			// auto-change a committed time (driver may already be en route). Only
			// flag a "Schedule Drift" Exception when the real finish would actually
			// run PAST that job's own already-confirmed start — a genuine conflict,
			// not just any timing difference. ----
			confirmedSameDay = Service_Appointment_Form[Installer == teamInstaller && Confirmed_Schedule_Date == teamDate && Appointment_Status != "Completed" && Appointment_Status != "Failed" && ID != saRec.ID];
			if(confirmedSameDay != null)
			{
				for each csd in confirmedSameDay
				{
					// Confirmed_Time_Slot is a real TIME-type field — reading it
					// directly (csd.Confirmed_Time_Slot) returns a TIME value, NOT a
					// string; comparing that against a STRING literal (e.g. != "")
					// is a type error in Deluge ("left expression is of type TIME and
					// right expression is of type STRING"), confirmed live 2026-09-08.
					// .toString() must be called FIRST to get a real string, matching
					// the same pattern this app's own Action 2 already used correctly
					// (rec2's timeSlotStr = rec2.Confirmed_Time_Slot.toString();).
					csdTimeStr = "";
					if(csd.Confirmed_Time_Slot != null)
					{
						csdTimeStr = csd.Confirmed_Time_Slot.toString();
					}
					if(csdTimeStr != null && csdTimeStr != "")
					{
						csdParts = csdTimeStr.toList(" ");
						csdMin = -1;
						if(csdParts.size() == 2)
						{
							csdHM = csdParts.get(0).toList(":");
							// .toString() on a TIME field may include seconds
							// ("08:00:00 AM") rather than this app's own "8:00 AM"
							// writing convention — only hour/minute (first 2 parts)
							// are used, any 3rd (seconds) part is ignored.
							if(csdHM.size() >= 2)
							{
								csdHr = csdHM.get(0).toLong();
								csdMinPart = csdHM.get(1).toLong();
								csdAmPm = csdParts.get(1).toUpperCase();
								if(csdAmPm == "PM" && csdHr != 12){ csdHr = csdHr + 12; }
								if(csdAmPm == "AM" && csdHr == 12){ csdHr = 0; }
								csdMin = (csdHr * 60) + csdMinPart;
							}
						}
						if(csdMin >= 0 && actualEndMin > csdMin)
						{
							flagRec = Service_Appointment_Form[ID == csd.ID];
							flagRec.Exception_Status = "Flagged";
							flagRec.Exception_Reason = "Schedule Drift — Prior job finished later than planned";
							custNameDrift = "";
							if(flagRec.Customer_Name != null)
							{
								fNameDrift = flagRec.Customer_Name.first_name;
								lNameDrift = flagRec.Customer_Name.last_name;
								if(fNameDrift == null){ fNameDrift = ""; }
								if(lNameDrift == null){ lNameDrift = ""; }
								custNameDrift = (fNameDrift + " " + lNameDrift).trim();
							}
							insert into DMS_Exception_Queue
							[
								Sales_Order_Reference = flagRec.ID
								Customer_Name = custNameDrift
								Exception_Stage = "Scheduling"
								Exception_Reason = "Schedule Drift — Prior job finished later than planned"
								Severity = "Medium"
								Raised_By = "System"
								Date_Raised = zoho.currenttime
								Status = "Open"
								Added_User = zoho.loginuser
							];
						}
					}
				}
			}
		}
	}
}

====================================================
NOTES:
- **FIXED 2026-09-08, real live error found on first paste attempt**: "Error at
  line number: 66. In Criteria left expression is of type TIME and right
  expression is of type STRING and the operator != is not valid." Root cause:
  `Confirmed_Time_Slot` (and by the same logic, `Suggested_Time_Slot`) is a real
  TIME-type field — reading it directly (`csd.Confirmed_Time_Slot`) returns a TIME
  value, not a string, so comparing it against a STRING literal (`!= ""`) is a
  type error. `.toString()` must be called FIRST — confirms/generalizes what this
  app's OWN Action 2 (dms_scheduling_engine.txt) already did correctly elsewhere
  (`timeSlotStr = rec2.Confirmed_Time_Slot.toString();`), and what this same
  file's own dms_scheduling_engine.txt NOTES had already flagged as an untested
  risk ("if it errors, the fix is likely a proper Time-type construction"). Fixed
  by converting via `.toString()` inside a null-guard BEFORE any string
  comparison/parsing. Also loosened the colon-split size check from `== 2` to
  `>= 2`, since `.toString()` on a TIME field may render WITH seconds
  ("08:00:00 AM") rather than this app's own writing convention ("8:00 AM", no
  seconds) — the 3rd (seconds) part is simply ignored, only hour/minute used.
  **General rule for this app going forward, not just this file**: any TIME-type
  field must go through `.toString()` before being treated as a string anywhere
  (comparison, `.toList()`, concatenation-then-reparse) — confirmed live, not
  just a theoretical Deluge doc claim.
- Branch A (pending/Suggested-only) and Branch B (Confirmed/flag-only) are
  mutually exclusive by their own criteria (Confirmed_Schedule_Date == null vs.
  != null) — a given Service_Appointment record can only ever match one branch,
  never both, so there's no double-processing risk between them.
- SIMPLIFICATION, flagged deliberately: if 2+ records match Branch A (multiple
  still-pending suggestions for the same team/day), ALL of them get pushed to the
  SAME actualEndTimeStr — this app has no explicit "job order/sequence" field to
  chain them one-after-another the way Phase 1A's single foundUsed offset does.
  Still strictly better than the stale pre-Phase-1B estimate, but not perfectly
  sequenced when there are 3+ stops queued for one team on one day. Revisit if
  this turns out to matter in practice.
- Reuses the exact same "H:MM AM/PM" 12-hour string format as Suggested_Time_Slot/
  Confirmed_Time_Slot everywhere else in this app (dms_scheduling_engine.txt),
  parsed with the identical toList(" ")/toList(":") idiom — kept consistent so no
  other file (widgets included) needs to handle a different time-string shape.
- `Added_User = zoho.loginuser` included on the new DMS_Exception_Queue insert per
  the same-day discovery in dms_scheduling_engine.txt's own NOTES (confirmed a
  real, widely-used convention across 107+ files in this project).
- UNTESTED — full chain needs, in order: (1) this file pasted as a new workflow on
  Field_Work (Created or Edited > Successful form submission); (2) a Service
  Appointment with Confirmed_Schedule_Date/Confirmed_Time_Slot/Installer set, plus
  a 2nd Suggested-only (not yet Confirmed) record for the SAME Installer/date; (3)
  mark the first one's Field Work Installation_Status="Complete" with a real
  Schedule_End_Date_and_Time filled in, save; (4) confirm: the first Service
  Appointment's Appointment_Status flips to "Completed"; the 2nd (pending) record's
  Suggested_Time_Slot updates to the real finish time; (5) separately, set up a 3rd
  record ALREADY Confirmed for later that same team/day at a time EARLIER than the
  real finish time just recorded — confirm it gets Exception_Status="Flagged" /
  Exception_Reason="Schedule Drift..." and a new DMS_Exception_Queue row, with its
  own Confirmed_Schedule_Date/Confirmed_Time_Slot completely UNCHANGED; (6) resave
  the same already-Completed Field Work record (e.g. edit Logistic_Notes only) —
  confirm nothing re-fires a 2nd time (idempotency guard).
====================================================

````
