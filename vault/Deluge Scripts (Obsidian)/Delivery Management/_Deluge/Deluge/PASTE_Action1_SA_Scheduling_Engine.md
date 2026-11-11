---
title: "PASTE_Action1_SA_Scheduling_Engine"
source_file: "DMS\PASTE_Action1_SA_Scheduling_Engine.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 443
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-order
---

# PASTE_Action1_SA_Scheduling_Engine

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `DMS\PASTE_Action1_SA_Scheduling_Engine.txt`
> - **Lines of Code:** 443
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
if(input.Site_Confirmation_Status == "Confirmed" && input.Suggested_Schedule_Date == null && input.Confirmed_Schedule_Date == null)
{
	rec = Service_Appointment_Form[ID == input.ID];

	// Gate: Exception Status must be None/Resolved before scheduling can proceed
	if(input.Exception_Status == "Flagged")
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
	fleetAssignment = "Own Fleet"; // 3rd-party auto-decision not implemented, see NOTES

	estDuration = input.Estimated_Duration;
	if(estDuration == null || estDuration == 0)
	{
		estDuration = 2; // sane fallback if never filled in
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
	searchDays = "".leftpad(maxWindow - 1).toList("");
	for each  dayMarker in searchDays
	{
		dayCounter = dayCounter + 1;
		if(foundInstaller == null)
		{
			candidateDate = zoho.currentdate.addDay(dayCounter);
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
		// team availability") — clear a stale suggestion from an EARLIER run
		// before this LATER run correctly finds zero team availability.
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
		// block just above.
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
	workdayStartStr = "8:00 AM";
	pStart = Policy_Settings[Policy_Key == "workday_start_time"];
	if(pStart != null && pStart.Value != null && pStart.Value != "")
	{
		workdayStartStr = pStart.Value;
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
		if(ctsHM.size() == 2)
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

````
