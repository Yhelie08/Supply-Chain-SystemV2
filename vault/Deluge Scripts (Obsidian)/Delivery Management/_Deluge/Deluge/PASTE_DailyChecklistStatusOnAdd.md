---
title: "PASTE_DailyChecklistStatusOnAdd"
source_file: "DMS\PASTE_DailyChecklistStatusOnAdd.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]"
lines: 45
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - kanban
  - pick
  - procurement
  - purchase-order
  - qc
---

# PASTE_DailyChecklistStatusOnAdd

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `DMS\PASTE_DailyChecklistStatusOnAdd.txt`
> - **Lines of Code:** 45
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#kanban`, `#pick`, `#procurement`, `#purchase-order`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget|DailyChecklistVehicle Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
>>> WORKFLOW SETUP (fill in exactly like this in Zoho Creator) <<<

Choose form: Daily_Checklist_for_Vehicle
Record Event: On Add
Form Event: Add
Field: (none — this runs on the whole form submission, not a single field change)
Name: Set_Initial_Status

>>> START — paste everything between here and END into the workflow's Deluge editor <<<

// ADDED 2026-09-18 — pairs with the new Vehicle Daily Checklist Kanban widget
// (Widget\DMS\DailyChecklistVehicle\DailyChecklistVehicle.zip), which organizes
// records into Open / In Progress / Completed columns. The form itself has no
// field driving that until this workflow + the new Status field below exist.
//
// Rule: if the checker found an issue, the record starts at "Open" (needs
// attention). If no issue was found, there is nothing to track, so it starts
// straight at "Completed" — an officer never has to manually move a
// no-issue checklist through the board.
//
// REQUIRES a new field on this form first (create this before pasting the
// workflow below, or the update call fails with an invalid-field error):
//   Field Name: Status
//   Field Type: Dropdown (Picklist)
//   Choices: Open, In Progress, Completed
//   Default: leave blank — this workflow sets the real value on submit.

if(input.Issue_Found == "Yes")
{
	Daily_Checklist_for_Vehicle[ID == input.ID].update({"Status":"Open"});
}
else
{
	Daily_Checklist_for_Vehicle[ID == input.ID].update({"Status":"Completed"});
}

>>> END <<<

>>> STILL NEEDED, IN ORDER <<<
1. Create the "Status" field on Daily_Checklist_for_Vehicle (Dropdown, choices exactly "Open" / "In Progress" / "Completed", no default).
2. Add that same "Status" field to Daily_Checklist_for_Vehicle_Report's own field list (Report Builder → Configure Fields, or however this account's Zoho Creator exposes it) — CONFIRMED per the user's own live report definition (2026-09-18) that this report only exposes 12 explicitly-listed fields, not automatically every form field. Skipping this step means the widget will keep reading Status as blank no matter what the form itself holds — the exact bug already hit once today on a different widget in this project (Fleet Decision silently reading blank for the same reason).
3. Create the workflow above (On Add, no field trigger).
4. Report name is already confirmed and set correctly in the widget — REPORT_NAME = "Daily_Checklist_for_Vehicle_Report" (not the "All_<FormName>" pattern this project usually uses; verified 2026-09-18 against the user's own live report definition). No action needed here unless the report gets renamed later.
5. Upload Widget\DMS\DailyChecklistVehicle\DailyChecklistVehicle.zip as this form's widget page.
6. Live test: submit a new checklist with Issue Found = Yes — confirm it lands in "Open" on the board. Submit one with Issue Found = No — confirm it lands straight in "Completed". Open a card's "View" detail, change Status, Save — confirm it moves columns and the choice persists on reopen. Existing OLD records (submitted before this setup) will show "Open" by default in the widget even with a blank Status field — that's the widget's own fallback per the code comment on `stageOf()`, not a bug; move them manually once if they don't actually need attention.

````
