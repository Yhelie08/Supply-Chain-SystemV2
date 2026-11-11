---
title: "shipment_delay_status_schedule"
source_file: "shipment_delay_status_schedule.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 198
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# shipment_delay_status_schedule

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `shipment_delay_status_schedule.txt`
> - **Lines of Code:** 198
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== New 2026-07-22, per user — daily auto-flip of Shipments.Shipment_Status based on
   Estimated_Warehouse_Arrival vs "today" (real or test-overridden, see
   schedule_test_settings_form.txt). ==

RULE (confirmed with user):
- Estimated_Warehouse_Arrival < today               -> Shipment_Status = "Delayed"
- Estimated_Warehouse_Arrival - today <= 7 days      -> Shipment_Status = "Arriving in 1 Week"
- otherwise -> leave whatever status is already there untouched (never force back to
  Pending/In Transit — this schedule only ever pushes TOWARD Delayed/Arriving in 1 Week,
  never invents/reverts other states).
- Shipment_Status == "Delivered" is a HARD terminal guard — skipped entirely, every run.
  This is the exact bug the user flagged: without this guard, a shipment that's already
  Delivered but whose Estimated_Warehouse_Arrival date has since passed would get
  flipped back to "Delayed" by the very next 8am run, silently undoing the delivery
  confirmation. Guard checked FIRST, before even reading Estimated_Warehouse_Arrival.

PREREQUISITE (user is adding this choice manually, per their own message):
- Shipments.Shipment_Status needs a new dropdown choice, "Arriving in 1 Week", alongside
  the existing Pending/In Transit/Delayed/Delivered.
- schedule_test_settings_form.txt's Schedule_Test_Settings form must exist first (the
  manual-test override date this function reads).

====================================================
CHANGED 2026-07-22, per user — this app's App Builder has its own "Run workflow on a
scheduled date" builder (Setup/App Builder -> Workflow, "Specify Date and Time" tab,
Run: Daily) with a real "Run Now" button on the schedule's own config page (confirmed
via web search incl. community threads, not just official docs, which don't mention it
at all — Run Now IS real, capped at 2 manual triggers/day). That makes the separate
Custom Function + Custom API wrapper (STEP 1/3 below, kept for reference only, NOT the
primary path) unnecessary just for manual testing — paste the BODY ONLY (no `map
funcName(){}` wrapper, no return) directly into the workflow's own "Deluge script"
action, and use its own Run Now button to test on demand instead.
====================================================
PRIMARY PATH — paste this body directly into the workflow's "Deluge script" action
(Add New Action > Deluge script). No function signature, no return statement — this
box is a plain script body, same shape as every other workflow action in this app.
====================================================

todayVal = zoho.currentdate;
usingOverride = false;
settingsRec = Schedule_Test_Settings[ID != 0];
for each  s in settingsRec
{
	if(s.Test_Current_Date != null)
	{
		todayVal = s.Test_Current_Date;
		usingOverride = true;
	}
}

delayedCount = 0;
arrivingCount = 0;
skippedDelivered = 0;
checkedCount = 0;

allShips = Shipments[ID != 0];
for each  sh in allShips
{
	if(sh.Shipment_Status == "Delivered")
	{
		skippedDelivered = skippedDelivered + 1;
	}
	else if(sh.Estimated_Warehouse_Arrival != null)
	{
		checkedCount = checkedCount + 1;
		diffMs = (sh.Estimated_Warehouse_Arrival - todayVal);
		diffDays = (diffMs / 86400000).round(0);
		if(diffDays < 0)
		{
			if(sh.Shipment_Status != "Delayed")
			{
				sh.Shipment_Status = "Delayed";
			}
			delayedCount = delayedCount + 1;
		}
		else if(diffDays <= 7)
		{
			if(sh.Shipment_Status != "Arriving in 1 Week")
			{
				sh.Shipment_Status = "Arriving in 1 Week";
			}
			arrivingCount = arrivingCount + 1;
		}
	}
}

