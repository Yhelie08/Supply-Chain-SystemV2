---
title: "IPAPASTE_KO_2026-09-16"
source_file: "IPAPASTE_KO_2026-09-16.txt"
category: "_Shared/Deluge/_Unlabelled"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 1670
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
---

# IPAPASTE_KO_2026-09-16

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `_Shared/Deluge/_Unlabelled`
> - **Source File:** `IPAPASTE_KO_2026-09-16.txt`
> - **Lines of Code:** 1,670
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
============================================================
READY-TO-PASTE, 2026-09-16 — 5 piraso, direkta na copy-paste,
walang extra na dapat tanggalin. Kopyahin mula sa " >>> START"
hanggang " <<< END" ng bawat piraso (huwag isama ang mga label
na may >>> / <<<, code lang sa GITNA).
============================================================


============================================================
PIRASO 1 / 5
Saan ilalagay: Workflow tab > Form workflows > Service Appointment Form
              > SA_Scheduling_Engine (4 Actions) > buksan > ACTION 1
============================================================
>>> START PIRASO 1

if(input.Site_Confirmation_Status == "Confirmed" && input.Suggested_Schedule_Date == null && input.Confirmed_Schedule_Date == null)
{
	rec = Service_Appointment_Form[ID == input.ID];

	// Gate: Exception Status must be None/Resolved before scheduling can proceed
	if(input.Exception_Status == "Flagged")
	{
		return;
	}

	// ADDED 2026-09-14, per user (Process Engineer + System Developer walkthrough,
	// "Wala namang limitasyon ang Pick Up kasi naka depende ito sa customer") — a
	// Pick Up delivery has no team/vehicle to dispatch at all (the client comes to
	// get the item themselves), so it has no real "capacity" to search for — the
	// whole slot-search/team-matching logic below simply does not apply. Confirmed
	// live: "Pick Up" already exists as a real choice on Type_of_Delivery (Service
	// Appointment Form field builder), just never had engine logic wired to it.
	// Deliberately just returns — no Suggested_Schedule_Date is written, leaving
	// Confirmed_Schedule_Date entirely open for the dispatcher (or the client
	// themselves, per the same conversation) to set directly via DeliveryQueue.
	// See Action 2's own matching Pick Up branch for what happens once that date is
	// actually set.
	if(input.Type_of_Delivery == "Pick Up")
	{
		return;
	}

	// Classify (B.3)
	deliveryType = input.Type_of_Delivery;
	if(deliveryType == "Multi-Day Install")
	{
		rec.Exception_Status = "Flagged";
		rec.Exception_Reason = "Requires Manual Planning";
		custNameExc1 = "";
		if(rec.Customer_Name != null)
		{
			custNameExc1 = rec.Customer_Name.first_name + " " + rec.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec.ID
			Customer_Name = custNameExc1
			Exception_Stage = "Scheduling"
			Exception_Reason = "Requires Manual Planning"
			Severity = "Medium"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		return;
	}
	isFullDay = (deliveryType == "Full-Day Install");
	fleetAssignment = "Own Fleet"; // 3rd-party auto-decision not implemented, see NOTES — CONFIRMED 2026-09-14 per user this stays a MANUAL dispatcher override, not an automatic rule ("Oo gawin na itong manual desisyon ito kasi depende parin ito sa customer")

	estDuration = input.Estimated_Duration;
	if(estDuration == null || estDuration == 0)
	{
		// FIXED 2026-09-11, per user ("ayusin natin lahat ng dapat ifix") — a flat
		// 2hr guess was used for EVERY delivery type whenever this field was left
		// blank, which is the common case in practice per the user's own report
		// ("officers never fill it in even on completed orders"), not a rare edge
		// case — meaning the whole capacity/chaining engine was mostly scheduling
		// off a guess, not real job durations. Now defaults by Type_of_Delivery
		// (Delivery Only=2h, With Installation=4h, Full-Day Install=8h — same
		// numbers proposed earlier this project and never confirmed/built), AND
		// writes the default back onto the record itself so Estimated_Duration is
		// no longer silently blank for any OTHER feature/report that reads it
		// directly, not just this one calculation.
		estDuration = if(deliveryType == "With Installation", 4, if(deliveryType == "Full-Day Install", 8, 2));
		rec.Estimated_Duration = estDuration;
	}
	bufferPct = 15;
	pBuf = Policy_Settings[Policy_Key == "traffic_buffer_percent"];
	if(pBuf != null && pBuf.Value != null && pBuf.Value != "")
	{
		bufferPct = pBuf.Value.toLong();
	}
	bufferedDuration = estDuration * (1 + (bufferPct / 100.0));
	if(isFullDay)
	{
		bufferedDuration = 8; // Block Rule: full workday, matches B.3's own rule
	}

	maxWindow = 14;
	pWin = Policy_Settings[Policy_Key == "max_days_scheduling_window"];
	if(pWin != null && pWin.Value != null && pWin.Value != "")
	{
		maxWindow = pWin.Value.toLong();
	}
	workdayHours = 9; // fallback default, overridden below from Policy_Settings
	pStartWD = Policy_Settings[Policy_Key == "workday_start_time"];
	pEndWD = Policy_Settings[Policy_Key == "workday_end_time"];
	if(pStartWD != null && pStartWD.Value != null && pStartWD.Value != "" && pEndWD != null && pEndWD.Value != null && pEndWD.Value != "")
	{
		sParts = pStartWD.Value.toList(" ");
		eParts = pEndWD.Value.toList(" ");
		if(sParts.size() == 2 && eParts.size() == 2)
		{
			sHr = sParts.get(0).toList(":").get(0).toLong();
			eHr = eParts.get(0).toList(":").get(0).toLong();
			if(sParts.get(1).toUpperCase() == "PM" && sHr != 12){ sHr = sHr + 12; }
			if(eParts.get(1).toUpperCase() == "PM" && eHr != 12){ eHr = eHr + 12; }
			if(sParts.get(1).toUpperCase() == "AM" && sHr == 12){ sHr = 0; }
			if(eParts.get(1).toUpperCase() == "AM" && eHr == 12){ eHr = 0; }
			if(eHr > sHr)
			{
				workdayHours = eHr - sHr;
			}
		}
	}

	// Slot search (B.4) — evaluate every available team per candidate day, earliest
	// day with an eligible team wins. Runs day-by-day rather than one big query
	// because "remaining capacity" depends on that SPECIFIC day's existing bookings.
	// Deluge has NO while loop at all (confirmed) — searchDays is a fixed-length
	// placeholder list (maxWindow empty elements), for each-ed with our own manual
	// dayCounter; the "if(foundTeam == null)" guard inside means once a match is
	// found, remaining iterations do nothing instead of needing a break statement
	// (Deluge for-each has no reliable early-exit either — this dodges that too).
	// NOTE: deliberately never hold a Daily_Team_Availability RECORD across a loop
	// boundary/reassignment (e.g. "bestTeam = t;" then read later) — same exotic
	// object-lifetime class as this app's documented subform-row-mutability gotcha.
	// Only plain strings/numbers (Installer/Driver name, hours) survive past each
	// for-each iteration.
	foundInstaller = null;
	foundDriver = null;
	foundDate = null;
	foundUsed = 0;
	foundVehicle = null;
	dayCounter = 0;
	searchDays = "".leftpad(maxWindow).toList(""); // FIX 2026-09-11: now includes TODAY as a candidate (was tomorrow-only, maxWindow-1 length)
	for each  dayMarker in searchDays
	{
		dayCounter = dayCounter + 1;
		if(foundInstaller == null)
		{
			candidateDate = zoho.currentdate.addDay(dayCounter - 1); // offset 0 = today, not tomorrow
			teams = Daily_Team_Availability[Availability_Date == candidateDate && Availability_Status != "Not Available"];
			bestInstaller = null;
			bestDriver = null;
			bestRemaining = -1;
			bestUsed = 0;
			bestVehicle = null;
			bestSoCount = 999999;
			if(teams != null)
			{
				for each  t in teams
				{
					tInstaller = t.Installer;
					tDriver = t.Driver;
					tVehicle = t.Vehicle;
					cap = t.Max_Capacity_Hours;
					if(cap == null)
					{
						cap = 0;
					}
					usedRecs = Service_Appointment_Form[Installer == tInstaller && Confirmed_Schedule_Date == candidateDate && Appointment_Status != "Failed"];
					used = 0;
					if(usedRecs != null)
					{
						for each  u in usedRecs
						{
							ud = u.Estimated_Duration;
							if(ud == null)
							{
								ud = 0;
							}
							used = used + (ud * (1 + (bufferPct / 100.0)));
						}
					}
					remaining = cap - used;

					// NEW 2026-09-15, per user ("by SO ang capacity, hindi package") — a team
					// can also cap out by NUMBER OF SO/deliveries per day, independent of
					// hours left. Counts BOTH Confirmed AND Suggested-but-not-yet-confirmed
					// jobs for this team/day (unlike the hours-based `used` above, which stays
					// Confirmed-only per its own documented limitation) — this is what actually
					// fixes "system only ever suggests one team": Suggested jobs previously
					// didn't count against ANY capacity check, so every fresh search saw every
					// team at 0 used and kept re-picking the same first-listed team.
					soCountToday = 0;
					soRecsToday = Service_Appointment_Form[Installer == tInstaller && (Confirmed_Schedule_Date == candidateDate || Suggested_Schedule_Date == candidateDate) && Appointment_Status != "Failed"];
					if(soRecsToday != null)
					{
						for each  sr in soRecsToday
						{
							soCountToday = soCountToday + 1;
						}
					}
					maxSO = t.Max_SO_Capacity;
					soCapOk = true;
					if(maxSO != null && maxSO > 0 && soCountToday >= maxSO)
					{
						soCapOk = false;
					}

					// NEW 2026-09-15b -- tie-break: when 2+ teams have EQUAL remaining
					// hours (e.g. both fully idle), prefer whichever has FEWER already-
					// suggested/confirmed jobs today (soCountToday) instead of always
					// picking the first team in query order -- closes the residual
					// "same team keeps getting suggested" gap the same-day Max_SO_
					// Capacity fix didn't fully cover (that fix only blocks once a
					// team HITS its cap; ties before that point were still arbitrary).
					if(soCapOk && bufferedDuration <= remaining && (remaining > bestRemaining || (remaining == bestRemaining && soCountToday < bestSoCount)))
					{
						bestInstaller = tInstaller;
						bestDriver = tDriver;
						bestRemaining = remaining;
						bestUsed = used;
						bestVehicle = tVehicle;
						bestSoCount = soCountToday;
					}
				}
			}
			if(bestInstaller != null)
			{
				foundInstaller = bestInstaller;
				foundDriver = bestDriver;
				foundDate = candidateDate;
				foundUsed = bestUsed;
				foundVehicle = bestVehicle;
			}
		}
	}

	if(foundInstaller == null)
	{
		rec.Exception_Status = "Flagged";
		rec.Exception_Reason = "Calendar Full";
		// FIXED 2026-09-16, per user ("baka may masasuggest siya pero wala naman
		// team availability") — a Suggested_Schedule_Date/Time written by an
		// EARLIER run must not be left sitting on the record once a LATER run
		// genuinely finds zero team availability, or DeliveryQueue keeps showing
		// (and letting the officer "Approve") a suggestion that no longer has any
		// real team behind it. No-op the first time Action 1 ever runs on a fresh
		// record (nothing to clear yet), but matters once this same clearing is
		// mirrored into Re_Schedule/reScheduleDelivery below, which CAN re-run
		// after a real suggestion already exists.
		rec.Suggested_Schedule_Date = null;
		rec.Suggested_Time_Slot = null;
		rec.Installer = null;
		rec.Assigned_to_Driver = null;
		rec.Fleet_Assignment = null;
		custNameExc2 = "";
		if(rec.Customer_Name != null)
		{
			custNameExc2 = rec.Customer_Name.first_name + " " + rec.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec.ID
			Customer_Name = custNameExc2
			Exception_Stage = "Scheduling"
			Exception_Reason = "Calendar Full"
			Severity = "Medium"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		return;
	}

	// Overtime check (B.6) — approximated via cumulative hours vs a fixed workday
	// span, since no literal clock-time slot tracking exists. 3rd Party skips this
	// entirely per the plan.
	projectedTotal = foundUsed + bufferedDuration;
	isOvertimeRisk = (projectedTotal > workdayHours) && (fleetAssignment == "Own Fleet");
	if(isOvertimeRisk)
	{
		rec.Exception_Status = "Flagged";
		rec.Exception_Reason = "Slot Pushed — Overtime Declined";
		// FIXED 2026-09-16 — same stale-suggestion clear as the Calendar Full
		// block just above, same reasoning.
		rec.Suggested_Schedule_Date = null;
		rec.Suggested_Time_Slot = null;
		rec.Installer = null;
		rec.Assigned_to_Driver = null;
		rec.Fleet_Assignment = null;
		custNameExc3 = "";
		if(rec.Customer_Name != null)
		{
			custNameExc3 = rec.Customer_Name.first_name + " " + rec.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec.ID
			Customer_Name = custNameExc3
			Exception_Stage = "Scheduling"
			Exception_Reason = "Slot Pushed — Overtime Declined"
			Severity = "Medium"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		return;
	}

	// Write suggested schedule (B.7)
	// FIX 2026-09-11, per user (some field teams genuinely start as early as 6:00
	// AM, others later — a single global Policy Setting can't represent that, and
	// per user's own instruction the Policy Setting is deliberately NOT used as a
	// fallback here anymore): read the WINNING team's own Start_Time1 off its
	// Daily_Team_Availability row for foundDate/foundInstaller. Only a hardcoded
	// "8:00 AM" is used if that team left Start_Time1 blank for that day.
	workdayStartStr = "8:00 AM";
	teamStartRecs = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
	if(teamStartRecs != null)
	{
		for each tsr in teamStartRecs
		{
			if(tsr.Start_Time1 != null)
			{
				tsrStr = tsr.Start_Time1.toString();
				if(tsrStr != null && tsrStr != "")
				{
					workdayStartStr = tsrStr;
				}
			}
		}
	}

	// ---- NEW 2026-09-08, per user (avoid idle "pending" time between back-to-
	// back stops for the same team/day — e.g. a 2-hr job suggested at 8:00 AM
	// was leaving a 2nd stop suggested at a flat workday_start_time again
	// instead of right after the first one finishes). Suggested_Time_Slot used
	// to be a flat nominal placeholder (always workday_start_time) for EVERY
	// job on a team's day, ignoring hours already committed earlier that day.
	// Now offsets the suggestion by foundUsed (this team's cumulative buffered
	// hours already booked on foundDate BEFORE this job — already computed
	// above in the slot-search loop) so a 2nd/3rd stop starts right when the
	// prior one is expected to finish. Reuses the SAME 15% traffic buffer
	// already folded into foundUsed/bufferedDuration as the travel allowance
	// between stops, rather than double-counting travel time with a separate
	// fixed gap.
	// SIMPLIFICATION, flagged deliberately: minutes are truncated (toLong()),
	// not rounded — off by at most 59 seconds of display time, never compounds
	// across jobs since each job's offset is always computed fresh from
	// foundUsed (real cumulative hours), not from a previous job's own
	// already-truncated display string. ----
	computedTimeSlot = workdayStartStr;
	ctsParts = workdayStartStr.toList(" ");
	if(ctsParts.size() == 2)
	{
		ctsHM = ctsParts.get(0).toList(":");
		if(ctsHM.size() >= 2) // >=2 not ==2: a native TIME field's toString() can include seconds (3 parts)
		{
			ctsHr = ctsHM.get(0).toLong();
			ctsMin = ctsHM.get(1).toLong();
			ctsAmPm = ctsParts.get(1).toUpperCase();
			if(ctsAmPm == "PM" && ctsHr != 12){ ctsHr = ctsHr + 12; }
			if(ctsAmPm == "AM" && ctsHr == 12){ ctsHr = 0; }
			ctsTotalMin = (ctsHr * 60) + ctsMin + (foundUsed * 60).toLong();
			ctsHr24 = ctsTotalMin / 60;
			ctsMinRem = ctsTotalMin - (ctsHr24 * 60);
			ctsDispHr = ctsHr24;
			if(ctsHr24 == 0){ ctsDispHr = 12; }
			if(ctsHr24 > 12){ ctsDispHr = ctsHr24 - 12; }
			ctsDispAmPm = "AM";
			if(ctsHr24 >= 12){ ctsDispAmPm = "PM"; }
			ctsMinStr = ctsMinRem + "";
			if(ctsMinRem < 10){ ctsMinStr = "0" + ctsMinRem; }
			computedTimeSlot = ctsDispHr + ":" + ctsMinStr + " " + ctsDispAmPm;
		}
	}

	rec.Suggested_Schedule_Date = foundDate;
	rec.Suggested_Time_Slot = computedTimeSlot; // real per-job offset, see NEW 2026-09-08 note above
	/* CHANGED 2026-07-23, per user ("fleet assignment should be the vehicle") —
	   Fleet_Assignment used to just always show the hardcoded fleetAssignment
	   string ("Own Fleet" — 3rd-party auto-decision was never implemented, so
	   this was a constant, not a real decision, on every single record). Now
	   shows the actual assigned team's own Vehicle (captured off the same
	   Daily_Team_Availability row Installer/Driver came from, foundVehicle) when
	   one is set — falls back to the old fleetAssignment string only if that
	   Daily_Team_Availability record's own Vehicle field is blank. */
	if(foundVehicle != null && foundVehicle != "")
	{
		rec.Fleet_Assignment = foundVehicle;
	}
	else
	{
		rec.Fleet_Assignment = fleetAssignment;
	}
	rec.Installation_Required = (deliveryType == "With Installation" || deliveryType == "Full-Day Install");
	rec.Calendar_Entry_Created = false;
	rec.Appointment_Status = "Queued"; // stand-in for "Pending Confirmation", see NOTES
	rec.Installer = foundInstaller;
	rec.Assigned_to_Driver = foundDriver;
	fleetDisplay = fleetAssignment;
	if(foundVehicle != null && foundVehicle != "")
	{
		fleetDisplay = foundVehicle;
	}
	rec.Original_System_Suggestion = "System suggested: " + foundInstaller + " / " + foundDriver + " on " + foundDate + " (" + fleetDisplay + ")";

	// ---- NEW 2026-08-07, per user ("if e sched -> auto priority dapat hindi na
	// mag manual") — a Priority record (stamped true by dms_field_work_reschedule.
	// txt on a freshly re-queued reschedule) auto-confirms its own system
	// suggestion immediately instead of waiting for the officer to manually copy
	// Suggested into Confirmed. Deliberately does NOT touch anything above this
	// point — the normal (non-priority) path runs 100% identically either way.
	// Inlines Action 2's calendar-write logic directly rather than relying on
	// Action 2 firing on its own: setting rec.Confirmed_Schedule_Date here does
	// NOT make Action 2 fire in this same execution (input stays the ORIGINAL
	// submitted snapshot for every action within one workflow run — a rec-write
	// from Action 1 is not visible as input.* to Action 2 until some LATER save
	// re-triggers the whole workflow), so without this block a Priority record's
	// Confirmed_Schedule_Date would sit populated forever with Calendar_Entry_
	// Created still false / Appointment_Status stuck on "Queued".
	if(input.Priority == true)
	{
		// Re-runs the SAME D.3 capacity conflict check Action 2 normally does right
		// before flipping Calendar_Entry_Created — Action 1's own slot-search above
		// already confirmed capacity against ALL non-Failed bookings for this team/
		// date, but this narrower Calendar_Entry_Created==true-only check is what
		// actually gates the calendar lock elsewhere in this file, so it's repeated
		// here for consistency rather than assumed to already be covered.
		teamCapP = 8;
		availRecsP = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
		if(availRecsP != null)
		{
			for each ap in availRecsP
			{
				aCapP = ap.Max_Capacity_Hours;
				if(aCapP != null)
				{
					teamCapP = aCapP;
				}
			}
		}
		otherConfirmedP = Service_Appointment_Form[Installer == foundInstaller && Confirmed_Schedule_Date == foundDate && Calendar_Entry_Created == true && ID != input.ID];
		otherHoursP = 0;
		if(otherConfirmedP != null)
		{
			for each op in otherConfirmedP
			{
				odP = op.Estimated_Duration;
				if(odP == null)
				{
					odP = 0;
				}
				oBufferedP = odP * (1 + (bufferPct / 100.0));
				if(op.Type_of_Delivery == "Full-Day Install")
				{
					oBufferedP = 8;
				}
				otherHoursP = otherHoursP + oBufferedP;
			}
		}
		projectedTeamTotalP = otherHoursP + bufferedDuration;
		if(projectedTeamTotalP <= teamCapP)
		{
			rec.Confirmed_Schedule_Date = foundDate;
			rec.Confirmed_Time_Slot = computedTimeSlot; // real per-job offset, matches Suggested_Time_Slot above

			fNameEvP = "";
			lNameEvP = "";
			if(rec.Customer_Name != null)
			{
				fNameEvP = rec.Customer_Name.first_name;
				lNameEvP = rec.Customer_Name.last_name;
			}
			if(fNameEvP == null){ fNameEvP = ""; }
			if(lNameEvP == null){ lNameEvP = ""; }
			if(fNameEvP != "")
			{
				custNameEvP = fNameEvP + " " + lNameEvP;
			}
			else
			{
				custNameEvP = lNameEvP;
			}
			typeEvP = rec.Type_of_Delivery;
			if(typeEvP == null || typeEvP == ""){ typeEvP = "—"; }
			locationEvP = rec.Customer_Address;
			if(rec.City != null && rec.City != "")
			{
				locationEvP = locationEvP + ", " + rec.City;
			}
			rec.Calendar_Event_Summary = "Title: " + rec.Sales_Order + " - " + custNameEvP + " | Date: " + foundDate + " | Time: " + computedTimeSlot + " (" + bufferedDuration + " hrs) | Team: " + foundInstaller + " / " + foundDriver + " | Fleet: " + fleetDisplay + " | Type: " + typeEvP + " | Location: " + locationEvP + " | Notes: Auto-confirmed (Priority — Reschedule)";
			rec.Calendar_Entry_Created = true;
			rec.Appointment_Status = "Scheduled";
		}
		// else: real capacity conflict at the exact moment of auto-confirm (another
		// record grabbed this same team/date in between) — leave Suggested_* as
		// already written above and DON'T flag a 2nd Exception here; the record just
		// falls back to behaving like any other non-priority suggestion, still
		// showing the Priority badge, until the officer manually confirms it via
		// the normal DeliveryQueue flow (same UI path already proven working).
	}
}

<<< END PIRASO 1


============================================================
Saan ilalagay: PAREHONG SA_Scheduling_Engine workflow, pero
              ACTION 2 (2nd box, hindi Action 1)
============================================================
>>> START PIRASO 1b — ACTION 2

if(input.Confirmed_Schedule_Date != null && input.Calendar_Entry_Created != true)
{
	rec2 = Service_Appointment_Form[ID == input.ID];

	// ADDED 2026-09-14 — see Action 1's own matching Pick Up comment for the full
	// rationale. No team/vehicle involved, so none of D.3's capacity-conflict logic
	// below applies — whatever date/time the dispatcher (or the client themselves)
	// set is simply confirmed outright, no override paperwork needed either (there
	// was never a system Suggested_* value to override in the first place).
	if(input.Type_of_Delivery == "Pick Up")
	{
		fNameEvPU = "";
		lNameEvPU = "";
		if(rec2.Customer_Name != null)
		{
			fNameEvPU = rec2.Customer_Name.first_name;
			lNameEvPU = rec2.Customer_Name.last_name;
		}
		if(fNameEvPU == null){ fNameEvPU = ""; }
		if(lNameEvPU == null){ lNameEvPU = ""; }
		custNameEvPU = (fNameEvPU + " " + lNameEvPU).trim();
		timeSlotStrPU = "";
		if(rec2.Confirmed_Time_Slot != null){ timeSlotStrPU = rec2.Confirmed_Time_Slot.toString(); }
		rec2.Fleet_Assignment = "Customer Pickup";
		rec2.Calendar_Event_Summary = "Title: " + rec2.Sales_Order + " - " + custNameEvPU + " | Date: " + rec2.Confirmed_Schedule_Date + " | Time: " + timeSlotStrPU + " | Type: Pick Up | Notes: Customer/dispatcher-scheduled pickup, no delivery team assigned";
		rec2.Calendar_Entry_Created = true;
		rec2.Appointment_Status = "Scheduled";
		return;
	}

	isOverride = (input.Suggested_Schedule_Date == null) || (input.Confirmed_Schedule_Date != input.Suggested_Schedule_Date) || (input.Confirmed_Time_Slot != input.Suggested_Time_Slot);
	if(isOverride)
	{
		rec2.Override_Applied = true;
		rec2.Override_Timestamp = zoho.currenttime;
		// Override_By / Override_Reason are required by the Validations workflow
		// below whenever this same mismatch is detected — already filled by the
		// time this action runs, or the save would have been blocked.
	}

	// D.3 Rule 1 (No Overlap), reinterpreted per this build's cumulative-hours model —
	// see file NOTES. No literal clock-time slot tracking exists (Suggested/Confirmed_
	// Time_Slot are nominal placeholders, not real distinct times), so "overlap" here
	// means the team's TOTAL confirmed hours for Confirmed_Schedule_Date, including
	// this order, would exceed Daily_Team_Availability.Max_Capacity_Hours.
	teamCap = 8;
	availRecs = Daily_Team_Availability[Availability_Date == input.Confirmed_Schedule_Date && Installer == input.Installer];
	if(availRecs != null)
	{
		for each a in availRecs
		{
			aCap = a.Max_Capacity_Hours;
			if(aCap != null)
			{
				teamCap = aCap;
			}
		}
	}

	bufferPctD = 15;
	pBufD = Policy_Settings[Policy_Key == "traffic_buffer_percent"];
	if(pBufD != null && pBufD.Value != null && pBufD.Value != "")
	{
		bufferPctD = pBufD.Value.toLong();
	}
	myDuration = input.Estimated_Duration;
	if(myDuration == null || myDuration == 0)
	{
		myDuration = 2;
	}
	myBuffered = myDuration * (1 + (bufferPctD / 100.0));
	if(input.Type_of_Delivery == "Full-Day Install")
	{
		myBuffered = 8;
	}

	otherConfirmed = Service_Appointment_Form[Installer == input.Installer && Confirmed_Schedule_Date == input.Confirmed_Schedule_Date && Calendar_Entry_Created == true && ID != input.ID];
	otherHours = 0;
	if(otherConfirmed != null)
	{
		for each o in otherConfirmed
		{
			od = o.Estimated_Duration;
			if(od == null)
			{
				od = 0;
			}
			oBuffered = od * (1 + (bufferPctD / 100.0));
			if(o.Type_of_Delivery == "Full-Day Install")
			{
				oBuffered = 8;
			}
			otherHours = otherHours + oBuffered;
		}
	}

	projectedTeamTotal = otherHours + myBuffered;
	capacityExceeded = (projectedTeamTotal > teamCap);

	// ---- NEW 2026-09-10, per user ("pinapasingit na sched... hindi na magawa ng
	// staff kasi naka fixed na yung sched", ASAP client on-the-spot scenario) —
	// a capacity-exceeding save used to hard-block UNCONDITIONALLY here, even when
	// the officer had already supplied Override_By/Override_Reason (isOverride==
	// true, mandatory via SA_Scheduling_Override_Validate whenever Confirmed
	// differs from Suggested) — meaning there was NO way for an officer to force
	// an urgent job onto an already-full team/day, no matter how deliberate. Now
	// only hard-blocks when isOverride==false (a genuine unintentional conflict,
	// e.g. two officers racing for the same slot) — an authorized override is
	// allowed through to the normal confirm path below instead of being silently
	// rejected while the widget's own save call still reports success. ----
	if(capacityExceeded && !isOverride)
	{
		rec2.Exception_Status = "Flagged";
		rec2.Exception_Reason = "Calendar Conflict";
		custNameExc4 = "";
		if(rec2.Customer_Name != null)
		{
			custNameExc4 = rec2.Customer_Name.first_name + " " + rec2.Customer_Name.last_name;
		}
		insert into DMS_Exception_Queue
		[
			Sales_Order_Reference = rec2.ID
			Customer_Name = custNameExc4
			Exception_Stage = "Calendar"
			Exception_Reason = "Calendar Conflict"
			Severity = "High"
			Raised_By = "System"
			Date_Raised = zoho.currenttime
			Status = "Open"
			Added_User = zoho.loginuser
		];
		// D.7: no silent failure — Calendar_Entry_Created/Appointment_Status stay
		// untouched (never flip to Scheduled), Exception_Status surfaces the block.
		return;
	}
	// else: either within capacity, OR capacityExceeded but the officer explicitly
	// overrode it (Override_By/Override_Reason already on record) — fall through
	// and confirm below. See notesEv/capacityExceeded tag further down and the
	// stale-Exception cleanup right before Calendar_Entry_Created is set.

	// D.2 — Calendar Event Structure, internal snapshot only (no external calendar API
	// — see NOTES). A future widget renders this as the visual calendar board.
	// FIXED 2026-07-28, real bug found live ("Title: SO-16280 - null (TEST
	// ORDER)..." / "Type: null") — Deluge string-concatenates a blank/null
	// field as the literal text "null", not empty string. Hit because a
	// widget-dispatched record (UI/FF Widget/OrderAggregation's own new
	// Dispatch flow) legitimately leaves Customer_Name.first_name blank
	// (that widget has no split-name source) and Type_of_Delivery blank
	// (source DELIVERY_TYPE didn't match the DMS's own picklist). Both
	// fields are now built null-safe before use, same "check for null,
	// substitute empty string" idiom already used elsewhere in this file
	// (see locationEv's own City-append guard right below, already correct).
	fNameEv = "";
	lNameEv = "";
	if(rec2.Customer_Name != null)
	{
		fNameEv = rec2.Customer_Name.first_name;
		lNameEv = rec2.Customer_Name.last_name;
	}
	if(fNameEv == null){ fNameEv = ""; }
	if(lNameEv == null){ lNameEv = ""; }
	if(fNameEv != "")
	{
		custNameEv = fNameEv + " " + lNameEv;
	}
	else
	{
		custNameEv = lNameEv;
	}
	typeEv = rec2.Type_of_Delivery;
	if(typeEv == null || typeEv == ""){ typeEv = "—"; }
	locationEv = rec2.Customer_Address;
	if(rec2.City != null && rec2.City != "")
	{
		locationEv = locationEv + ", " + rec2.City;
	}
	notesEv = "";
	if(isOverride)
	{
		notesEv = "Override: " + rec2.Override_Reason;
	}
	// NEW 2026-09-10 — see capacityExceeded/isOverride note above: tag an
	// over-capacity ASAP override visibly in the calendar summary instead of
	// leaving no trace that this booking pushed the team past its normal cap.
	if(capacityExceeded)
	{
		if(notesEv != "")
		{
			notesEv = notesEv + " | ";
		}
		notesEv = notesEv + "⚠ ASAP — Exceeds Daily Capacity (" + projectedTeamTotal + " / " + teamCap + " hrs)";
	}
	timeSlotStr = rec2.Confirmed_Time_Slot.toString();
	rec2.Calendar_Event_Summary = "Title: " + rec2.Sales_Order + " - " + custNameEv + " | Date: " + rec2.Confirmed_Schedule_Date + " | Time: " + timeSlotStr + " (" + myBuffered + " hrs) | Team: " + rec2.Installer + " / " + rec2.Assigned_to_Driver + " | Fleet: " + rec2.Fleet_Assignment + " | Type: " + typeEv + " | Location: " + locationEv + " | Notes: " + notesEv;

	// NEW 2026-09-10 — clear a stale Flagged badge left over from an earlier
	// blocked attempt (e.g. this exact record was "Calendar Full"/"Calendar
	// Conflict" before) now that it has genuinely been confirmed/scheduled.
	// FIXED 2026-09-10, real live error found: "Variable Exception_Stage does
	// not exist in Service_Appointment_Form" — Exception_Stage is a field on
	// DMS_Exception_Queue (the separate exception-record form), NOT on
	// Service_Appointment_Form itself; this form only carries Exception_Status/
	// Exception_Reason. Rescoped to Exception_Reason instead, matching only the
	// specific reasons THIS engine itself can raise on this form (see the 3
	// Exception_Reason strings used elsewhere in this same file) — same intent
	// (never silently clear an unrelated Flagged exception from elsewhere in
	// the app) without referencing a field this form doesn't have.
	if(rec2.Exception_Status == "Flagged" && (rec2.Exception_Reason == "Calendar Conflict" || rec2.Exception_Reason == "Calendar Full" || rec2.Exception_Reason == "Slot Pushed — Overtime Declined"))
	{
		rec2.Exception_Status = "Resolved";
	}

	rec2.Calendar_Entry_Created = true;
	rec2.Appointment_Status = "Scheduled";
}

<<< END PIRASO 1b


============================================================
Saan ilalagay: PAREHONG SA_Scheduling_Engine workflow, ACTION 3
============================================================
>>> START PIRASO 1c — ACTION 3

if((input.Appointment_Status == "Completed" || input.Appointment_Status == "Failed") && input.Calendar_Entry_Created == true)
{
	statusTag = "[" + input.Appointment_Status + "]";
	if(input.Calendar_Event_Summary == null || !input.Calendar_Event_Summary.contains(statusTag))
	{
		rec3 = Service_Appointment_Form[ID == input.ID];
		baseSummary = rec3.Calendar_Event_Summary;
		if(baseSummary == null)
		{
			baseSummary = "";
		}
		rec3.Calendar_Event_Summary = baseSummary + " " + statusTag;
	}
}

<<< END PIRASO 1c


============================================================
Saan ilalagay: PAREHONG SA_Scheduling_Engine workflow, ACTION 4
============================================================
>>> START PIRASO 1d — ACTION 4

if(input.Type_of_Delivery == "Pick Up" && input.Installer != null && input.Installer != "")
{
	rec4 = Service_Appointment_Form[ID == input.ID];
	rec4.Installer = "";
	rec4.Assigned_to_Driver = "";
	rec4.Suggested_Schedule_Date = null;
	rec4.Suggested_Time_Slot = "";
	rec4.Fleet_Assignment = "Customer Pickup";
	if(input.Confirmed_Schedule_Date != null)
	{
		fNameEvR = "";
		lNameEvR = "";
		if(rec4.Customer_Name != null)
		{
			fNameEvR = rec4.Customer_Name.first_name;
			lNameEvR = rec4.Customer_Name.last_name;
		}
		if(fNameEvR == null){ fNameEvR = ""; }
		if(lNameEvR == null){ lNameEvR = ""; }
		custNameEvR = (fNameEvR + " " + lNameEvR).trim();
		timeSlotStrR = "";
		if(input.Confirmed_Time_Slot != null)
		{
			timeSlotStrR = input.Confirmed_Time_Slot.toString();
		}
		rec4.Calendar_Event_Summary = "Title: " + rec4.Sales_Order + " - " + custNameEvR + " | Date: " + rec4.Confirmed_Schedule_Date + " | Time: " + timeSlotStrR + " | Type: Pick Up | Notes: Converted from delivery to Pick Up — original team released";
		rec4.Calendar_Entry_Created = true;
		rec4.Appointment_Status = "Scheduled";
	}
	else
	{
		rec4.Calendar_Entry_Created = false;
		rec4.Appointment_Status = "Queued";
	}
}

<<< END PIRASO 1d


============================================================
PIRASO 2 / 5
Saan ilalagay: Workflow tab > Form workflows > Service Appointment Form
              > SA_Scheduling_Override_Validate (1 Action) > ACTION 1
============================================================
>>> START PIRASO 2

// ADDED 2026-09-14 — a Pick Up delivery never gets a Suggested_Schedule_Date at all
// (Action 1 returns early for this type, see its own comment), so the OLD
// mismatchDetected check below would ALWAYS read true the moment a dispatcher/client
// sets Confirmed_Schedule_Date directly — wrongly blocking every single Pick Up
// confirmation with "Override By is required," even though no system suggestion
// ever existed to override in the first place. Real, would-be-blocking bug, caught
// before this was pasted live.
if(input.Type_of_Delivery == "Pick Up")
{
	return;
}
mismatchDetected = (input.Confirmed_Schedule_Date != null) && ((input.Suggested_Schedule_Date == null) || (input.Confirmed_Schedule_Date != input.Suggested_Schedule_Date) || (input.Confirmed_Time_Slot != input.Suggested_Time_Slot));
if(mismatchDetected && input.Calendar_Entry_Created != true)
{
	if(input.Override_By == null || input.Override_By == "")
	{
		alert "Override By is required when confirming a schedule that differs from the system suggestion.";
		cancel submit;
	}
	if(input.Override_Reason == null || input.Override_Reason == "")
	{
		alert "Override Reason is required when confirming a schedule that differs from the system suggestion.";
		cancel submit;
	}
}

<<< END PIRASO 2


============================================================
PIRASO 3 / 5
Saan ilalagay: "Report workflows" tab > Report Action Item na
              "Re_Schedule" (button sa Service Appointment list/report)
============================================================
>>> START PIRASO 3

rec = Service_Appointment_Form[ID == input.ID];

// GUARD, added 2026-09-08, per user question ("magbabago ba ang na-approve na
// schedule?") — Re-Schedule on an already-Completed (or Failed) delivery makes
// no business sense (the job already happened) and would silently reset
// Appointment_Status back to "Queued" / Calendar_Entry_Created back to false
// further down in this same script, discarding real completion data. Refuse
// outright instead of letting the rest of this Action Item run.
if(input.Appointment_Status == "Completed" || input.Appointment_Status == "Failed")
{
	return;
}

// ADDED 2026-09-14 — same reasoning as Action 1's own Pick Up branch: no team/
// vehicle involved, so a team slot-search makes no sense here. Re-Schedule on a
// Pick Up record is a no-op — the dispatcher just edits Confirmed_Schedule_Date
// directly instead.
if(input.Type_of_Delivery == "Pick Up")
{
	return;
}

if(input.Exception_Status == "Flagged")
{
	rec.Exception_Status = "Resolved";
	// Re-Schedule is an explicit officer action — treat it as clearing whatever
	// exception blocked scheduling before, consistent with E.5's "Revert to System"
	// concept from the plan (not yet a real Exception Queue record, see NOTES).
}

deliveryType = input.Type_of_Delivery;
if(deliveryType == "Multi-Day Install")
{
	rec.Exception_Status = "Flagged";
	rec.Exception_Reason = "Requires Manual Planning";
	return;
}
isFullDay = (deliveryType == "Full-Day Install");
fleetAssignment = "Own Fleet";

estDuration = input.Estimated_Duration;
if(estDuration == null || estDuration == 0)
{
	// FIXED 2026-09-11, same type-aware default as Action 1 above (Delivery
	// Only=2h/With Installation=4h/Full-Day Install=8h), instead of a flat 2h
	// guess — see Action 1's own comment for the full reasoning.
	estDuration = if(deliveryType == "With Installation", 4, if(deliveryType == "Full-Day Install", 8, 2));
	rec.Estimated_Duration = estDuration;
}
bufferPct = 15;
pBuf = Policy_Settings[Policy_Key == "traffic_buffer_percent"];
if(pBuf != null && pBuf.Value != null && pBuf.Value != "")
{
	bufferPct = pBuf.Value.toLong();
}
bufferedDuration = estDuration * (1 + (bufferPct / 100.0));
if(isFullDay)
{
	bufferedDuration = 8;
}

maxWindow = 14;
pWin = Policy_Settings[Policy_Key == "max_days_scheduling_window"];
if(pWin != null && pWin.Value != null && pWin.Value != "")
{
	maxWindow = pWin.Value.toLong();
}
workdayHours = 9;
pStartWD = Policy_Settings[Policy_Key == "workday_start_time"];
pEndWD = Policy_Settings[Policy_Key == "workday_end_time"];
if(pStartWD != null && pStartWD.Value != null && pStartWD.Value != "" && pEndWD != null && pEndWD.Value != null && pEndWD.Value != "")
{
	sParts = pStartWD.Value.toList(" ");
	eParts = pEndWD.Value.toList(" ");
	if(sParts.size() == 2 && eParts.size() == 2)
	{
		sHr = sParts.get(0).toList(":").get(0).toLong();
		eHr = eParts.get(0).toList(":").get(0).toLong();
		if(sParts.get(1).toUpperCase() == "PM" && sHr != 12){ sHr = sHr + 12; }
		if(eParts.get(1).toUpperCase() == "PM" && eHr != 12){ eHr = eHr + 12; }
		if(sParts.get(1).toUpperCase() == "AM" && sHr == 12){ sHr = 0; }
		if(eParts.get(1).toUpperCase() == "AM" && eHr == 12){ eHr = 0; }
		if(eHr > sHr)
		{
			workdayHours = eHr - sHr;
		}
	}
}

foundInstaller = null;
foundDriver = null;
foundDate = null;
foundUsed = 0;
foundVehicle = null;
dayCounter = 0;
searchDays = "".leftpad(maxWindow).toList(""); // FIX 2026-09-11: now includes TODAY as a candidate (was tomorrow-only, maxWindow-1 length)
for each  dayMarker in searchDays
{
	dayCounter = dayCounter + 1;
	if(foundInstaller == null)
	{
		candidateDate = zoho.currentdate.addDay(dayCounter - 1); // offset 0 = today, not tomorrow
		teams = Daily_Team_Availability[Availability_Date == candidateDate && Availability_Status != "Not Available"];
		bestInstaller = null;
		bestDriver = null;
		bestRemaining = -1;
		bestUsed = 0;
		bestVehicle = null;
		bestSoCount = 999999;
		if(teams != null)
		{
			for each  t in teams
			{
				tInstaller = t.Installer;
				tDriver = t.Driver;
				tVehicle = t.Vehicle;
				cap = t.Max_Capacity_Hours;
				if(cap == null)
				{
					cap = 0;
				}
				usedRecs = Service_Appointment_Form[Installer == tInstaller && Confirmed_Schedule_Date == candidateDate && Appointment_Status != "Failed"];
				used = 0;
				if(usedRecs != null)
				{
					for each  u in usedRecs
					{
						ud = u.Estimated_Duration;
						if(ud == null)
						{
							ud = 0;
						}
						used = used + (ud * (1 + (bufferPct / 100.0)));
					}
				}
				remaining = cap - used;

				// NEW 2026-09-15 — same SO-count capacity check as Action 1's own slot
				// search above (see that block's comment for the full rationale). Mirrored
				// here since Re_Schedule is a separate manually-maintained copy of the same
				// slot-search logic.
				soCountToday = 0;
				soRecsToday = Service_Appointment_Form[Installer == tInstaller && (Confirmed_Schedule_Date == candidateDate || Suggested_Schedule_Date == candidateDate) && Appointment_Status != "Failed"];
				if(soRecsToday != null)
				{
					for each  sr in soRecsToday
					{
						soCountToday = soCountToday + 1;
					}
				}
				maxSO = t.Max_SO_Capacity;
				soCapOk = true;
				if(maxSO != null && maxSO > 0 && soCountToday >= maxSO)
				{
					soCapOk = false;
				}

				// NEW 2026-09-15b -- tie-break: when 2+ teams have EQUAL remaining
				// hours (e.g. both fully idle), prefer whichever has FEWER already-
				// suggested/confirmed jobs today (soCountToday) instead of always
				// picking the first team in query order -- closes the residual
				// "same team keeps getting suggested" gap the same-day Max_SO_
				// Capacity fix didn't fully cover (that fix only blocks once a
				// team HITS its cap; ties before that point were still arbitrary).
				if(soCapOk && bufferedDuration <= remaining && (remaining > bestRemaining || (remaining == bestRemaining && soCountToday < bestSoCount)))
				{
					bestInstaller = tInstaller;
					bestDriver = tDriver;
					bestRemaining = remaining;
					bestUsed = used;
					bestVehicle = tVehicle;
					bestSoCount = soCountToday;
				}
			}
		}
		if(bestInstaller != null)
		{
			foundInstaller = bestInstaller;
			foundDriver = bestDriver;
			foundDate = candidateDate;
			foundUsed = bestUsed;
			foundVehicle = bestVehicle;
		}
	}
}

if(foundInstaller == null)
{
	rec.Exception_Status = "Flagged";
	rec.Exception_Reason = "Calendar Full";
	// FIXED 2026-09-16, per user ("baka may masasuggest siya pero wala naman
	// team availability") — Re_Schedule genuinely CAN re-run on a record that
	// already carries a suggestion from an earlier run, unlike Action 1 (guarded
	// to fire only once). Without this, a record that had a valid suggestion
	// before, then loses its team (Daily_Team_Availability row deleted, etc.) and
	// gets Re-Scheduled, still showed the OLD Suggested Date/Time/Installer in
	// DeliveryQueue as if it were current — clear them so "Calendar Full" means
	// what it says everywhere the record is displayed, not just in Exception_Reason.
	rec.Suggested_Schedule_Date = null;
	rec.Suggested_Time_Slot = null;
	rec.Installer = null;
	rec.Assigned_to_Driver = null;
	rec.Fleet_Assignment = null;
	return;
}

projectedTotal = foundUsed + bufferedDuration;
isOvertimeRisk = (projectedTotal > workdayHours) && (fleetAssignment == "Own Fleet");
if(isOvertimeRisk)
{
	rec.Exception_Status = "Flagged";
	rec.Exception_Reason = "Slot Pushed — Overtime Declined";
	// FIXED 2026-09-16 — same stale-suggestion clear as the Calendar Full block
	// just above, same reasoning.
	rec.Suggested_Schedule_Date = null;
	rec.Suggested_Time_Slot = null;
	rec.Installer = null;
	rec.Assigned_to_Driver = null;
	rec.Fleet_Assignment = null;
	return;
}

// FIX 2026-09-11, per user — same Daily_Team_Availability-based Start_Time1 read
// as the main SA_Scheduling_Engine block above (Policy Setting deliberately not
// used as a fallback anymore — see that block's own note for the full reason).
workdayStartStr = "8:00 AM";
teamStartRecs = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
if(teamStartRecs != null)
{
	for each tsr in teamStartRecs
	{
		if(tsr.Start_Time1 != null)
		{
			tsrStr = tsr.Start_Time1.toString();
			if(tsrStr != null && tsrStr != "")
			{
				workdayStartStr = tsrStr;
			}
		}
	}
}

// ---- NEW 2026-09-08 — same sequential-chaining fix as the main SA_Scheduling_
// Engine block above (see its own "NEW 2026-09-08" note for the full rationale):
// offsets the suggestion by foundUsed instead of always using the flat
// workday_start_time, so a re-run on a team's day that already has other
// bookings starts right after those finish instead of a flat nominal time. ----
computedTimeSlot = workdayStartStr;
ctsParts = workdayStartStr.toList(" ");
if(ctsParts.size() == 2)
{
	ctsHM = ctsParts.get(0).toList(":");
	if(ctsHM.size() >= 2) // >=2 not ==2: a native TIME field's toString() can include seconds (3 parts)
	{
		ctsHr = ctsHM.get(0).toLong();
		ctsMin = ctsHM.get(1).toLong();
		ctsAmPm = ctsParts.get(1).toUpperCase();
		if(ctsAmPm == "PM" && ctsHr != 12){ ctsHr = ctsHr + 12; }
		if(ctsAmPm == "AM" && ctsHr == 12){ ctsHr = 0; }
		ctsTotalMin = (ctsHr * 60) + ctsMin + (foundUsed * 60).toLong();
		ctsHr24 = ctsTotalMin / 60;
		ctsMinRem = ctsTotalMin - (ctsHr24 * 60);
		ctsDispHr = ctsHr24;
		if(ctsHr24 == 0){ ctsDispHr = 12; }
		if(ctsHr24 > 12){ ctsDispHr = ctsHr24 - 12; }
		ctsDispAmPm = "AM";
		if(ctsHr24 >= 12){ ctsDispAmPm = "PM"; }
		ctsMinStr = ctsMinRem + "";
		if(ctsMinRem < 10){ ctsMinStr = "0" + ctsMinRem; }
		computedTimeSlot = ctsDispHr + ":" + ctsMinStr + " " + ctsDispAmPm;
	}
}

rec.Suggested_Schedule_Date = foundDate;
rec.Suggested_Time_Slot = computedTimeSlot;
/* CHANGED 2026-07-23 — same fix as the main scheduling block above, mirrored
   here since this is the Re_Schedule copy (fleetAssignment was always the
   hardcoded "Own Fleet" constant; now shows the actual assigned team's Vehicle
   from Daily_Team_Availability when set). */
if(foundVehicle != null && foundVehicle != "")
{
	rec.Fleet_Assignment = foundVehicle;
}
else
{
	rec.Fleet_Assignment = fleetAssignment;
}
rec.Installation_Required = (deliveryType == "With Installation" || deliveryType == "Full-Day Install");
rec.Calendar_Entry_Created = false;
rec.Appointment_Status = "Queued";
rec.Installer = foundInstaller;
rec.Assigned_to_Driver = foundDriver;
fleetDisplayRR = fleetAssignment;
if(foundVehicle != null && foundVehicle != "")
{
	fleetDisplayRR = foundVehicle;
}
rec.Original_System_Suggestion = "System suggested (re-run): " + foundInstaller + " / " + foundDriver + " on " + foundDate + " (" + fleetDisplayRR + ")";

// ADDED 2026-09-11, per user ("ayusin natin lahat ng dapat ifix") — mirrors Action
// 1's own "if(input.Priority == true)" auto-confirm block (see its comment above
// for the full reasoning), previously flagged in this file's own NOTES section as
// a known, un-mirrored gap: a Priority record re-scheduled via this manual
// Re-Schedule button still required a manual officer Confirm, unlike the normal
// Site-Confirmation-triggered path. Same capacity re-check + inline calendar write,
// same silent-fallback-to-Suggested-only on a genuine conflict.
if(input.Priority == true)
{
	teamCapP = 8;
	availRecsP = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
	if(availRecsP != null)
	{
		for each ap in availRecsP
		{
			aCapP = ap.Max_Capacity_Hours;
			if(aCapP != null)
			{
				teamCapP = aCapP;
			}
		}
	}
	otherConfirmedP = Service_Appointment_Form[Installer == foundInstaller && Confirmed_Schedule_Date == foundDate && Calendar_Entry_Created == true && ID != input.ID];
	otherHoursP = 0;
	if(otherConfirmedP != null)
	{
		for each op in otherConfirmedP
		{
			odP = op.Estimated_Duration;
			if(odP == null)
			{
				odP = 0;
			}
			oBufferedP = odP * (1 + (bufferPct / 100.0));
			if(op.Type_of_Delivery == "Full-Day Install")
			{
				oBufferedP = 8;
			}
			otherHoursP = otherHoursP + oBufferedP;
		}
	}
	projectedTeamTotalP = otherHoursP + bufferedDuration;
	if(projectedTeamTotalP <= teamCapP)
	{
		rec.Confirmed_Schedule_Date = foundDate;
		rec.Confirmed_Time_Slot = computedTimeSlot;

		fNameEvP = "";
		lNameEvP = "";
		if(rec.Customer_Name != null)
		{
			fNameEvP = rec.Customer_Name.first_name;
			lNameEvP = rec.Customer_Name.last_name;
		}
		if(fNameEvP == null){ fNameEvP = ""; }
		if(lNameEvP == null){ lNameEvP = ""; }
		if(fNameEvP != "")
		{
			custNameEvP = fNameEvP + " " + lNameEvP;
		}
		else
		{
			custNameEvP = lNameEvP;
		}
		typeEvP = rec.Type_of_Delivery;
		if(typeEvP == null || typeEvP == ""){ typeEvP = "—"; }
		locationEvP = rec.Customer_Address;
		if(rec.City != null && rec.City != "")
		{
			locationEvP = locationEvP + ", " + rec.City;
		}
		rec.Calendar_Event_Summary = "Title: " + rec.Sales_Order + " - " + custNameEvP + " | Date: " + foundDate + " | Time: " + computedTimeSlot + " (" + bufferedDuration + " hrs) | Team: " + foundInstaller + " / " + foundDriver + " | Fleet: " + fleetDisplayRR + " | Type: " + typeEvP + " | Location: " + locationEvP + " | Notes: Auto-confirmed (Priority — Re-Schedule re-run)";
		rec.Calendar_Entry_Created = true;
		rec.Appointment_Status = "Scheduled";
	}
	// else: real capacity conflict at the exact moment of auto-confirm — leave
	// Suggested_* as already written above, same fallback behavior as Action 1.
}

<<< END PIRASO 3


============================================================
PIRASO 4 / 5
Saan ilalagay: "Functions" tab > Custom Function "reScheduleDelivery"
              (kopyahin LAHAT, kasama ang unang linya "map
              reScheduleDelivery(String recordId)" at ang mga { } —
              ibang editor ito, blangkong canvas, hindi tulad ng ibang
              Custom Function na may sariling paligid na na)
============================================================
>>> START PIRASO 4

map reScheduleDelivery(String recordId)
{
	response = Map();
	r = Service_Appointment_Form[ID == recordId.toLong()];
	if(r == null)
	{
		response.put("status", "error");
		response.put("message", "Record not found");
		return response;
	}

	// GUARD, added 2026-09-08, same as dms_scheduling_engine.txt's Re_Schedule
	// Report Action Item — Re-Schedule on an already-Completed (or Failed)
	// delivery makes no business sense and would silently reset Appointment_
	// Status/Calendar_Entry_Created further down, discarding real completion
	// data. Refuse outright via the response Map (this is a Custom Function,
	// no `alert` available — the widget's own caller shows response.message).
	if(r.Appointment_Status == "Completed" || r.Appointment_Status == "Failed")
	{
		response.put("status", "blocked");
		response.put("message", "Hindi na maaaring i-Re-Schedule — naka-\"" + r.Appointment_Status + "\" na ang deliverang ito.");
		return response;
	}

	// ADDED 2026-09-14 — same reasoning as dms_scheduling_engine.txt's own Pick Up
	// branches: no team/vehicle involved for a Pick Up delivery, so a team
	// slot-search makes no sense here at all.
	if(r.Type_of_Delivery == "Pick Up")
	{
		response.put("status", "blocked");
		response.put("message", "Pick Up deliveries don't need re-scheduling — i-edit na lang diretso ang Confirmed Date/Time.");
		return response;
	}

	if(r.Exception_Status == "Flagged")
	{
		r.Exception_Status = "Resolved";
	}

	deliveryType = r.Type_of_Delivery;
	if(deliveryType == "Multi-Day Install")
	{
		r.Exception_Status = "Flagged";
		r.Exception_Reason = "Requires Manual Planning";
		response.put("status", "flagged");
		response.put("message", "Multi-Day Install requires manual planning — cannot auto-schedule.");
		return response;
	}
	isFullDay = (deliveryType == "Full-Day Install");
	fleetAssignment = "Own Fleet";

	estDuration = r.Estimated_Duration;
	if(estDuration == null || estDuration == 0)
	{
		// FIXED 2026-09-11, same type-aware default as dms_scheduling_engine.txt's
		// Action 1 (Delivery Only=2h/With Installation=4h/Full-Day Install=8h),
		// instead of a flat 2h guess — see that file's own comment for the full
		// reasoning. Also writes the default back onto the record itself.
		estDuration = if(deliveryType == "With Installation", 4, if(deliveryType == "Full-Day Install", 8, 2));
		r.Estimated_Duration = estDuration;
	}
	bufferPct = 15;
	pBuf = Policy_Settings[Policy_Key == "traffic_buffer_percent"];
	if(pBuf != null && pBuf.Value != null && pBuf.Value != "")
	{
		bufferPct = pBuf.Value.toLong();
	}
	bufferedDuration = estDuration * (1 + (bufferPct / 100.0));
	if(isFullDay)
	{
		bufferedDuration = 8;
	}

	maxWindow = 14;
	pWin = Policy_Settings[Policy_Key == "max_days_scheduling_window"];
	if(pWin != null && pWin.Value != null && pWin.Value != "")
	{
		maxWindow = pWin.Value.toLong();
	}
	workdayHours = 9;
	pStartWD = Policy_Settings[Policy_Key == "workday_start_time"];
	pEndWD = Policy_Settings[Policy_Key == "workday_end_time"];
	if(pStartWD != null && pStartWD.Value != null && pStartWD.Value != "" && pEndWD != null && pEndWD.Value != null && pEndWD.Value != "")
	{
		sParts = pStartWD.Value.toList(" ");
		eParts = pEndWD.Value.toList(" ");
		if(sParts.size() == 2 && eParts.size() == 2)
		{
			sHr = sParts.get(0).toList(":").get(0).toLong();
			eHr = eParts.get(0).toList(":").get(0).toLong();
			if(sParts.get(1).toUpperCase() == "PM" && sHr != 12){ sHr = sHr + 12; }
			if(eParts.get(1).toUpperCase() == "PM" && eHr != 12){ eHr = eHr + 12; }
			if(sParts.get(1).toUpperCase() == "AM" && sHr == 12){ sHr = 0; }
			if(eParts.get(1).toUpperCase() == "AM" && eHr == 12){ eHr = 0; }
			if(eHr > sHr)
			{
				workdayHours = eHr - sHr;
			}
		}
	}

	foundInstaller = null;
	foundDriver = null;
	foundDate = null;
	foundUsed = 0;
	foundVehicle = null;
	dayCounter = 0;
	searchDays = "".leftpad(maxWindow).toList(""); // FIX 2026-09-11: now includes TODAY as a candidate (was tomorrow-only, maxWindow-1 length)
	for each  dayMarker in searchDays
	{
		dayCounter = dayCounter + 1;
		if(foundInstaller == null)
		{
			candidateDate = zoho.currentdate.addDay(dayCounter - 1); // offset 0 = today, not tomorrow
			teams = Daily_Team_Availability[Availability_Date == candidateDate && Availability_Status != "Not Available"];
			bestInstaller = null;
			bestDriver = null;
			bestRemaining = -1;
			bestUsed = 0;
			bestVehicle = null;
			bestSoCount = 999999;
			if(teams != null)
			{
				for each  t in teams
				{
					tInstaller = t.Installer;
					tDriver = t.Driver;
					tVehicle = t.Vehicle;
					cap = t.Max_Capacity_Hours;
					if(cap == null)
					{
						cap = 0;
					}
					usedRecs = Service_Appointment_Form[Installer == tInstaller && Confirmed_Schedule_Date == candidateDate && Appointment_Status != "Failed"];
					used = 0;
					if(usedRecs != null)
					{
						for each  u in usedRecs
						{
							ud = u.Estimated_Duration;
							if(ud == null)
							{
								ud = 0;
							}
							used = used + (ud * (1 + (bufferPct / 100.0)));
						}
					}
					remaining = cap - used;

					// NEW 2026-09-15 — same SO-count capacity check as dms_scheduling_engine.
					// txt's own Action 1/Re_Schedule slot search (see that file's header
					// comment for the full rationale: "by SO ang capacity, hindi package",
					// per user, and counting Suggested-not-just-Confirmed jobs here is what
					// fixes the real "system only ever suggests one team" symptom). Mirrored
					// here since this Custom Function is a separate manually-maintained copy
					// of the same slot-search logic.
					soCountToday = 0;
					soRecsToday = Service_Appointment_Form[Installer == tInstaller && (Confirmed_Schedule_Date == candidateDate || Suggested_Schedule_Date == candidateDate) && Appointment_Status != "Failed"];
					if(soRecsToday != null)
					{
						for each  sr in soRecsToday
						{
							soCountToday = soCountToday + 1;
						}
					}
					maxSO = t.Max_SO_Capacity;
					soCapOk = true;
					if(maxSO != null && maxSO > 0 && soCountToday >= maxSO)
					{
						soCapOk = false;
					}

					// NEW 2026-09-15b -- tie-break: when 2+ teams have EQUAL remaining
					// hours (e.g. both fully idle), prefer whichever has FEWER already-
					// suggested/confirmed jobs today (soCountToday) instead of always
					// picking the first team in query order -- closes the residual
					// "same team keeps getting suggested" gap the same-day Max_SO_
					// Capacity fix didn't fully cover (that fix only blocks once a
					// team HITS its cap; ties before that point were still arbitrary).
					if(soCapOk && bufferedDuration <= remaining && (remaining > bestRemaining || (remaining == bestRemaining && soCountToday < bestSoCount)))
					{
						bestInstaller = tInstaller;
						bestDriver = tDriver;
						bestRemaining = remaining;
						bestUsed = used;
						bestVehicle = tVehicle;
						bestSoCount = soCountToday;
					}
				}
			}
			if(bestInstaller != null)
			{
				foundInstaller = bestInstaller;
				foundDriver = bestDriver;
				foundDate = candidateDate;
				foundUsed = bestUsed;
				foundVehicle = bestVehicle;
			}
		}
	}

	if(foundInstaller == null)
	{
		r.Exception_Status = "Flagged";
		r.Exception_Reason = "Calendar Full";
		// FIXED 2026-09-16, per user ("baka may masasuggest siya pero wala naman
		// team availability") — same stale-suggestion clear as the mirrored fix in
		// dms_scheduling_engine.txt's Re_Schedule Action Item (see its own comment
		// for the full reasoning): this Custom Function can re-run on a record
		// that already carries a suggestion from an earlier run, so a genuine
		// Calendar Full result must clear it, not just flag the exception.
		r.Suggested_Schedule_Date = null;
		r.Suggested_Time_Slot = null;
		r.Installer = null;
		r.Assigned_to_Driver = null;
		r.Fleet_Assignment = null;
		response.put("status", "flagged");
		response.put("message", "No available team/slot found within the scheduling window.");
		return response;
	}

	projectedTotal = foundUsed + bufferedDuration;
	isOvertimeRisk = (projectedTotal > workdayHours) && (fleetAssignment == "Own Fleet");
	if(isOvertimeRisk)
	{
		r.Exception_Status = "Flagged";
		r.Exception_Reason = "Slot Pushed — Overtime Declined";
		// FIXED 2026-09-16 — same stale-suggestion clear as the Calendar Full
		// block just above, same reasoning.
		r.Suggested_Schedule_Date = null;
		r.Suggested_Time_Slot = null;
		r.Installer = null;
		r.Assigned_to_Driver = null;
		r.Fleet_Assignment = null;
		response.put("status", "flagged");
		response.put("message", "Best available slot would require overtime — flagged for approval.");
		return response;
	}

	// FIX 2026-09-11, per user — same Daily_Team_Availability-based Start_Time1 read
	// as dms_scheduling_engine.txt's own Action 1/Re_Schedule copies (Policy Setting
	// deliberately not used as a fallback anymore — see that file's own note).
	workdayStartStr = "8:00 AM";
	teamStartRecs = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
	if(teamStartRecs != null)
	{
		for each tsr in teamStartRecs
		{
			if(tsr.Start_Time1 != null)
			{
				tsrStr = tsr.Start_Time1.toString();
				if(tsrStr != null && tsrStr != "")
				{
					workdayStartStr = tsrStr;
				}
			}
		}
	}

	// ---- NEW 2026-09-08 — same sequential-chaining fix as dms_scheduling_engine.
	// txt's Action 1 / Re_Schedule copies (see that file's own "NEW 2026-09-08"
	// note for the full rationale): offsets the suggestion by foundUsed instead
	// of always using the flat workday_start_time, so re-scheduling onto a
	// team's day that already has other bookings starts right after those
	// finish instead of a flat nominal time. ----
	computedTimeSlot = workdayStartStr;
	ctsParts = workdayStartStr.toList(" ");
	if(ctsParts.size() == 2)
	{
		ctsHM = ctsParts.get(0).toList(":");
		if(ctsHM.size() >= 2) // >=2 not ==2: a native TIME field's toString() can include seconds (3 parts)
		{
			ctsHr = ctsHM.get(0).toLong();
			ctsMin = ctsHM.get(1).toLong();
			ctsAmPm = ctsParts.get(1).toUpperCase();
			if(ctsAmPm == "PM" && ctsHr != 12){ ctsHr = ctsHr + 12; }
			if(ctsAmPm == "AM" && ctsHr == 12){ ctsHr = 0; }
			ctsTotalMin = (ctsHr * 60) + ctsMin + (foundUsed * 60).toLong();
			ctsHr24 = ctsTotalMin / 60;
			ctsMinRem = ctsTotalMin - (ctsHr24 * 60);
			ctsDispHr = ctsHr24;
			if(ctsHr24 == 0){ ctsDispHr = 12; }
			if(ctsHr24 > 12){ ctsDispHr = ctsHr24 - 12; }
			ctsDispAmPm = "AM";
			if(ctsHr24 >= 12){ ctsDispAmPm = "PM"; }
			ctsMinStr = ctsMinRem + "";
			if(ctsMinRem < 10){ ctsMinStr = "0" + ctsMinRem; }
			computedTimeSlot = ctsDispHr + ":" + ctsMinStr + " " + ctsDispAmPm;
		}
	}

	r.Suggested_Schedule_Date = foundDate;
	r.Suggested_Time_Slot = computedTimeSlot;
	/* CHANGED 2026-07-23, per user ("fleet assignment should be the vehicle") —
	   same fix as dms_scheduling_engine.txt's 2 copies — shows the actual
	   assigned team's Vehicle (from Daily_Team_Availability) instead of the
	   always-constant "Own Fleet" placeholder, falling back to it only when
	   that Daily_Team_Availability record's own Vehicle field is blank. */
	if(foundVehicle != null && foundVehicle != "")
	{
		r.Fleet_Assignment = foundVehicle;
	}
	else
	{
		r.Fleet_Assignment = fleetAssignment;
	}
	r.Installation_Required = (deliveryType == "With Installation" || deliveryType == "Full-Day Install");
	r.Calendar_Entry_Created = false;
	r.Appointment_Status = "Queued";
	r.Installer = foundInstaller;
	r.Assigned_to_Driver = foundDriver;
	fleetDisplay = fleetAssignment;
	if(foundVehicle != null && foundVehicle != "")
	{
		fleetDisplay = foundVehicle;
	}
	r.Original_System_Suggestion = "System suggested (re-run): " + foundInstaller + " / " + foundDriver + " on " + foundDate + " (" + fleetDisplay + ")";

	// ADDED 2026-09-11, per user ("ayusin natin lahat ng dapat ifix") — mirrors
	// dms_scheduling_engine.txt's Action 1 "if(input.Priority == true)" auto-
	// confirm block (see that file's comment for the full reasoning), the 3rd
	// and last of this app's 3 slot-search call sites to get it — previously
	// flagged as a known, un-mirrored gap: a Priority record re-scheduled via
	// the widget's Re-Schedule button (this function) still required a manual
	// officer Confirm, unlike the normal Site-Confirmation-triggered path.
	autoConfirmedP = false;
	if(r.Priority == true)
	{
		teamCapP = 8;
		availRecsP = Daily_Team_Availability[Availability_Date == foundDate && Installer == foundInstaller];
		if(availRecsP != null)
		{
			for each ap in availRecsP
			{
				aCapP = ap.Max_Capacity_Hours;
				if(aCapP != null)
				{
					teamCapP = aCapP;
				}
			}
		}
		otherConfirmedP = Service_Appointment_Form[Installer == foundInstaller && Confirmed_Schedule_Date == foundDate && Calendar_Entry_Created == true && ID != r.ID];
		otherHoursP = 0;
		if(otherConfirmedP != null)
		{
			for each op in otherConfirmedP
			{
				odP = op.Estimated_Duration;
				if(odP == null)
				{
					odP = 0;
				}
				oBufferedP = odP * (1 + (bufferPct / 100.0));
				if(op.Type_of_Delivery == "Full-Day Install")
				{
					oBufferedP = 8;
				}
				otherHoursP = otherHoursP + oBufferedP;
			}
		}
		projectedTeamTotalP = otherHoursP + bufferedDuration;
		if(projectedTeamTotalP <= teamCapP)
		{
			r.Confirmed_Schedule_Date = foundDate;
			r.Confirmed_Time_Slot = computedTimeSlot;

			fNameEvP = "";
			lNameEvP = "";
			if(r.Customer_Name != null)
			{
				fNameEvP = r.Customer_Name.first_name;
				lNameEvP = r.Customer_Name.last_name;
			}
			if(fNameEvP == null){ fNameEvP = ""; }
			if(lNameEvP == null){ lNameEvP = ""; }
			if(fNameEvP != "")
			{
				custNameEvP = fNameEvP + " " + lNameEvP;
			}
			else
			{
				custNameEvP = lNameEvP;
			}
			typeEvP = r.Type_of_Delivery;
			if(typeEvP == null || typeEvP == ""){ typeEvP = "—"; }
			locationEvP = r.Customer_Address;
			if(r.City != null && r.City != "")
			{
				locationEvP = locationEvP + ", " + r.City;
			}
			r.Calendar_Event_Summary = "Title: " + r.Sales_Order + " - " + custNameEvP + " | Date: " + foundDate + " | Time: " + computedTimeSlot + " (" + bufferedDuration + " hrs) | Team: " + foundInstaller + " / " + foundDriver + " | Fleet: " + fleetDisplay + " | Type: " + typeEvP + " | Location: " + locationEvP + " | Notes: Auto-confirmed (Priority — Re-Schedule re-run)";
			r.Calendar_Entry_Created = true;
			r.Appointment_Status = "Scheduled";
			autoConfirmedP = true;
		}
		// else: real capacity conflict at the exact moment of auto-confirm — leave
		// Suggested_* as already written above, same fallback behavior as Action 1.
	}

	response.put("status", "success");
	if(autoConfirmedP)
	{
		response.put("message", "Auto-confirmed (Priority): " + foundInstaller + " / " + foundDriver + " on " + foundDate);
	}
	else
	{
		response.put("message", "New suggestion: " + foundInstaller + " / " + foundDriver + " on " + foundDate);
	}
	response.put("suggestedDate", foundDate);
	response.put("installer", foundInstaller);
	response.put("driver", foundDriver);
	return response;
}

<<< END PIRASO 4


============================================================
PIRASO 5 / 5 — HINDI CODE, DATA CHECK LANG
Saan pupuntahan: Daily Team Availability widget (o native form)
============================================================
Para talagang mawala ang "laging 8:00 AM":
- Buksan ang Daily Team Availability widget/form.
- Sa row ng team (hal. CJ / Zaldy) at petsa (hal. 2026-08-29),
  tignan ang "Start Time" field.
- Kung BLANGKO ito, 8:00 AM talaga ang gagamitin — SINADYA ito,
  hindi bug. Punuan ng totoong oras ng simula ng team para
  magbago ang suggestion.
- Tignan din ang "Max SO / Day" field ng parehong team — kung
  blangko, walang limit (tama lang, hindi bug).
============================================================

````
