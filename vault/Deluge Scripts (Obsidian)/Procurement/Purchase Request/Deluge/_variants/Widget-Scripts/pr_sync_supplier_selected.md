---
title: "pr_sync_supplier_selected"
source_file: "DMS\DelugeScripts\pr_sync_supplier_selected.txt"
category: "Procurement/Purchase Request/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 162
tags:
  - deluge
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
  - zoho-creator
---

# pr_sync_supplier_selected

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\pr_sync_supplier_selected.txt`
> - **Lines of Code:** 162
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PR_Sync_Supplier_Selected — Purchase_Request1 supplier-selection sync ==
== First captured/documented here 2026-07-14 — previously only referenced (not verified)
   in pr_check_readiness.txt's own NOTES ("Selcted_Final_Cost ... auto-filled by
   PR_Sync_Supplier_Selected — a separate workflow this session hasn't touched/
   documented yet"). Found live via a real bug investigation — see NOTES below. ==

====================================================
WORKFLOW SETUP — PR_Sync_Supplier_Selected
  Form: Purchase_Request1
  Trigger: Created or Edited > Validations (on form submission)
====================================================

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
		supName = "";
		for each  supRec in Suppliers { if(supRec.ID + "" == sidStr) { supName = supRec.Supplier_Name.first_name + ""; if(supName == "" || supName == "null") { supName = supRec.Supplier_Name.last_name + ""; } } }
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

====================================================
NOTES:
- First captured 2026-07-14, full source pasted live from Creator's workflow editor
  (Temp1.txt) during a real bug investigation — see below. Previously only referenced
  by name in pr_check_readiness.txt's own NOTES, never actually seen/verified until now.
- BUG found live 2026-07-14 (PR-00002 / Acantha Deux / INQ-00003): `so_to_pr_scripts_
  NewScripts.txt`'s new `finalPriceForPR` fallback (falls back to the Inquiry's own
  SRP_Approved1 when the winning quote row has no real price — see that file's own
  NOTES) correctly computed 4685 and included it in the `Purchase_Request1` create
  payload (`data.put("Selcted_Final_Cost", finalPriceForPR)`), and the createRecord
  call reported success (code 3000) — but the record's actual Selcted_Final_Cost came
  back ¥0.00 on live inspection. Root cause: `zoho.creator.v2_1.createRecord` fires the
  target form's own Created-trigger workflows by default (already confirmed elsewhere in
  this codebase) — this script IS one of them (Created or Edited > Validations), and its
  Step 5 unconditionally did `input.Selcted_Final_Cost = winnerFinalPrice;` where
  `winnerFinalPrice = ifnull(ssel.Final_Price,0)` reads the winning `Supplier_Selected`
  row's own Final_Price. SO_To_PR's routing had marked Tony as the winner
  (`Selected=true` on his Supplier_Selected row) but that row's own Final_Price was
  blank (Tony never actually submitted a quote on the Inquiry side either) — so
  `winnerFinalPrice` computed to 0 and this Validations script overwrote the just-set
  4685 back to 0, all within the same create-and-validate cascade, before the record
  ever actually saved with the 4685 value.
- FIXED: Step 5 now only overwrites `Selcted_Final_Cost` when `winnerFinalPrice > 0`
  (a real price actually exists on the winner's row) — when the winner's own price is
  still blank, it now LEAVES whatever's already in `Selcted_Final_Cost` untouched
  (e.g. SO_To_PR's catalog-rate fallback) instead of zeroing it out. This preserves the
  CORRECT existing behavior for every other case: once a real supplier quote comes in
  (winnerFinalPrice>0), this script still correctly syncs it in as the authoritative
  price, same as before. The `else` branch (no winner selected at all,
  `winnerSupplierID==""`) is UNCHANGED — still resets to 0, since that's a genuinely
  different case (nothing to reference at all, not a blank-but-selected winner).
- UNTESTED — needs re-pasting into Creator (Purchase_Request1's `PR_Sync_Supplier_
  Selected` workflow) + a retest: delete PR-00002, re-approve Acantha's SO again, and
  confirm Selcted_Final_Cost now actually persists at 4685 instead of getting reset to 0.
====================================================

````
