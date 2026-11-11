---
title: "pr_approve_po_custom_api"
source_file: "DMS\DelugeScripts\pr_approve_po_custom_api.txt"
category: "Procurement/Purchase Order/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 1735
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
  - qc
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# pr_approve_po_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Procurement/Purchase Order/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\pr_approve_po_custom_api.txt`
> - **Lines of Code:** 1,735
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PR to PO Grouping "Approve PR to PO" button, via Creator Custom API ==
== Called directly from PRs/app/PR.html's .btn-create-po buttons (group card + detail view) ==
== New 2026-07-07 — mirrors pr_to_po_grouping.txt's 3 Actions exactly ==
== CONFIRMED WORKING END-TO-END 2026-07-07 (PR-00021/PR-00022 -> PO-00004, aggregate +
   both supplier POs all correct) — see NOTES for the one real setup gotcha hit live ==
== CHANGED 2026-07-16, mirrored from pr_to_po_grouping.txt Actions 2/3 (see that file's
   header note for the full writeup) — `approvePOFenteng`/`approvePOTony` now ALSO build
   Shipments + Receiving + the real Books Purchase Order, once per distinct supplier PO
   touched per call (`processedSupPOsF/T`), moved in from
   acknowledge_po_custom_api.txt's `acknowledgePOFenteng`/`acknowledgePOTony` (now slimmed
   to ETD/ETA + status bookkeeping only, per user request). `approvePOMain` UNCHANGED —
   Shipments/Receiving/Books are per-supplier concepts, always lived in the
   Fenteng/Tony-specific functions/Actions, never the aggregate one. ==

====================================================
WHY THIS EXISTS (don't skip straight to editing pr_to_po_grouping.txt instead)
====================================================
`PR_Approved` in pr_to_po_grouping.txt is a REPORT ACTION ITEM ("On click of action
item" trigger). Report Action Items are a Creator UI-only construct — there is no
Creator REST/SDK call that can invoke one externally, unlike form workflows (which DO
fire from zoho.creator.v2_1.createRecord / addRecords per this project's established
findings). A custom widget button therefore CANNOT "click" that native button for you.

The proven workaround in this exact codebase: convert the logic into a Deluge Custom
Function wrapped in a Custom API (see create_estimate_custom_api.txt — same pattern,
same reasoning, same widget SDK call shape). This file does that for PR_Approved.

Split into 3 SEPARATE custom functions/APIs, not 1 combined one — this codebase already
found live (Supplier_Populate_From_INQ) that combining Fenteng-form and Tony-form
subform-constructor calls in the SAME script breaks ("Supplier_1 insert + subform must
be SEPARATE Deluge action from Supplier_2 — cross-form subform refs fail when
combined"). Since that restriction appears tied to having both duplicate-form subform
constructors present in one script's compiled text (not just execution order), splitting
into 3 functions mirrors the exact separation already proven safe for the native
3-Action version, rather than gambling on whether the restriction also holds inside a
Custom Function specifically.

====================================================
STEP 1 — CREATE 3 DELUGE CUSTOM FUNCTIONS
  Creator: Workflows (or Functions area) -> New Custom Function
  Same editor gotchas as create_estimate_custom_api.txt's Custom Function (this is the
  SAME "App Builder" custom-function editor, not a Books one, not a workflow-action one):
  - Paste the FULL block including the "map funcName(...)" signature line + outer {} —
    this editor does NOT pre-generate a wrapper.
  - Return type keyword in the signature must match the dropdown you set ("map").
  - Do NOT explicitly type local variables (no "Map response = Map();") — plain
    untyped assignment only ("response = Map();").
  - Don't click the left-sidebar snippet helper buttons while your real code is in the
    editor — they insert literal placeholder text at the cursor and corrupt the buffer.
====================================================

--------------------------------------------------
FUNCTION 1 of 3 — approvePOMain
Argument: String soNo
--------------------------------------------------

map approvePOMain(String soNo)
{
	response = Map();
	siblingPRs = Purchase_Request1[Sales_Order == soNo && PR_Approved == false && PR_READY_FOR_PO == true];
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
						/* FIXED 2026-08-10 — was exact ln.Supplier==selectedSupplierName, same
						   full-vs-bare-name mismatch class as elsewhere in this file. Real live
						   case (SO-16438): PR-00001 approved first, PO line stores "Tony Fan";
						   PR-00002 (earlier skipped for missing Override_Reason) resolves
						   selectedSupplierName as "Tony" on re-approval — exact match found 0
						   POs, would have created a duplicate PO instead of joining this one. */
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
			targetPO.SO_No = soIDNum;
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
			prLoop.PR_Status = "Converted to PO";
			prLoop.Link_PO_No = targetPO.PO_No;
			prLoop.PR_Approved = true;
			approvedList = approvedList + prLoop.PR_No + " -> " + targetPO.PO_No + "; ";
			continue;
		}
		targetPO.Sales_Owner=prLoop.Sales_Owner;
		/* REVERTED 2026-07-15, mirrored from pr_to_po_grouping.txt Action 1 — see that
		   block's comment for full reasoning. */
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
			newLine.Item_Image = itemRec.Image;
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
		/* FIXED 2026-08-05, real crash found live in Production (PR-00002/SO-16399,
		   Stack Trace: "'supSnapRec' has no matching records. Unable to update the
		   value supSnapRec.Active_PO_Count. Line:(197)") — same short-vs-full-name
		   mismatch class already fixed today elsewhere (stage_inquiry_changed_actions.txt,
		   approvePOFenteng/Tony), but a NEW field/form pair: Suppliers.Supplier_Name is a
		   Name-type field storing the FULL name entirely in first_name ("Tony Fan" /
		   "Fenteng Lighting", confirmed via live API dump — last_name is blank on both
		   real rows), while selectedSupplierName here is the SHORT name ("Tony"/
		   "Fenteng") off Purchase_Request1.Selected_Supplier. The old exact-match
		   criteria found 0 rows every time -> supSnapRec was an empty collection ->
		   dot-accessing/writing .Active_PO_Count on it crashed the whole function (an
		   unhandled exception, not a caught business-logic error, unlike the
		   Fenteng/Tony functions' own silent-0-processed version of this same bug
		   class). Suppliers has only 2 real records — safe to iterate the whole form
		   and string-compare, same established pattern used elsewhere in this app for
		   small forms. */
		matchedSupplierId = 0;
		matchedSupplierActivePOCount = 0;
		foundSupplier = false;
		for each  supRec in Suppliers
		{
			supNameVal = supRec.Supplier_Name.first_name + "";
			supMatches = false;
			if(supNameVal == selectedSupplierName)
			{
				supMatches = true;
			}
			if(supNameVal.contains(selectedSupplierName))
			{
				supMatches = true;
			}
			if(selectedSupplierName.contains(supNameVal))
			{
				supMatches = true;
			}
			if(supMatches == true)
			{
				matchedSupplierId = supRec.ID;
				matchedSupplierActivePOCount = supRec.Active_PO_Count;
				foundSupplier = true;
			}
		}
		targetPO.Supplier_Load_At_PO=matchedSupplierActivePOCount;
		prLoop.PR_Status = "Converted to PO";
		prLoop.Link_PO_No = targetPO.PO_No;
		prLoop.Production_Date = zoho.currentdate;
		activePOCount = 0;
		allActivePOs = Purchase_Order[PO_Status != "Completed" && PO_Status != "Cancelled"];
		for each  po in allActivePOs
		{
			for each  poLn in po.PO_Line_Items
			{
				poLnSupplierVal = poLn.Supplier + "";
				poLnMatches = false;
				if(poLnSupplierVal == selectedSupplierName)
				{
					poLnMatches = true;
				}
				if(poLnSupplierVal.contains(selectedSupplierName))
				{
					poLnMatches = true;
				}
				if(selectedSupplierName.contains(poLnSupplierVal))
				{
					poLnMatches = true;
				}
				if(poLnMatches == true)
				{
					activePOCount = activePOCount + 1;
				}
			}
		}
		if(foundSupplier == true)
		{
			update Suppliers[ID == matchedSupplierId]
			[
				Active_PO_Count = activePOCount
			];
		}
		prLoop.Last_Update = zoho.currenttime;
		prLoop.PR_Approved = true;
		approvedList = approvedList + prLoop.PR_No + " -> " + targetPO.PO_No + "; ";
	}
	msg = "Approved: " + approvedList;
	if(skippedList != "")
	{
		msg = msg + " | Skipped (needs Override Reason, or On Hold/Cancelled): " + skippedList;
	}
	if(approvedList == "" && skippedList == "")
	{
		response.put("status","empty");
		response.put("message","No eligible PRs found for SO " + soNo);
	}
	else
	{
		response.put("status","success");
		response.put("message",msg);
	}
	return response;
}

