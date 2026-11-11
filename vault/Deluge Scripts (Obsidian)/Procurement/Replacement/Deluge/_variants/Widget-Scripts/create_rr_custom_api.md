---
title: "create_rr_custom_api"
source_file: "DMS\DelugeScripts\create_rr_custom_api.txt"
category: "Procurement/Replacement/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 711
tags:
  - custom-api
  - deluge
  - fulfillment
  - order-aggregation
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-books
---

# create_rr_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Procurement/Replacement/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\create_rr_custom_api.txt`
> - **Lines of Code:** 711
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#order-aggregation`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== 3 Deluge Custom Functions (createRRMain/createRRFenteng/createRRTony) + Custom API
   setup, mirroring create_rr_button.txt's 3 native Actions on Exceptions' "Create RR"
   Report Action Item verbatim — same conversion pattern already used for
   pr_approve_po_custom_api.txt/acknowledge_po_custom_api.txt (Report Action Items can't
   be invoked via any Creator API/SDK call). New 2026-07-13, built for the
   UI/EndUser/Exception widget's "Create RR" button. Every line of logic is unchanged
   from create_rr_button.txt except `input.field` -> `r.field` on a freshly fetched
   record (`r = Exceptions[ID == exceptionId.toLong()]`), and the native `success
   message`/no-return-value shape replaced with a returned Map({status, message,
   created}) since Custom Functions need an explicit return. This is a MANUALLY-
   MAINTAINED MIRROR — same maintenance risk already documented for the other 2 files
   above: any future edit to create_rr_button.txt's 3 Actions needs a matching edit
   here. ==

