---
title: "assign_to_pick_gate"
source_file: "assign_to_pick_gate.txt"
category: "Fulfillment/Order Readiness/Deluge"
associated_widget: "[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]"
lines: 54
tags:
  - deluge
  - fulfillment
  - pick
  - procurement
  - purchase-order
---

# assign_to_pick_gate

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]
> - **Category:** `Fulfillment/Order Readiness/Deluge`
> - **Source File:** `assign_to_pick_gate.txt`
> - **Lines of Code:** 54
> - **Tags:** `#deluge`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
ASSIGN TO PICK — LOCK UNTIL ASSIGN PICKER IS CHOSEN
=====================================================
Goal: "Assign to Pick" (Decision box, Field Link Name: Assign_to_Pick) dapat naka-DISABLE
hangga't walang napiling value sa "Assign Picker" (Choice field, Field Link Name: Assign_Picker).

Gagawa ka ng DALAWANG workflow sa parehong form (Form Builder > Workflow tab).


WORKFLOW 1 — Disable on load
-----------------------------
Choose form: Picker
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Load of the form   (nasa grupong "Before form submission")
Name the workflow: Disable Assign to Pick on Load

Deluge script:

if(input.Assign_Picker == null || input.Assign_Picker == "")
{
	disable Assign_to_Pick;
}


WORKFLOW 2 — Enable/disable base sa Assign Picker input
---------------------------------------------------------
Choose form: Picker
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): User input of a field   (nasa grupong "Before form submission")
Choose Field: Assign Picker
Name the workflow: Toggle Assign to Pick on Picker Select

Deluge script:

if(input.Assign_Picker == null || input.Assign_Picker == "")
{
	disable Assign_to_Pick;
}
else
{
	enable Assign_to_Pick;
}


PAANO I-TEST
-------------
1. I-save ang dalawang workflow sa itaas.
2. Buksan ang form bilang bagong record -> dapat naka-gray out/disabled agad ang "Assign to Pick".
3. Pumili ng value sa "Assign Picker" -> dapat mag-enable na ang "Assign to Pick".
4. Kung may makitang error, i-screenshot ang Execution Result / error panel para ma-diagnose.

Sources:
- https://www.zoho.com/deluge/help/client-functions/enable-disable.html
- https://help.zoho.com/portal/en/kb/creator/developer-guide/workflows/create-and-manage-on-user-input-actions/articles/configure-deluge-script-on-user-input-in-form-workflows
- https://help.zoho.com/portal/en/kb/creator/developer-guide/workflows/create-and-manage-form-workflows/articles/understand-record-event

````
