---
title: "PASTE_ApprovePOFenteng_ApprovePOTony_Production"
source_file: "NEw/PASTE_ApprovePOFenteng_ApprovePOTony_Production.txt"
category: "Procurement/Supplier - Tony Fan/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 1205
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

# PASTE_ApprovePOFenteng_ApprovePOTony_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Procurement/Supplier - Tony Fan/Deluge`
> - **Source File:** `NEw/PASTE_ApprovePOFenteng_ApprovePOTony_Production.txt`
> - **Lines of Code:** 1,205
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
====================================================
PASTE TARGET: 2 Custom Functions in Production (Microservices -> Custom API
-> approve_po_fenteng / approve_po_tony -> edit the underlying Deluge function)
approvePOMain does NOT need re-pasting -- unaffected by either bug below.

v2, 2026-08-05 -- fixes TWO real bugs found live in Production:
1) Selected_Supplier short-vs-full name mismatch (Create PO silently processed 0
   records for the supplier side -- fixed earlier today).
2) SRP_Rate_PR never used as a fallback for the price sent to Books -- a PR
   routed from an Approved Inquiry already carries that Inquirys approved SRP
   into SRP_Rate_PR automatically, but Books was falling through to the generic
   catalog rate (or the suppliers own raw quote) instead, since only the manual
   SRP_Approved_PR field was ever checked. Confirmed live: PR-00001,
   SRP_Rate_PR=200 (matching source Inquiry INQ-00018s real approved SRP),
   SRP_Approved_PR blank, Books ended up receiving 150 (the suppliers raw quote)
   instead of 200.

NOTE: this paste-ready version has all == ... == prose-note comments stripped
(that convention is documentation-only, not valid Deluge, and broke this exact
editor once already today when left inside a function body). Real /* ... */
block comments ARE kept -- confirmed safe, this file already had that style
live before today with no issue.
====================================================

--- approvePOFenteng (paste over the existing approve_po_fenteng function) ---

map approvePOFenteng(String soNo)
{
	response = Map();
	processedCount = 0;
	processedSupPOsF = List();
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

--- approvePOTony (paste over the existing approve_po_tony function) ---

map approvePOTony(String soNo)
{
	response = Map();
	processedCount = 0;
	processedSupPOsT = List();
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

````
