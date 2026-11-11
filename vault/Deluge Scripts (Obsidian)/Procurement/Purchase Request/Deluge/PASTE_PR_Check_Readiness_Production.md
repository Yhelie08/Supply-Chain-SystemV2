---
title: "PASTE_PR_Check_Readiness_Production"
source_file: "NEw/PASTE_PR_Check_Readiness_Production.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 93
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
  - zoho-books
---

# PASTE_PR_Check_Readiness_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `NEw/PASTE_PR_Check_Readiness_Production.txt`
> - **Lines of Code:** 93
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
// Condition 1: Selected Supplier
hasSelected = false;
sup = input.Selected_Supplier;
if(sup != null)
{
	if(sup != "")
	{
		hasSelected = true;
	}
}
input.Selected_Supplier1 = hasSelected;
// Condition 2: Final Price confirmed
// From-inquiry items: price already validated upstream at the Inquiry's own SRP-approval
// step, so trust it unconditionally (even a 0-rate item counts as confirmed here).
// Not-from-inquiry items: auto-confirmed if the item has a real catalog Rate (that rate
// is what gets sent to Books regardless of any supplier quote — see pr_to_po_grouping.txt).
// Only a not-from-inquiry, 0-rate item needs a genuine manual supplier price
// (Selcted_Final_Cost, synced from the winning Supplier_Selected row) to confirm.
hasPrice = false;
// FIXED 2026-08-05, real mismatch found live (PR-00002/SO-16399) — this check never
// looked at SRP_Approved_PR (the manual-approval field, separate from SRP_Rate_PR/
// inquiry_reference) at all, so a PR whose price was confirmed via SRP_Approved_PR
// alone (inquiry_reference blank, no catalog Rate, Selcted_Final_Cost still 0) stayed
// "Final price confirmed = false" -> PR_READY_FOR_PO = false natively, blocking the
// native Create PO action item, while the PRs widget's OWN client-side readiness
// checklist (which DOES check SRP_Approved_PR, same priority order already fixed this
// session in pr_to_po_grouping.txt's approvePOFenteng/Tony) showed all 5 conditions
// green — a genuine native-vs-widget readiness disagreement, not a stale-recompute
// issue. Added SRP_Approved_PR as the first-checked tier, same priority order as
// approvePOFenteng/Tony's own price resolution (SRP_Approved_PR -> SRP_Rate_PR ->
// inquiry_reference -> catalog Rate -> Selcted_Final_Cost).
srpApprovedVal = input.SRP_Approved_PR;
if(srpApprovedVal != null && srpApprovedVal != 0)
{
	hasPrice = true;
}
else
{
	srpRateVal = input.SRP_Rate_PR;
	if(srpRateVal != null && srpRateVal != 0)
	{
		hasPrice = true;
	}
	else
	{
		hasInqRef = input.inquiry_reference != null && input.inquiry_reference != "";
		if(hasInqRef)
		{
			hasPrice = true;
		}
		else
		{
			itemRateVal = 0;
			itemRecCheck = Items[SKU == input.sku];
			if(itemRecCheck != null)
			{
				itemRateStrCheck = itemRecCheck.Rate + "";
				if(itemRateStrCheck != "null" && itemRateStrCheck != "" && itemRateStrCheck != "0")
				{
					itemRateVal = itemRateStrCheck.toDecimal();
				}
			}
			if(itemRateVal != 0)
			{
				hasPrice = true;
			}
			else
			{
				fp = input.Selcted_Final_Cost;
				if(fp != null && fp > 0)
				{
					hasPrice = true;
				}
			}
		}
	}
}
input.Final_price_confirmed = hasPrice;
// Condition 3: Shipping mode selected
hasMode = false;
sm = input.Shipment_Mode;
if(sm != null)
{
	if(sm != "")
	{
		hasMode = true;
	}
}
input.Shipping_mode_selected = hasMode;
// Condition 4: Target date exists
input.Target_date_exists = input.Target_Delivery != null;
// === Final AND ===
input.PR_READY_FOR_PO = input.Selected_Supplier1 && input.Final_price_confirmed && input.Shipping_mode_selected && input.Target_date_exists;

````
