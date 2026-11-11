---
title: "crate_checklist_to_order_aggregation_sync"
source_file: "Deluge Script/crate_checklist_to_order_aggregation_sync.txt"
category: "Fulfillment/Crate/Deluge/_variants/Archive-NEw"
associated_widget: "[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]"
lines: 286
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - order-aggregation
  - pack
  - procurement
  - purchase-order
  - purchase-request
  - qc
---

# crate_checklist_to_order_aggregation_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]
> - **Category:** `Fulfillment/Crate/Deluge/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/crate_checklist_to_order_aggregation_sync.txt`
> - **Lines of Code:** 286
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Crate/Widget/Crate Checklist Widget|Crate Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
CRATE CHECKLIST DONE -> ADD TO ORDER_AGGREGATION1
=====================================================
Goal: Kapag naging "Done" ang "Crating Status" (Field Link Name: Crating_Status1) sa isang
Crate_Checklist record, dapat isama ang item na iyon sa Order_Aggregation1 (Order
Aggregation form) — parehong destinasyon gaya ng mga item na DIREKTANG dumaan mula sa
Checker_Checklist (QC Approved + hindi For Crate), dahil pareho lang silang sasama sa
parehong "dispatch pool" pagdating ng oras.

Isang record per SO ang Order_Aggregation1 (gaya ng ginawa na sa
checker_checklist_qc_approved_sync.txt) — maramihang item ay ROWS lang sa loob ng "Item
Details" grid ng IISANG SO record, hindi hiwalay na record bawat item. Kaya:
  - Kung WALA pang Order_Aggregation1 record sa SO na iyon (kahit mula sa crate o sa
    direktang QC path), gagawa ng bago, may unang item row.
  - Kung MAY existing na: kung BAGONG item pa ito (ibang SKU), idadagdag na BAGONG ROW
    sa Item Details grid nito; kung PAREHONG SKU na ng existing row, ina-UPDATE na lang
    ang laman ng row na iyon (Item_Name/Quantity). Sa parehong sitwasyon, ang mga
    top-level field na may source sa Crate_Checklist (PAC, Order Type, Target Date, PR,
    Delivery Type, Customer details) ay ina-UPDATE rin sa pinakabagong value mula sa
    input — hindi na basta pina-preserve/kinokopya pabalik ang lumang value. (Parehong
    DELETE-then-RE-INSERT approach dahil hindi puwedeng i-update ang subform field sa
    lugar — see [[deluge_creator_gotchas]] point 8 / PAALALA sa
    checker_checklist_qc_approved_sync.txt.)


