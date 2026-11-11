---
title: "crate_checklist_to_order_aggregation_sync"
source_file: "crate_checklist_to_order_aggregation_sync.txt"
category: "Fulfillment/Crate/Deluge"
associated_widget: "[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]"
lines: 161
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - readiness-gate
---

# crate_checklist_to_order_aggregation_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]
> - **Category:** `Fulfillment/Crate/Deluge`
> - **Source File:** `crate_checklist_to_order_aggregation_sync.txt`
> - **Lines of Code:** 161
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
// Ang Form Event ay tatakbo lang PAGKATAPOS ma-save ang record — kaya kailangan pa rin
// ng sariling check dito kung TALAGANG "Done" na ang Crating Status, para hindi ito
// tumakbo kapag ibang field lang ang na-edit o kapag "Pending" pa rin.
if(input.Crating_Status1 != "Done")
{
	info "Crating Status is not Done — skipping Order Aggregation sync.";
	return;
}
soVal = input.SO + "";
skuVal = input.SKU + "";
qtyVal = input.Quantity + "";
qtyNum = 0;
if(qtyVal != "" && qtyVal != "null")
{
	qtyNum = qtyVal.toLong();
}
// ===== FULFILLMENT_STAGE SYNC — "Order Aggregation": ADDED 2026-09-03, per direct
// user instruction ("if done na dapat ang fulfillment stage niya is sa order
// aggregation") — same guarded stage-bump pattern already used elsewhere in this
// pipeline (readiness_gate_release_to_pick1_direct.txt's "Order Readiness"/
// "Picking", pack_to_checker_checklist_sync.txt's "Quality Checking",
// checker_checklist_qc_approved_sync.txt's "Order Aggregation"/"Crate"). Only
// reached once Crating_Status1 is confirmed "Done" (the guard at the very top of
// this file already returned otherwise). Matched per-item on Sales_Order_
// Fulfillment's own Item_Details1 subform (Item_Name + SKU), only updates if not
// already at the target stage. =====
sofMatchesStage = Sales_Order_Fulfillment[SO_No == soVal];
for each  sofRecStage in sofMatchesStage
{
	sofFullListStage = Sales_Order_Fulfillment[ID == sofRecStage.ID];
	for each  sofFullStage in sofFullListStage
	{
		sofFoundStage = false;
		for each  sofRowStage in sofFullStage.Item_Details1
		{
			if(sofRowStage.Item + "" == input.Item_Name && sofRowStage.SKU + "" == skuVal)
			{
				sofFoundStage = true;
			}
		}
		if(sofFoundStage == true && sofFullStage.Fulfillment_Stage != "Order Aggregation")
		{
			update sofFullStage
			[
				Fulfillment_Stage="Order Aggregation"
			];
			info "Fulfillment_Stage updated to Order Aggregation for SO " + soVal + " / SKU " + skuVal;
		}
	}
}
newRow = Order_Aggregation1.Item_Details();
newRow.Item_Name=input.Item_Name;
newRow.SKU=skuVal;
newRow.QTY=qtyNum;
matchingAgg = Order_Aggregation1[SO == soVal];
foundAgg = false;
aggId = 0;
for each  rec in matchingAgg
{
	foundAgg = true;
	aggId = rec.ID;
}
if(foundAgg == false)
{
	// ===== WALA PANG Order_Aggregation1 record sa SO na ito — gumawa ng bago, may
	// kasamang unang item row. For_Crate = true dahil crate item ang pinagmulan nito. =====
	rows = Collection();
	rows.insert(newRow);
	newAggId = insert into Order_Aggregation1
	[
		SO=soVal
		PAC=input.Package_Order
		ORDER_TYPE=input.Order_Type
		Target_Date=input.Target_Delivery_Date
		PR=input.PR_if_any
		DEMO=input.Dem_if_any
		DELIVERY_TYPE=input.Delivery_Type
		For_Crate=true
		Customer_Name=input.Customer_Name
		Customer_Address=input.Customer_Address
		Customer_Type=input.Customer_Type
		Item_Details=rows
		Added_User=zoho.loginuser
	];
	info "Order_Aggregation1 record created for SO " + soVal + " (from Crate), new ID: " + newAggId + ", item " + skuVal + " added.";
}
else
{
	// ===== MAY EXISTING Order_Aggregation1 record na sa SO na ito. Parehong CONFIRMED-
	// safe na DELETE-then-RE-INSERT approach gaya ng checker_checklist_qc_approved_
	// sync.txt — hindi puwedeng i-update ang subform field sa lugar.
	// UPDATE (2026-07-27): sa halip na basta i-preserve (kopyahin pabalik) ang LUMANG
	// halaga ng mga top-level field na parang walang nagbago, kunin na ang
	// PINAKABAGONG value mula sa kasalukuyang input para sa mga field na may source sa
	// Crate_Checklist (PAC, Order Type, Target Date, PR, Demo, Delivery Type, Customer
	// details) — kaya kung may na-edit sa mga field na ito, isasama ito sa update kahit
	// dagdag-row lang ang trigger. Dispatch_Selected lang ang tunay na pina-preserve
	// (manual-only field ito sa Order_Aggregation1 mismo, walang source kahit saan). =====
	fullAgg = Order_Aggregation1[ID == aggId];
	existingRows = List();
	dispatchSelectedPreserved = "";
	for each  fullRec in fullAgg
	{
		existingRows = fullRec.Item_Details;
		dispatchSelectedPreserved = fullRec.Dispatch_Selected;
	}
	// I-rebuild ang bawat existing row gamit ang parehong CONFIRMED-safe paraan
	// (Form.Subform() + field assignment) — iwas gamitin nang direkta yung fetched row
	// objects sa isang bagong insert statement. Kung PAREHONG SKU ng kasalumuyang item
	// ang isang row, i-UPDATE ang laman nito (Item_Name/QTY) sa halip na magdagdag ng
	// duplicate row.
	rebuiltRows = Collection();
	rowUpdated = false;
	for each  rowItem in existingRows
	{
		r = Order_Aggregation1.Item_Details();
		r.Item_Name=rowItem.Item_Name;
		r.SKU=rowItem.SKU;
		r.QTY=rowItem.QTY;
		r.Bin_Location=rowItem.Bin_Location;
		r.Select1=rowItem.Select1;
		existingSku = rowItem.SKU + "";
		if(existingSku == skuVal)
		{
			r.Item_Name=input.Item_Name;
			r.QTY=qtyNum;
			rowUpdated = true;
		}
		rebuiltRows.insert(r);
	}
	if(rowUpdated == false)
	{
		rebuiltRows.insert(newRow);
	}
	delete from Order_Aggregation1[ID == aggId];
	newAggId = insert into Order_Aggregation1
	[
		SO=soVal
		PAC=input.Package_Order
		ORDER_TYPE=input.Order_Type
		Target_Date=input.Target_Delivery_Date
		For_Crate=true
		PR=input.PR_if_any
		DEMO=input.Dem_if_any
		DELIVERY_TYPE=input.Delivery_Type
		Dispatch_Selected=dispatchSelectedPreserved
		Customer_Name=input.Customer_Name
		Customer_Address=input.Customer_Address
		Customer_Type=input.Customer_Type
		Item_Details=rebuiltRows
		Added_User=zoho.loginuser
	];
	if(rowUpdated == true)
	{
		info "Order_Aggregation1 record for SO " + soVal + " updated (from Crate) — item " + skuVal + " row refreshed, top-level fields synced (old ID " + aggId + " deleted, new ID " + newAggId + ").";
	}
	else
	{
		info "Item " + skuVal + " added (from Crate) — Order_Aggregation1 record for SO " + soVal + " recreated (old ID " + aggId + " deleted, new ID " + newAggId + ").";
	}
}

````