--------------------------------------------------
FUNCTION 2 of 3 — approvePOFenteng
Argument: String soNo
--------------------------------------------------

map approvePOFenteng(String soNo)
{
	response = Map();
	processedCount = 0;
	processedSupPOsF = List();
	/* FIXED 2026-08-05, same real bug as approvePOTony below (see that function's
	   own NOTES) — Selected_Supplier can hold "Fenteng Lighting" (full) instead of
	   "Fenteng" (short); criteria broadened, supplier match moved into the loop. */
	siblingPRsF = Purchase_Request1[Sales_Order == soNo && PR_Approved == true && Link_PO_No != null];
	for each  prLoopF in siblingPRsF
	{
		if(prLoopF.Link_PO_No == "")
		{
			continue;
		}
		supplierMatchesF = false;
		if(prLoopF.Selected_Supplier == "Fenteng")
		{
			supplierMatchesF = true;
		}
		if(prLoopF.Selected_Supplier.contains("Fenteng"))
		{
			supplierMatchesF = true;
		}
		if(supplierMatchesF == false)
		{
			continue;
		}
		itemRecF = prLoopF.Items;
		itemNameF = itemRecF.item_name;
		existingSupPOsF = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == prLoopF.Link_PO_No];
		supPOFoundF = false;
		for each  spoF in existingSupPOsF
		{
			targetSupPOF = spoF;
			supPOFoundF = true;
		}
		if(supPOFoundF == false)
		{
			newSupPOIDF = insert into Fenteng_Lighting_Purchase_Order
			[
				PO_No_Supplier1=prLoopF.Link_PO_No
				PO_Date_Supplier1=zoho.currentdate
				PO_Status_Supplier1="Draft"
			];
			targetSupPOF = Fenteng_Lighting_Purchase_Order[ID == newSupPOIDF];
		}
		alreadyHasLineF = false;
		for each  existingLnF in targetSupPOF.PO_Line_Items_Supplier1
		{
			if(existingLnF.PR_No_Supplier1 == prLoopF.PR_No)
			{
				alreadyHasLineF = true;
			}
		}
		if(alreadyHasLineF == true)
		{
			alreadyTrackedF = false;
			for each  doneNoF in processedSupPOsF
			{
				if(doneNoF == targetSupPOF.PO_No_Supplier1)
				{
					alreadyTrackedF = true;
				}
			}
			if(alreadyTrackedF == false)
			{
				processedSupPOsF.add(targetSupPOF.PO_No_Supplier1);
			}
			continue;
		}
		/* REMOVED 2026-07-15: SRP_Rate_PR fallback dropped, mirrors pr_to_po_grouping.txt
		   Action 2 (see that block's comment for full reasoning). */
		rateToUseF = prLoopF.Selcted_Final_Cost;
		if(rateToUseF == null)
		{
			rateToUseF = 0;
		}
		/* Item_Price_Supplier1 (Single Line/TEXT) — catalog reference rate, kept
		   separate from Final_Price_Supplier1. See pr_to_po_grouping.txt Action 2 NOTES
		   for the full reasoning, including the 2026-07-15 SRP_Approved_PR priority
		   addition mirrored here. */
		itemPriceValF = 0;
		if(prLoopF.SRP_Approved_PR != null && prLoopF.SRP_Approved_PR != 0)
		{
			itemPriceValF = prLoopF.SRP_Approved_PR;
		}
		else if(prLoopF.SRP_Rate_PR != null && prLoopF.SRP_Rate_PR != 0)
		{
			/* ADDED 2026-08-05, real bug found live in Production: a PR routed from an already-Approved Inquiry (inquiry_reference set) already carries that Inquirys own approved SRP into SRP_Rate_PR automatically at PR-creation time (SO_To_PR) -- but SRP_Approved_PR itself (a separate MANUAL-approval field) stays blank until an officer explicitly re-approves the same number in the PRs widget. Confirmed live: a real PR had SRP_Rate_PR=200 (matching its source Inquirys real approved SRP) but SRP_Approved_PR blank, so this whole block fell to the generic catalog Items.Rate fallback, and Books ended up receiving the suppliers raw quote instead of the real approved SRP. FIX: SRP_Rate_PR checked as a middle tier before the generic catalog fallback. */
			itemPriceValF = prLoopF.SRP_Rate_PR;
		}
		else
		{
			itemRateStrF = itemRecF.Rate + "";
			if(itemRateStrF != "null" && itemRateStrF != "" && itemRateStrF != "0" && itemRateStrF.toDecimal() != 0)
			{
				itemPriceValF = itemRateStrF.toDecimal();
			}
		}
		newSupLineF = Fenteng_Lighting_Purchase_Order.PO_Line_Items_Supplier1();
		newSupLineF.PR_No_Supplier1=prLoopF.PR_No;
		newSupLineF.Supplier_Supplier1=prLoopF.Selected_Supplier;
		newSupLineF.Item_Supplier1=itemNameF;
		newSupLineF.SKU_Supplier1=prLoopF.sku;
		newSupLineF.QTY_Supplier1=prLoopF.quantity.round(0).toLong();
		newSupLineF.Unit_Supplier1=prLoopF.unit;
		newSupLineF.Final_Price_Supplier1=rateToUseF;
		newSupLineF.Item_Price_Supplier1=itemPriceValF + "";
		newSupLineF.Line_Total_Supplier1=prLoopF.quantity.round(0).toLong() * rateToUseF.round(0).toLong();
		newSupLineF.Shipping_Mode_Supplier1=prLoopF.Shipment_Mode;
		newSupLineF.Target_Delivery_Supplier1=prLoopF.Target_Delivery;
		newSupLineF.supplier_target_date_Supplier1=prLoopF.supplier_target_date;
		newSupLineF.Delay_Status_Supplier1=prLoopF.Delay_Status;
		newSupLineF.Followed_Recommendation_Supplier1=prLoopF.Followed_Recommendation;
		newSupLineF.Override_Reason_Supplier1=prLoopF.Override_Reason;
		targetSupPOF.PO_Line_Items_Supplier1.insert(newSupLineF);
		totalValF = 0;
		totalLnsF = 0;
		for each  poLnF in targetSupPOF.PO_Line_Items_Supplier1
		{
			totalLnsF = totalLnsF + 1;
			if(poLnF.Line_Total_Supplier1 != null)
			{
				totalValF = totalValF + poLnF.Line_Total_Supplier1;
			}
		}
		targetSupPOF.Total_PO_Value_Supplier1=totalValF;
		targetSupPOF.Total_Lines_Supplier1=totalLnsF;
		targetSupPOF.Sent_On_Supplier1=zoho.currenttime;
		targetSupPOF.Is_Locked_Supplier1=true;
		processedCount = processedCount + 1;
		alreadyTrackedF2 = false;
		for each  doneNoF2 in processedSupPOsF
		{
			if(doneNoF2 == targetSupPOF.PO_No_Supplier1)
			{
				alreadyTrackedF2 = true;
			}
		}
		if(alreadyTrackedF2 == false)
		{
			processedSupPOsF.add(targetSupPOF.PO_No_Supplier1);
		}
	}
	/* MOVED HERE 2026-07-16, mirrored from pr_to_po_grouping.txt Action 2 — see that
	   file's inline comment for the full writeup. Same "once per distinct supplier PO
	   touched this run" granularity via processedSupPOsF. RR_Reference_No guard dropped
	   — replacement POs never reach this function (created directly, bypass PR1). */
	for each  poNoTouchedF in processedSupPOsF
	{
		supPOsSyncF = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == poNoTouchedF];
		for each  spoF2 in supPOsSyncF
		{
			targetSupPOF2 = spoF2;
		}
		aggPOsSyncF = Purchase_Order[PO_No == poNoTouchedF];
		for each  apoF2 in aggPOsSyncF
		{
			apoF = apoF2;
		}
		soNoTextF = apoF.SO_No.Sales_Order_Number;
		matchingShipNoF = "";
		candidateShipmentsF = Shipments[PO_No == apoF.ID && Shipment_Status == "Pending"];
		for each  shF in candidateShipmentsF
		{
			matchingShipNoF = shF.Shipment_No;
		}
		isNewShipmentF = false;
		if(matchingShipNoF != "")
		{
			targetShipsF = Shipments[Shipment_No == matchingShipNoF];
			for each  tshF in targetShipsF
			{
				targetShipF = tshF;
			}
		}
		else
		{
			maxShipNumF = 0;
			existingShipmentsF = Shipments[ID != 0];
			for each  shF in existingShipmentsF
			{
				shipNoStrF = shF.Shipment_No;
				if(shipNoStrF != null && shipNoStrF != "")
				{
					shipNumPartF = shipNoStrF.removeFirstOccurence("SHP-");
					shipNumF = shipNumPartF.toLong();
					if(shipNumF > maxShipNumF)
					{
						maxShipNumF = shipNumF;
					}
				}
			}
			newShipNumF = maxShipNumF + 1;
			if(newShipNumF < 10)
			{
				newShipNoF = "SHP-0000" + newShipNumF;
			}
			else if(newShipNumF < 100)
			{
				newShipNoF = "SHP-000" + newShipNumF;
			}
			else if(newShipNumF < 1000)
			{
				newShipNoF = "SHP-00" + newShipNumF;
			}
			else if(newShipNumF < 10000)
			{
				newShipNoF = "SHP-0" + newShipNumF;
			}
			else
			{
				newShipNoF = "SHP-" + newShipNumF;
			}
			newShipIDF = insert into Shipments
			[
				Shipment_No=newShipNoF
				PO_No=apoF.ID
				Sales_Order=soNoTextF
				Customer=apoF.Customer
				Supplier="Fenteng"
				Shipment_Status="Pending"
			];
			targetShipF = Shipments[ID == newShipIDF];
			isNewShipmentF = true;
		}
		for each  poLnAggF in apoF.PO_Line_Items
		{
			targetShipF.Required_Days_Lead=poLnAggF.Required_Days_Lead;
			targetShipF.Remaining_Days=poLnAggF.Remaining_Days;
			targetShipF.Target_Date=poLnAggF.Target_Delivery;
			targetShipF.Supplier_Target_Date=poLnAggF.supplier_target_date;
			targetShipF.Production_Date=poLnAggF.Production_Date;
			if(poLnAggF.PR_No != null && poLnAggF.PR_No != "")
			{
				prLineF = Purchase_Request1[PR_No == poLnAggF.PR_No];
				targetShipF.Shipment_Days=prLineF.Shipment_Days;
				targetShipF.Sales_Owner=prLineF.Sales_Owner;
			}
			else
			{
				targetShipF.Sales_Owner=apoF.Sales_Owner;
			}
			shipLineExistsF = false;
			for each  existingShipLnF in targetShipF.PO_Shipments
			{
				if(existingShipLnF.PR_No == poLnAggF.PR_No)
				{
					shipLineExistsF = true;
				}
			}
			if(shipLineExistsF == false)
			{
				newShipLineF = Shipments.PO_Shipments();
				newShipLineF.PR_No=poLnAggF.PR_No;
				newShipLineF.SKU=poLnAggF.SKU;
				newShipLineF.Item_Name=poLnAggF.Item;
				newShipLineF.Ordered_QTY=poLnAggF.QTY;
				newShipLineF.Shipment_QTY=poLnAggF.QTY;
				newShipLineF.Remaining_QTY=poLnAggF.QTY;
				newShipLineF.Shipping_Mode=poLnAggF.Shipping_Mode;
				targetShipF.PO_Shipments.insert(newShipLineF);
			}
		}
		/* ADDED 2026-07-21 — mirrors pr_to_po_grouping.txt Action 2's same-day block
		   (Shipments-Created-trigger workflow dropped, folded in here instead). */
		if(isNewShipmentF == true)
		{
			newSuppRecIDF = insert into Fenteng_Shipment
			[
				Shipment_No=targetShipF.Shipment_No
				Parent_Shipment_ID=targetShipF.ID + ""
				Added_User1=zoho.loginuser
			];
			newSuppRecF = Fenteng_Shipment[ID == newSuppRecIDF];
			for each  shLnF in targetShipF.PO_Shipments
			{
				newSuppRowF = Fenteng_Shipment.Supplier1_Shipment_Details();
				newSuppRowF.SKU=shLnF.SKU;
				newSuppRowF.Item_Name=shLnF.Item_Name;
				newSuppRowF.PR_No=shLnF.PR_No;
				newSuppRowF.RR_No="";
				newSuppRecF.Supplier1_Shipment_Details.insert(newSuppRowF);
			}
		}
		recvFoundF = false;
		matchingRecvIDF = 0;
		existingRecvF = Receiving[Shipments == targetShipF.ID];
		for each  rcF in existingRecvF
		{
			matchingRecvIDF = rcF.ID;
			recvFoundF = true;
		}
		if(recvFoundF == true)
		{
			targetRecvsF = Receiving[ID == matchingRecvIDF];
			for each  trcF in targetRecvsF
			{
				targetRecvF = trcF;
			}
		}
		else
		{
			maxRecvNumF = 0;
			existingRecvsF = Receiving[ID != 0];
			for each  rcF in existingRecvsF
			{
				recvNoStrF = rcF.Receive_No1;
				if(recvNoStrF != null && recvNoStrF != "")
				{
					recvNumPartF = recvNoStrF.removeFirstOccurence("RCV-");
					recvNumF = recvNumPartF.toLong();
					if(recvNumF > maxRecvNumF)
					{
						maxRecvNumF = recvNumF;
					}
				}
			}
			newRecvNumF = maxRecvNumF + 1;
			if(newRecvNumF < 10)
			{
				newRecvNoF = "RCV-0000" + newRecvNumF;
			}
			else if(newRecvNumF < 100)
			{
				newRecvNoF = "RCV-000" + newRecvNumF;
			}
			else if(newRecvNumF < 1000)
			{
				newRecvNoF = "RCV-00" + newRecvNumF;
			}
			else if(newRecvNumF < 10000)
			{
				newRecvNoF = "RCV-0" + newRecvNumF;
			}
			else
			{
				newRecvNoF = "RCV-" + newRecvNumF;
			}
			newRecvIDF = insert into Receiving
			[
				Receive_No1=newRecvNoF
				Shipments=targetShipF.ID
				SO_No=soNoTextF
				PO_No=apoF.PO_No
				Customer_Name=apoF.Customer
				Supplier="Fenteng"
			];
			targetRecvF = Receiving[ID == newRecvIDF];
		}
		for each  poLnAggF in apoF.PO_Line_Items
		{
			if(poLnAggF.PR_No != null && poLnAggF.PR_No != "")
			{
				prLineRecvF = Purchase_Request1[PR_No == poLnAggF.PR_No];
				targetRecvF.Sales_Owner=prLineRecvF.Sales_Owner;
			}
			else
			{
				targetRecvF.Sales_Owner=apoF.Sales_Owner;
			}
			recvLineExistsF = false;
			for each  existingRecvLnF in targetRecvF.Receiving_Line_Items
			{
				if(existingRecvLnF.PR_No == poLnAggF.PR_No)
				{
					recvLineExistsF = true;
				}
			}
			if(recvLineExistsF == false)
			{
				newRecvLineF = Receiving.Receiving_Line_Items();
				newRecvLineF.PR_No=poLnAggF.PR_No;
				newRecvLineF.SKU=poLnAggF.SKU;
				newRecvLineF.Item_Name=poLnAggF.Item;
				newRecvLineF.Expected_Qty=poLnAggF.QTY;
				targetRecvF.Receiving_Line_Items.insert(newRecvLineF);
			}
		}
		/* ADDED 2026-07-16, mirrored from pr_to_po_grouping.txt Action 2 — see that
		   file's own comment for the full writeup (Receiving's own Validations
		   workflows never fire on this cross-form insert). */
		totalExpectedF = 0;
		totalAcceptedF = 0;
		totalDamageF = 0;
		totalMissingF = 0;
		totalLinesRF = 0;
		incompleteLinesF = 0;
		readyForFulfillF = 0;
		for each  rln in targetRecvF.Receiving_Line_Items
		{
			totalLinesRF = totalLinesRF + 1;
			expRF = ifnull(rln.Expected_Qty,0);
			accRF = ifnull(rln.Accepted_Qty,0);
			dmgRF = ifnull(rln.Damage_Qty,0);
			misRF = ifnull(rln.Missing_Qty,0);
			totalExpectedF = totalExpectedF + expRF;
			totalAcceptedF = totalAcceptedF + accRF;
			totalDamageF = totalDamageF + dmgRF;
			totalMissingF = totalMissingF + misRF;
			totalRecRF = accRF + dmgRF + misRF;
			if(totalRecRF == expRF && accRF == expRF)
			{
				rln.Line_Result="Complete";
				rln.Ready_for_Fulfillment=true;
				readyForFulfillF = readyForFulfillF + 1;
			}
			else
			{
				rln.Line_Result="Incomplete";
				rln.Ready_for_Fulfillment=false;
				incompleteLinesF = incompleteLinesF + 1;
			}
		}
		targetRecvF.Total_Expected_Qty=totalExpectedF;
		targetRecvF.Total_Accepted_Qty=totalAcceptedF;
		targetRecvF.Total_Damage_Qty=totalDamageF;
		targetRecvF.Total_Missing_Qty=totalMissingF;
		targetRecvF.Total_Lines=totalLinesRF;
		targetRecvF.Incomplete_Lines=incompleteLinesF;
		targetRecvF.Ready_for_Fulfillment1=readyForFulfillF;
		if(totalLinesRF == 0 || (totalAcceptedF == 0 && totalDamageF == 0 && totalMissingF == 0))
		{
			targetRecvF.Receive_Status="Pending";
		}
		else if(incompleteLinesF == 0)
		{
			targetRecvF.Receive_Status="Received";
		}
		else
		{
			targetRecvF.Receive_Status="Partial Received";
		}
		shipModeBooksF = "Air Freight";
		for each  poLnBooksF in apoF.PO_Line_Items
		{
			shipLineValF = poLnBooksF.Shipping_Mode + "";
			if(shipLineValF == "LCL")
			{
				shipModeBooksF = "LCL";
			}
			else if(shipLineValF == "FCL")
			{
				shipModeBooksF = "FCL";
			}
			else if(shipLineValF != "" && shipLineValF != "null")
			{
				shipModeBooksF = "Air Freight";
			}
		}
		booksLineItemsF = List();
		prRefListF = List();
		for each  poLnBooksF2 in targetSupPOF2.PO_Line_Items_Supplier1
		{
			prRefListF.add(poLnBooksF2.PR_No_Supplier1);
			bookItemRecsF = Items[SKU == poLnBooksF2.SKU_Supplier1];
			bookItemIdF = "";
			for each  biF in bookItemRecsF
			{
				bookItemIdF = biF.ID1 + "";
			}
			if(bookItemIdF == "null")
			{
				bookItemIdF = "";
			}
			if(bookItemIdF != "")
			{
				effectiveRateF = poLnBooksF2.Final_Price_Supplier1.toDecimal();
				itemPriceStrF = poLnBooksF2.Item_Price_Supplier1 + "";
				if(itemPriceStrF != "null" && itemPriceStrF != "" && itemPriceStrF != "0" && itemPriceStrF.toDecimal() != 0)
				{
					effectiveRateF = itemPriceStrF.toDecimal();
				}
				lineBF = Map();
				lineBF.put("item_id",bookItemIdF);
				lineBF.put("quantity",poLnBooksF2.QTY_Supplier1.toLong());
				lineBF.put("rate",effectiveRateF);
				lineBF.put("warehouse_id","2680178000042173149");
				booksLineItemsF.add(lineBF);
			}
		}
		prRefsStrF = "[";
		prRefCountF = 0;
		for each  prRefItemF in prRefListF
		{
			if(prRefCountF > 0)
			{
				prRefsStrF = prRefsStrF + ",";
			}
			prRefsStrF = prRefsStrF + "\"" + prRefItemF + "\"";
			prRefCountF = prRefCountF + 1;
		}
		prRefsStrF = prRefsStrF + "]";
		cfListBooksF = List();
		cfBF1 = Map();
		cfBF1.put("label","Mode of Shipment");
		cfBF1.put("value",shipModeBooksF);
		cfListBooksF.add(cfBF1);
		cfBF2 = Map();
		cfBF2.put("label","Type of Order");
		cfBF2.put("value","Pre Order");
		cfListBooksF.add(cfBF2);
		cfBF3 = Map();
		cfBF3.put("label","Created by");
		cfBF3.put("value","Procurement");
		cfListBooksF.add(cfBF3);
		cfBF4 = Map();
		cfBF4.put("label","Supplier");
		cfBF4.put("value","Fenteng Lighting");
		cfListBooksF.add(cfBF4);
		cfBF5 = Map();
		cfBF5.put("label","PR References");
		cfBF5.put("value",prRefsStrF);
		cfListBooksF.add(cfBF5);
		existingBooksPOIDF = apoF.Books_PO_ID + "";
		if(existingBooksPOIDF == "null")
		{
			existingBooksPOIDF = "";
		}
		booksPOValidF = false;
		if(existingBooksPOIDF != "")
		{
			checkPORespF = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/purchaseorders/" + existingBooksPOIDF + "?organization_id=751117756"
				type :GET
				connection:"zhbooks3"
			];
			if(checkPORespF.get("code") == 0 && checkPORespF.get("purchaseorder") != null)
			{
				booksPOValidF = true;
			}
		}
		if(booksPOValidF == true)
		{
			updatePOBodyF = Map();
			updatePOBodyF.put("line_items",booksLineItemsF);
			updatePOBodyF.put("custom_fields",cfListBooksF);
			updatePOBodyStrF = updatePOBodyF.toString();
			updatePORespF = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/purchaseorders/" + existingBooksPOIDF + "?organization_id=751117756"
				type :PUT
				parameters:updatePOBodyStrF
				headers:{"Content-Type":"application/json"}
				connection:"zhbooks3"
			];
			info "Books PO update resp (Fenteng)=" + updatePORespF.toString();
		}
		else
		{
			createPOBodyF = Map();
			createPOBodyF.put("vendor_id","2680178000049168001");
			createPOBodyF.put("line_items",booksLineItemsF);
			createPOBodyF.put("custom_fields",cfListBooksF);
			createPOBodyF.put("date",zoho.currentdate.toString("yyyy-MM-dd"));
			createPOBodyStrF = createPOBodyF.toString();
			createPORespF = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/purchaseorders?organization_id=751117756"
				type :POST
				parameters:createPOBodyStrF
				headers:{"Content-Type":"application/json"}
				connection:"zhbooks3"
			];
			info "Books PO create resp (Fenteng)=" + createPORespF.toString();
			if(createPORespF.get("code") == 0 && createPORespF.get("purchaseorder") != null)
			{
				newBooksPOIDF = createPORespF.get("purchaseorder").get("purchaseorder_id") + "";
				apoF.Books_PO_ID = newBooksPOIDF;
				apoF.Books_PO_No = createPORespF.get("purchaseorder").get("purchaseorder_number") + "";
				approvePORespF = invokeurl
				[
					url :"https://www.zohoapis.com/books/v3/purchaseorders/" + newBooksPOIDF + "/approve?organization_id=751117756"
					type :POST
					connection:"zhbooks3"
				];
				info "Books PO approve resp (Fenteng)=" + approvePORespF.toString();
				openPORespF = invokeurl
				[
					url :"https://www.zohoapis.com/books/v3/purchaseorders/" + newBooksPOIDF + "/status/open?organization_id=751117756"
					type :POST
					connection:"zhbooks3"
				];
				info "Books PO status/open resp (Fenteng)=" + openPORespF.toString();
			}
		}
	}
	response.put("status","success");
	response.put("processed",processedCount);
	response.put("message",processedCount + " Fenteng line(s) synced");
	return response;
}

