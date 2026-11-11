---
title: "schedule_test_settings_form"
source_file: "schedule_test_settings_form.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/Daily Team Availability/Widget/DailyTeamAvailability Widget|DailyTeamAvailability Widget]]"
lines: 58
tags:
  - deluge
  - procurement
  - purchase-order
---

# schedule_test_settings_form

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/Daily Team Availability/Widget/DailyTeamAvailability Widget|DailyTeamAvailability Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `schedule_test_settings_form.txt`
> - **Lines of Code:** 58
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/Daily Team Availability/Widget/DailyTeamAvailability Widget|DailyTeamAvailability Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== New 2026-07-22 — tiny standalone settings form, same pattern as Shipment_ID_Counter
   (single record, never user-facing). Lets a scheduled workflow be tested on-demand
   by overriding "today" without waiting for the real daily 8am fire. ==

====================================================
PREREQUISITE: paste this form via Application IDE (Settings -> Application IDE).
====================================================

form Schedule_Test_Settings
{
	displayname = "Schedule Test Settings"
	Test_Current_Date
	(
		type = date
		displayname = "Test Current Date (blank = use real today)"
		row = 1
		column = 1
		width = medium
	)
	actions
	{
		on add
		{
			submit
			(
   				type = submit
   				displayname = "Submit"
			)
		}
		on edit
		{
			update
			(
   				type = submit
   				displayname = "Update"
			)
			cancel
			(
   				type = cancel
   				displayname = "Cancel"
			)
		}
	}
}

====================================================
NOTES:
- One record, one field. Blank Test_Current_Date = the schedule uses zoho.currentdate
  for real. Set a date here to simulate "today" being some other day, for manual
  testing of shipment_delay_status_schedule.txt without waiting for the real 8am fire.
- No seed record needed — the schedule's own function auto-treats "no record found" the
  same as "blank" (falls back to zoho.currentdate).
- Expose default report as Schedule_Test_Settings_Report (educated-guess link name,
  same FormName_Report convention as every other form in this app — confirm live).
- Reused nowhere else — this exists purely to unblock manual testing of ONE schedule.
  Remember to clear Test_Current_Date back to blank once done testing, so the real
  daily schedule isn't accidentally left running against a fake date.
====================================================

````
