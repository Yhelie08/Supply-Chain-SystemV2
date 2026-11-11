---
title: "pr_to_po_grouping"
source_file: "pr_to_po_grouping.txt"
category: "Procurement/Purchase Order/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 2049
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - readiness-gate
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# pr_to_po_grouping

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Procurement/Purchase Order/Deluge`
> - **Source File:** `pr_to_po_grouping.txt`
> - **Lines of Code:** 2,049
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#readiness-gate`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Purchase_Request1 -> Purchase_Order (+ supplier PO): "Approve PR" action button ==
== Lives on a report called "PO Grouping" (filtered/grouped view of Purchase_Request1) ==
== Converts an approved PR into a PO line item — reuses an existing open PO for the same
   SO+supplier if one exists, otherwise creates a new PO with an auto-generated PO_No ==
== CHANGED 2026-07-03, then REVERSED 2026-07-16: this script briefly stopped at
   Purchase_Order + the supplier PO forms only, with Shipments/Receiving/Books PO sync
   moved OUT to Acknowledged_PO_Supplier1/2 (purchase_order_scripts.txt) so they'd only
   fire once the supplier acknowledged. Per user request 2026-07-16 ("move the function
   of acknowledge - going to zoho books, going to shipment and receiving - to
   PR_Approved. acknowledge only function now: is to populate ETD and ETA in shipment
   after acknowledge"), Actions 2/3 now build Shipments + Receiving + the real Books
   Purchase Order themselves, once per distinct supplier PO touched by the click
   (tracked via `processedSupPOsF/T`) — same "once per PO, loop its current
   PO_Line_Items" granularity Acknowledge always used, just triggered earlier now.
   Acknowledge (purchase_order_scripts.txt) keeps ONLY PO_Status/Acknowledge_On
   bookkeeping + now writes mandatory ETD/ETA onto the Shipment this creates — see that
   file's NOTES. Replacement POs (Damage/QC/Complaint RR flow) never reach PR_Approved
   at all (created directly, bypass PR1/Link_PO_No) — Acknowledge keeps a slim
   Shipment+Receiving-only copy gated to `RR_Reference_No` for those, Books still
   skipped for them same as before.
== CHANGED 2026-07-07: "Approve PR to PO" now batch-approves ALL not-yet-approved,
   ready siblings sharing the SAME Sales_Order as the clicked PR (e.g. clicking
   PR-00020's button on SO-16100 also approves PR-00019 if it's PR_Approved==false AND
   PR_READY_FOR_PO==true too) — previously only converted the single clicked PR. See
   NOTES for the full design (why Actions 2/3 can't just re-check PR_Approved==false,
   and the idempotent already-has-this-line? guard that replaces it).

====================================================
PREREQUISITE — add these fields to the Creator "Purchase_Order" form BEFORE pasting
Action 1, or the `targetPO.Books_PO_ID=...`/`targetPO.Books_PO_No=...` lines will error
with "field does not exist":
  Books_PO_ID   (Single Line) — stores the Books purchaseorder_id
  Books_PO_No   (Single Line) — stores the Books purchaseorder_number (e.g. "PO-04532")
Same pattern as Books_Estimate_ID/Books_Estimate_No on the Projects form.

ALSO (added 2026-07-06) — add this column to the PO_Line_Items SUBFORM (not a header
field — Purchase_Order is per-line, unlike Purchase_Request1 which is one-item-per-record):
  Item_Image   (Image, single — same type as Product_Image_Supplier1/2_PR)
====================================================

====================================================
WORKFLOW SETUP
  Form: Purchase Request (Purchase_Request1)
  Location: In "PR to PO Grouping" report
  Trigger: On click of action item
  Action name: PR_Approved
  Report Action Item CONDITION (confirmed live 2026-07-06):
    PR_READY_FOR_PO == true && PR_Approved == false
    (gates the button so it's only enabled once all 4 readiness conditions in
    pr_check_readiness.txt pass — Selected Supplier, Final price confirmed, Shipping
    mode selected, Target date exists — AND disables it again once already approved,
    same "hide once done" pattern as Submit Response/Acknowledge PO elsewhere in this
    app. User initially asked to gate on "PR Approved is checked" — clarified via
    question that they meant PR_READY_FOR_PO, since gating solely on PR_Approved would
    be circular (that field is only ever set true by this action's own script). The
    `&& PR_Approved == false` half was confirmed already present/added straight in
    Creator's Action Item condition builder (screenshot-confirmed), not something typed
    into this script file.)
====================================================

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
				if(ln.Supplier == selectedSupplierName)
				{
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
	prLoop.PR_Status = "Converted to PO";
	prLoop.Link_PO_No = targetPO.PO_No;
	prLoop.Production_Date = zoho.currentdate;
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
			Active_PO_Count = activePOCount
		];
	}
	prLoop.Last_Update = zoho.currenttime;
	prLoop.PR_Approved = true;
	approvedList = approvedList + prLoop.PR_No + " -> " + targetPO.PO_No + "; ";
}
if(approvedList == "" && skippedList == "")
{
	info "No eligible PRs found for SO " + input.Sales_Order + ".";
}
else if(skippedList != "")
{
	info "Approved: " + approvedList + " | Skipped (needs Override Reason): " + skippedList;
}
else
{
	success message "Approved: " + approvedList;
}

====================================================
ACTION 2 — Fenteng_Lighting_Purchase_Order (SEPARATE action, same PR_Approved workflow)
  Required: separate action, NOT combined with Action 1 or Action 3 — this codebase's
  established rule for duplicated-form Form.Subform() calls breaking when combined.
====================================================

== FIXED 2026-08-05, real bug found live in Production (via the widget's own
   approvePOFenteng/approvePOTony mirror, same query shape here) — Selected_Supplier
   can hold "Fenteng Lighting"/"Tony Fan" (full name) instead of "Fenteng"/"Tony"
   (short), same class of mismatch already fixed today in
   stage_inquiry_changed_actions.txt. Exact-match criteria found 0 records, PR
   approval appeared to succeed but no supplier PO / no Books push ever happened,
   with zero error anywhere. FIX: criteria no longer filters on Selected_Supplier
   at all; the actual match now happens per-record inside the loop via a plain
   `if`/`.contains()` check (not inside the Form[...] criteria bracket — unproven
   there, unlike a plain in-script `if`). ==