--------------------------------------------------
FUNCTION 3 of 3 — approvePOTony
Argument: String soNo
--------------------------------------------------

map approvePOTony(String soNo)
{
	response = Map();
	processedCount = 0;
	processedSupPOsT = List();
	/* FIXED 2026-08-05, real bug found live in Production: Selected_Supplier holds
	   the FULL name ("Tony Fan") on this specific PR, not the SHORT name ("Tony")
	   this criteria expects — confirmed live (PR-00001, Sales_Order SO-16394,
	   Selected_Supplier: "Tony Fan"). Exact-match criteria found 0 records, function
	   returned {"status":"success","processed":0,...} with nothing actually created
	   — no error anywhere, just silently did nothing. Same short-vs-full-name
	   mismatch class already fixed today in stage_inquiry_changed_actions.txt.
	   FIX: criteria no longer filters on Selected_Supplier at all (broadened to
	   just Sales_Order+PR_Approved+Link_PO_No); the actual supplier match now
	   happens per-record inside the loop via a confirmed-safe plain `if`/`.contains()`
	   check (NOT inside the Form[...] criteria bracket itself — that shape has no
	   proven precedent anywhere else in this codebase, unlike a plain in-script
	   `if`, which is used safely elsewhere). Catches "Tony" (exact) and "Tony Fan"
	   (contains) both. */
	siblingPRsT = Purchase_Request1[Sales_Order == soNo && PR_Approved == true && Link_PO_No != null];
	for each  prLoopT in siblingPRsT
	{
		if(prLoopT.Link_PO_No == "")
		{
			continue;
		}
		supplierMatchesT = false;
		if(prLoopT.Selected_Supplier == "Tony")
		{
			supplierMatchesT = true;
		}
		if(prLoopT.Selected_Supplier.contains("Tony"))
		{
			supplierMatchesT = true;
		}
		if(supplierMatchesT == false)
		{
			continue;
		}
		itemRecT = prLoopT.Items;
		itemNameT = itemRecT.item_name;
		existingSupPOsT = Tony_Fan_Purchase_Order[PO_No_Supplier2 == prLoopT.Link_PO_No];
		supPOFoundT = false;
		for each  spoT in existingSupPOsT
		{
			targetSupPOT = spoT;
			supPOFoundT = true;
		}
		if(supPOFoundT == false)
		{
			newSupPOIDT = insert into Tony_Fan_Purchase_Order
			[
				PO_No_Supplier2=prLoopT.Link_PO_No
				PO_Date_Supplier2=zoho.currentdate
				PO_Status_Supplier2="Draft"
			];
			targetSupPOT = Tony_Fan_Purchase_Order[ID == newSupPOIDT];
		}
		alreadyHasLineT = false;
		for each  existingLnT in targetSupPOT.PO_Line_Items_Supplier2
		{
			if(existingLnT.PR_No_Supplier2 == prLoopT.PR_No)
			{
				alreadyHasLineT = true;
			}
		}
		if(alreadyHasLineT == true)
		{
			alreadyTrackedT = false;
			for each  doneNoT in processedSupPOsT
			{
				if(doneNoT == targetSupPOT.PO_No_Supplier2)
				{
					alreadyTrackedT = true;
				}
			}
			if(alreadyTrackedT == false)
			{
				processedSupPOsT.add(targetSupPOT.PO_No_Supplier2);
			}
			continue;
		}
		/* REMOVED 2026-07-15: SRP_Rate_PR fallback dropped, mirrors pr_to_po_grouping.txt
		   Action 3 (see that block's comment for full reasoning). */
		rateToUseT = prLoopT.Selcted_Final_Cost;
		if(rateToUseT == null)
		{
			rateToUseT = 0;
		}
		/* Item_Price_Supplier2 (Single Line/TEXT) — catalog reference rate, kept
		   separate from Final_Price_Supplier2. See pr_to_po_grouping.txt Action 3 NOTES
		   for the full reasoning, including the 2026-07-15 SRP_Approved_PR priority
		   addition mirrored here. */
		itemPriceValT = 0;
		if(prLoopT.SRP_Approved_PR != null && prLoopT.SRP_Approved_PR != 0)
		{
			itemPriceValT = prLoopT.SRP_Approved_PR;
		}
		else if(prLoopT.SRP_Rate_PR != null && prLoopT.SRP_Rate_PR != 0)
		{
			/* ADDED 2026-08-05, same real bug/fix as the Fenteng block above (see its own comment for the full writeup). */
			itemPriceValT = prLoopT.SRP_Rate_PR;
		}
		else
		{
			itemRateStrT = itemRecT.Rate + "";
			if(itemRateStrT != "null" && itemRateStrT != "" && itemRateStrT != "0" && itemRateStrT.toDecimal() != 0)
			{
				itemPriceValT = itemRateStrT.toDecimal();
			}
		}
		newSupLineT = Tony_Fan_Purchase_Order.PO_Line_Items_Supplier2();
		newSupLineT.PR_No_Supplier2=prLoopT.PR_No;
		newSupLineT.Supplier_Supplier2=prLoopT.Selected_Supplier;
		newSupLineT.Item_Supplier2=itemNameT;
		newSupLineT.SKU_Supplier2=prLoopT.sku;
		newSupLineT.QTY_Supplier2=prLoopT.quantity.round(0).toLong();
		newSupLineT.Unit_Supplier2=prLoopT.unit;
		newSupLineT.Final_Price_Supplier2=rateToUseT;
		newSupLineT.Item_Price_Supplier2=itemPriceValT + "";
		newSupLineT.Line_Total_Supplier2=prLoopT.quantity.round(0).toLong() * rateToUseT.round(0).toLong();
		newSupLineT.Shipping_Mode_Supplier2=prLoopT.Shipment_Mode;
		newSupLineT.Target_Delivery_Supplier2=prLoopT.Target_Delivery;
		newSupLineT.supplier_target_date_Supplier2=prLoopT.supplier_target_date;
		newSupLineT.Delay_Status_Supplier2=prLoopT.Delay_Status;
		newSupLineT.Followed_Recommendation_Supplier2=prLoopT.Followed_Recommendation;
		newSupLineT.Override_Reason_Supplier2=prLoopT.Override_Reason;
		targetSupPOT.PO_Line_Items_Supplier2.insert(newSupLineT);
		totalValT = 0;
		totalLnsT = 0;
		for each  poLnT in targetSupPOT.PO_Line_Items_Supplier2
		{
			totalLnsT = totalLnsT + 1;
			if(poLnT.Line_Total_Supplier2 != null)
			{
				totalValT = totalValT + poLnT.Line_Total_Supplier2;
			}
		}
		targetSupPOT.Total_PO_Value_Supplier2=totalValT;
		targetSupPOT.Total_Lines_Supplier2=totalLnsT;
		targetSupPOT.Sent_On_Supplier2=zoho.currenttime;
		targetSupPOT.Is_Locked_Supplier2=true;
		processedCount = processedCount + 1;
		alreadyTrackedT2 = false;
		for each  doneNoT2 in processedSupPOsT
		{
			if(doneNoT2 == targetSupPOT.PO_No_Supplier2)
			{
				alreadyTrackedT2 = true;
			}
		}
		if(alreadyTrackedT2 == false)
		{
			processedSupPOsT.add(targetSupPOT.PO_No_Supplier2);
		}
	}
	/* MOVED HERE 2026-07-16 — Tony mirror of approvePOFenteng's block above. */
	for each  poNoTouchedT in processedSupPOsT
	{
		supPOsSyncT = Tony_Fan_Purchase_Order[PO_No_Supplier2 == poNoTouchedT];
		for each  spoT2 in supPOsSyncT
		{
			targetSupPOT2 = spoT2;
		}
		aggPOsSyncT = Purchase_Order[PO_No == poNoTouchedT];
		for each  apoT2 in aggPOsSyncT
		{
			apoT = apoT2;
		}
		soNoTextT = apoT.SO_No.Sales_Order_Number;
		matchingShipNoT = "";
		candidateShipmentsT = Shipments[PO_No == apoT.ID && Shipment_Status == "Pending"];
		for each  shT in candidateShipmentsT
		{
			matchingShipNoT = shT.Shipment_No;
		}
		isNewShipmentT = false;
		if(matchingShipNoT != "")
		{
			targetShipsT = Shipments[Shipment_No == matchingShipNoT];
			for each  tshT in targetShipsT
			{
				targetShipT = tshT;
			}
		}
		else
		{
			maxShipNumT = 0;
			existingShipmentsT = Shipments[ID != 0];
			for each  shT in existingShipmentsT
			{
				shipNoStrT = shT.Shipment_No;
				if(shipNoStrT != null && shipNoStrT != "")
				{
					shipNumPartT = shipNoStrT.removeFirstOccurence("SHP-");
					shipNumT = shipNumPartT.toLong();
					if(shipNumT > maxShipNumT)
					{
						maxShipNumT = shipNumT;
					}
				}
			}
			newShipNumT = maxShipNumT + 1;
			if(newShipNumT < 10)
			{
				newShipNoT = "SHP-0000" + newShipNumT;
			}
			else if(newShipNumT < 100)
			{
				newShipNoT = "SHP-000" + newShipNumT;
			}
			else if(newShipNumT < 1000)
			{
				newShipNoT = "SHP-00" + newShipNumT;
			}
			else if(newShipNumT < 10000)
			{
				newShipNoT = "SHP-0" + newShipNumT;
			}
			else
			{
				newShipNoT = "SHP-" + newShipNumT;
			}
			newShipIDT = insert into Shipments
			[
				Shipment_No=newShipNoT
				PO_No=apoT.ID
				Sales_Order=soNoTextT
				Customer=apoT.Customer
				Supplier="Tony"
				Shipment_Status="Pending"
			];
			targetShipT = Shipments[ID == newShipIDT];
			isNewShipmentT = true;
		}
		for each  poLnAggT in apoT.PO_Line_Items
		{
			targetShipT.Required_Days_Lead=poLnAggT.Required_Days_Lead;
			targetShipT.Remaining_Days=poLnAggT.Remaining_Days;
			targetShipT.Target_Date=poLnAggT.Target_Delivery;
			targetShipT.Supplier_Target_Date=poLnAggT.supplier_target_date;
			targetShipT.Production_Date=poLnAggT.Production_Date;
			if(poLnAggT.PR_No != null && poLnAggT.PR_No != "")
			{
				prLineT = Purchase_Request1[PR_No == poLnAggT.PR_No];
				targetShipT.Shipment_Days=prLineT.Shipment_Days;
				targetShipT.Sales_Owner=prLineT.Sales_Owner;
			}
			else
			{
				targetShipT.Sales_Owner=apoT.Sales_Owner;
			}
			shipLineExistsT = false;
			for each  existingShipLnT in targetShipT.PO_Shipments
			{
				if(existingShipLnT.PR_No == poLnAggT.PR_No)
				{
					shipLineExistsT = true;
				}
			}
			if(shipLineExistsT == false)
			{
				newShipLineT = Shipments.PO_Shipments();
				newShipLineT.PR_No=poLnAggT.PR_No;
				newShipLineT.SKU=poLnAggT.SKU;
				newShipLineT.Item_Name=poLnAggT.Item;
				newShipLineT.Ordered_QTY=poLnAggT.QTY;
				newShipLineT.Shipment_QTY=poLnAggT.QTY;
				newShipLineT.Remaining_QTY=poLnAggT.QTY;
				newShipLineT.Shipping_Mode=poLnAggT.Shipping_Mode;
				targetShipT.PO_Shipments.insert(newShipLineT);
			}
		}
		/* ADDED 2026-07-21 — Tony mirror of the Fenteng block above, same reasoning. */
		if(isNewShipmentT == true)
		{
			newSuppRecIDT = insert into Tony_Shipment
			[
				Shipment_No=targetShipT.Shipment_No
				Parent_Shipment_ID=targetShipT.ID + ""
				Added_User1=zoho.loginuser
			];
			newSuppRecT = Tony_Shipment[ID == newSuppRecIDT];
			for each  shLnT in targetShipT.PO_Shipments
			{
				newSuppRowT = Tony_Shipment.Supplier2_Shipment_Details();
				newSuppRowT.SKU=shLnT.SKU;
				newSuppRowT.Item_Name=shLnT.Item_Name;
				newSuppRowT.PR_No=shLnT.PR_No;
				newSuppRowT.RR_No="";
				newSuppRecT.Supplier2_Shipment_Details.insert(newSuppRowT);
			}
		}
		recvFoundT = false;
		matchingRecvIDT = 0;
		existingRecvT = Receiving[Shipments == targetShipT.ID];
		for each  rcT in existingRecvT
		{
			matchingRecvIDT = rcT.ID;
			recvFoundT = true;
		}
		if(recvFoundT == true)
		{
			targetRecvsT = Receiving[ID == matchingRecvIDT];
			for each  trcT in targetRecvsT
			{
				targetRecvT = trcT;
			}
		}
		else
		{
			maxRecvNumT = 0;
			existingRecvsT = Receiving[ID != 0];
			for each  rcT in existingRecvsT
			{
				recvNoStrT = rcT.Receive_No1;
				if(recvNoStrT != null && recvNoStrT != "")
				{
					recvNumPartT = recvNoStrT.removeFirstOccurence("RCV-");
					recvNumT = recvNumPartT.toLong();
					if(recvNumT > maxRecvNumT)
					{
						maxRecvNumT = recvNumT;
					}
				}
			}
			newRecvNumT = maxRecvNumT + 1;
			if(newRecvNumT < 10)
			{
				newRecvNoT = "RCV-0000" + newRecvNumT;
			}
			else if(newRecvNumT < 100)
			{
				newRecvNoT = "RCV-000" + newRecvNumT;
			}
			else if(newRecvNumT < 1000)
			{
				newRecvNoT = "RCV-00" + newRecvNumT;
			}
			else if(newRecvNumT < 10000)
			{
				newRecvNoT = "RCV-0" + newRecvNumT;
			}
			else
			{
				newRecvNoT = "RCV-" + newRecvNumT;
			}
			newRecvIDT = insert into Receiving
			[
				Receive_No1=newRecvNoT
				Shipments=targetShipT.ID
				SO_No=soNoTextT
				PO_No=apoT.PO_No
				Customer_Name=apoT.Customer
				Supplier="Tony"
			];
			targetRecvT = Receiving[ID == newRecvIDT];
		}
		for each  poLnAggT in apoT.PO_Line_Items
		{
			if(poLnAggT.PR_No != null && poLnAggT.PR_No != "")
			{
				prLineRecvT = Purchase_Request1[PR_No == poLnAggT.PR_No];
				targetRecvT.Sales_Owner=prLineRecvT.Sales_Owner;
			}
			else
			{
				targetRecvT.Sales_Owner=apoT.Sales_Owner;
			}
			recvLineExistsT = false;
			for each  existingRecvLnT in targetRecvT.Receiving_Line_Items
			{
				if(existingRecvLnT.PR_No == poLnAggT.PR_No)
				{
					recvLineExistsT = true;
				}
			}
			if(recvLineExistsT == false)
			{
				newRecvLineT = Receiving.Receiving_Line_Items();
				newRecvLineT.PR_No=poLnAggT.PR_No;
				newRecvLineT.SKU=poLnAggT.SKU;
				newRecvLineT.Item_Name=poLnAggT.Item;
				newRecvLineT.Expected_Qty=poLnAggT.QTY;
				targetRecvT.Receiving_Line_Items.insert(newRecvLineT);
			}
		}
		/* ADDED 2026-07-16 — Tony mirror of the Fenteng block above. */
		totalExpectedT = 0;
		totalAcceptedT = 0;
		totalDamageT = 0;
		totalMissingT = 0;
		totalLinesRT = 0;
		incompleteLinesT = 0;
		readyForFulfillT = 0;
		for each  rln2 in targetRecvT.Receiving_Line_Items
		{
			totalLinesRT = totalLinesRT + 1;
			expRT = ifnull(rln2.Expected_Qty,0);
			accRT = ifnull(rln2.Accepted_Qty,0);
			dmgRT = ifnull(rln2.Damage_Qty,0);
			misRT = ifnull(rln2.Missing_Qty,0);
			totalExpectedT = totalExpectedT + expRT;
			totalAcceptedT = totalAcceptedT + accRT;
			totalDamageT = totalDamageT + dmgRT;
			totalMissingT = totalMissingT + misRT;
			totalRecRT = accRT + dmgRT + misRT;
			if(totalRecRT == expRT && accRT == expRT)
			{
				rln2.Line_Result="Complete";
				rln2.Ready_for_Fulfillment=true;
				readyForFulfillT = readyForFulfillT + 1;
			}
			else
			{
				rln2.Line_Result="Incomplete";
				rln2.Ready_for_Fulfillment=false;
				incompleteLinesT = incompleteLinesT + 1;
			}
		}
		targetRecvT.Total_Expected_Qty=totalExpectedT;
		targetRecvT.Total_Accepted_Qty=totalAcceptedT;
		targetRecvT.Total_Damage_Qty=totalDamageT;
		targetRecvT.Total_Missing_Qty=totalMissingT;
		targetRecvT.Total_Lines=totalLinesRT;
		targetRecvT.Incomplete_Lines=incompleteLinesT;
		targetRecvT.Ready_for_Fulfillment1=readyForFulfillT;
		if(totalLinesRT == 0 || (totalAcceptedT == 0 && totalDamageT == 0 && totalMissingT == 0))
		{
			targetRecvT.Receive_Status="Pending";
		}
		else if(incompleteLinesT == 0)
		{
			targetRecvT.Receive_Status="Received";
		}
		else
		{
			targetRecvT.Receive_Status="Partial Received";
		}
		shipModeBooksT = "Air Freight";
		for each  poLnBooksT in apoT.PO_Line_Items
		{
			shipLineValT = poLnBooksT.Shipping_Mode + "";
			if(shipLineValT == "LCL")
			{
				shipModeBooksT = "LCL";
			}
			else if(shipLineValT == "FCL")
			{
				shipModeBooksT = "FCL";
			}
			else if(shipLineValT != "" && shipLineValT != "null")
			{
				shipModeBooksT = "Air Freight";
			}
		}
		booksLineItemsT = List();
		prRefListT = List();
		for each  poLnBooksT2 in targetSupPOT2.PO_Line_Items_Supplier2
		{
			prRefListT.add(poLnBooksT2.PR_No_Supplier2);
			bookItemRecsT = Items[SKU == poLnBooksT2.SKU_Supplier2];
			bookItemIdT = "";
			for each  biT in bookItemRecsT
			{
				bookItemIdT = biT.ID1 + "";
			}
			if(bookItemIdT == "null")
			{
				bookItemIdT = "";
			}
			if(bookItemIdT != "")
			{
				effectiveRateT = poLnBooksT2.Final_Price_Supplier2.toDecimal();
				itemPriceStrT = poLnBooksT2.Item_Price_Supplier2 + "";
				if(itemPriceStrT != "null" && itemPriceStrT != "" && itemPriceStrT != "0" && itemPriceStrT.toDecimal() != 0)
				{
					effectiveRateT = itemPriceStrT.toDecimal();
				}
				lineBT = Map();
				lineBT.put("item_id",bookItemIdT);
				lineBT.put("quantity",poLnBooksT2.QTY_Supplier2.toLong());
				lineBT.put("rate",effectiveRateT);
				lineBT.put("warehouse_id","2680178000042173149");
				booksLineItemsT.add(lineBT);
			}
		}
		prRefsStrT = "[";
		prRefCountT = 0;
		for each  prRefItemT in prRefListT
		{
			if(prRefCountT > 0)
			{
				prRefsStrT = prRefsStrT + ",";
			}
			prRefsStrT = prRefsStrT + "\"" + prRefItemT + "\"";
			prRefCountT = prRefCountT + 1;
		}
		prRefsStrT = prRefsStrT + "]";
		cfListBooksT = List();
		cfBT1 = Map();
		cfBT1.put("label","Mode of Shipment");
		cfBT1.put("value",shipModeBooksT);
		cfListBooksT.add(cfBT1);
		cfBT2 = Map();
		cfBT2.put("label","Type of Order");
		cfBT2.put("value","Pre Order");
		cfListBooksT.add(cfBT2);
		cfBT3 = Map();
		cfBT3.put("label","Created by");
		cfBT3.put("value","Procurement");
		cfListBooksT.add(cfBT3);
		cfBT4 = Map();
		cfBT4.put("label","Supplier");
		cfBT4.put("value","Tony Fan");
		cfListBooksT.add(cfBT4);
		cfBT5 = Map();
		cfBT5.put("label","PR References");
		cfBT5.put("value",prRefsStrT);
		cfListBooksT.add(cfBT5);
		existingBooksPOIDT = apoT.Books_PO_ID + "";
		if(existingBooksPOIDT == "null")
		{
			existingBooksPOIDT = "";
		}
		booksPOValidT = false;
		if(existingBooksPOIDT != "")
		{
			checkPORespT = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/purchaseorders/" + existingBooksPOIDT + "?organization_id=751117756"
				type :GET
				connection:"zhbooks3"
			];
			if(checkPORespT.get("code") == 0 && checkPORespT.get("purchaseorder") != null)
			{
				booksPOValidT = true;
			}
		}
		if(booksPOValidT == true)
		{
			updatePOBodyT = Map();
			updatePOBodyT.put("line_items",booksLineItemsT);
			updatePOBodyT.put("custom_fields",cfListBooksT);
			updatePOBodyStrT = updatePOBodyT.toString();
			updatePORespT = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/purchaseorders/" + existingBooksPOIDT + "?organization_id=751117756"
				type :PUT
				parameters:updatePOBodyStrT
				headers:{"Content-Type":"application/json"}
				connection:"zhbooks3"
			];
			info "Books PO update resp (Tony)=" + updatePORespT.toString();
		}
		else
		{
			createPOBodyT = Map();
			createPOBodyT.put("vendor_id","2680178000002735078");
			createPOBodyT.put("line_items",booksLineItemsT);
			createPOBodyT.put("custom_fields",cfListBooksT);
			createPOBodyT.put("date",zoho.currentdate.toString("yyyy-MM-dd"));
			createPOBodyStrT = createPOBodyT.toString();
			createPORespT = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/purchaseorders?organization_id=751117756"
				type :POST
				parameters:createPOBodyStrT
				headers:{"Content-Type":"application/json"}
				connection:"zhbooks3"
			];
			info "Books PO create resp (Tony)=" + createPORespT.toString();
			if(createPORespT.get("code") == 0 && createPORespT.get("purchaseorder") != null)
			{
				newBooksPOIDT = createPORespT.get("purchaseorder").get("purchaseorder_id") + "";
				apoT.Books_PO_ID = newBooksPOIDT;
				apoT.Books_PO_No = createPORespT.get("purchaseorder").get("purchaseorder_number") + "";
				approvePORespT = invokeurl
				[
					url :"https://www.zohoapis.com/books/v3/purchaseorders/" + newBooksPOIDT + "/approve?organization_id=751117756"
					type :POST
					connection:"zhbooks3"
				];
				info "Books PO approve resp (Tony)=" + approvePORespT.toString();
				openPORespT = invokeurl
				[
					url :"https://www.zohoapis.com/books/v3/purchaseorders/" + newBooksPOIDT + "/status/open?organization_id=751117756"
					type :POST
					connection:"zhbooks3"
				];
				info "Books PO status/open resp (Tony)=" + openPORespT.toString();
			}
		}
	}
	response.put("status","success");
	response.put("processed",processedCount);
	response.put("message",processedCount + " Tony line(s) synced");
	return response;
}

