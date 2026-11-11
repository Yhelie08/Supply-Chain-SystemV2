---
title: "pr_sync_supplier_selected"
source_file: "pr_sync_supplier_selected"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 124
tags:
  - deluge
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# pr_sync_supplier_selected

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `pr_sync_supplier_selected`
> - **Lines of Code:** 124
> - **Tags:** `#deluge`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
if(input.Sourcing_Type == "Local")
{
	input.Selected_Supplier = "HC System";
	input.Required_Days_Lead = 0;
	return;
}
// === Step 1: Build list of category-matched suppliers + find the Recommended one ===
matchedSupplierIDs = List();
recommendedSupplierID = "";
for each  qr in input.Supplier_Load_Balancing
{
	if(qr.Match_Category == "Match")
	{
		sidStr = qr.Suppliers.toString();
		if(!matchedSupplierIDs.contains(sidStr))
		{
			matchedSupplierIDs.add(sidStr);
		}
		if(qr.Eligible_Supplier == "Recommended")
		{
			recommendedSupplierID = sidStr;
		}
	}
}
// === Step 2: Flag existing Supplier_Selected rows no longer matched ===
existingSelectedIDs = List();
for each  ssel in input.Supplier_Selected
{
	selIDStr = ssel.Supplier_ID.toString();
	existingSelectedIDs.add(selIDStr);
	if(!matchedSupplierIDs.contains(selIDStr))
	{
		ssel.Status="Removed";
		ssel.Selected=false;
		// force unselect — no longer a valid pick
	}
	else
	{
		ssel.Status="Active";
	}
}
// === Step 3: Add new rows for newly matched suppliers not yet present ===
for each  sidStr in matchedSupplierIDs
{
	if(!existingSelectedIDs.contains(sidStr))
	{
		supRec = Suppliers[ID == sidStr.toLong()];
		supName = supRec.Supplier_Name.first_name;
		if(supName == null || supName == "")
		{
			supName = supRec.Supplier_Name.last_name;
		}
		newSel = Purchase_Request1.Supplier_Selected();
		newSel.Supplier_ID=sidStr;
		newSel.Suppliers=supName;
		newSel.Status="Active";
		newSel.Selected=false;
		input.Supplier_Selected.insert(newSel);
	}
}
// === Step 4: Enforce only ONE winner — unselect all other rows when one is selected ===
for each  wsel1 in input.Supplier_Selected
{
	if(wsel1.Selected == true)
	{
		for each  wsel2 in input.Supplier_Selected
		{
			if(wsel2.ID != wsel1.ID)
			{
				wsel2.Selected=false;
			}
		}
	}
}
// === Step 5: Populate header fields based on the winner ===
winnerSupplierID = "";
winnerSupplierName = "";
winnerFinalPrice = 0;
winnerLeadTime = 0;
for each  ssel in input.Supplier_Selected
{
	if(ssel.Selected)
	{
		winnerSupplierID = ssel.Supplier_ID.toString();
		winnerSupplierName = ssel.Suppliers;
		winnerFinalPrice = ifnull(ssel.Final_Price,0);
		winnerLeadTime = ifnull(ssel.Lead_Time,0);
	}
}
if(winnerSupplierID != "")
{
	input.Selected_Supplier = winnerSupplierName;
	// FIXED 2026-07-14: only overwrite Selcted_Final_Cost when the winner's OWN row
	// actually has a real price — see NOTES below for why.
	if(winnerFinalPrice > 0)
	{
		input.Selcted_Final_Cost = winnerFinalPrice;
	}
	input.Required_Days_Lead = winnerLeadTime;
	// REMOVED 2026-07-28, real bug found live (PR-00006, SO-16325) — this comparison
	// used the NATIVE Supplier_Load_Balancing subform's own recommendedSupplierID
	// (Step 1, above), computed by pr_sync_supplier_load_balancing.txt's stale-tiebreak
	// logic (first-in-list wins on an Active_POs tie — native subform order put
	// Fenteng first, widget's own live NPR_SUPPLIERS fetch order put Tony first, same
	// 0-0 tie, two different "winners"). Confirmed via direct API pull: native subform
	// said Fenteng=Recommended while the PRs widget's own live Load Balancing panel
	// (computeRecommendedSupplier(), a separate/more-current computation) correctly
	// showed Tony=Recommended. Every save/edit re-ran this Validations workflow and
	// silently reverted Followed_Recommendation back to "No" even right after being
	// manually corrected, permanently blocking Create PO with a false "needs Override
	// Reason." Real fix: this field is now owned EXCLUSIVELY by the PRs widget
	// (syncFollowedRecFromSupplier() on manual pick, autoHealFollowedRecommendation()
	// self-correcting it live whenever the recommendation shifts) — matches this app's
	// own established "native form isn't used in deployment, widget owns live
	// decisions" pattern already applied to Load Balancing itself. This workflow no
	// longer touches Followed_Recommendation at all here.
}
else
{
	input.Selected_Supplier = "";
	input.Selcted_Final_Cost = 0;
	input.Required_Days_Lead = 0;
	input.Followed_Recommendation = "";
}

````
