---
title: "PASTE_reScheduleDelivery_2026-09-17"
source_file: "PASTE_reScheduleDelivery_2026-09-17.txt"
category: "Delivery Management/_Deluge"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 381
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pick
  - procurement
  - purchase-order
---

# PASTE_reScheduleDelivery_2026-09-17

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Deluge`
> - **Source File:** `PASTE_reScheduleDelivery_2026-09-17.txt`
> - **Lines of Code:** 381
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
============================================================
READY-TO-PASTE, 2026-09-17 — 1 piraso lang, ang reScheduleDelivery
Custom Function na tinatawag ng "Re-Schedule" button sa DeliveryQueue
widget. Kopyahin mula sa " >>> START" hanggang " <<< END" (huwag
isama ang mga label na may >>> / <<<, code lang sa GITNA).

SAAN ILALAGAY: App Builder -> Custom Functions -> hanapin/buksan yung
function na "reScheduleDelivery" -> palitan ang BUONG laman ng editor
nito ng code sa ibaba (kasama ang unang linya, "map reScheduleDelivery
(String recordId)" at yung mga curly braces { }).

BAKIT ITO KAILANGAN: Ito yung nawawalang piraso — kumpirmado na hindi
ito naka-sync sa mga bagong ayos (Max SO Capacity, tie-break, Start
Time1, atbp.) simula pa noong 2026-09-15/16. Ito rin ang dahilan kung
bakit walang Suggested Date/Time na lumalabas kahit pinindot mo yung
Re-Schedule button.

WALANG Fleet Decision requirement dito (tinanggal 2026-09-17) — sadyang
pinanatiling tugma sa kasalukuyang live na SA_Scheduling_Engine Action 1
mo (walang Fleet Decision check doon), para hindi ka ma-block ng bagong
requirement na wala naman sa ibang parte ng system.
============================================================
>>> START reScheduleDelivery

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

	if(r.Appointment_Status == "Completed" || r.Appointment_Status == "Failed")
	{
		response.put("status", "blocked");
		response.put("message", "Hindi na maaaring i-Re-Schedule — naka-\"" + r.Appointment_Status + "\" na ang deliverang ito.");
		return response;
	}

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
	searchDays = "".leftpad(maxWindow).toList("");
	for each  dayMarker in searchDays
	{
		dayCounter = dayCounter + 1;
		if(foundInstaller == null)
		{
			candidateDate = zoho.currentdate.addDay(dayCounter - 1);
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
		r.Suggested_Schedule_Date = null;
		r.Suggested_Time_Slot = null;
		r.Installer = null;
		r.Assigned_to_Driver = null;
		r.Fleet_Assignment = null;
		response.put("status", "flagged");
		response.put("message", "Best available slot would require overtime — flagged for approval.");
		return response;
	}

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

	computedTimeSlot = workdayStartStr;
	ctsParts = workdayStartStr.toList(" ");
	if(ctsParts.size() == 2)
	{
		ctsHM = ctsParts.get(0).toList(":");
		if(ctsHM.size() >= 2)
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

<<< END reScheduleDelivery

````