Field mapping (Crate_Checklist -> Order_Aggregation1):
  Top-level SO record fields (isusulat kapag GAGAWA ng bagong record, AT ina-UPDATE din
  sa pinakabagong value kapag may existing na — hindi na pina-preserve/kinokopya pabalik
  ang lumang value):
    SO           -> SO
    Package_Order -> PAC
    Order_Type   -> ORDER_TYPE
    Target_Delivery_Date -> Target_Date   (UPDATE: dinagdag na ang Target_Delivery_Date
                                           field sa Crate_Checklist form, kasama na sa sync)
    PR_if_any    -> PR
    Dem_if_any   -> DEMO   (UPDATE 2026-07-27: dinagdag na ang "Dem # (if any)" field sa
                            Crate_Checklist form, kasama na sa sync)
    Delivery_Type -> DELIVERY_TYPE
    (walang halaga) -> For_Crate = true  (dahil crate item ito, laging itinatakda TRUE
                                          ang For_Crate ng Order_Aggregation1 record
                                          nito, kahit ibang item sa parehong SO ay hindi
                                          For Crate — pinapahiwatig lang nito na "may
                                          kasamang crated item ang SO na ito")

  Item Details grid row (isusulat sa BAWAT pagtakbo, bago o dagdag na row):
    Item_Name -> Item_Name
    SKU       -> SKU
    Quantity  -> QTY   (text -> number, ginagamit ang .toLong())

  HINDI kasama (walang katapat na field sa Crate_Checklist form, kaya blangko kapag
  GAGAWA ng bagong record galing sa crate path — kinumpirma ng user, tuloy na lang; PERO
  pina-preserve/hindi nire-reset kapag may existing NA record, dahil wala talagang
  paraan ang crate item na i-update ang mga ito):
    - Bin_Location (sa Item Details grid row): wala ring Bin_Location field sa
      Crate_Checklist form (parehong gap na noon pa sa checker_checklist_qc_approved_
      sync.txt's Checker_Checklist->Crate_Checklist mapping, hindi bago dito) — laging
      preserved sa bawat existing row, hindi nire-reset ng crate item.
  (Dispatch_Selected ay laging preserved din — manual-only field ito sa Order_Aggregation1
  mismo, walang source sa kahit anong upstream form.)


WORKFLOW — Crating Done sync to Order Aggregation
-----------------------------------------------------------------
Choose form: Crate_Checklist
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Successful form submission   (nasa grupong "After form submission")
Name the workflow: Crating Done to Order Aggregation Sync

Deluge script:

// ===== FULFILLMENT_STAGE SYNC (dinagdag 2026-07-28): kahit "Pending" pa ang Crating
// Status, ang pagkakaroon na ng Crate_Checklist record para dito ay nangangahulugang
// "To Ship" na ang stage nito sa Sales_Order_Fulfillment — i-update agad. Isang Sales_
// Order_Fulfillment record per item (see so_fulfillment_sync.txt), kaya SO + Item + SKU
// ang batayan ng pagtugma. =====
soValStage = input.SO + "";
skuValStage = input.SKU + "";
itemNameForSOF = input.Item_Name + "";
sofMatches = Sales_Order_Fulfillment[SO_No == soValStage];
for each  sofRec in sofMatches
{
	sofFullList = Sales_Order_Fulfillment[ID == sofRec.ID];
	for each  sofFull in sofFullList
	{
		sofFound = false;
		for each  sofRow in sofFull.Item_Details1
		{
			if(sofRow.Item + "" == itemNameForSOF && sofRow.SKU + "" == skuValStage)
			{
				sofFound = true;
			}
		}
		if(sofFound == true && sofFull.Fulfillment_Stage != "To Ship")
		{
			update sofFull [ Fulfillment_Stage = "To Ship" ];
			info "Fulfillment_Stage updated to To Ship for SO " + soValStage + " / SKU " + skuValStage;
		}
	}
}

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

newRow = Order_Aggregation1.Item_Details();
newRow.Item_Name = input.Item_Name;
newRow.SKU = skuVal;
newRow.QTY = qtyNum;

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
		SO = soVal
		PAC = input.Package_Order
		ORDER_TYPE = input.Order_Type
		Target_Date = input.Target_Delivery_Date
		PR = input.PR_if_any
		DEMO = input.Dem_if_any
		DELIVERY_TYPE = input.Delivery_Type
		For_Crate = true
		Customer_Name = input.Customer_Name
		Customer_Address = input.Customer_Address
		Customer_Type = input.Customer_Type
		Item_Details = rows
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
		r.Item_Name = rowItem.Item_Name;
		r.SKU = rowItem.SKU;
		r.QTY = rowItem.QTY;
		r.Bin_Location = rowItem.Bin_Location;
		r.Select1 = rowItem.Select1;
		existingSku = rowItem.SKU + "";
		if(existingSku == skuVal)
		{
			r.Item_Name = input.Item_Name;
			r.QTY = qtyNum;
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
		SO = soVal
		PAC = input.Package_Order
		ORDER_TYPE = input.Order_Type
		Target_Date = input.Target_Delivery_Date
		For_Crate = true
		PR = input.PR_if_any
		DEMO = input.Dem_if_any
		DELIVERY_TYPE = input.Delivery_Type
		Dispatch_Selected = dispatchSelectedPreserved
		Customer_Name = input.Customer_Name
		Customer_Address = input.Customer_Address
		Customer_Type = input.Customer_Type
		Item_Details = rebuiltRows
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


PAALALA
-------------
1. Bakit laging TRUE ang isinusulat na For_Crate sa Order_Aggregation1: dahil crate item
   ang pinagmulan ng row na ito, ipinapahiwatig na "may kasamang crated item" ang SO na
   ito — kahit magkahalo ang For_Crate ng mga individual na item nito (ang totoong
   per-item na desisyon ay nasa Checker_Checklist/Crate_Checklist pa rin, hindi dito).
   Once true, hindi na ito ibinabalik sa false ng sync na ito (one-way flag, parehong
   pattern gaya ng ibang checkbox trigger sa buong pipeline).
2. Sync-only ito, walang hide/delete sa Crate_Checklist record — parehong desisyon gaya
   ng ginawa sa checker_checklist_qc_approved_sync.txt (2026-07-25, "wag muna hide, okay
   lang kahit di na maghide"). Kung gusto mo itong i-hide sa hinaharap, sabihin mo.
3. Kung sakaling magkaroon pa ng Bin_Location field sa Crate_Checklist form sa
   hinaharap, kailangang i-update ang script na ito para isama sa sync (tingnan ang
   "HINDI kasama" note sa field mapping sa itaas). Target_Delivery_Date at Demo (field
   link name: Dem_if_any) ay kasama na ngayon (2026-07-27 update).
4. UPDATE (2026-07-27): Kapag may existing NA Order_Aggregation1 record sa SO at
   dumating ang isa pang crate item nito (bago o parehong SKU), ina-UPDATE na rin ngayon
   ang top-level fields (PAC, Order Type, Target Date, PR, Demo, Delivery Type, Customer
   details) sa PINAKABAGONG value mula sa kasalukuyang input — hindi na basta pina-
   preserve/kinokopya lang pabalik ang lumang value. Dispatch_Selected pa rin ang laging
   preserved (walang source field kahit saan). Kung PAREHONG SKU ng existing row ang
   kasalukuyang item, ina-UPDATE ang laman ng row na iyon sa halip na mag-skip nang
   walang ginagawa.


PAANO I-TEST
-------------
1. I-save ang workflow sa itaas sa Crate_Checklist form.
2. TEST 1 — unang item ng SO (walang existing Order_Aggregation1 record pa): buksan ang
   isang Crate_Checklist record na may value na sa "Target Delivery Date" at "Dem # (if
   any)", piliin ang "Done" sa Crating Status, i-save. Pumunta sa Order_Aggregation1
   (Order Aggregation) form/report -> dapat may bagong record na, may isang row sa "Item
   Details" grid, naka-check ang "For Crate" (top-level), at kapareho ang "Target
   Delivery Date" at "Demo #" ng Crate_Checklist record na pinagmulan.
3. TEST 2 — pangalawang item, PAREHONG SO: buksan ang ibang Crate_Checklist record na
   PAREHONG SO ng TEST 1 pero ibang SKU/item, piliin ang "Done", i-save. Balikan ang
   Order_Aggregation1 record ng SO na iyon -> dapat DALAWANG row na ang laman ng Item
   Details grid (hindi bagong record).
4. TEST 3 — SO na may kasamang non-crate item na: kung may Order_Aggregation1 record na
   galing muna sa direktang QC (non-crate) path na may Bin Location sa mga row nito, tapos
   dumating ang crate item ng parehong SO (Crating Status = Done), tiyaking NAPRESERVE pa
   rin ang Bin Location ng mga naunang row (hindi na-reset kahit nag-delete+re-insert sa
   likod) — pero NA-UPDATE naman ang ORDER_TYPE/PAC/DELIVERY_TYPE/Target Date/Demo/Customer
   details sa pinakabagong value ng crate item (hindi na dapat parehong-pareho sa lumang
   value kung may pinagbago ka).
5. TEST 4 — pag-edit ng dati nang naidagdag na item: buksan ulit yung Crate_Checklist
   record na ginamit sa TEST 1 (naka-Done na siya), palitan ang Quantity, i-save ulit.
   Balikan ang Order_Aggregation1 record -> dapat NA-UPDATE ang Quantity ng row na iyon
   sa grid (hindi bagong row ang nadagdag, at hindi rin ito basta na-skip).
6. Balikan ang Crate_Checklist report -> mananatili ang record doon (sync-only, walang
   hide/delete sa ngayon, hindi ito bug).
7. Kung may error o mali ang resulta, i-screenshot ang Execution Result / Workflow Logs
   para ma-diagnose.

Sources:
- https://www.zoho.com/deluge/help/miscellaneous/insert-subform-row.html
- https://www.zoho.com/deluge/help/miscellaneous/access-subform-fields.html
- https://www.zoho.com/deluge/help/data-access/add-record.html

````
