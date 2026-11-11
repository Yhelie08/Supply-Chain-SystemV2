---
title: "PR_Approved_Action1_PASTE_THIS_2026-10-01"
source_file: "PR_Approved_Action1_PASTE_THIS_2026-10-01.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 276
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# PR_Approved_Action1_PASTE_THIS_2026-10-01

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `PR_Approved_Action1_PASTE_THIS_2026-10-01.txt`
> - **Lines of Code:** 276
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
siblingPRs = Purchase_Request1[Sales_Order == input.Sales_Order && PR_Approved == false && PR_READY_FOR_PO == true];
approvedList = "";
skippedList = "";
for each  prLoop in siblingPRs
{
	/* ADDED 2026-10-01 (PR On Hold plan, Phase 2) — a PR that is On Hold or Cancelled
	   is never converted to a PO, even when a sibling PR in the same SO is. Blank
	   Hold_Status (older PRs) counts as Active. */
	if(prLoop.Hold_Status == "On Hold" || prLoop.Hold_Status == "Cancelled")
	{
		skippedList = skippedList + prLoop.PR_No + " (" + prLoop.Hold_Status + "), ";
		continue;
	}
	if(prLoop.Followed_Recommendation == "No")
	{
		if(prLoop.Override_Reason == null || prLoop.Override_Reason == "")
		{
			skippedList = skippedList + prLoop.PR_No + ", ";
			continue;
		}
	}
	selectedSupplierName = prLoop.Selected_Supplier;
	customerRec = prLoop.Customer;
	customerName = customerRec.customer_name;
	itemRec = prLoop.Items;
	itemName = itemRec.item_name;
	matchingPONo = "";
	candidatePOs = Purchase_Order[PO_Status != "Completed"];
	for each  po in candidatePOs
	{
		if(po.SO_No.Sales_Order_Number == prLoop.Sales_Order)
		{
			for each  ln in po.PO_Line_Items
			{
				lnSupplierVal = ln.Supplier + "";
				if(lnSupplierVal == selectedSupplierName || lnSupplierVal.contains(selectedSupplierName) || selectedSupplierName.contains(lnSupplierVal))
				{
					/* FIXED 2026-08-10, mirrors pr_approve_po_custom_api.txt's approvePOMain
					   fix — was exact ln.Supplier==selectedSupplierName, same full-vs-bare-name
					   mismatch class as elsewhere in this file (see NOTES). Real live case
					   (SO-16438): a PR skipped earlier for missing Override_Reason, re-approved
					   after fixing it, would create a duplicate PO instead of joining the
					   existing one if the supplier name shape differs between the two PRs. */
					matchingPONo = po.PO_No;
				}
			}
		}
	}
	if(matchingPONo != "")
	{
		targetPOs = Purchase_Order[PO_No == matchingPONo];
		for each  tpo in targetPOs
		{
			targetPO = tpo;
		}
	}
	else
	{
		maxNum = 0;
		existingPOs = Purchase_Order[ID != 0];
		for each  po in existingPOs
		{
			poNoStr = po.PO_No;
			if(poNoStr != null && poNoStr != "")
			{
				numPart = poNoStr.removeFirstOccurence("PO-");
				num = numPart.toLong();
				if(num > maxNum)
				{
					maxNum = num;
				}
			}
		}
		newNum = maxNum + 1;
		if(newNum < 10)
		{
			newPONo = "PO-0000" + newNum;
		}
		else if(newNum < 100)
		{
			newPONo = "PO-000" + newNum;
		}
		else if(newNum < 1000)
		{
			newPONo = "PO-00" + newNum;
		}
		else if(newNum < 10000)
		{
			newPONo = "PO-0" + newNum;
		}
		else
		{
			newPONo = "PO-" + newNum;
		}
		newPOID = insert into Purchase_Order
		[
			PO_No=newPONo
			Customer=customerName
			Customer_Type=prLoop.Customer_Type
			Sales_Owner=prLoop.Sales_Owner
			PO_Date=zoho.currentdate
			PO_Status="Draft"
			Added_User=zoho.loginuser
		];
		targetPO = Purchase_Order[ID == newPOID];
		soFound = false;
		soIDNum = 0;
		soRecs = Sales_Order[Sales_Order_Number == prLoop.Sales_Order];
		for each  sor in soRecs
		{
			soIDNum = sor.ID;
			soFound = true;
		}
		if(soFound == false)
		{
			soIDNum = insert into Sales_Order
			[
				Sales_Order_Number=prLoop.Sales_Order
				Added_User=zoho.loginuser
			];
		}
		targetPO.SO_No=soIDNum;
	}
	alreadyHasLine = false;
	for each  existingLn in targetPO.PO_Line_Items
	{
		if(existingLn.PR_No == prLoop.PR_No)
		{
			alreadyHasLine = true;
		}
	}
	if(alreadyHasLine == true)
	{
		prLoop.PR_Status="Converted to PO";
		prLoop.Link_PO_No=targetPO.PO_No;
		prLoop.PR_Approved=true;
		approvedList = approvedList + prLoop.PR_No + ", ";
		continue;
	}
	targetPO.Sales_Owner=prLoop.Sales_Owner;
	/* REVERTED 2026-07-15, per user ("dont show srp/rate there") — both the SRP_Rate_PR
	   and catalog-Rate fallback tiers dropped from the aggregate Final_Price too, same
	   as Actions 2/3 earlier today. Safe for the same reason: Books-sync no longer
	   depends on this field for money-correctness (Item_Price_Supplier1/2, see
	   purchase_order_scripts.txt, already carries the authoritative catalog rate
	   separately) — this is purely a buyer-facing DISPLAY field now, and per user's
	   principle established today, no surface should show a reference/fallback number
	   as if it were a real confirmed price. Final_Price now ONLY ever reflects
	   Selcted_Final_Cost (0 if blank). */
	rateToUse = prLoop.Selcted_Final_Cost;
	if(rateToUse == null)
	{
		rateToUse = 0;
	}
	newLine = Purchase_Order.PO_Line_Items();
	newLine.PR_No=prLoop.PR_No;
	newLine.Supplier=selectedSupplierName;
	newLine.Item=itemName;
	newLine.SKU=prLoop.sku;
	newLine.QTY=prLoop.quantity.round(0).toLong();
	newLine.Unit=prLoop.unit;
	newLine.Final_Price=rateToUse;
	newLine.Line_Total=prLoop.quantity.round(0).toLong() * rateToUse.round(0).toLong();
	itemRateStr = itemRec.Rate + "";
	if(itemRateStr != "null" && itemRateStr != "" && itemRateStr != "0" && itemRateStr.toDecimal() != 0)
	{
		newLine.SRP_Rate_PO=itemRateStr.toDecimal().round(0).toLong();
		targetPO.SRP_Rate=itemRateStr.toDecimal().round(0).toLong();
	}
	newLine.Shipping_Mode=prLoop.Shipment_Mode;
	newLine.Target_Delivery=prLoop.Target_Delivery;
	newLine.supplier_target_date=prLoop.supplier_target_date;
	newLine.Delay_Status=prLoop.Delay_Status;
	newLine.Required_Days_Lead=prLoop.Required_Days_Lead;
	newLine.Remaining_Days=prLoop.Remaining_Days;
	newLine.Followed_Recommendation=prLoop.Followed_Recommendation;
	newLine.Override_Reason=prLoop.Override_Reason;
	newLine.Priority=prLoop.Priority;
	newLine.Production_Date=zoho.currentdate;
	if(itemRec != null && itemRec.Image != null)
	{
		newLine.Item_Image=itemRec.Image;
	}
	targetPO.PO_Line_Items.insert(newLine);
	totalVal = 0;
	totalLns = 0;
	for each  poLn in targetPO.PO_Line_Items
	{
		totalLns = totalLns + 1;
		if(poLn.Line_Total != null)
		{
			totalVal = totalVal + poLn.Line_Total;
		}
	}
	targetPO.Total_PO_Value=totalVal;
	targetPO.Total_Lines=totalLns;
	targetPO.Sent_On=zoho.currenttime;
	targetPO.Is_Locked=true;
	/* FIXED 2026-08-07, real crash risk found via codebase-wide audit: this is the
	   NATIVE "Approve PR" twin of `pr_approve_po_custom_api.txt`'s `approvePOMain` —
	   that file already got this EXACT fix live 2026-08-05 (real Production crash,
	   "'supSnapRec' has no matching records") but the fix was never mirrored here.
	   Suppliers.Supplier_Name stores the FULL name entirely in first_name ("Tony Fan"/
	   "Fenteng Lighting"), while selectedSupplierName (Purchase_Request1.Selected_Supplier)
	   can be either the short name (auto-routed PR, no INQ match) or the full name
	   (INQ-routed PR, confirmed live in Production holding "Tony Fan") depending on
	   the PR's own history — the old exact-match criteria found 0 rows whenever it hit
	   the short-name case, and dot-accessing/writing .Active_PO_Count on the resulting
	   empty collection crashed the whole function, same as the already-fixed incident.
	   Suppliers has only 2 real records — safe to iterate the whole form and
	   string-compare both directions, same pattern as approvePOMain's fix. */
	matchedSupplierIdPR = 0;
	matchedSupplierActivePOCountPR = 0;
	foundSupplierPR = false;
	for each  supRecPR in Suppliers
	{
		supNameValPR = supRecPR.Supplier_Name.first_name + "";
		supMatchesPR = false;
		if(supNameValPR == selectedSupplierName)
		{
			supMatchesPR = true;
		}
		if(supNameValPR.contains(selectedSupplierName))
		{
			supMatchesPR = true;
		}
		if(selectedSupplierName.contains(supNameValPR))
		{
			supMatchesPR = true;
		}
		if(supMatchesPR == true)
		{
			matchedSupplierIdPR = supRecPR.ID;
			matchedSupplierActivePOCountPR = supRecPR.Active_PO_Count;
			foundSupplierPR = true;
		}
	}
	targetPO.Supplier_Load_At_PO=matchedSupplierActivePOCountPR;
	prLoop.PR_Status="Converted to PO";
	prLoop.Link_PO_No=targetPO.PO_No;
	prLoop.Production_Date=zoho.currentdate;
	activePOCount = 0;
	allActivePOs = Purchase_Order[PO_Status != "Completed" && PO_Status != "Cancelled"];
	for each  po in allActivePOs
	{
		for each  poLn in po.PO_Line_Items
		{
			if(poLn.Supplier == selectedSupplierName)
			{
				activePOCount = activePOCount + 1;
			}
		}
	}
	if(foundSupplierPR == true)
	{
		update Suppliers[ID == matchedSupplierIdPR]
		[
			Active_PO_Count=activePOCount
		];
	}
	prLoop.Last_Update=zoho.currenttime;
	prLoop.PR_Approved=true;
	approvedList = approvedList + prLoop.PR_No + " -> " + targetPO.PO_No + "; ";
}
if(approvedList == "" && skippedList == "")
{
	info "No eligible PRs found for SO " + input.Sales_Order + ".";
}
else if(skippedList != "")
{
	info "Approved: " + approvedList + " | Skipped (needs Override Reason, or On Hold/Cancelled): " + skippedList;
}
else
{
	success message "Approved: " + approvedList;
}

````