====================================================
CUSTOM FUNCTION 1 SETUP:
  Name: createRRMain
  Arguments: String exceptionId
  Paste FULL block below INCLUDING the `map createRRMain(...)` signature line — Creator
  Custom Functions need the full signature, unlike Books custom functions (confirmed
  this project's own established convention, see CLAUDE.md Deluge Gotchas).
====================================================

map createRRMain(String exceptionId)
{
	response = Map();
	r = Exceptions[ID == exceptionId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Exception not found.");
		return response;
	}

	groupKeys = List();
	groupSku = Map();
	groupItem = Map();
	groupSupplier = Map();
	groupType = Map();
	groupQty = Map();
	// ADDED 2026-08-08, mirrored from create_rr_button.txt Action 1 — FIXED per
	// that file's own code review: RR_Spare_Parts must hold a PAIRED "Type: Qty"
	// string (comma-joined across rows), matching checker_checklist_qc_sync.txt's
	// own QC-side aggregation and what Fenteng-RR/Tony-RR/ExceptionControl already
	// parse (split on "," then ":" per segment). Built per-row, inside this same
	// loop, so type and qty can never misalign across multiple physical units of
	// the same SKU. groupSpareType (bare type names, no qty) is kept for
	// RR_Item_to_Replace.
	groupSpareType = Map();
	groupSparePairs = Map();
	for each  pc in r.Product_Context1
	{
		/* ADDED 2026-07-21, mirrored from create_rr_button.txt — see that file's
		   own comment for the full reasoning. */
		if(pc.Type_field == "Damage" && pc.Repairable == "Yes" && pc.Repair_Outcome != "Not Fixed")
		{
			continue;
		}
		gKey = pc.SKU + "||" + pc.Type_field;
		if(!groupKeys.contains(gKey))
		{
			groupKeys.add(gKey);
			groupSku.put(gKey,pc.SKU);
			groupItem.put(gKey,pc.Item);
			groupSupplier.put(gKey,pc.Supplier);
			groupType.put(gKey,pc.Type_field);
			groupQty.put(gKey,0);
			groupSpareType.put(gKey,"");
			groupSparePairs.put(gKey,"");
		}
		groupQty.put(gKey, groupQty.get(gKey) + ifnull(pc.Qty,0));
		pcQtyRaw = pc.Quantity_of_damage_spare_s + "";
		if(pcQtyRaw != "" && pcQtyRaw != "null")
		{
			// CHANGED 2026-08-08d, per user request ("separate quantities per
			// sparepart needed, per line item") — Quantity_of_damage_spare_s now
			// holds the FULL "Type: Qty, Type: Qty" pairs directly (the widget
			// builds one qty box per checked type), so this row's own contribution
			// is parsed straight out of it instead of reconstructed from one
			// shared qty. "Others" is still resolved to the officer's own typed
			// Spare_Part_Type_Other text per segment.
			pcOtherText = pc.Spare_Part_Type_Other + "";
			segs = pcQtyRaw.toList(",");
			pcSpareType = "";
			pcPairsThisRow = "";
			for each seg in segs
			{
				segTrim = seg.trim();
				segType = segTrim.getPrefix(":").trim();
				segQty = segTrim.getSuffix(":").trim();
				if(segQty == "" || segQty == "null")
				{
					segQty = "—";
				}
				if(segType == "Others" && pcOtherText != "" && pcOtherText != "null")
				{
					segType = pcOtherText;
				}
				if(pcSpareType == "") { pcSpareType = segType; }
				else { pcSpareType = pcSpareType + ", " + segType; }
				segPair = segType + ": " + segQty;
				if(pcPairsThisRow == "") { pcPairsThisRow = segPair; }
				else { pcPairsThisRow = pcPairsThisRow + ", " + segPair; }
			}
			existingSpareType = groupSpareType.get(gKey);
			if(existingSpareType == "") { groupSpareType.put(gKey,pcSpareType); }
			else { groupSpareType.put(gKey,existingSpareType + ", " + pcSpareType); }
			existingPair = groupSparePairs.get(gKey);
			if(existingPair == "") { groupSparePairs.put(gKey,pcPairsThisRow); }
			else { groupSparePairs.put(gKey,existingPair + ", " + pcPairsThisRow); }
		}
	}

	existingPairs = List();
	existingRRsForExc = Replacement_Request[Source_Exception_No == r.Exception_No];
	for each  exrr in existingRRsForExc
	{
		for each  srow in exrr.Replacement_Summary
		{
			existingPairs.add(srow.SKU + "||" + exrr.Source_Type);
		}
	}

	maxNum = 0;
	existingRRsAll = Replacement_Request[ID != 0];
	for each  rr in existingRRsAll
	{
		rrNoStr = rr.RR_No;
		if(rrNoStr != null && rrNoStr != "")
		{
			numPart = rrNoStr.removeFirstOccurence("RR-");
			num = numPart.toLong();
			if(num > maxNum)
			{
				maxNum = num;
			}
		}
	}

	createdCount = 0;
	for each  gKey in groupKeys
	{
		gSku = groupSku.get(gKey);
		gType = groupType.get(gKey);
		sourceType = "";
		if(r.Source_Module == "Receiving")
		{
			if(gType == "Damage")
			{
				sourceType = "Receiving Damage";
			}
			else
			{
				sourceType = "Receiving Missing";
			}
		}
		else if(r.Source_Module == "Fulfillment QC")
		{
			sourceType = "QC Failure";
		}
		else
		{
			sourceType = "Management Decision";
		}
		pairKey = gSku + "||" + sourceType;
		if(existingPairs.contains(pairKey))
		{
			continue;
		}
		maxNum = maxNum + 1;
		newNum = maxNum;
		if(newNum < 10)
		{
			newRRNo = "RR-0000" + newNum;
		}
		else if(newNum < 100)
		{
			newRRNo = "RR-000" + newNum;
		}
		else if(newNum < 1000)
		{
			newRRNo = "RR-00" + newNum;
		}
		else if(newNum < 10000)
		{
			newRRNo = "RR-0" + newNum;
		}
		else
		{
			newRRNo = "RR-" + newNum;
		}
		/* ADDED 2026-07-20, mirrored from create_rr_button.txt — see that file's own
		   NOTES for the full reasoning (Clone Shipment mechanism reads these safely
		   instead of a subform on a criteria-queried record). */
		newRRID = insert into Replacement_Request
		[
			RR_No=newRRNo
			RR_Date=zoho.currentdate
			RR_Status="Open"
			Source_Type=sourceType
			Source_Exception_No=r.Exception_No
			Last_Updated=zoho.currenttime
			Added_User=zoho.loginuser
			RR_Supplier=groupSupplier.get(gKey)
			RR_SKU=gSku
			RR_Item_Name=groupItem.get(gKey)
			RR_Qty_Value=groupQty.get(gKey)
			RR_PR_No=r.Receiving_Line_ID
			RR_Item_to_Replace=groupSpareType.get(gKey)
			RR_Damage_Qty=groupQty.get(gKey)
			RR_Spare_Parts=groupSparePairs.get(gKey)
		];
		newRR = Replacement_Request[ID == newRRID];
		newRow = Replacement_Request.Replacement_Summary();
		newRow.PR_No=r.Receiving_Line_ID;
		newRow.Supplier=groupSupplier.get(gKey);
		newRow.SKU=gSku;
		newRow.Item=groupItem.get(gKey);
		newRow.SO_No=r.Sales_Order;
		newRow.Original_PO_No=r.PO_No;
		newRow.Priority=r.Priority;
		newRow.RR_Qty=groupQty.get(gKey);
		newRR.Replacement_Summary.insert(newRow);
		createdCount = createdCount + 1;

		/* ADDED 2026-07-20, mirrored from create_rr_button.txt Action 1 — Missing_SKUs
		   stamp / new replacement PO creation, moved here (officer-triggered Create RR)
		   from approve_rr_custom_api.txt (was supplier-triggered Approve RR). */
		if(sourceType == "Receiving Missing")
		{
			targetPOsRR = Purchase_Order[PO_No == r.PO_No];
			for each  poRR in targetPOsRR
			{
				poRR.Missing_SKUs = gSku;
			}
		}
		else
		{
			/* CHANGED 2026-07-20, mirrored from create_rr_button.txt — see that file's
			   own NOTES for the full reasoning. No new PO created — stamps Damage_SKUs
			   on the ORIGINAL PO instead, same pattern as the Missing branch above. */
			targetPOsRRDmg = Purchase_Order[PO_No == r.PO_No];
			for each  poRRDmg in targetPOsRRDmg
			{
				poRRDmg.Damage_SKUs = gSku;
			}
		}
	}
	if(createdCount > 0)
	{
		r.Exception_Status = "Under Review";
	}
	messageText = "No new RR needed — every item already has one.";
	if(createdCount > 0)
	{
		messageText = createdCount + " RR(s) created.";
	}
	response.put("status","success");
	response.put("created",createdCount);
	response.put("message", messageText);
	return response;
}

====================================================
CUSTOM FUNCTION 2 SETUP:
  Name: createRRFenteng
  Arguments: String exceptionId
====================================================

map createRRFenteng(String exceptionId)
{
	response = Map();
	r = Exceptions[ID == exceptionId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Exception not found.");
		return response;
	}

	groupKeysF = List();
	groupSkuF = Map();
	groupItemF = Map();
	groupSupplierF = Map();
	groupTypeF = Map();
	groupQtyF = Map();
	// ADDED 2026-08-08, mirrored from create_rr_button.txt Action 2 — see
	// createRRMain's own FIXED comment above for the full pairing-format
	// reasoning.
	groupSpareTypeF = Map();
	groupSparePairsF = Map();
	for each  pc in r.Product_Context1
	{
		/* ADDED 2026-07-21 — same repair-tracking gate as createRRMain. */
		if(pc.Type_field == "Damage" && pc.Repairable == "Yes" && pc.Repair_Outcome != "Not Fixed")
		{
			continue;
		}
		gKeyF = pc.SKU + "||" + pc.Type_field;
		if(!groupKeysF.contains(gKeyF))
		{
			groupKeysF.add(gKeyF);
			groupSkuF.put(gKeyF,pc.SKU);
			groupItemF.put(gKeyF,pc.Item);
			groupSupplierF.put(gKeyF,pc.Supplier);
			groupTypeF.put(gKeyF,pc.Type_field);
			groupQtyF.put(gKeyF,0);
			groupSpareTypeF.put(gKeyF,"");
			groupSparePairsF.put(gKeyF,"");
		}
		groupQtyF.put(gKeyF, groupQtyF.get(gKeyF) + ifnull(pc.Qty,0));
		pcQtyRawF = pc.Quantity_of_damage_spare_s + "";
		if(pcQtyRawF != "" && pcQtyRawF != "null")
		{
			// CHANGED 2026-08-08d — see createRRMain's own comment above for the
			// full per-type-qty reasoning.
			pcOtherTextF = pc.Spare_Part_Type_Other + "";
			segsF = pcQtyRawF.toList(",");
			pcSpareTypeF = "";
			pcPairsThisRowF = "";
			for each segF in segsF
			{
				segTrimF = segF.trim();
				segTypeF = segTrimF.getPrefix(":").trim();
				segQtyF = segTrimF.getSuffix(":").trim();
				if(segQtyF == "" || segQtyF == "null")
				{
					segQtyF = "—";
				}
				if(segTypeF == "Others" && pcOtherTextF != "" && pcOtherTextF != "null")
				{
					segTypeF = pcOtherTextF;
				}
				if(pcSpareTypeF == "") { pcSpareTypeF = segTypeF; }
				else { pcSpareTypeF = pcSpareTypeF + ", " + segTypeF; }
				segPairF = segTypeF + ": " + segQtyF;
				if(pcPairsThisRowF == "") { pcPairsThisRowF = segPairF; }
				else { pcPairsThisRowF = pcPairsThisRowF + ", " + segPairF; }
			}
			existingSpareTypeF = groupSpareTypeF.get(gKeyF);
			if(existingSpareTypeF == "") { groupSpareTypeF.put(gKeyF,pcSpareTypeF); }
			else { groupSpareTypeF.put(gKeyF,existingSpareTypeF + ", " + pcSpareTypeF); }
			existingPairF = groupSparePairsF.get(gKeyF);
			if(existingPairF == "") { groupSparePairsF.put(gKeyF,pcPairsThisRowF); }
			else { groupSparePairsF.put(gKeyF,existingPairF + ", " + pcPairsThisRowF); }
		}
	}

	existingSupPairsF = List();
	existingSupRRsF = Fenteng_Lighting_Replacement_Request[Source_Exception_No == r.Exception_No];
	for each  esrF in existingSupRRsF
	{
		for each  ssrowF in esrF.Replacement_Summary
		{
			existingSupPairsF.add(ssrowF.SKU + "||" + esrF.Source_Type);
		}
	}

	createdCountF = 0;
	for each  gKeyF in groupKeysF
	{
		// FIXED 2026-08-07, real bug confirmed live: Production's real
		// Receiving.Supplier value is "Tony Fan"/"Fenteng Lighting" (the
		// Suppliers form's own full display name), not the bare "Fenteng"/
		// "Tony" this strict equality expected — only Dev's own test data
		// happened to use the bare literal, masking this in every prior test.
		// Zero supplier RRs were ever created in Production as a result.
		// Matches the defensive == || .contains() pattern already used
		// elsewhere in this codebase for the same field (see
		// receiving_widget_custom_api.txt/receiving_create_bin_receiving.txt).
		supplierValF = groupSupplierF.get(gKeyF) + "";
		if(supplierValF != "Fenteng" && !supplierValF.contains("Fenteng"))
		{
			continue;
		}
		gSkuF = groupSkuF.get(gKeyF);
		gTypeF = groupTypeF.get(gKeyF);
		sourceTypeF = "";
		if(r.Source_Module == "Receiving")
		{
			if(gTypeF == "Damage")
			{
				sourceTypeF = "Receiving Damage";
			}
			else
			{
				sourceTypeF = "Receiving Missing";
			}
		}
		else if(r.Source_Module == "Fulfillment QC")
		{
			sourceTypeF = "QC Failure";
		}
		else
		{
			sourceTypeF = "Management Decision";
		}
		pairKeyF = gSkuF + "||" + sourceTypeF;
		if(existingSupPairsF.contains(pairKeyF))
		{
			continue;
		}
		parentRRNoF = "";
		parentRRsF = Replacement_Request[Source_Exception_No == r.Exception_No];
		for each  prrF in parentRRsF
		{
			if(prrF.Source_Type == sourceTypeF)
			{
				for each  prsRowF in prrF.Replacement_Summary
				{
					if(prsRowF.SKU == gSkuF)
					{
						parentRRNoF = prrF.RR_No;
					}
				}
			}
		}
		if(parentRRNoF != "")
		{
			newSupRRIDF = insert into Fenteng_Lighting_Replacement_Request
			[
				RR_No=parentRRNoF
				RR_Date=zoho.currentdate
				RR_Status="Open"
				Source_Type=sourceTypeF
				Source_Exception_No=r.Exception_No
				Last_Updated=zoho.currenttime
				RR_Item_to_Replace=groupSpareTypeF.get(gKeyF)
				RR_Damage_Qty=groupQtyF.get(gKeyF)
				RR_Spare_Parts=groupSparePairsF.get(gKeyF)
			];
			newSupRRF = Fenteng_Lighting_Replacement_Request[ID == newSupRRIDF];
			newSupRowF = Fenteng_Lighting_Replacement_Request.Replacement_Summary();
			newSupRowF.PR_No=r.Receiving_Line_ID;
			newSupRowF.Supplier=groupSupplierF.get(gKeyF);
			newSupRowF.SKU=gSkuF;
			newSupRowF.Item=groupItemF.get(gKeyF);
			newSupRowF.SO_No=r.Sales_Order;
			newSupRowF.Original_PO_No=r.PO_No;
			newSupRowF.Priority=r.Priority;
			newSupRowF.RR_Qty=groupQtyF.get(gKeyF);
			newSupRRF.Replacement_Summary.insert(newSupRowF);
			createdCountF = createdCountF + 1;

			/* ADDED 2026-07-20, mirrored from create_rr_button.txt Action 2. */
			if(sourceTypeF == "Receiving Missing")
			{
				targetSupPOsF2 = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == r.PO_No];
				for each  spoF2 in targetSupPOsF2
				{
					spoF2.Missing_SKUs_Supplier1 = gSkuF;
				}
			}
			else
			{
				/* CHANGED 2026-07-20, mirrored from create_rr_button.txt Action 2 —
				   no new supplier PO created, stamps Damage_SKUs_Supplier1 on the
				   EXISTING supplier PO instead. */
				targetSupPOsDmgF2 = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == r.PO_No];
				for each  spoDmgF2 in targetSupPOsDmgF2
				{
					spoDmgF2.Damage_SKUs_Supplier1 = gSkuF;
				}
			}
		}
	}
	response.put("status","success");
	response.put("created",createdCountF);
	return response;
}

