---
title: "PR_Compute_Shipment_Timeline"
source_file: "PR_Compute_Shipment_Timeline"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 52
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# PR_Compute_Shipment_Timeline

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `PR_Compute_Shipment_Timeline`
> - **Lines of Code:** 52
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
// === PR_Compute_Shipment_Timeline ===
// Form: Purchase_Request1 | Event: Created or Edited | Validations on form submission
if(input.PR_Status == "Converted to PO")
{
	effectiveProductionDate = input.Production_Date;
}
else
{
	effectiveProductionDate = zoho.currentdate;
	input.Production_Date = zoho.currentdate;
	// preview lang — mao-override ng actual date sa PO conversion
}
if(effectiveProductionDate != null)
{
	shipDays = 14;
	// FIXED 2026-09-05, per user ("wala namang lcl, fcl at air pag sa local lang") —
	// Local (HC System) sourcing has no external freight leg at all, so there's no
	// shipping buffer to add — target date collapses to the production date itself
	// (already today + 0 lead days, per pr_sync_supplier_selected.txt's own Local
	// guard). Checked BEFORE the LCL/FCL check so it always wins for Local regardless
	// of whatever stale Shipment_Mode value might be sitting on the record.
	if(input.Sourcing_Type == "Local")
	{
		shipDays = 0;
	}
	else if(input.Shipment_Mode == "LCL" || input.Shipment_Mode == "FCL")
	{
		shipDays = 30;
	}
	productionEndDate = effectiveProductionDate.addDay(input.Required_Days_Lead);
	Supplier_Target_Date = productionEndDate.addDay(shipDays);
	today = zoho.currentdate;
	currentTarget = productionEndDate;
	if(today > productionEndDate)
	{
		currentTarget = Supplier_Target_Date;
	}
	rawDiff = (currentTarget - today);
	input.Remaining_Days = (rawDiff / 86400000).round(0);
	if(today > input.Supplier_Target_Date)
	{
		input.Delay_Status = "Delayed";
	}
	else if(input.Remaining_Days <= 3)
	{
		input.Delay_Status = "At Risk";
	}
	else
	{
		input.Delay_Status = "On Track";
	}
}

````
