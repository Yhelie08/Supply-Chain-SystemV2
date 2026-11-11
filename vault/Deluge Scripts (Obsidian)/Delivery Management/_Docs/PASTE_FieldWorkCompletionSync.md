---
title: "PASTE_FieldWorkCompletionSync"
source_file: "DMS\PASTE_FieldWorkCompletionSync.txt"
category: "Delivery Management/_Docs"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 196
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - procurement
  - purchase-order
---

# PASTE_FieldWorkCompletionSync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Docs`
> - **Source File:** `DMS\PASTE_FieldWorkCompletionSync.txt`
> - **Lines of Code:** 196
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
if(input.Installation_Status == "Complete" && input.Schedule_End_Date_and_Time != null && input.Service_Appointment_ID != null && input.Service_Appointment_ID != "")
{
	saId = input.Service_Appointment_ID.toLong();
	saRec = Service_Appointment_Form[ID == saId];

	// SAFETY CHECK, added 2026-09-08 — real live bug found: 2 Service_Appointment
	// records sharing one Sales_Order (2 packages/deliveries under the same SO)
	// resolved to the SAME Field_Work row via OngoingService's own FW_BY_SO
	// fallback. Cross-checking Sales_Order catches a stale/wrong
	// Service_Appointment_ID pointing at a SIBLING delivery instead of silently
	// marking it done.
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

		// NEW 2026-09-08 — appends the real actual Schedule_Start/End times onto
		// Calendar_Event_Summary so they're visible on the Delivery Queue detail
		// view without an extra click into "View Field Report."
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

````