====================================================
CUSTOM FUNCTION 3 SETUP:
  Name: createRRTony
  Arguments: String exceptionId
====================================================

map createRRTony(String exceptionId)
{
	response = Map();
	r = Exceptions[ID == exceptionId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Exception not found.");
		return response;
	}

	groupKeysT = List();
	groupSkuT = Map();
	groupItemT = Map();
	groupSupplierT = Map();
	groupTypeT = Map();
	groupQtyT = Map();
	// ADDED 2026-08-08, mirrored from create_rr_button.txt Action 3 — see
	// createRRMain's own FIXED comment above for the full pairing-format
	// reasoning.
	groupSpareTypeT = Map();
	groupSparePairsT = Map();
	for each  pc in r.Product_Context1
	{
		/* ADDED 2026-07-21 — same repair-tracking gate as createRRMain. */
		if(pc.Type_field == "Damage" && pc.Repairable == "Yes" && pc.Repair_Outcome != "Not Fixed")
		{
			continue;
		}
		gKeyT = pc.SKU + "||" + pc.Type_field;
		if(!groupKeysT.contains(gKeyT))
		{
			groupKeysT.add(gKeyT);
			groupSkuT.put(gKeyT,pc.SKU);
			groupItemT.put(gKeyT,pc.Item);
			groupSupplierT.put(gKeyT,pc.Supplier);
			groupTypeT.put(gKeyT,pc.Type_field);
			groupQtyT.put(gKeyT,0);
			groupSpareTypeT.put(gKeyT,"");
			groupSparePairsT.put(gKeyT,"");
		}
		groupQtyT.put(gKeyT, groupQtyT.get(gKeyT) + ifnull(pc.Qty,0));
		pcQtyRawT = pc.Quantity_of_damage_spare_s + "";
		if(pcQtyRawT != "" && pcQtyRawT != "null")
		{
			// CHANGED 2026-08-08d — see createRRMain's own comment above for the
			// full per-type-qty reasoning.
			pcOtherTextT = pc.Spare_Part_Type_Other + "";
			segsT = pcQtyRawT.toList(",");
			pcSpareTypeT = "";
			pcPairsThisRowT = "";
			for each segT in segsT
			{
				segTrimT = segT.trim();
				segTypeT = segTrimT.getPrefix(":").trim();
				segQtyT = segTrimT.getSuffix(":").trim();
				if(segQtyT == "" || segQtyT == "null")
				{
					segQtyT = "—";
				}
				if(segTypeT == "Others" && pcOtherTextT != "" && pcOtherTextT != "null")
				{
					segTypeT = pcOtherTextT;
				}
				if(pcSpareTypeT == "") { pcSpareTypeT = segTypeT; }
				else { pcSpareTypeT = pcSpareTypeT + ", " + segTypeT; }
				segPairT = segTypeT + ": " + segQtyT;
				if(pcPairsThisRowT == "") { pcPairsThisRowT = segPairT; }
				else { pcPairsThisRowT = pcPairsThisRowT + ", " + segPairT; }
			}
			existingSpareTypeT = groupSpareTypeT.get(gKeyT);
			if(existingSpareTypeT == "") { groupSpareTypeT.put(gKeyT,pcSpareTypeT); }
			else { groupSpareTypeT.put(gKeyT,existingSpareTypeT + ", " + pcSpareTypeT); }
			existingPairT = groupSparePairsT.get(gKeyT);
			if(existingPairT == "") { groupSparePairsT.put(gKeyT,pcPairsThisRowT); }
			else { groupSparePairsT.put(gKeyT,existingPairT + ", " + pcPairsThisRowT); }
		}
	}

	existingSupPairsT = List();
	existingSupRRsT = Tony_Fan_Replacement_Request[Source_Exception_No == r.Exception_No];
	for each  esrT in existingSupRRsT
	{
		for each  ssrowT in esrT.Replacement_Summary
		{
			existingSupPairsT.add(ssrowT.SKU + "||" + esrT.Source_Type);
		}
	}

	createdCountT = 0;
	for each  gKeyT in groupKeysT
	{
		// FIXED 2026-08-07 — same real bug/fix as createRRFenteng above.
		supplierValT = groupSupplierT.get(gKeyT) + "";
		if(supplierValT != "Tony" && !supplierValT.contains("Tony"))
		{
			continue;
		}
		gSkuT = groupSkuT.get(gKeyT);
		gTypeT = groupTypeT.get(gKeyT);
		sourceTypeT = "";
		if(r.Source_Module == "Receiving")
		{
			if(gTypeT == "Damage")
			{
				sourceTypeT = "Receiving Damage";
			}
			else
			{
				sourceTypeT = "Receiving Missing";
			}
		}
		else if(r.Source_Module == "Fulfillment QC")
		{
			sourceTypeT = "QC Failure";
		}
		else
		{
			sourceTypeT = "Management Decision";
		}
		pairKeyT = gSkuT + "||" + sourceTypeT;
		if(existingSupPairsT.contains(pairKeyT))
		{
			continue;
		}
		parentRRNoT = "";
		parentRRsT = Replacement_Request[Source_Exception_No == r.Exception_No];
		for each  prrT in parentRRsT
		{
			if(prrT.Source_Type == sourceTypeT)
			{
				for each  prsRowT in prrT.Replacement_Summary
				{
					if(prsRowT.SKU == gSkuT)
					{
						parentRRNoT = prrT.RR_No;
					}
				}
			}
		}
		if(parentRRNoT != "")
		{
			newSupRRIDT = insert into Tony_Fan_Replacement_Request
			[
				RR_No=parentRRNoT
				RR_Date=zoho.currentdate
				RR_Status="Open"
				Source_Type=sourceTypeT
				Source_Exception_No=r.Exception_No
				Last_Updated=zoho.currenttime
				RR_Item_to_Replace=groupSpareTypeT.get(gKeyT)
				RR_Damage_Qty=groupQtyT.get(gKeyT)
				RR_Spare_Parts=groupSparePairsT.get(gKeyT)
			];
			newSupRRT = Tony_Fan_Replacement_Request[ID == newSupRRIDT];
			newSupRowT = Tony_Fan_Replacement_Request.Replacement_Summary();
			newSupRowT.PR_No=r.Receiving_Line_ID;
			newSupRowT.Supplier=groupSupplierT.get(gKeyT);
			newSupRowT.SKU=gSkuT;
			newSupRowT.Item=groupItemT.get(gKeyT);
			newSupRowT.SO_No=r.Sales_Order;
			newSupRowT.Original_PO_No=r.PO_No;
			newSupRowT.Priority=r.Priority;
			newSupRowT.RR_Qty=groupQtyT.get(gKeyT);
			newSupRRT.Replacement_Summary.insert(newSupRowT);
			createdCountT = createdCountT + 1;

			/* ADDED 2026-07-20, mirrored from create_rr_button.txt Action 3. */
			if(sourceTypeT == "Receiving Missing")
			{
				targetSupPOsT2 = Tony_Fan_Purchase_Order[PO_No_Supplier2 == r.PO_No];
				for each  spoT2 in targetSupPOsT2
				{
					spoT2.Missing_SKUs_Supplier2 = gSkuT;
				}
			}
			else
			{
				/* CHANGED 2026-07-20, mirrored from create_rr_button.txt Action 3 —
				   no new supplier PO created, stamps Damage_SKUs_Supplier2 on the
				   EXISTING supplier PO instead. */
				targetSupPOsDmgT2 = Tony_Fan_Purchase_Order[PO_No_Supplier2 == r.PO_No];
				for each  spoDmgT2 in targetSupPOsDmgT2
				{
					spoDmgT2.Damage_SKUs_Supplier2 = gSkuT;
				}
			}
		}
	}
	response.put("status","success");
	response.put("created",createdCountT);
	return response;
}

