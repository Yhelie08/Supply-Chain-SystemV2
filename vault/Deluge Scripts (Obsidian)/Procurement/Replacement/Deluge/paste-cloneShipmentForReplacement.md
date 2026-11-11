---
title: "paste-cloneShipmentForReplacement"
source_file: "paste-cloneShipmentForReplacement.txt"
category: "Procurement/Replacement/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 419
tags:
  - deluge
  - fulfillment
  - kanban
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# paste-cloneShipmentForReplacement

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `Procurement/Replacement/Deluge`
> - **Source File:** `paste-cloneShipmentForReplacement.txt`
> - **Lines of Code:** 419
> - **Tags:** `#deluge`, `#fulfillment`, `#kanban`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
map cloneShipmentForReplacement(String rrRecordId)
{
	response = Map();
	r = Replacement_Request[ID == rrRecordId.toLong()];
	if(r == null)
	{
		response.put("status","error");
		response.put("message","Replacement Request not found.");
		return response;
	}
	if(r.Cloned_Shipment_No != null && r.Cloned_Shipment_No != "")
	{
		response.put("status","error");
		response.put("message","A replacement shipment (" + r.Cloned_Shipment_No + ") was already logged for this RR.");
		return response;
	}
	supStatus = "";
	supShipMode = "";
	/* FIXED 2026-08-07, real bug (same class as the already-fixed approvePOMain crash):
	   r.RR_Supplier can be the short name or the full Suppliers-form name depending on
	   record history — confirmed live in Production. Old strict == silently left
	   supStatus blank for the full-name case, unconditionally blocking that RR from
	   ever being logged as shipped. See clone_shipment_for_replacement.txt (the
	   canonical, header-annotated copy of this same function). */
	rrSupplierValCS1 = r.RR_Supplier + "";
	if(rrSupplierValCS1 == "Fenteng" || rrSupplierValCS1.contains("Fenteng"))
	{
		supMatch = Fenteng_Lighting_Replacement_Request[RR_No == r.RR_No];
		for each  sm in supMatch
		{
			supStatus = sm.RR_Status;
			supShipMode = sm.Shipment_Mode;
		}
	}
	else if(rrSupplierValCS1 == "Tony" || rrSupplierValCS1.contains("Tony"))
	{
		supMatchT = Tony_Fan_Replacement_Request[RR_No == r.RR_No];
		for each  smT in supMatchT
		{
			supStatus = smT.RR_Status;
			supShipMode = smT.Shipment_Mode;
		}
	}
	if(supStatus != "Acknowledged" && supStatus != "In Production" && supStatus != "Shipped" && supStatus != "Completed")
	{
		response.put("status","error");
		response.put("message","This RR must be Acknowledged by the supplier (Shipment Mode/Expected Ship Date/ETA filled on their own portal) before a replacement shipment can be logged.");
		return response;
	}
	origPONo = "";
	excMatch = Exceptions[Exception_No == r.Source_Exception_No];
	for each  em in excMatch
	{
		origPONo = em.PO_No;
	}
	if(origPONo == "" && r.Source_Module == "Fulfillment EXC")
	{
		ecMatch = Exception_Control1[Exception_Number == r.Source_Exception_No];
		ecPrNo = "";
		for each  ecm in ecMatch
		{
			ecPrNo = ecm.PR;
		}
		if(ecPrNo != "")
		{
			pr1Match = Purchase_Request1[PR_No == ecPrNo];
			for each  pr1m in pr1Match
			{
				origPONo = pr1m.Link_PO_No;
			}
		}
	}
	/* ADDED 2026-08-12, per user (stock item, no PR/PO ever raised for it) — Fulfillment
	   EXC only (native Damage/Missing RRs below still hard-error on blank origPONo, they
	   always trace to a real PO by construction). CORRECTED 2026-08-12 — Customer now
	   sourced primarily from Sales_Order_Fulfillment (SO_No, Customer is a lookup, "+"
	   for display text) since that's where so_kanban_sync.txt actually puts stock-item
	   data; Pre_Order_FF is zero-stock/Pre-Order-type only, kept as second fallback. See
	   clone_shipment_for_replacement.txt for the full writeup. */
	poFreeCustomerName = "";
	if(origPONo == "" && r.Source_Module == "Fulfillment EXC")
	{
		sofMatchNoPO = Sales_Order_Fulfillment[SO_No == r.RR_SO];
		for each  sofmNoPO in sofMatchNoPO
		{
			// .Customer is a lookup — dot-chain into customer_name for the display text
			sofCustValNoPO = sofmNoPO.Customer.customer_name + "";
			if(sofCustValNoPO != "" && sofCustValNoPO != "null")
			{
				poFreeCustomerName = sofCustValNoPO;
			}
		}
		if(poFreeCustomerName == "")
		{
			preOrderMatchNoPO = Pre_Order_FF[SO == r.RR_SO];
			for each  pomNoPO in preOrderMatchNoPO
			{
				pomCustValNoPO = pomNoPO.Customer_Name + "";
				if(pomCustValNoPO != "" && pomCustValNoPO != "null")
				{
					poFreeCustomerName = pomCustValNoPO;
				}
			}
		}
	}
	else if(origPONo == "")
	{
		response.put("status","error");
		response.put("message","Could not trace back to the original PO — check Source_Exception_No on this RR and PO_No on the linked Exception (or PR on the linked Exception_Control1 item).");
		return response;
	}
	origShip = null;
	if(origPONo != "")
	{
		origPOMatch = Purchase_Order[PO_No == origPONo];
		origPOIdForShip = 0;
		for each  opm in origPOMatch
		{
			origPOIdForShip = opm.ID;
		}
		if(origPOIdForShip == 0)
		{
			response.put("status","error");
			response.put("message","Could not resolve the original Purchase_Order record for " + origPONo + ".");
			return response;
		}
		origShips = Shipments[PO_No == origPOIdForShip];
		highestIdSeen = 0;
		for each  os in origShips
		{
			if(os.ID > highestIdSeen)
			{
				highestIdSeen = os.ID;
				origShip = os;
			}
		}
		if(origShip == null)
		{
			response.put("status","error");
			response.put("message","No existing Shipment found for PO " + origPONo + " to clone from.");
			return response;
		}
	}
	if(origShip != null)
	{
		newShipID = insert into Shipments
		[
			PO_No=origShip.PO_No
			Sales_Order=origShip.Sales_Order
			Customer=origShip.Customer
			Supplier=r.RR_Supplier
			Sales_Owner=origShip.Sales_Owner
			Shipment_Status="Pending"
			Target_Date=origShip.Target_Date
			Supplier_Target_Date=origShip.Supplier_Target_Date
			ETD=r.Expected_Ship_Date
			ETA=r.ETA
			Source_Module=r.Source_Module
			Exception_Number=r.Source_Exception_No
		];
	}
	else
	{
		/* No original PO/Shipment to clone from (stock item) — fresh Shipment instead.
		   PO_No/Sales_Owner/Target_Date/Supplier_Target_Date have no source, left unset. */
		newShipID = insert into Shipments
		[
			Sales_Order=r.RR_SO
			Customer=poFreeCustomerName
			Supplier=r.RR_Supplier
			Shipment_Status="Pending"
			ETD=r.Expected_Ship_Date
			ETA=r.ETA
			Source_Module=r.Source_Module
			Exception_Number=r.Source_Exception_No
		];
	}
	newShipRec = Shipments[ID == newShipID];

	maxShipNum = 0;
	allShipsForNum = Shipments[ID != 0];
	for each  sfn in allShipsForNum
	{
		snVal = sfn.Shipment_No;
		if(snVal != null && snVal.startsWith("SHP-"))
		{
			numPart = snVal.removeFirstOccurence("SHP-");
			numPartInt = 0;
			try
			{
				numPartInt = numPart.toLong();
			}
			catch (e)
			{
				numPartInt = 0;
			}
			if(numPartInt > maxShipNum)
			{
				maxShipNum = numPartInt;
			}
		}
	}
	nextShipNumStr = (maxShipNum + 1) + "";
	padLen = nextShipNumStr.length();
	if(padLen == 1)
	{
		nextShipNumStr = "0000" + nextShipNumStr;
	}
	else if(padLen == 2)
	{
		nextShipNumStr = "000" + nextShipNumStr;
	}
	else if(padLen == 3)
	{
		nextShipNumStr = "00" + nextShipNumStr;
	}
	else if(padLen == 4)
	{
		nextShipNumStr = "0" + nextShipNumStr;
	}
	newShipRec.Shipment_No = "SHP-" + nextShipNumStr;

	newShipLine = Shipments.PO_Shipments();
	newShipLine.SKU=r.RR_SKU;
	newShipLine.Item_Name=r.RR_Item_Name;
	newShipLine.Shipment_QTY=r.RR_Qty_Value;
	newShipLine.PR_No=r.RR_PR_No;
	newShipLine.Ordered_QTY=r.RR_Qty_Value;
	newShipLine.Remaining_QTY=r.RR_Qty_Value;
	if(origShip != null)
	{
		origLineShipMode = "";
		for each  olsm in origShip.PO_Shipments
		{
			if(olsm.PR_No == r.RR_PR_No)
			{
				origLineShipMode = olsm.Shipping_Mode;
			}
		}
		if(origLineShipMode == "")
		{
			for each  olsmFallback in origShip.PO_Shipments
			{
				origLineShipMode = olsmFallback.Shipping_Mode;
			}
		}
		if(origLineShipMode != null && origLineShipMode != "")
		{
			newShipLine.Shipping_Mode=origLineShipMode;
		}
	}
	else if(supShipMode != null && supShipMode != "")
	{
		/* No original PO line to inherit a planned mode from (stock item) — use the
		   supplier's own RR-level pick instead. */
		newShipLine.Shipping_Mode=supShipMode;
	}
	if(r.Source_Module == "Fulfillment EXC" && supShipMode != null && supShipMode != "")
	{
		newShipLine.Shipment_Mode_When_Received=supShipMode;
	}
	newShipRec.PO_Shipments.insert(newShipLine);

	if(r.Source_Module == "Fulfillment EXC")
	{
		origRecvForIdentity = null;
		if(origPONo != "")
		{
			origRecvsForIdentity = Receiving[PO_No == origPONo];
			for each  idRecv in origRecvsForIdentity
			{
				origRecvForIdentity = idRecv;
			}
		}
		/* Customer_Name falls back to poFreeCustomerName (stock-item path, "" when
		   origPONo is populated normally — no behavior change on the existing path). */
		newFulfRecvId = insert into Receiving
		[
			Shipments = newShipID
			SO_No = newShipRec.Sales_Order
			PO_No = origPONo
			Customer_Name = if(origRecvForIdentity != null, origRecvForIdentity.Customer_Name, poFreeCustomerName)
			Supplier = r.RR_Supplier
			Source_Module = "Fulfillment EXC"
			Exception_Number = r.Source_Exception_No
		];
		newFulfRecv = Receiving[ID == newFulfRecvId];
		newFulfLine = Receiving.Receiving_Line_Items();
		newFulfLine.PR_No = r.RR_PR_No;
		newFulfLine.SKU = r.RR_SKU;
		newFulfLine.Item_Name = r.RR_Item_Name;
		newFulfLine.Expected_Qty = r.RR_Qty_Value;
		if(supShipMode != null && supShipMode != "")
		{
			newFulfLine.Shipment_Mode_When_Received = supShipMode;
		}
		newFulfRecv.Receiving_Line_Items.insert(newFulfLine);
		maxRecvNum = 0;
		allRecvsForNum = Receiving[ID != 0];
		for each  rfn in allRecvsForNum
		{
			rnVal = rfn.Receive_No1;
			if(rnVal != null && rnVal.startsWith("RCV-"))
			{
				rnPart = rnVal.removeFirstOccurence("RCV-");
				rnPartInt = 0;
				try
				{
					rnPartInt = rnPart.toLong();
				}
				catch (e)
				{
					rnPartInt = 0;
				}
				if(rnPartInt > maxRecvNum)
				{
					maxRecvNum = rnPartInt;
				}
			}
		}
		nextRecvNumStr = (maxRecvNum + 1) + "";
		recvPadLen = nextRecvNumStr.length();
		if(recvPadLen == 1)
		{
			nextRecvNumStr = "0000" + nextRecvNumStr;
		}
		else if(recvPadLen == 2)
		{
			nextRecvNumStr = "000" + nextRecvNumStr;
		}
		else if(recvPadLen == 3)
		{
			nextRecvNumStr = "00" + nextRecvNumStr;
		}
		else if(recvPadLen == 4)
		{
			nextRecvNumStr = "0" + nextRecvNumStr;
		}
		newFulfRecv.Receive_No1 = "RCV-" + nextRecvNumStr;
		newFulfRecv.Total_Expected_Qty = r.RR_Qty_Value;
		newFulfRecv.Total_Accepted_Qty = 0;
		newFulfRecv.Total_Damage_Qty = 0;
		newFulfRecv.Total_Missing_Qty = 0;
		newFulfRecv.Total_Lines = 1;
		newFulfRecv.Incomplete_Lines = 1;
		newFulfRecv.Ready_for_Fulfillment1 = 0;
		newFulfRecv.Receive_Status = "Pending";
	}
	else
	{
		existingRecvForPO2 = Receiving[PO_No == origPONo];
		if(existingRecvForPO2.count() > 0)
		{
			for each  existingRecvRoute2 in existingRecvForPO2
			{
				update existingRecvRoute2
				[
					Shipments = newShipID
				];
			}
		}
	}
	newShipRec.Receiving_Record_Created = true;

	/* FIXED 2026-08-07 — same real bug/fix as the supStatus branch earlier in this
	   function. */
	rrSupplierValCS2 = r.RR_Supplier + "";
	if(rrSupplierValCS2 == "Fenteng" || rrSupplierValCS2.contains("Fenteng"))
	{
		newSuppRecIDCS = insert into Fenteng_Shipment
		[
			Shipment_No=newShipRec.Shipment_No
			Parent_Shipment_ID=newShipRec.ID + ""
			Added_User1=zoho.loginuser
		];
		newSuppRecCS = Fenteng_Shipment[ID == newSuppRecIDCS];
		for each  shLnCS in newShipRec.PO_Shipments
		{
			newSuppRowCS = Fenteng_Shipment.Supplier1_Shipment_Details();
			newSuppRowCS.SKU=shLnCS.SKU;
			newSuppRowCS.Item_Name=shLnCS.Item_Name;
			newSuppRowCS.PR_No=shLnCS.PR_No;
			newSuppRowCS.RR_No="";
			newSuppRecCS.Supplier1_Shipment_Details.insert(newSuppRowCS);
		}
	}
	else if(rrSupplierValCS2 == "Tony" || rrSupplierValCS2.contains("Tony"))
	{
		newSuppRecIDCST = insert into Tony_Shipment
		[
			Shipment_No=newShipRec.Shipment_No
			Parent_Shipment_ID=newShipRec.ID + ""
			Added_User1=zoho.loginuser
		];
		newSuppRecCST = Tony_Shipment[ID == newSuppRecIDCST];
		for each  shLnCST in newShipRec.PO_Shipments
		{
			newSuppRowCST = Tony_Shipment.Supplier2_Shipment_Details();
			newSuppRowCST.SKU=shLnCST.SKU;
			newSuppRowCST.Item_Name=shLnCST.Item_Name;
			newSuppRowCST.PR_No=shLnCST.PR_No;
			newSuppRowCST.RR_No="";
			newSuppRecCST.Supplier2_Shipment_Details.insert(newSuppRowCST);
		}
	}

	r.Cloned_Shipment_No = newShipRec.Shipment_No;
	response.put("status","success");
	if(origShip != null)
	{
		response.put("message","Replacement Shipment " + newShipRec.Shipment_No + " created for PO " + origPONo + ".");
	}
	else
	{
		response.put("message","Replacement Shipment " + newShipRec.Shipment_No + " created (stock item — no original PO, PO_No/Sales_Owner left blank).");
	}
	response.put("shipmentId", newShipID + "");
	return response;
}

````
