---
title: "ACTION3_PASTE_DITO"
source_file: "DMS\ACTION3_PASTE_DITO.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 34
tags:
  - deluge
  - procurement
  - purchase-order
---

# ACTION3_PASTE_DITO

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `DMS\ACTION3_PASTE_DITO.txt`
> - **Lines of Code:** 34
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
ACTION 3 LANG ITO — D.4 status sync marker
====================================================
Saan i-paste: Service_Appointment_Form > Workflow Rule
"SA_Scheduling_Engine" > ACTION 3 (ang PANGATLO/HULING box)

FIX dito: dinagdagan lang ng panaklong "( )" sa paligid ng
"Completed" || "Failed" — kasi kung wala 'yon, mababasa ng Deluge
na kapag "Completed" na ang status, papasok agad ito kahit hindi pa
totoo ang Calendar_Entry_Created (mali). Dapat pareho munang
"Completed" O "Failed" ANG DAPAT SUMAMA SA Calendar_Entry_Created
bago pumasok.

I-REPLACE ang buong laman ng Action 3 box ng code sa ibaba:
====================================================

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

====================================================
Tapos na. Ito lang isang box, wala nang ibang box na kasama dito.
====================================================

````