====================================================
CUSTOM API SETUP (x3) — same pattern as pr_approve_po_custom_api.txt/
acknowledge_po_custom_api.txt:
  Creator → Settings → Custom APIs → New Custom API
  API 1: name "create_rr_main"     -> Custom Function createRRMain
  API 2: name "create_rr_fenteng"  -> Custom Function createRRFenteng
  API 3: name "create_rr_tony"     -> Custom Function createRRTony
  Method: POST, argument "exceptionId" (String) for each
  IMPORTANT gotcha already hit twice in this project (see pr_approve_po_custom_api.txt
  NOTES): a newly-created Custom API can be left in Draft state — must be explicitly
  Enabled or SDK calls will fail. Also: the Standard response wraps the function's
  returned Map under "result", not "data" — invokeApi() in the widget already checks
  both (see CLAUDE.md Deluge Gotchas).
  After creation, copy each API's public key into UI/EndUser/Exception/app/index.html's
  CUSTOM_API_CREATE_RR_MAIN_KEY / CUSTOM_API_CREATE_RR_FENTENG_KEY /
  CUSTOM_API_CREATE_RR_TONY_KEY (search-and-replace REPLACE_WITH_KEY).
====================================================

NOTES:
- ADDED 2026-07-20, mirrored from create_rr_button.txt's same-day change (see that
  file's own NOTES for full reasoning): Missing_SKUs stamp / new replacement PO
  creation moved from supplier-triggered Approve RR into officer-triggered Create RR,
  across all 3 functions here. `approve_rr_custom_api.txt`'s `approveRRFenteng`/
  `approveRRTony` are now stripped to status + audit-date bookkeeping only. UNTESTED.