processedSupPOsF = List();
siblingPRsF = Purchase_Request1[Sales_Order == input.Sales_Order && PR_Approved == true && Link_PO_No != null];
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
	/* REMOVED 2026-07-15, per user: SRP_Rate_PR fallback dropped from Final_Price_Supplier1
	   entirely — this field must ONLY ever show Fenteng's own real quote (Selcted_Final_Cost),
	   never a reference number, even when that number happens to be 0/blank. Safe now that
	   Books-sync no longer reads Final_Price_Supplier1 as its primary source — it prefers
	   Item_Price_Supplier1 (below) first, so this field carrying no fallback doesn't risk
	   understating what Books gets charged the way it would have before that change. */
	rateToUseF = prLoopF.Selcted_Final_Cost;
	if(rateToUseF == null)
	{
		rateToUseF = 0;
	}
	/* Item_Price_Supplier1 (Single Line/TEXT field) — catalog reference rate, kept
	   SEPARATE from Final_Price_Supplier1 so the supplier-facing "Final Price" always
	   shows their own real quote (or blank/0 pending one), never a catalog value
	   masquerading as their price. Books-sync (Acknowledged_PO_Supplier1, see
	   purchase_order_scripts.txt) prefers this field over Final_Price_Supplier1 when
	   it's set. Written as TEXT on purpose — sidesteps the Currency-type-mismatch class
	   of bug entirely (see Deluge Gotchas), same reasoning as why this field was made
	   Single Line rather than Number/Currency.
	   ADDED 2026-07-15, per user ("we will use whatever is final saved SRP Approved PR
	   going to PO and then going to books") — SRP_Approved_PR (new manually-editable
	   header field, see UI/EndUser/PRs/app/index.html's srpApprovedInfo()) now takes
	   PRIORITY over the catalog Rate here when a human has actually saved a real value
	   (>0) — the widget's own auto-default (catalog rate shown until approved) is a
	   CLIENT-side-only default, never reflected in the stored field itself, so reading
	   SRP_Approved_PR straight is safe: 0/blank there genuinely means "never approved,"
	   correctly falling through to the same catalog-Rate fallback as before. */
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

/* MOVED HERE 2026-07-16, per user ("move the function of acknowledge - going to zoho
   books, going to shipment and receiving - to PR_Approved. acknowledge only function
   now: is to populate ETD and ETA in shipment after acknowledge") — Shipment+Receiving
   creation and the Books Purchase Order sync now fire at PR-approval time instead of
   waiting for supplier acknowledgment. Logic is IDENTICAL to what used to live in
   Acknowledged_PO_Supplier1 (purchase_order_scripts.txt) — see that file's NOTES
   history for the full original debugging trail (Books PO create/approve/open, the
   SHP-/RCV- manual numbering, the Configure-Fields/BIGINT gotchas already solved there)
   — only WHEN it fires changed, not the logic itself. Runs once per DISTINCT supplier
   PO touched this click (not once per PR-line), tracked via processedSupPOsF above, so
   a multi-PR batch approval (same SO, several sibling PRs) still only builds each
   Shipment/Receiving/Books PO once — same "once per PO" granularity Acknowledge always
   used. Acknowledge (purchase_order_scripts.txt) keeps PO_Status/Acknowledge_On
   bookkeeping and now ALSO writes mandatory ETD/ETA onto the Shipment this block
   creates — see that file's NOTES. Replacement POs (Damage/QC/Complaint RR flow,
   approve_rr_supplier.txt) never reach this action at all (they're created directly,
   bypassing PR1/Link_PO_No entirely) — the RR_Reference_No Books-skip guard that used
   to wrap this block in Acknowledge is therefore dropped here, not needed. Mirror this
   into pr_approve_po_custom_api.txt's approvePOFenteng if it changes again. UNTESTED. */
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
	/* ADDED 2026-07-21, per user ("drop Shipment_Populate_Receiving, put supplier's
	   shipment populating directly on Create PO — both native and widget") — the
	   Shipments-Created-trigger-based auto-create workflow proved unreliable (Creator's
	   own editor kept corrupting the pasted action, root cause never resolved). Folded
	   directly into this script instead, using targetShipF (already resolved above,
	   whether newly created or an existing Shipment matched this run) and its own
	   just-populated PO_Shipments — no dependency on any Shipments-form trigger firing
	   at all. Only runs when this PO's Shipment was genuinely NEW this click
	   (isNewShipmentF) — an already-existing Shipment being re-touched (e.g. a 2nd PR
	   line added to the same PO in the same batch) must not create a duplicate
	   Fenteng_Shipment record. RR_No always blank here — replacement POs (Damage/QC/
	   Complaint RR flow) never reach this action at all (created directly, bypassing
	   PR1/Link_PO_No), so there is no replacement-PO case to resolve RR_No for. */
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
	/* ADDED 2026-07-16, per user ("check my sample rcv after i approve pr. it is
	   completed on status. but not really completed") — Receiving's own Validations
	   workflows (Receiving_Compute_Totals/Receiving_Set_Line_Result/
	   Receiving_Set_Receive_Status, see those files) never fire for a record built via
	   this cross-form `insert into Receiving` (established gotcha in this codebase —
	   Deluge cross-form inserts don't trigger the target form's own workflows), so every
	   rollup field stayed blank/0 and the widget's status bucketing misread "0
	   incomplete of 0 total" as complete. Mirrors those 3 native scripts' exact
	   formulas here so a freshly (or re-synced) Receiving record is correct immediately
	   — recomputed from the CURRENT full line set every run, same as the Shipment/Books
	   sync above, so this also self-heals if more lines get merged in later. */
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

====================================================
ACTION 3 — Tony_Fan_Purchase_Order (SEPARATE action, same PR_Approved workflow)
====================================================

