---
title: "PASTE_ApprovePOMain_Production"
source_file: "NEw/PASTE_ApprovePOMain_Production.txt"
category: "Procurement/Purchase Order/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 279
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# PASTE_ApprovePOMain_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Procurement/Purchase Order/Deluge`
> - **Source File:** `NEw/PASTE_ApprovePOMain_Production.txt`
> - **Lines of Code:** 279
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
map approvePOMain(String soNo)
{
	response = Map();
	siblingPRs = Purchase_Request1[Sales_Order == soNo && PR_Approved == false && PR_READY_FOR_PO == true];
	approvedList = "";
	skippedList = "";
	for each  prLoop in siblingPRs
	{
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
		msg = msg + " | Skipped (needs Override Reason): " + skippedList;
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

````