- Untested — needs live setup (3 Custom Functions + 3 Custom APIs) and a real test from
  the widget's "Create RR" button. Same coverage gaps as create_rr_button.txt itself
  (single-item / multi-unit-same-SKU / re-click dedup / genuinely-multi-item cases).
- `r.Exception_Status = "Under Review"` mutates a HEADER field on a queried (non-input)
  record — proven-working pattern in this codebase (unlike subform-row mutation, which
  is confirmed unreliable — see receiving_validations_and_damage_missing.txt NOTES).
- Deliberately mirrors create_rr_button.txt's grouping/dedup logic exactly rather than
  reimplementing — any bug fix to that file's 3 Actions needs a matching edit here too.
- BUG caught live 2026-07-13, first paste attempt: `createRRMain`'s `message` line used a
  JS-style ternary (`cond ? a : b`) — Deluge does NOT support ternary expressions at all,
  errored `"Error at line number: 140 Improper Statement"`. Deluge only has `if/else`
  statements, no inline conditional expression syntax. Fixed by building `messageText`
  via a plain `if(createdCount > 0){...}` block first, then `response.put("message",
  messageText)`. Checked the other 2 functions (`createRRFenteng`/`createRRTony`) for
  the same pattern — neither has a ternary, only this one did. Re-paste `createRRMain`.
====================================================

````
