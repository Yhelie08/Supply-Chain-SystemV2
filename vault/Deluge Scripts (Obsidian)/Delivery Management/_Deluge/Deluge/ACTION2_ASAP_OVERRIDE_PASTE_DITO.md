---
title: "ACTION2_ASAP_OVERRIDE_PASTE_DITO"
source_file: "DMS\ACTION2_ASAP_OVERRIDE_PASTE_DITO.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 159
tags:
  - delivery-management
  - deluge
  - dms
  - procurement
  - purchase-order
---

# ACTION2_ASAP_OVERRIDE_PASTE_DITO

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `DMS\ACTION2_ASAP_OVERRIDE_PASTE_DITO.txt`
> - **Lines of Code:** 159
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
ACTION 2 LANG ITO — ASAP OVERRIDE FIX (Phase 2)
(UPDATED 2026-09-10 — may na-fix na error: "Variable Exception_Stage
does not exist in Service_Appointment_Form". Kung na-try mo na yung
lumang bersyon at nakuha mo yung error na 'yon, ITO na ang tama,
i-paste mo ulit.)
====================================================
Saan i-paste: Service_Appointment_Form > Workflow Rule
"SA_Scheduling_Engine" > ACTION 2 (ang PANGALAWA sa 3 boxes)

Kilalanin mo ang tamang box: nagsisimula ang code sa
"if(input.Confirmed_Schedule_Date != null && input.Calendar_Entry_
Created != true)" — HINDI ito yung nagsisimula sa
"if(input.Site_Confirmation_Status == "Confirmed"..." (yun ay
Action 1, iba na box).

I-REPLACE ang buong laman ng Action 2 box ng code sa ibaba:
====================================================

if(input.Confirmed_Schedule_Date != null && input.Calendar_Entry_Created != true)
{
	rec2 = Service_Appointment_Form[ID == input.ID];
	isOverride = (input.Suggested_Schedule_Date == null) || (input.Confirmed_Schedule_Date != input.Suggested_Schedule_Date) || (input.Confirmed_Time_Slot != input.Suggested_Time_Slot);
	if(isOverride)
	{
		rec2.Override_Applied = true;
		rec2.Override_Timestamp = zoho.currenttime;
	}

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
		return;
	}

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

	if(rec2.Exception_Status == "Flagged" && (rec2.Exception_Reason == "Calendar Conflict" || rec2.Exception_Reason == "Calendar Full" || rec2.Exception_Reason == "Slot Pushed — Overtime Declined"))
	{
		rec2.Exception_Status = "Resolved";
	}

	rec2.Calendar_Entry_Created = true;
	rec2.Appointment_Status = "Scheduled";
}

====================================================
Tapos na. Ito lang isang box, wala nang ibang box na kasama dito.
====================================================

````
