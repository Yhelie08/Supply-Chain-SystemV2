---
title: "pr_check_readiness"
source_file: "DMS\DelugeScripts\pr_check_readiness.txt"
category: "Procurement/Purchase Request/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 155
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

# pr_check_readiness

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\pr_check_readiness.txt`
> - **Lines of Code:** 155
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PR_Check_Readiness — Purchase_Request1 readiness checklist ==
== Drives the "Readiness Checklist" section shown on the PR1 form (Selected Supplier,
   Final price confirmed, Shipping mode selected, Target date exists, PR READY FOR PO) ==

====================================================
WORKFLOW SETUP — PR_Check_Readiness
  Form: Purchase_Request1
  Trigger: Created or Edited > Validations (on form submission)
====================================================

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

====================================================
NOTES:
- New workflow, first seen 2026-07-06 (pasted via Temp.txt) — not documented in any
  DelugeScripts file before this, saved here now.
- ADDED 2026-07-06: Condition 2 (Final price confirmed) now ALSO passes when
  `SRP_Rate_PR` (the SO-approved rate, see so_to_pr_scripts_NewScripts.txt) has a real
  value, not just when `Selcted_Final_Cost` (the supplier's own negotiated/synced price)
  is set — per user request, an SO-sourced rate should count as "price confirmed" on its
  own, same reasoning as the SRP_Rate_PR-based exemptions already added to
  Mandatory_PR_Fields_Supplier1/2 and the Disable_PR_Details logic.
- `Selcted_Final_Cost` (missing an 'e', confirmed real field link name — see
  pr_to_po_grouping.txt NOTES, don't "fix" the spelling) is auto-filled by
  PR_Sync_Supplier_Selected (a separate workflow this session hasn't touched/documented
  yet — referenced only, not verified).
- Standalone `//` comment lines are used throughout this pasted script — established
  gotcha elsewhere in this codebase says these can miscount Deluge's reported error line
  numbers. Not removed here since the script was pasted directly from Temp.txt and this
  file hasn't been live-tested yet; flag if an error's reported line looks wrong.
- REWORKED 2026-07-15, per user request — Condition 2 replaced the old
  Selcted_Final_Cost-OR-SRP_Rate_PR check with an inquiry-vs-catalog-rate rule (4 cases
  user specified, using PR-00002/Acantha as the motivating example — screenshots showed
  "Final price confirmed" red-X on a from-inquiry item with a real catalog Rate, despite
  the price already being resolved/approved at the Inquiry stage): (1) item has
  `inquiry_reference` set (routed from a real Inquiry, matched via
  `so_to_pr_scripts_NewScripts.txt`'s INQ routing) → auto-confirmed unconditionally,
  whether the item's own Rate is 0 or not — price was already validated upstream by the
  Inquiry's own SRP-approval step (see the Inquiry widget's "SRP & Pricing Summary"
  panel/readiness checklist), no need to re-gate at PR level; (2) no inquiry_reference,
  but the item has a real nonzero catalog `Rate` (`All_Items`, e.g. Acantha) →
  auto-confirmed too, catalog rate becomes the authoritative Books price regardless of
  whether a supplier has quoted (see pr_to_po_grouping.txt's matching 3rd-tier fallback,
  added same day) — supplier response can still come in for comparison, just isn't
  blocking; (3) no inquiry_reference AND item Rate is 0/blank → the only case that still
  requires manual confirmation, via a real `Selcted_Final_Cost` synced from the winning
  Supplier_Selected row (PR_Sync_Supplier_Selected, itself fed by the supplier's own
  quote on their supplier PR form) — unchanged default behavior. Reads `Items[SKU ==
  input.sku]` (input context, not a fetched-record BIGINT risk — same safe pattern as
  the Inquiry side's `Items[SKU == inq.sku]`). Deliberately does NOT write anything into
  `Selcted_Final_Cost` itself (read-only comparison/fallback only) — avoids the exact
  Currency(CNY)-vs-plain-Number type-mismatch risk that killed an earlier same-session
  attempt to auto-fill that field from a catalog/SRP source (see
  so_to_pr_scripts_NewScripts.txt's own NOTES, "FULLY REVERTED" entry). UNTESTED — needs
  a live resave of PR-00002 (from-inquiry, real Rate) confirming "Final price confirmed"
  now shows green, plus a fresh manually-created/no-INQ PR against a 0-rate item
  confirming that one still correctly stays red until a supplier responds.
- BUG fixed same day, before first live test — original `itemRecCheck.Rate` was assigned
  straight into a NUMBER var and later compared `!= 0`, erroring live (TEXT vs NUMBER
  `!=`) — same already-documented `Items.Rate` runtime-type gotcha as
  `pr_to_po_grouping.txt`'s own `SRP_Rate_PO` bug (see that file's NOTES). Fixed with the
  same safe `itemRateStr = rec.Rate + ""` cast pattern before `.toDecimal()`.
====================================================

````