====================================================
STEP 2 — CREATE 3 CUSTOM APIs
  Creator: Microservices -> Custom API -> + Create Custom API
  Same convention as create_estimate (create_estimate_custom_api.txt):
====================================================
For EACH of the 3 functions above, create one Custom API:

  1. Name: ApprovePOMain     (link name e.g. approve_po_main)     -> Function: approvePOMain
  2. Name: ApprovePOFenteng  (link name e.g. approve_po_fenteng)  -> Function: approvePOFenteng
  3. Name: ApprovePOTony     (link name e.g. approve_po_tony)     -> Function: approvePOTony

Request (all 3, identical shape):
  HTTP Method: POST
  Content-Type: application/json, "Key and Value"
  Authentication: PublicKey
  Parameter: soNo (String) — matches each function's String soNo argument
Response:
  Pass the function's returned Map through as the response body (same as create_estimate).

After saving each one, copy its PUBLIC KEY and paste into PRs/app/PR.html, replacing the
3 placeholder constants:
  CUSTOM_API_KEY_PO_MAIN, CUSTOM_API_KEY_PO_FENTENG, CUSTOM_API_KEY_PO_TONY
(near "APPROVE PR(s) → PO" in the widget's <script>, search for "REPLACE_WITH_").

====================================================
STEP 3 — WIDGET (PRs/app/PR.html) — DONE 2026-07-07, untested
====================================================
- Two `.btn-create-po` buttons wired: the PO-Grouping card grid
  (createPOFromCard(i), reuses the card's existing sameSupplier/allReady/noneConverted
  validation, unchanged) and the detail-view header button (createPOFromDetail(), same
  flow scoped to the currently open PR's own Sales_Order).
- Both funnel into showConfirm(msg, onYes) — a small reusable modal (new CSS/HTML,
  no dependency added) — then runApprovePOBatch(soNo, btnEl) on confirm.
- runApprovePOBatch calls all 3 Custom APIs in sequence (Main, then Fenteng, then Tony)
  via ZOHO.CREATOR.DATA.invokeCustomApi({api_name, http_method, content_type, payload,
  public_key}) — same call shape as Inq.html's proven create_estimate call. Fenteng/Tony
  are called unconditionally every time regardless of which supplier(s) are actually in
  that SO — safe because both are self-contained (query their own supplier's eligible
  PRs) and no-op harmlessly (processedCount:0) when there's nothing of that supplier to
  sync.
- On success, refetches PO_Grouping data (loadGroupingData + buildGroupBuckets +
  renderGroupCards) after a short delay so the card reflects the new PR_Approved/
  Link_PO_No state without a full page reload.
- UNCONFIRMED: exact shape of invokeCustomApi's resolved response for these 3 (whether
  the Map lands at resp.data or directly on resp) — same defensive
  `(resp && resp.data) ? resp.data : resp` fallback as the estimate flow, simplify once
  the real shape is confirmed on first live test.

====================================================
NOTES:
- FIXED 2026-07-10, resynced from `pr_to_po_grouping.txt` Action 1's same-day fix: no
  idempotency guard before inserting a `PO_Line_Items` row (matches an existing PO by
  supplier only, never checked for an existing line with the same `PR_No` first) —
  could duplicate-insert a line if a PR got re-approved against an existing PO. Added
  the same guard: loops `targetPO.PO_Line_Items` for an existing `PR_No` match right
  after `targetPO` is resolved; if found, stamps PR_Status/Link_PO_No/PR_Approved/
  approvedList and `continue`s past the line build/insert. UNTESTED.
- ADDED 2026-07-10, per user request, resynced from `pr_to_po_grouping.txt` Action 1's
  same-day change (2 design iterations, see that file's own NOTES for full history):
  FINAL version is `PO_Line_Items` subform column `Production_Date`,
  `newLine.Production_Date=zoho.currentdate`. An intermediate header-field version
  (`targetPO.Production_Date`) was tried and mirrored here too, then abandoned — user
  moved the field into the subform instead after a real edge case was flagged (header
  field would silently overwrite when a sibling PR merges into the same PO later).
  `approvePOFenteng`/`approvePOTony` NOT touched — native Actions 2/3 weren't given
  this field either. UNTESTED.
- FIXED 2026-07-09 (found via PR.html widget audit): `approvePOMain` had drifted from
  `pr_to_po_grouping.txt`'s native Action 1 after that file's 2026-07-08 change —
  still preferred `SRP_Rate_PR` over `Selcted_Final_Cost` for Final_Price (removed
  natively), and never set `SRP_Rate_PO`/header `SRP_Rate` (added natively). Approving
  via the widget was producing a DIFFERENT Final_Price than approving the same PR
  natively, and missing two fields. Re-synced `approvePOMain` to match Action 1 exactly.
  `approvePOFenteng`/`approvePOTony` were NOT touched — confirmed `pr_to_po_grouping.txt`
  Actions 2/3 themselves were never updated 2026-07-08 either (still SRP_Rate_PR-
  preferring, no SRP_Rate_PO), so both stayed correctly in sync. Re-paste `approvePOMain`
  into Creator's Custom Function editor after this fix — the other two are unaffected.
  Lesson: this file is a manually-maintained MIRROR of pr_to_po_grouping.txt's Actions —
  any future edit to Action 1/2/3 there needs a matching edit here, not automatic.
- RESTORED 2026-07-14, mirroring `pr_to_po_grouping.txt`'s own same-day change: the
  SRP_Rate_PR preference this exact resync note removed on 2026-07-09 is now back —
  found live via PR-00002/Acantha that dropping it from Action 1 (while Actions 2/3 kept
  it) meant the aggregate PO got `Final_Price=0` for any PR whose supplier hasn't quoted
  yet, while the supplier-specific POs correctly showed a reference price. Re-added
  the fallback right after `rateToUse = prLoop.Selcted_Final_Cost;` — CORRECTED per
  user's follow-up walking through PR-00001's case: only applies when
  `Selcted_Final_Cost` is genuinely 0/blank
  (`if((rateToUse == null || rateToUse == 0) && prLoop.SRP_Rate_PR != null &&
  prLoop.SRP_Rate_PR != 0){ rateToUse = prLoop.SRP_Rate_PR; }`), NOT Actions 2/3's own
  unconditional version — that would have silently overridden an already-real confirmed
  price (like PR-00001's Selcted_Final_Cost=150) with an unrelated SO sell-rate whenever
  SRP_Rate_PR also happened to be nonzero. `approvePOFenteng`/`approvePOTony` RESOLVED
  too, same day, initially: suppliers shouldn't see `SRP_Rate_PR` at all — removed the
  fallback from both entirely. RE-REVERSED same day after a live test on PR-00002 showed
  the real consequence: Tony's own supplier PO record is the SAME one
  `acknowledge_po_custom_api.txt`/`purchase_order_scripts.txt` reads to build the actual
  Books PO — a $0 Final_Price on that line meant the real Books PO total would understate
  the true value (₱150 instead of ₱9,520). User chose "real price, hide SRP label" —
  restored the SAME corrected (zero-only) fallback condition into `approvePOFenteng`/
  `approvePOTony` too, matching Action 1/2/3 native exactly:
  `if((rateToUseF==null||rateToUseF==0) && prLoopF.SRP_Rate_PR!=null && prLoopF.SRP_Rate_PR
  !=0){ rateToUseF=prLoopF.SRP_Rate_PR; }` (T/Tony equivalent). "Hide the label" is UI-only
  — neither Fenteng-PO nor Tony-PO widget has ever shown an "(SRP)" tag on Final Price
  (unlike the PRs widget's own display-only fallback, which does tag it), so no widget
  change needed — value just reads as a normal Final Price.
  CONFIRMED WORKING 2026-07-14 — user re-approved PR-00002, Tony's own supplier PO
  (PO-00001) line now shows ₱4,685/₱9,370, Total PO Value ₱9,520, matching the aggregate
  exactly, no visible source label. Still needs: a live Acknowledge on this PO to confirm
  the resulting real Books PO totals ₱9,520 too (not yet clicked, PO still "Awaiting
  Acknowledge" as of this test).
- This does NOT touch or replace `PR_Approved` in pr_to_po_grouping.txt — that Report
  Action Item still exists and still works from inside native Creator (someone opening
  the PO Grouping report directly in Zoho Creator, not through this widget, can still
  click it). This file adds a SEPARATE, parallel path for the custom widget only. Keep
  both in sync if the batch-approve logic changes again — they're currently identical
  copies (Action 1 = approvePOMain, Action 2 = approvePOFenteng, Action 3 =
  approvePOTony), just wrapped differently (Report Action Item vs Custom Function).
- Same BIGINT-on-fetched-record avoidance as pr_to_po_grouping.txt's own 2026-07-07
  rewrite: `prLoop.Items` / `prLoop.Customer` used as direct lookup dot-chains
  (`itemRec = prLoop.Items; itemName = itemRec.item_name;`), NOT re-queried via
  `Items[ID == prLoop.Items]` — the fetched-record BIGINT gotcha documented in the main
  CLAUDE.md Deluge Gotchas section would apply to the latter, not the former.
- UNTESTED whether Custom Functions (App Builder context) enforce the same
  "Fenteng+Tony subform constructors must be separate" restriction as Report Action
  Item Actions — this file sidesteps the question entirely by keeping them in 3
  separate functions/APIs regardless, per the user's explicit choice (see project
  memory) rather than gambling on 1 combined function.
- soNo is passed explicitly from the widget (bucket.soNo / _currentMappedPR.soNo) rather
  than re-deriving it from a PR ID server-side — simpler, and the widget already has
  this value on hand from the PO_Grouping/All_Purchase_Request report data it already
  loaded, no extra round-trip needed.
- CONFIRMED WORKING END-TO-END 2026-07-07 (real click through the widget, PR-00021 +
  PR-00022, SO-16100, both Selected_Supplier="Tony" -> PO-00004): aggregate
  Purchase_Order got both lines correctly (Supplier/PR_No/Item/SKU/QTY/Final_Price all
  right). Confirms approvePOMain + the Custom API wiring + the widget's confirm-modal
  and invokeCustomApi call shape all work as designed.
- BUG (setup gotcha, not a code bug) found same test: Tony_Fan_Purchase_Order never got
  created for PO-00004 even though approvePOMain succeeded and PR_Approved flipped true
  on both PRs. Direct API call to `approve_po_tony` returned
  `{"code":9360,"message":"Custom API is in draft or disabled state. Please enable the
  API and try again."}` — the Custom API had been created (Step 2) but never explicitly
  enabled/published in Creator, unlike approve_po_main/approve_po_fenteng which were
  already active. FIX: enable/publish the Custom API in Creator (Microservices -> Custom
  API -> ApprovePOTony -> Enable). This is a one-time per-API setup step, not a
  recurring gotcha — but worth checking FIRST (before touching any Deluge code) if a
  newly-created Custom API silently does nothing: probe it directly with a harmless
  payload and check for code 9360 specifically, rather than assuming the function body
  itself is broken.
- DEBUGGING TECHNIQUE that found the above: called the Custom API directly via a
  throwaway Node script (same `SyncItemsCust/.env`-credentials pattern used throughout
  this project for Books API debugging) instead of guessing from the widget's UI alone —
  a direct POST to `https://www.zohoapis.com/creator/custom/homecartel/approve_po_tony
  ?publickey=...` with `{"soNo":"SO-16100"}` immediately surfaced the real Creator-side
  error the widget's console logs would have shown too, just faster to isolate. Same
  approach (probe with a harmless/nonexistent soNo) used to confirm the OTHER 2 APIs
  were healthy (`{"status":"empty",...}` / `{"status":"success","processed":0,...}`)
  before concluding the third one specifically was the outlier.
- SEPARATE non-bug data-quality issue hit while testing: PR-00021/PR-00022 initially
  showed as "already converted" in the widget (blocked by the pre-existing
  `noneConverted` card check) because `Link_PO_No` was already set to "PO-00004" from an
  earlier test cycle even though `PR_Approved` itself was false — stale test data (one
  field got manually reset without the other). Not a code bug; user manually cleared
  `Link_PO_No` on both records in Creator to get a clean retest. Flagged as a REAL latent
  gap while investigating: neither approvePOMain nor the native pr_to_po_grouping.txt
  Action 1 checks `Link_PO_No` before inserting a line — only `PR_Approved`. If a record
  ever ends up in that same inconsistent state again (Link_PO_No set, PR_Approved false),
  approving it again would insert a DUPLICATE line into that PO. Not fixed yet — worth a
  `if(prLoop.Link_PO_No != null && prLoop.Link_PO_No != "") { continue; }` guard in both
  places if this recurs.
- ADDED 2026-07-15, mirrored from `pr_to_po_grouping.txt` (same edit, same day, see that
  file's NOTES for the full 4-case writeup) — `rateToUse`/`rateToUseF`/`rateToUseT` in
  `approvePOMain`/`approvePOFenteng`/`approvePOTony` all gained a 3rd-tier fallback to the
  item's own catalog `Rate` (`itemRec.Rate`/`itemRecF.Rate`/`itemRecT.Rate`) after
  Selcted_Final_Cost/SRP_Rate_PR both come up 0 — a not-from-inquiry item with a real
  catalog rate (e.g. Acantha) now auto-sends that rate to Books even with no supplier
  quote yet. Read-only, never writes into Selcted_Final_Cost. BUG fixed same day (mirrored
  from `pr_to_po_grouping.txt` — see that file's NOTES) — original `itemRec.Rate != 0`
  compare errored live (TEXT vs NUMBER `!=`), fixed with the established
  `itemRateStr = itemRec.Rate + ""` safe-cast pattern. UNTESTED.
====================================================

````
