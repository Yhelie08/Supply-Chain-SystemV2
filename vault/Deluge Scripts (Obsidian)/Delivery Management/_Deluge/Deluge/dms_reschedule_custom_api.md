---
title: "dms_reschedule_custom_api"
source_file: "dms_reschedule_custom_api.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]"
lines: 470
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
---

# dms_reschedule_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `dms_reschedule_custom_api.txt`
> - **Lines of Code:** 470
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== DMS — Re-Schedule Custom Function/API wrapper ==
== New 2026-07-17, built for the DeliveryQueue widget's "Re-Schedule" button. ==

Mirrors the Re_Schedule Report Action Item in dms_scheduling_engine.txt verbatim
(input.field -> r.field on a freshly-fetched record) — same conversion pattern as
every other un-callable-Report-Action-Item workaround in this app
(pr_approve_po_custom_api.txt, acknowledge_po_custom_api.txt, create_rr_custom_api.txt,
approve_rr_custom_api.txt). Report Action Items can't be invoked via any Creator
API/SDK call, confirmed repeatedly throughout this whole project.

====================================================
STEP 1 — Deluge Custom Function (App Builder -> Custom Function editor — paste FULL
signature + braces, this editor is a blank canvas unlike Books custom functions)
====================================================

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

	// REMOVED 2026-09-17 — this Fleet_Decision gate (added 2026-09-16, briefly
	// narrowed then reverted same day) was found to NOT match what's actually
	// live: the deployed SA_Scheduling_Engine Action 1 (confirmed against the
	// user's own live-paste reference, IPAPASTE_KO_2026-09-16.txt) has NO
	// Fleet_Decision check at all — that whole feature was never deployed.
	// Keeping this block here would have made Re-Schedule (this function)
	// require a Fleet Decision pick that the automatic path never required,
	// a new inconsistency mid-troubleshooting a completely different bug
	// (Suggested_Schedule_Date staying blank despite real team availability).
	// Removed to match live behavior — auto-suggest runs off team availability
	// only, same as Action 1 currently does. Re-adding a real Fleet Decision
	// gate (the original 2026-09-16 ask) is a separate decision, not bundled
	// into this fix.
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

====================================================
STEP 2 — Custom API
  Name/link name: dms_reschedule
  Method: POST
  Parameter: recordId (String, required)
  Function: reScheduleDelivery
  Response type: Standard (wraps the function's Map under "result" — confirmed
  Deluge Gotcha, invokeCustomApi's response must be read via resp.result, not
  resp.data — see reference-deluge-quirks memory)
  Auth: PublicKey (same as every other Custom API in this app)
====================================================

NOTES:
- **NEW 2026-09-08** — mirrors dms_scheduling_engine.txt's own "NEW 2026-09-08"
  sequential time-chaining fix (Suggested_Time_Slot = workday_start_time + foundUsed
  instead of a flat placeholder) byte-identical, same variable names. See that file's
  own NOTES section for the full rationale + live-test steps; same steps apply here,
  triggered via the dms_reschedule Custom API instead of the native Re-Schedule
  button.
- Same "Custom API left in Draft" gotcha already documented elsewhere in this app —
  confirm it shows Enabled after creation, not stuck in Draft.
- `Service_Appointment_Form[ID == recordId.toLong()]` — recordId arrives as a String
  from the widget's JSON payload, `.toLong()` cast needed before use in `ID ==`
  criteria (direct input-context ID comparisons elsewhere in this app skip the cast
  since `input.ID` is already numeric — this is a genuinely different context, a
  function PARAMETER, so the cast is needed here).
- UNTESTED — needs Custom Function + Custom API created live, then a real call from
  the DeliveryQueue widget's Re-Schedule button.

````