== FIXED 2026-08-05, same real bug as Action 2 above (see that block's own NOTES)
   — Selected_Supplier can hold "Tony Fan" (full) instead of "Tony" (short);
   criteria broadened, supplier match moved into the loop. ==
processedSupPOsT = List();
siblingPRsT = Purchase_Request1[Sales_Order == input.Sales_Order && PR_Approved == true && Link_PO_No != null];
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
	/* REMOVED 2026-07-15, per user: SRP_Rate_PR fallback dropped from Final_Price_Supplier2
	   entirely — same reasoning as Action 2 (Fenteng) above, see that block's comment. */
	rateToUseT = prLoopT.Selcted_Final_Cost;
	if(rateToUseT == null)
	{
		rateToUseT = 0;
	}
	/* Item_Price_Supplier2 (Single Line/TEXT field, added by user 2026-07-15) — catalog
	   reference rate, kept SEPARATE from Final_Price_Supplier2 so Tony's own "Final
	   Price" always shows his real quote, never a catalog value standing in for it.
	   Books-sync (Acknowledged_PO_Supplier2, purchase_order_scripts.txt) prefers this
	   field over Final_Price_Supplier2 when set. TEXT on purpose — same
	   Currency-type-mismatch avoidance as everywhere else this session.
	   ADDED 2026-07-15, per user — SRP_Approved_PR takes priority over catalog Rate here
	   when a human has actually approved a value. See Action 2 (Fenteng)'s matching
	   comment for the full reasoning. */
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

/* MOVED HERE 2026-07-16 — Tony mirror of Action 2's block above. Same reasoning, same
   RR_Reference_No-guard-dropped rationale (see Action 2's comment). Mirror this into
   pr_approve_po_custom_api.txt's approvePOTony if it changes again. UNTESTED. */
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
	/* ADDED 2026-07-21 — Tony mirror of Action 2's same-day block above. Same
	   reasoning (Shipments-Created-trigger workflow dropped, folded in here instead),
	   same isNewShipmentT guard, same RR_No-always-blank rationale. */
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
	/* ADDED 2026-07-16 — Tony mirror of Action 2's Receiving totals/status block above,
	   same reasoning (Receiving's own Validations workflows never fire on a cross-form
	   insert). */
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

====================================================
NOTES:
- BUG found live 2026-07-10 (user retested the same PR after resetting PR_Approved to
  false, not caused by the Production_Date change): Action 1 had NO idempotency guard
  before inserting a `PO_Line_Items` row — it matches an existing PO by SUPPLIER only
  (`matchingPONo` loop), never checks whether that PO already has a line for this exact
  `PR_No`. Actions 2/3 already had this exact "idempotent does this PR already have a
  line?" check (see their own NOTES) — Action 1 was the one missing it. Result: a PR
  re-approved against an existing PO created a duplicate identical line instead of
  being skipped. FIXED: added the same guard right after `targetPO` is resolved (both
  new-PO and matched-existing-PO branches) — loops `targetPO.PO_Line_Items` for an
  existing `PR_No` match; if found, stamps the same PR_Status/Link_PO_No/PR_Approved/
  approvedList side effects a normal approval would (so the PR still gets marked
  approved and linked) but `continue`s past the line-build/insert entirely. Mirrored
  into `pr_approve_po_custom_api.txt`'s `approvePOMain` same session. UNTESTED.
- ADDED 2026-07-10, per user request (Action 1 / aggregate Purchase_Order only, NOT
  yet applied to Actions 2/3's supplier-specific PO forms — flag if those need it too):
  new `PO_Line_Items` column `Production_Date`, set to `newLine.Production_Date=
  zoho.currentdate` at the same point every other per-line field is populated. Went
  through 2 design iterations same day: (1) first attempt put it on `newLine` and
  errored live ("does not exist in 'newLine'...") since the field only existed as a
  HEADER field on Purchase_Order at that point; (2) moved to
  `targetPO.Production_Date` (header) to match — but flagged a real edge case to the
  user: a header field gets silently OVERWRITTEN if a sibling PR is approved LATER and
  merges into the same existing PO (the script does support this, matching by
  supplier via `matchingPONo`), losing the original lines' production date, whereas
  the other per-line timeline fields (Target_Delivery/Delay_Status/etc.) don't have
  that problem. User agreed and moved the field into the `PO_Line_Items` subform
  instead, header field removed from the Purchase_Order form entirely — back to
  `newLine.Production_Date`, this is now the FINAL version. Not read from
  `prLoop.Production_Date` even though PR1 has its own same-named HEADER field
  (unrelated field, unrelated form) — `zoho.currentdate` used directly instead.
  `pr_approve_po_custom_api.txt`'s `approvePOMain` mirror updated to match, same
  history. UNTESTED after this final fix.
- CHANGED 2026-07-08, per user request (Action 1 / aggregate Purchase_Order only —
  Action 2/3 NOT touched, see below): `Final_Price` is now ALWAYS
  `prLoop.Selcted_Final_Cost` (the approved selected final price of the supplier) —
  removed the 2026-07-06 preference for `SRP_Rate_PR` (the SO-approved rate) that used
  to override it when present. New separate column `SRP_Rate_PO` (user added to the
  `PO_Line_Items` subform) is populated from `itemRec.Rate` — the ITEM's current
  catalog rate in Books — but ONLY when that rate is non-zero; left blank otherwise
  (many custom/made-to-order items have `Items.Rate==0` in Books, confirmed via the
  test item synced same session, "CUSTOMIZED (TABLE LAMP)", `ID1
  2680178000024629990`). Per user: "Final Price (this should be the provided final
  price of the supplier)" — SRP_Rate_PO is a reference/comparison column, not a
  substitute for Final_Price in any case, including when the catalog rate is 0 (then
  Final_Price is the ONLY price shown, sourced purely from what the supplier quoted).
  `Total_PO_Value` needed NO code change — the existing `totalVal` loop right after
  already sums `Line_Total` (built from `Final_Price`) across all `PO_Line_Items` rows
  on every run, satisfying "total of Final_Price across lines" as-is.
  NOT applied to Action 2/3 (Fenteng/Tony supplier PO forms) — those still use the old
  `rateToUseF/T` SRP_Rate_PR-preference logic, unchanged. User only mentioned adding
  `SRP_Rate_PO` to the aggregate `PO_Line_Items` subform specifically; flag if the
  supplier-form line items need the same treatment (their own SRP_Rate_PO-equivalent
  column doesn't exist yet as of this writing).
  RESTORED 2026-07-14 (Action 1 only): found live via PR-00002/Acantha — with the
  SRP_Rate_PR preference removed here but still present in Actions 2/3, approving a PR
  whose supplier hasn't quoted yet (`Selcted_Final_Cost==0`) produced an inconsistent
  result: the supplier-specific POs (2/3) correctly fell back to `SRP_Rate_PR`, but the
  AGGREGATE PO (this Action) would get `Final_Price=0` — no fallback at all. Re-added
  `SRP_Rate_PR` as a fallback right after `rateToUse = prLoop.Selcted_Final_Cost;` —
  but CORRECTED from Actions 2/3's own existing logic, per user's explicit call after
  walking through PR-00001's case: only apply the fallback when `Selcted_Final_Cost`
  is genuinely 0/blank (`if((rateToUse == null || rateToUse == 0) && prLoop.SRP_Rate_PR
  != null && prLoop.SRP_Rate_PR != 0){ rateToUse = prLoop.SRP_Rate_PR; }`) — NOT Actions
  2/3's unconditional "SRP_Rate_PR always wins when nonzero" behavior, which would have
  silently overridden PR-00001's real, already-confirmed Selcted_Final_Cost=150 (Tony's
  actual quote) with an unrelated SO sell-rate number whenever that also happened to be
  nonzero. Original rationale for removing this from Action 1 on 2026-07-08 ("Final Price
  should be the provided final price of the supplier") is respected exactly now — the
  fallback only ever fills a genuine gap, never overrides a real confirmed price.
  RESOLVED (Actions 2/3), same day, then RE-REVERSED same day after a real live test
  exposed the actual consequence: removed the `SRP_Rate_PR` fallback from Actions 2/3
  entirely (per "suppliers shouldn't see the existing SRP/Rate") — but a live PR-to-PO
  approval + Acknowledge-side check showed the real downstream effect: Tony's own supplier
  PO (Fenteng_Lighting/Tony_Fan_Purchase_Order) is the SAME record `Acknowledged_PO_
  Supplier1/2` (purchase_order_scripts.txt) reads to build the REAL Zoho Books PO — so
  `Final_Price_Supplier1/2=0` on PR-00002's line meant the eventual Books PO would UNDERSTATE
  the real total (Tony's Books PO would total ₱150 instead of the correct ₱9,520 the
  aggregate/buyer side already showed). User confirmed via direct question ("what's the
  total going in books? still 9520?") that this mismatch was a real problem, not
  cosmetic — chose to RESTORE the fallback into Actions 2/3 after all ("real price, hide
  SRP label"): re-added the exact same corrected (Action-1-style, zero-only) condition
  to `rateToUseF`/`rateToUseT` — `if((rateToUseF==null||rateToUseF==0) && prLoopF.
  SRP_Rate_PR!=null && prLoopF.SRP_Rate_PR!=0){ rateToUseF=prLoopF.SRP_Rate_PR; }` (and
  the T/Tony equivalent) — so a supplier PO's Final_Price still only ever fills a genuine
  ₱0 gap, never overrides a real confirmed price, matching Action 1 exactly. "Hide the
  SRP label" clarified as a UI-only concern, not a backend one — neither
  Fenteng-PO/Tony-PO widget (UI/SupplierPortal/Fenteng-PO, Tony-PO) has ever shown any
  "(SRP)"-style tag on Final Price (unlike the buyer-facing PRs widget's own display-only
  fallback, which DOES tag "(SRP)") — so no widget change needed here, the value just
  reads as an ordinary Final Price with no visible source label. Mirrored into
  `pr_approve_po_custom_api.txt`'s `approvePOFenteng`/`approvePOTony` too. UNTESTED after
  this restore — needs a live PR-to-PO approval on PR-00002 to confirm Tony's OWN supplier
  PO line now also shows 4685 (matching the aggregate), and that subsequent Acknowledge ->
  Books PO sync totals ₱9,520 correctly instead of ₱150.
  BUG confirmed live 2026-07-08, TWO rounds: (1) `itemRec.Rate != 0` threw "left
  expression is of type TEXT and right expression is of type NUMBER and the operator
  != is not valid" — comparing directly against the numeric literal `0` failed.
  (2) The `.toDecimal()`-cast fix attempt THEN threw "Function applied over invalid
  expression" on the very same field — contradictory with (1)'s TEXT diagnosis,
  suggesting `itemRec.Rate`'s actual runtime type/nullness is inconsistent across PR
  loop iterations (possibly null/invalid for some `itemRec` values) rather than
  reliably one fixed type. FIXED for real: switched to this codebase's established
  defensive normalize-via-concat pattern (`field + ""` coerces ANY type — text,
  number, or null — to a safe string first, matches the exact pattern used throughout
  this project e.g. `missingValCheck = lpoCheck.Missing_SKUs + "";`): `itemRateStr =
  itemRec.Rate + ""; if(itemRateStr != "null" && itemRateStr != "" && itemRateStr !=
  "0" && itemRateStr.toDecimal() != 0) { newLine.SRP_Rate_PO=itemRateStr.toDecimal();
  }`. THIRD round: `newLine.SRP_Rate_PO=itemRateStr.toDecimal();` then threw "Expecting
  BIGINT expression found DECIMAL expression" — `SRP_Rate_PO` is a whole-number BIGINT
  field, not Decimal/Currency, same as `QTY` elsewhere in this script. FIXED: added
  `.round(0).toLong()` after `.toDecimal()`, matching the exact cast pattern already
  used for QTY (`prLoop.quantity.round(0).toLong()`).
  ADDED same session (user found via screenshot): there's ALSO a HEADER-level `SRP_Rate`
  Number field on the aggregate Purchase_Order (PO Details section, separate from the
  subform's `SRP_Rate_PO`) that was left blank. Now stamped alongside `SRP_Rate_PO`
  inside the same non-zero-rate guard — last-write-wins if a PO ends up with multiple
  lines that have different non-zero SRP rates, same convention as `Shipping_Mode`/
  `Required_Days_Lead` elsewhere in this script. Needs live retest.
- ADDED 2026-07-07 (BATCH-APPROVE BY SO, user request: "I want the PR Approved to
  approve all PR with same SO"): Action 1 no longer operates on just `input` — it fetches
  `siblingPRs = Purchase_Request1[Sales_Order == input.Sales_Order && PR_Approved ==
  false && PR_READY_FOR_PO == true]` and runs the entire find-or-create-PO + insert-line
  + stamping logic once PER sibling in a loop (`prLoop`), instead of once for `input`
  alone. User was asked and confirmed (AskUserQuestion): a sibling that ISN'T
  individually ready yet (PR_READY_FOR_PO==false) is silently left alone this run, not
  force-approved — the `&& PR_READY_FOR_PO == true` half of the criteria handles that by
  simply excluding it from the loop. Followed_Recommendation/Override_Reason gate moved
  INSIDE the loop as a per-PR `continue` (skip just that one PR, collected into
  `skippedList` for the final message) instead of a top-level `return` that would have
  aborted the whole batch over one PR needing an override reason.
- BIGINT-ON-FETCHED-RECORD GOTCHA AVOIDED: the original single-PR version safely did
  `Customer[ID == input.Customer]` / `Items[ID == input.Items]` because `input` is
  direct-input context (this codebase's established Deluge Gotchas note this pattern
  works fine there). Once PRs come from a FETCHED criteria record (`prLoop`) instead,
  the same style of query (`Items[ID == prLoop.Items]`) hits the well-known
  fetched-record BIGINT error. AVOIDED (not just worked around) by switching to direct
  lookup dot-chaining instead — `itemRec = prLoop.Items; itemName = itemRec.item_name;`
  — same technique this file already used successfully for
  `po.SO_No.Sales_Order_Number`. No criteria re-query needed at all for Customer/Items
  once you're holding a fetched record with a lookup field on it.
- CROSS-ACTION COORDINATION PROBLEM (the trickiest part of this change): Actions 1/2/3
  are three SEPARATE Deluge actions under one click (required — combining
  Fenteng_Lighting_Purchase_Order and Tony_Fan_Purchase_Order subform constructors in
  one action is the established "must be separate" rule elsewhere in this codebase).
  They don't share local variables, only `input.field` writes persist across them
  (confirmed elsewhere in this file). That's fine for the OLD single-PR design (Action
  2/3 read `input.Link_PO_No` that Action 1 had just set on `input` itself) — but now
  Action 1 writes to N different `prLoop` records, NOT to `input.Link_PO_No` directly
  (writing to a criteria-fetched record doesn't touch the special `input` object even
  when it's the same underlying row). Worse: by the time Action 2 runs, Action 1 has
  ALREADY flipped every sibling's `PR_Approved` to `true`, so Action 2/3 can't reuse
  `PR_Approved == false` to figure out "which PRs did this exact click just touch."
  FIX: Actions 2/3 don't try to identify "this batch" at all — they instead query ALL
  PRs for this SO+their own supplier that are already `PR_Approved == true` with a
  `Link_PO_No` set (`Purchase_Request1[Sales_Order == input.Sales_Order &&
  Selected_Supplier == "Fenteng"/"Tony" && PR_Approved == true && Link_PO_No != null]`)
  and, for each, check whether the target supplier PO ALREADY has a line for that
  PR_No (`existingLnF.PR_No_Supplier1 == prLoopF.PR_No`) — only inserting if missing.
  This makes Action 2/3 fully idempotent and safe to re-run against old, already-synced
  PRs from past clicks (they just get skipped via the already-has-line check) while
  still catching every PR Action 1 just approved in THIS click, with no shared state
  needed between actions at all.
- Report Action Item condition is UNCHANGED (`PR_READY_FOR_PO == true && PR_Approved ==
  false`, per-row) — clicking any one eligible row's button now approves that row PLUS
  its eligible siblings, but the button itself still only shows on rows that are
  individually eligible, same as before.
- EDGE CASE not fixed: if two siblings under the same SO have DIFFERENT suppliers (e.g.
  PR-00019 -> Fenteng, PR-00020 -> Tony), Action 1's existing SO+supplier merge logic
  already handles this correctly (each supplier gets/reuses its own aggregate PO), and
  Action 2/3 each only touch their own supplier's siblings — no cross-contamination.
- ADDED/CONFIRMED 2026-07-06: Approve PR button's report Action Item condition is
  `PR_READY_FOR_PO == true && PR_Approved == false` (screenshot-confirmed from Creator's
  Action Item settings). User asked to "only enable the button when PR Approved is
  checked", clarified via question that they meant the readiness AND-condition
  (PR_READY_FOR_PO), not the PR_Approved field itself (gating on it alone would be
  circular — that field is only ever set true by this action's own script). Separately,
  user then noticed the button correctly greys out for an already-approved PR (PR-00019)
  — that's the `PR_Approved == false` half doing exactly what every other "hide once
  done" button in this app already does (Submit Response, Acknowledge PO). See
  pr_check_readiness.txt for what feeds PR_READY_FOR_PO.
- ADDED 2026-07-06: Purchase_Order.PO_Line_Items gained a per-line `Item_Image` column,
  set from `itemRec.Image` (already fetched at the top of Action 1 for `itemName`) —
  mirrors PR1_Sync_Own_Image / Product_Image_Supplier1/2_PR, just per-line instead of a
  single header field since Purchase_Order aggregates multiple items per record (unlike
  Purchase_Request1, which is 1 item per record). Single "Image" type, direct assignment,
  no List() wrap — same convention as every other image copy in this codebase. Only
  wired into Action 1 (aggregate PO) so far — Fenteng_Lighting_Purchase_Order/
  Tony_Fan_Purchase_Order's own PO_Line_Items_Supplier1/2 subforms don't have this yet,
  not requested.
- ADDED 2026-07-06: Final_Price/Final_Price_Supplier1/Final_Price_Supplier2 (+ their
  Line_Total counterparts) now prefer `input.SRP_Rate_PR` (the SO-approved rate set by
  SO_To_PR, see so_to_pr_scripts_NewScripts.txt) over `input.Selcted_Final_Cost` (the
  supplier's negotiated price) when SRP_Rate_PR has a real value. Falls back to
  Selcted_Final_Cost when SRP_Rate_PR is null/0 (manually-created PRs with no SO, or an
  SO line whose rate never got set). Each action computes its own
  rateToUse/rateToUseF/rateToUseT independently (separate actions don't share local vars,
  same reasoning as itemRec/customerRec re-derivation elsewhere in this file).
- Confirmed field types/names (2026-07-02, via live debugging):
  - Purchase_Order.SO_No is a LOOKUP (NUMBER), not text. Comparing it against
    Purchase_Request1.Sales_Order (a plain TEXT field storing the SO number string, e.g.
    "SO-01120") requires dot-chaining into the looked-up Sales Order record's own text
    field: `po.SO_No.Sales_Order_Number`. A bare `po.SO_No == input.Sales_Order` throws
    "left expression is of type NUMBER and right expression is of type TEXT".
  - Purchase_Order.Customer is plain TEXT (confirmed) — storing customerName (a string)
    directly is correct, no lookup ID needed.
  - Suppliers.Supplier_Name is a Creator "Name" composite field (confirmed via field
    builder screenshot — has Prefix/First Name/Last Name/Suffix). Fenteng/Tony were
    entered in the First Name box (confirmed) — `.first_name` is correct.
  - `Selcted_Final_Cost` (typo, missing an 'e') IS the real field link name on
    Purchase_Request1, confirmed by user — not a bug, don't "fix" the spelling in the
    script (and don't rename the field either — renaming works but risks breaking any
    other reference to it elsewhere that we don't have full visibility into).
- CRITICAL BUG PATTERN (cost several rounds of debugging, confirmed live 2026-07-02):
  assigning a bare `null` to a variable that is LATER reassigned to a record-typed value
  in the same scope (`matchingPO = null; ... matchingPO = po;`) causes a parse-time type
  error, but Deluge reports it at the NEXT statement after the block closes, not at the
  actual conflicting assignment — extremely misleading. Fixed by avoiding null-typed
  variables entirely: track a match by a string ID (`matchingPONo = "";`, later compare
  `!= ""`) instead of holding a raw fetched-record reference across scope, then
  re-fetch the actual record fresh when needed (`Purchase_Order[PO_No == matchingPONo]`)
  — matches this codebase's dominant convention of always re-fetching by criteria rather
  than carrying record variables across blocks.
- Standalone `// Step N:` comment lines (one per line, common in this script's original
  form) also miscount Deluge's reported error line numbers — same established gotcha as
  elsewhere in this codebase. Removed; kept inline trailing comments only where truly
  needed, and even those should NOT go inside a multi-line `insert into Form [ ... ]`
  bracket block (different field=value parsing mode, no semicolons) — an inline comment
  placed inside such a block caused a much earlier, seemingly-unrelated parse error at a
  totally different statement, confirmed live 2026-07-02.
- Race condition risk (NOT fixed, architectural limitation): PO_No generation scans all
  Purchase_Order records for max+1 with no locking, and the "reuse existing PO" match is
  similarly non-atomic. Two Approve-PR clicks close together (same SO+supplier) could
  generate duplicate PO_No values or create two separate POs instead of sharing one. Only
  a real fix if approvals can realistically happen concurrently — consider an Auto
  Number field for PO_No if this becomes a problem.
- `poNoStr.removeFirstOccurence("PO-").toLong()` will throw on any non-standard PO_No
  (blank, "PO-TEST", etc.) — this project has a habit of leaving test records around, so
  if a stray malformed PO_No exists, this whole button breaks for everyone. Worth a
  defensive null-catch if that turns out to be a real problem.
- Redundant record refetch removed: the original script did
  `poRec = Purchase_Order[ID == po.ID]; for each poLn in poRec.PO_Line_Items` inside a
  loop that was already iterating `po` (which already has PO_Line_Items accessible
  directly) — simplified to `for each poLn in po.PO_Line_Items`.
- `input.Customer.ID` and bracket-stripped `input.Items` (`.toString().removeFirstOccurence("[")...`)
  were both simplified to direct `input.Customer` / `input.Items` — lookup fields already
  return the plain NUMBER ID via `input.field` in direct input context (established
  convention throughout this codebase), no extra unwrapping needed.
- BUG confirmed live 2026-07-02: the new-PO insert branch (`insert into Purchase_Order
  [...]`) originally included `SO_No=input.Sales_Order` — same NUMBER-vs-TEXT mismatch
  as the comparison bug above, but on write instead of read: "Unable to insert record.
  An invalid expression has been assigned to the SO_No field." FIX: SO_No removed from
  the insert bracket itself; instead, after creating targetPO, look up the Sales_Order
  form (confirmed link name via field builder breadcrumb: "Supply Chain App -> Sales
  Order" = `Sales_Order`, field `Sales_Order_Number`) for a matching record. Since that
  form mostly contains mock/test data (per user), a real SO number often won't match
  anything — rather than leave SO_No blank, AUTO-CREATES a minimal Sales_Order record
  (just Sales_Order_Number set) when no match is found, then links to that, matching the
  same find-or-create pattern already used for Purchase_Order and Shipments. Uses a
  `soFound`/`soIDNum` (Boolean + Number, initialized 0) pair rather than a single
  string-then-number variable — avoids the exact null/type-transition bug documented
  above (assigning `soID = "";` then later `soID = sor.ID;` mixes STRING and NUMBER on
  one variable, same failure class as `matchingPO = null; ... matchingPO = po;`).
- ADDED 2026-07-03: `Sales_Owner` now refreshed UNCONDITIONALLY on the aggregate
  Purchase_Order on every approval, not just when a new PO is created — previously
  `targetPO.Sales_Owner` was only ever set inside the `insert into [...]` bracket (the
  new-PO branch), so reusing an existing PO never refreshed it. Fixed with
  `targetPO.Sales_Owner=input.Sales_Owner;` right after the find-or-create block
  resolves (runs regardless of which branch fired).
  REVERTED same day for the supplier PO forms specifically: user removed `SO_No_Supplier1/2`,
  `Customer_Supplier1/2`, `Customer_Type_Supplier1/2`, and `Sales_Owner_Supplier1/2`
  entirely from Fenteng_Lighting_Purchase_Order/Tony_Fan_Purchase_Order in Creator
  (suppliers shouldn't see internal sales/customer info) — Action 2/3's insert brackets
  and the `targetSupPOF/T.Sales_Owner_Supplier1/2=...` lines were removed to match, along
  with the now-unused `customerRecF/T`/`customerNameF/T`/`soFoundF/T`/`soIDNumF/T` fetch
  logic that only existed to populate those now-deleted fields. Aggregate Purchase_Order
  keeps its own `Sales_Owner` (internal-facing, not shown to suppliers).
  Sales_Owner still needs to reach Shipments/Receiving though (user: "get sales owner
  from the PR1") — see purchase_order_scripts.txt's NOTES, now sourced directly from
  each PR1 record (via PR_No) instead of the aggregate PO, since the PO-level value
  isn't the right source once acknowledgment covers multiple PRs that could have
  different Sales_Owner values.
- BOOKS PURCHASE ORDER SYNC — briefly lived here 2026-07-03 (confirmed working live:
  PR-00016 CREATE, PR-00017 UPDATE, both correct), then MOVED to
  `Acknowledged_PO_Supplier1/2` in `purchase_order_scripts.txt` same day per user
  request ("sending to zoho books po should be in acknowledge button in supplier's PO").
  Full field mapping/vendor IDs/warehouse/custom-field research now documented there.
  MOVED BACK 2026-07-16, per user request — see the top-of-file header note and Actions
  2/3's own inline comment for the current version (now inside Action 2/3, once per
  distinct supplier PO touched by the click). This history entry is kept for the field
  mapping/vendor ID research trail, not as a description of current behavior.
- ADDED 2026-07-03: `input.Last_Update = zoho.currenttime;` — stamps PR1's own
  `Last_Update` field (DATE-TIME, confirmed via form screenshot placeholder) right before
  `PR_Approved=true`. Mirrors the same stamp added to `PR_Changed` in
  `purchase_request_scripts1.txt` for native PR1 edits — this one covers the Action Item
  approval path specifically, since Action Item scripts don't fire the native Edited
  trigger.
- ADDED 2026-07-03 (merged in from user's Temp.txt scratch copy): `PO_Line_Items` gained
  two more per-line columns, `Followed_Recommendation` and `Override_Reason`, plus a
  `Priority` column (sourced from PR1's own `Priority` field, e.g. "Low" — confirmed
  real via a live API dump of PR-00016/PR-00017), all now set on `newLine`.
  BUG confirmed live 2026-07-03: this script also carried a header-level
  `targetPO.Followed_Recommendation=input.Followed_Recommendation;` (assumed to exist
  alongside the new per-line columns, per an earlier "keep both" decision) — turned out
  Purchase_Order has NO such header field at all: "'Followed_Recommendation' does not
  exist in 'targetPO' which is collection of 'Purchase_Order' form". REMOVED. Only the
  PO_Line_Items per-line column and the supplier-form `Followed_Recommendation_Supplier1/2`
  fields (Action 2/3) are real — there is no aggregate-PO-level version of this field.
- CHANGED 2026-07-03 (user request): `Followed_Recommendation_Supplier1/2` and
  `Override_Reason_Supplier1/2` moved from header-level fields on the supplier PO forms
  into their `PO_Line_Items_Supplier1/2` subforms instead (mirroring the aggregate PO's
  own per-line columns from the entry above). Override_Reason_Supplier1/2 in particular
  had NEVER been populated anywhere before this — the header field existed but nothing
  ever wrote to it. Now both are set on `newSupLineF/T` alongside the other per-line
  fields. User plans to DELETE the header-level `Followed_Recommendation_Supplier1/2`/
  `Override_Reason_Supplier1/2` fields from both supplier PO forms after confirming this
  works — the header-level `targetSupPOF/T.Followed_Recommendation_Supplier1/2=...`
  assignment (which used to run after the totals block) has already been removed from
  Action 2/3 to match.
- ADDED 2026-07-03 (user request): `Sent_On_Supplier1/2` was blank on both supplier PO
  forms — only the aggregate `Purchase_Order.Sent_On` was ever stamped. Added
  `targetSupPOF.Sent_On_Supplier1=zoho.currenttime;` /
  `targetSupPOT.Sent_On_Supplier2=zoho.currenttime;` right after the totals recompute in
  Action 2/3, same DATE-TIME/`zoho.currenttime` pattern as everywhere else in this file.
- CHANGED 2026-07-03: `Is_Locked` (aggregate Purchase_Order) and `Is_Locked_Supplier1/2`
  (both supplier PO forms) are set to `true` unconditionally at the END of every
  PR_Approved run (Action 1/2/3 respectively). Semantics clarified by user:
  `Is_Locked` means "this PO record is now view-only" (a form-lock flag), NOT "no longer
  eligible for more PR lines to merge into it" — those are two different concepts that
  happened to share one field.
  BUG confirmed live 2026-07-03 (first version of this change): the PO-matching query at
  the top of Action 1 was ALSO filtering on `Is_Locked == false`
  (`Purchase_Order[PO_Status != "Completed" && Is_Locked == false]`), so once Is_Locked
  flipped true after the first PR approval, a second PR for the same SO+supplier could
  no longer find/reuse that PO — it created a brand new one instead (confirmed live:
  same SO landed in PO-00004 and PO-00005 instead of merging). FIXED by removing the
  `Is_Locked == false` condition from the matching query entirely — merging eligibility
  is now judged purely on `PO_Status != "Completed"`, while `Is_Locked` itself still
  flips true on every approval for its own "view-only" purpose, completely decoupled
  from the matching logic now.
- ADDED 2026-07-02: Required_Days_Lead / Remaining_Days now flow from PR1 into both
  Purchase_Order.PO_Line_Items (per-line, new columns added by user) AND top-level on
  Shipments (already existed there, confirmed link names match labels exactly this
  time — Required_Days_Lead / Remaining_Days). Design choice: since these two are
  per-item on PR1 but only TOP-LEVEL (single value) on Shipments, the Shipments value
  just gets overwritten by whichever PR is approved most recently into that shipment —
  acceptable since Production_Date (the only other timeline field already on Shipments)
  has the same "last write wins" characteristic. `Shipment_Days` was genuinely missing
  from the Shipments form (unlike Required_Days_Lead/Remaining_Days which already
  existed) — user added it top-level, link name `Shipment_Days` (confirmed 2026-07-02),
  now wired in the same way as the other two.
- BUG confirmed live 2026-07-02: `input.PR_Approved = true;` originally ran as the very
  FIRST statement (right after the Override_Reason gate) — meaning if ANYTHING later in
  the script failed (like the SO_No bug above), the PR record was already left marked
  Approved=true with nothing actually converted. Since the Approve button's own
  condition presumably hides/disables once PR_Approved==true, this stranded the PR in a
  "looks approved, button gone, but no PO/Shipment was actually created" state with no
  way to retry from the UI. FIX: moved `input.PR_Approved = true;` to the very last line
  of the script, right before the success message — now only set once every other step
  has already succeeded. Any record already stuck in the bad state from before this fix
  needs `PR_Approved` manually reset to false to unlock the button again.

- ADDED 2026-07-02: `targetPO.Sent_On=zoho.currenttime;` — stamps the aggregate PO with
  the current date/time every time a PR is approved into it (confirmed field name via
  the All_Purchase_Orders report dump: "Sent_On as 'Sent On'"). Runs on every approval
  that touches this PO, so if multiple PRs land in the same PO over several days,
  Sent_On reflects the MOST RECENT approval, not the first.
  BUG confirmed live 2026-07-02: originally used `zoho.currentdate`, but Sent_On is
  actually a DATE-TIME field (confirmed via form screenshot showing placeholder format
  "yyyy-MM-dd hh:mm:ss A") — the date-only value silently didn't populate. Fixed to
  `zoho.currenttime` (Deluge's date+time system variable). This is a NATIVE in-app
  Deluge assignment, not a REST API update — the well-known "zoho.currenttime needs
  manual ISO 8601 format conversion before use" issue documented online applies
  specifically to REST API request bodies, not native same-app field assignment, so no
  `.toString()`/`.toTime()` conversion needed here.

SHIPMENT + RECEIVING PUSH — MOVED OUT 2026-07-03, MOVED BACK IN 2026-07-16:
- CURRENT (2026-07-16): back in Actions 2/3, per user request ("move the function of
  acknowledge - going to zoho books, going to shipment and receiving - to PR_Approved").
  See Actions 2/3's own inline comment for the live version — everything below this
  point in this NOTES entry describes the 2026-07-03 intermediate state (Acknowledge
  built it) and is kept for history/field-type-confirmation reference only.
- This used to live here (added 2026-07-02, ran on every single PR approval). Per user
  request 2026-07-03 ("when PR To PO approved -> send only to Purchase_Order and
  suppliers... when supplier acknowledged -> that's when we're gonna send to Shipments
  and Receiving too"), this whole section was CUT from Action 1 and rebuilt inside
  Acknowledged_PO_Supplier1/2 in purchase_order_scripts.txt — see that file's NOTES for
  the current Shipment/Receiving logic, field-type confirmations (Shipment_No/
  Receive_No1 both plain Single Line, not Auto Number; Shipment_Status dropdown has no
  Received/Completed value, "still open" = "Pending"), and the cross-form
  insert-doesn't-fire-workflows discovery that's why Receiving is still populated
  inline rather than relying on shipment_populate_receiving.txt's own trigger.
- Key difference in the new version: it no longer has a single input.* PR record to pull
  from (acknowledgment fires once per supplier PO, which may carry several approved PR
  lines). It loops the aggregate Purchase_Order's own PO_Line_Items subform instead —
  each PR's SKU/Item/QTY/Required_Days_Lead/Remaining_Days already sit on that subform
  row from Action 1, so no PR1 refetch is needed except for Shipment_Days (not a
  PO_Line_Items column, fetched per-line from Purchase_Request1 by PR_No).
- EDGE CASE (not fixed, flagged for user): PO_Status stays eligible ("!= Completed &&
  Is_Locked == false" in Action 1's matching query) even after acknowledgment, so a
  later-approved PR for the same SO+supplier could still land a new line on an
  already-Confirmed PO. Since the Acknowledge button hides once PO_Status=="Confirmed"
  (report condition), that new line will NOT automatically get pushed to Shipments/
  Receiving — nothing re-fires the acknowledgment logic for it. Only matters if PRs for
  the same SO+supplier keep getting approved after the PO's already been acknowledged;
  raise if that turns out to happen in practice.

SUPPLIER-SPECIFIC PO FORMS (Action 2/3, added 2026-07-02):
- Fills the gap flagged by user: the aggregated Purchase_Order got the PR line, but
  Fenteng_Lighting_Purchase_Order / Tony_Fan_Purchase_Order (the individual supplier
  portals) never did — those forms previously only had "disable all fields" workflows
  (purchase_order_scripts.txt), no create/populate logic at all.
- DESIGN CHOICE (confirmed by user): PO_No_Supplier1/2 MIRRORS the aggregate
  Purchase_Order's own PO_No exactly (same number in both places) rather than an
  independent per-supplier sequence — matches how PR_No_Supplier1/2 already mirrors the
  parent PR's PR_No elsewhere in this project. This means find-or-create for the
  supplier PO simplifies to a direct match on `PO_No_Supplier1/2 == input.Link_PO_No` —
  no separate max+1 scan needed, unlike the aggregate PO's own numbering.
- Reads `input.Link_PO_No` — set by Action 1 near the very end of its own script. This
  assumes `input` field writes from an earlier Action persist and are visible to later
  Actions within the SAME workflow trigger firing (sequential execution against one
  evolving record state) — a reasonable, standard Zoho Creator assumption, but not
  explicitly proven elsewhere in this codebase for custom Action Item workflows
  specifically (only proven within a SINGLE script's own sequential statements so far).
  VERIFY on first test: if Action 2/3 error or silently use a blank Link_PO_No, this
  cross-action `input` persistence assumption is the first thing to check.
- Field link names taken directly from purchase_order_scripts.txt's confirmed disable-
  script field list (PO_No_Supplier1/2, SO_No_Supplier1/2, Customer_Supplier1/2,
  Customer_Type_Supplier1/2, Sales_Owner_Supplier1/2, PO_Date_Supplier1/2,
  PO_Status_Supplier1/2, Total_PO_Value_Supplier1/2, Total_Lines_Supplier1/2,
  Followed_Recommendation_Supplier1/2, PO_Line_Items_Supplier1/2 with columns
  Supplier/PR_No/Item/SKU/QTY/Unit/Final_Price/Line_Total/Shipping_Mode/Target_Delivery/
  supplier_target_date/Delay_Status, all suffixed _Supplier1 or _Supplier2) — NOT
  independently re-confirmed via a fresh field builder screenshot this time, since that
  list was already directly sourced from a script that's confirmed live in Creator.
  UNCONFIRMED: whether Required_Days_Lead/Remaining_Days (added to the aggregate
  PO_Line_Items and Shipments this session) also exist on these supplier PO line-item
  subforms — NOT included in Action 2/3 pending that check, same as Shipments before
  Shipment_Days was confirmed.
- Two suppliers ("Fenteng" / "Tony") gated by `if(selectedSupplierNameF/T == "...")` —
  matches the exact string values already used and confirmed correct throughout this
  entire file (`selectedSupplierName` from `input.Selected_Supplier`).
- Each action independently re-derives itemRec/itemName/customerRec/customerName rather
  than reusing Action 1's variables — separate actions do NOT share local variables,
  only `input.field` writes carry across (same reasoning as the Link_PO_No point above).
- ADDED 2026-07-15, per user request (all 3 Actions + mirror `pr_approve_po_custom_api.txt`)
  — new 3rd-tier fallback on `rateToUse`/`rateToUseF`/`rateToUseT`: after
  Selcted_Final_Cost then SRP_Rate_PR both come up 0/blank, now also tries the item's own
  catalog `Rate` (`itemRec.Rate`/`itemRecF.Rate`/`itemRecT.Rate` — already fetched a few
  lines above via `itemRec = prLoop.Items;`, no new query needed). User's rule (4 cases,
  screenshots of PR-00002/Acantha + the Inquiry widget's SRP-approval panel as reference):
  a from-inquiry item's price was already resolved upstream (Selcted_Final_Cost/
  SRP_Rate_PR chain already covers that, unchanged); a NOT-from-inquiry item with a real
  catalog Rate (e.g. Acantha) should auto-send that catalog rate to Books even with no
  supplier quote yet — that's this new 3rd tier; a NOT-from-inquiry item with 0 catalog
  Rate still requires a real supplier-quoted Selcted_Final_Cost, unchanged (tier 1 only
  path that ever resolves for that case). Matching readiness-flag logic (separate concern
  — whether "Final price confirmed" shows true) reworked the same day in
  `pr_check_readiness.txt`, see that file's own NOTES for the full 4-case writeup.
  Deliberately read-only (never writes catalog Rate INTO Selcted_Final_Cost) — avoids the
  Currency(CNY)-vs-plain-Number type mismatch that killed an earlier same-session attempt
  to do exactly that (see so_to_pr_scripts_NewScripts.txt's "FULLY REVERTED" NOTES entry).
  UNTESTED — needs a live PR-approve on an item with a real catalog Rate and no supplier
  quote (Acantha-like) confirming the resulting PO line (aggregate + both supplier POs)
  picks up the catalog rate instead of 0.
- BUG fixed same day, before first live test — the 3rd-tier fallback above originally
  compared `itemRec.Rate != 0` directly (TEXT vs NUMBER) and errored live: "Error at line
  number: 130 In Criteria left expression is of type TEXT and right expression is of type
  NUMBER and the operator != is not valid" — this is the SAME already-documented
  `itemRec.Rate` runtime-type gotcha as this file's own earlier `SRP_Rate_PO` bug (see the
  "BUG confirmed live 2026-07-08, TWO rounds" NOTES entry above) — should have reused that
  established `itemRateStr = itemRec.Rate + ""` cast pattern from the start instead of
  re-guessing. Fixed in all 3 Actions with the same safe string-cast-then-`.toDecimal()`
  pattern (`itemRateStrFallback`/`F`/`T`, separate local vars per action).
====================================================

````
