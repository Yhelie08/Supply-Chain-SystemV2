---
title: "PASTE_ReSchedule_ReportActionItem"
source_file: "DMS\PASTE_ReSchedule_ReportActionItem.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]"
lines: 269
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
  - procurement
  - purchase-order
---

# PASTE_ReSchedule_ReportActionItem

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `DMS\PASTE_ReSchedule_ReportActionItem.txt`
> - **Lines of Code:** 269
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
rec = Service_Appointment_Form[ID == input.ID];

// GUARD, added 2026-09-08 — Re-Schedule on an already-Completed (or Failed)
// delivery makes no business sense and would silently reset Appointment_Status
// back to "Queued" / Calendar_Entry_Created back to false further down in this
// same script, discarding real completion data. Refuse outright instead.
// FIXED 2026-09-08 — `alert` is NOT allowed in a Report Action Item ("On click
// of action item") context, confirmed live ("Error at line number: 9. 'ALERT'
// task can be used only in on load, on validate and on change actions").
// Removed — `return;` alone provides the protection; no on-screen message.
if(input.Appointment_Status == "Completed" || input.Appointment_Status == "Failed")
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
	estDuration = 2;
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

				// NEW 2026-09-15 — same SO-count capacity check as Action 1's own slot
				// search above (see that file's header comment for the full rationale).
				// Mirrored here since Re_Schedule is a separate manually-maintained copy
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
	rec.Exception_Status = "Flagged";
	rec.Exception_Reason = "Calendar Full";
	// FIXED 2026-09-16, per user ("baka may masasuggest siya pero wala naman
	// team availability") — Re_Schedule can re-run on a record that already
	// carries a suggestion from an earlier run, so clear the stale one.
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
	// FIXED 2026-09-16 — same stale-suggestion clear as the Calendar Full
	// block just above.
	rec.Suggested_Schedule_Date = null;
	rec.Suggested_Time_Slot = null;
	rec.Installer = null;
	rec.Assigned_to_Driver = null;
	rec.Fleet_Assignment = null;
	return;
}

workdayStartStr = "8:00 AM";
pStart = Policy_Settings[Policy_Key == "workday_start_time"];
if(pStart != null && pStart.Value != null && pStart.Value != "")
{
	workdayStartStr = pStart.Value;
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

````