====================================================
FALLBACK PATH (not needed given the real Run Now button above — kept only in case
Run Now's 2x/day cap ever gets in the way and a 3rd on-demand trigger is wanted same
day): Custom Function (Setup -> App Builder -> Custom Functions -> New, return type:
MAP). Name: updateShipmentDelayStatus. Paste FULL block below including the signature
(Creator-side Custom Function editor wants the whole `map funcName(){...}` block, NOT
body-only — that's the Books-side convention, confirmed different in this app's own
CLAUDE.md Deluge Gotchas). Then a Custom API wrapping it, same un-callable-trigger
workaround pattern used everywhere else in this app.
====================================================

map updateShipmentDelayStatus()
{
	response = Map();

	todayVal = zoho.currentdate;
	usingOverride = false;
	settingsRec = Schedule_Test_Settings[ID != 0];
	for each  s in settingsRec
	{
		if(s.Test_Current_Date != null)
		{
			todayVal = s.Test_Current_Date;
			usingOverride = true;
		}
	}

	delayedCount = 0;
	arrivingCount = 0;
	skippedDelivered = 0;
	checkedCount = 0;

	allShips = Shipments[ID != 0];
	for each  sh in allShips
	{
		if(sh.Shipment_Status == "Delivered")
		{
			skippedDelivered = skippedDelivered + 1;
		}
		else if(sh.Estimated_Warehouse_Arrival != null)
		{
			checkedCount = checkedCount + 1;
			diffMs = (sh.Estimated_Warehouse_Arrival - todayVal);
			diffDays = (diffMs / 86400000).round(0);
			if(diffDays < 0)
			{
				if(sh.Shipment_Status != "Delayed")
				{
					sh.Shipment_Status = "Delayed";
				}
				delayedCount = delayedCount + 1;
			}
			else if(diffDays <= 7)
			{
				if(sh.Shipment_Status != "Arriving in 1 Week")
				{
					sh.Shipment_Status = "Arriving in 1 Week";
				}
				arrivingCount = arrivingCount + 1;
			}
		}
	}

	response.put("status","success");
	response.put("today_used",todayVal.toString());
	response.put("using_test_override",usingOverride);
	response.put("checked_count",checkedCount);
	response.put("delayed_count",delayedCount);
	response.put("arriving_soon_count",arrivingCount);
	response.put("skipped_delivered_count",skippedDelivered);
	return response;
}

====================================================
FALLBACK STEP 2 — Schedule action calling the function above (only if using the
Custom Function path instead of PRIMARY PATH's body-only paste):
updateShipmentDelayStatus();

FALLBACK STEP 3 — Custom API wrapper (manual-trigger workaround, same un-callable-
trigger pattern used everywhere else in this app)
Setup -> Custom API -> New Custom API
Name/link name: shipment_update_delay_status
Method: POST
Function: updateShipmentDelayStatus
Response type: Standard
====================================================

====================================================
NOTES:
- todayVal/diffDays math mirrors this app's own already-proven date-diff idiom
  (purchase_request1_full_workflow_dump.txt's PR_Compute_Priority: (date2 - date1) /
  86400000, rounded) — not the .daysBetween() form, since that idiom is the one already
  confirmed working for a plain date-minus-date subtraction in this codebase.
- `sh.Shipment_Status = "Delayed";` mutates the SAME loop variable that produced it,
  inline, inside the same for-each that's iterating it — the one proven-safe
  existing-record-mutation shape already established in this app (shipment_previous_
  status.txt's shipRecRS.Shipment_Status=..., receiving_status_workflow.txt). Never
  reassigned to another variable, never held past the loop.
- Deliberately does NOT try to auto-heal/demote a shipment already flagged "Arriving in
  1 Week"/"Delayed" back down if Estimated_Warehouse_Arrival later gets pushed out again
  (e.g. supplier re-syncs a later Date_Shipped) — not asked for, and doing so risks
  clobbering a status the user set on purpose in between. Flagged, not built — revisit
  if this actually causes a visibly stuck-wrong status in practice.
- To test manually: edit Schedule_Test_Settings' one record's Test_Current_Date to
  whatever date should count as "today", then call the shipment_update_delay_status
  Custom API (or just wait for the real 8am run once satisfied) — response Map reports
  exactly which/how-many records it touched and whether it used the override or the
  real date, so a test run's result is directly checkable without needing to eyeball
  every Shipments record by hand. Remember to blank Test_Current_Date back out after
  testing so the real daily 8am run isn't left pinned to a fake date.
- UNTESTED — first time this function/schedule/Custom API has been created or pasted.
====================================================

````
