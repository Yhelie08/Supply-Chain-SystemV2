---
title: "checker_checklist_qc_approved_sync"
source_file: "Deluge Script/checker_checklist_qc_approved_sync.txt"
category: "Fulfillment/QC Checklist/Deluge/_variants/Archive-NEw"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 638
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
  - supplier-portal
---

# checker_checklist_qc_approved_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `Fulfillment/QC Checklist/Deluge/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/checker_checklist_qc_approved_sync.txt`
> - **Lines of Code:** 638
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#readiness-gate`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
CHECKER_CHECKLIST QC APPROVED/REJECTED -> CRATE_CHECKLIST, ORDER_AGGREGATION1, o EXCEPTION_CONTROL1
=====================================================
Goal: Depende sa "QC Status" (Field Link Name: QC_Status) sa isang Checker_Checklist
(Quality Check) record, dapat mag-sync papunta sa isa sa TATLONG posibleng destinasyon:

  - Approved + For_Crate == true  -> sync sa Crate_Checklist (Crate Checklist form)
  - Approved + For_Crate == false -> sync sa Order_Aggregation1 (Order Aggregation form)
  - Rejected                      -> sync sa Exception_Control1 (Exception Control form)
                                     (UPDATE 2026-07-27, bagong branch)

HINDI dinedelete ang Checker_Checklist record — SYNC lang ito, walang hide/delete
sa ngayon. Sinubukan naming dagdagan ito ng hide-not-delete (2026-07-25, katulad
ng ibang stages ng pipeline), pero nagkaroon ng problema dahil sa "QC_Status"
mismo bilang basehan ng criteria (blangko pa ang QC_Status ng mga bagong dating
record galing Pack, kaya posibleng natago rin sila nang hindi sinasadya) — sa
halip na ayusin pa ito, sinabi ng user na huwag muna: "wag muna hide. okay na
yan okay lang kahit di na maghide." Kaya BINAWI na ang buong hide logic (yung
"Synced_Out" checkbox na dating idinagdag) — sync-only ulit, gaya ng
readiness_gate_release_to_picker.txt. Kung gusto ulit i-explore ang hide dito sa
hinaharap, tingnan ang [[deluge_creator_gotchas]] point 9 para sa dahilan kung
bakit hindi puwedeng "QC_Status is not Approved" ang direktang gamitin.

NOTE sa For_Crate field: wala pang For_Crate field sa Checker_Checklist noong una
kong tiningnan ang form — kinumpirma ng user na dinagdag na niya ito bago gawin
itong script (checkbox, initial value = false). Kung sakaling mapalitan pa ang
field link name nito sa Zoho, kailangang i-update rin dito.


PER-ITEM vs PER-SO — magkaiba ang dalawang destinasyon:
------------------------------------------------------------
- Crate_Checklist: ISANG RECORD PER ITEM, parehong pattern ng Pack/Picker/Pick1/
  Checker_Checklist mismo — matched by SO+SKU+PAC, gaya ng ginawa sa
  pack_to_checker_checklist_sync.txt.
- Order_Aggregation1: ISANG RECORD PER SO — dito nag-iiba, dahil "Item Details" sa
  Order_Aggregation1 ay isang SUBFORM/GRID (maramihang item rows sa loob ng IISANG
  SO record), hindi flat na fields gaya ng ibang forms sa pipeline na ito. Kaya sa
  bawat Checker_Checklist item na Approved + hindi For Crate, hahanapin muna kung
  may existing Order_Aggregation1 record na sa parehong SO — kung meron, isang
  BAGONG ROW lang ang idadagdag sa Item Details grid nito (hindi bagong record);
  kung wala pa, gagawa ng bagong Order_Aggregation1 record na may unang item row.


Field mapping (Checker_Checklist -> Crate_Checklist), kapag For_Crate == true:
  SO               -> SO
  PAC              -> Package_Order
  PR               -> PR_if_any
  RR               -> RR_if_any
  Order_Type       -> Order_Type
  Target_Delivery_Date -> Target_Delivery_Date   (UPDATE 2026-07-27: dinagdag na ang
                                                  Target_Delivery_Date field sa
                                                  Crate_Checklist form, kasama na sa sync)
  Delivery_Type    -> Delivery_Type
  Customer_Name    -> Customer_Name
  Customer_Address -> Customer_Address
  Customer_Type    -> Customer_Type
  Item_Name        -> Item_Name
  SKU              -> SKU
  Quantity         -> Quantity
  Quality_Checker  -> Assigned_Checker   (ASSUMPTION: kung sino ang nag-QC, siya
                                          rin ang lalabas na "Assigned Checker" sa
                                          Crate form, para sa reference lang. Hindi
                                          pa ito kumpirmadong business rule gaya ng
                                          Assign_Packer->Quality_Checker sa Pack
                                          sync — sabihin mo kung mali ito.)
  Image_max_10_JPG_JPEG_PNG -> Photo_Documentation   (UPDATE 2026-07-27: isinama na,
                                                      INSERT block lang — eksaktong
                                                      match ang type=image sa
                                                      dalawang form)
  Video_Upload_max_3_min_30_sec -> Video_Documentation   (parehong INSERT block lang,
                                                          eksaktong match ang
                                                          type=video)

  (Demo ay wala ring katapat na field sa Crate_Checklist, kaya hindi rin ito kasama —
  UPDATE: Target_Delivery_Date ay kasama na ngayon, dahil dinagdag na ito sa
  Crate_Checklist form. Assign_Crater, Crating_Checklist, Crating_Status ay para sa
  crater/checker mismo na pupunuan sa loob ng Crate_Checklist form — hindi bahagi ng
  sync na ito.)


Field mapping (Checker_Checklist -> Order_Aggregation1), kapag For_Crate == false:
  Top-level SO record fields (isusulat kapag GAGAWA ng bagong record, AT ina-UPDATE din
  sa pinakabagong input kapag may existing na — UPDATE 2026-07-27, dating pina-preserve
  lang/kinokopya pabalik ang lumang value; For_Crate at Dispatch_Selected na lang ang
  tunay na pina-preserve, see PAALALA):
    SO               -> SO
    PAC              -> PAC
    Order_Type       -> ORDER_TYPE
    Target_Delivery_Date -> Target_Date
    PR               -> PR
    Demo             -> DEMO
    Delivery_Type    -> DELIVERY_TYPE
    Customer_Name    -> Customer_Name
    Customer_Address -> Customer_Address
    Customer_Type    -> Customer_Type

  Item Details grid row (isusulat sa BAWAT pagtakbo, bago o dagdag na row):
    Item_Name    -> Item_Name
    SKU          -> SKU
    Quantity     -> QTY            (text -> number, ginagamit ang .toLong())
    Bin_Location -> Bin_Location

  (UPDATE 2026-07-25, pagkatapos baguhin ng user ang Order_Aggregation1 form:
  "For_Crate" sa Order_Aggregation1 mismo ay checkbox na ngayon (dati checkboxes
  placeholder), pero hindi pa rin ito ginagalaw ng sync na ito — IBA pa rin ito sa
  For_Crate checkbox ng Checker_Checklist na siyang ginagamit sa branching sa itaas.
  Sabihin mo kung gusto mo itong i-sync/i-configure din. "Added_Time1" field ay
  TINANGGAL na sa form — kaya TINANGGAL na rin ito sa script (dating dot-accessed,
  posibleng mag-error na kung naiwan pa dahil wala na talagang ganoong field, see
  [[deluge_creator_gotchas]] point 3). "Dispatch_Selected" ay bagong field sa
  Section1 (checkbox) — hindi rin bahagi ng sync na ito, pero PINRESERVE ng script
  sa delete+re-insert (see PAALALA) para hindi mawala kapag may bagong item na
  idagdag. "Select1" (displayname "Select", checkbox) sa loob ng grid ang TUNAY na
  "selected" decision checkbox ng Order Aggregation team — ito na ang pinreserve ng
  script sa bawat row (dating "Select", yung checkboxes/Choice1-2-3 placeholder, ay
  hindi na ginagamit/hindi na pinreserve).)


Field mapping (Checker_Checklist -> Exception_Control1), kapag QC_Status == "Rejected":
  Per-item, matched SO+SKU+PAC — parehong UPDATE-or-CREATE pattern gaya ng Crate_Checklist
  branch sa itaas (2026-07-27 general norm sa buong pipeline, see [[project_pipeline_move_pattern]]).
    SO               -> Sales_Order
    SKU              -> SKU
    PAC              -> PAC
    RR               -> RR_No
    PR               -> PR
    Demo             -> Demo1            (IBA ang link name — "Demo1" sa Exception_Control1)
    Order_Type       -> Order_Type
    Delivery_Type    -> DELIVERY_TYPE
    Quality_Checker  -> Checker          (displayname "Checked By")
    Remarks          -> Remarks
    Customer_Name    -> Customer_Name
    Customer_Type    -> Customer_Type
    Customer_Address -> Customer_Address
    Item_to_Replace  -> Item_to_Replace3 (parehong displayname "Item to Replace", pero
                                          ibang link name — values: Whole Fixture/Spare
                                          Parts/No damage sa Checker_Checklist vs Whole
                                          Fixture/Spare Parts LANG sa Exception_Control1,
                                          walang "No damage" option doon; hindi inaasahang
                                          mangyari ito kasama ng Rejected pero posible pa
                                          rin sa maling data entry, see PAALALA)
    Quantity_of_Damage_Items -> Quantity (displayname doon: "Quantity of Damage Items")
    Item_Name        -> Item_Name
    Quantity         -> Qty              (text -> number, .toLong(), gaya ng qtyNum)

  Spare_part_type (SUBFORM/grid, maramihang row posible) -> Item_to_Replace1 +
  Quantity_of_damage_spare_s (FLAT/single field, hindi subform, sa Exception_Control1):
  UNANG ROW LANG ang kinukuha (user's explicit choice 2026-07-27, dahil mismatched ang
  hugis ng dalawang form — grid vs flat field). Kung maraming row ang Spare_part_type,
  yung ibang row ay HINDI isasama sa sync na ito.

  Source_Module -> constant text na "Checker_Checklist (QC Rejected)", para malaman kung
  saan galing ang exception record na ito.

  HINDI kasama (walang source field/manual-only, pupunuan ng exception/rework team mismo
  sa loob ng Exception_Control1 form): Exception_Number, Signature, Rework_Status,
  Supplier, Rework, Status, Affected_Qty, Rework_Type, Modified_By, Modified_Time2,
  Added_Time2.

  Image_max_10_JPG_JPEG_PNG at Video_Upload_max_3_min_30_sec -> HINDI isinama, binawi
  (2026-07-27) matapos sunod-sunod na mabigo ang apat na paraan na sinubukan:
  1. Direktang assignment (Image_max_10_JPG_JPEG_PNG = input.Image_max_10_JPG_JPEG_PNG)
     sa UPDATE block -> error: "Invalid expressions found in update multi-column"
     (parehong klase ng restriction gaya ng subform fields, [[deluge_creator_gotchas]]
     point 8).
  2. Parehong assignment sa INSERT block -> walang error, PERO blangko pa rin sa
     Exception_Control1 (silent failure).
  3. "thisapp.get(path)" gamit ang manually-buong download path -> error: "Variable
     'thisapp' is not defined" (hindi totoong Deluge construct).
  4. I-re-fetch muna ang buong Checker_Checklist record via ID bago basahin ang
     Image/Video field (parehong fix pattern gaya ng bare-subform-variable gotcha) ->
     sinubukan din, tinanggal na rin sa huli.
  Desisyon: manual na lang, gaya ng ginagawa sa LAHAT ng ibang stage ng buong pipeline —
  ang exception/rework team na mismo ang mag-a-upload ulit ng litrato/video sa
  Exception_Control1 kung kailangan nila. Kung gusto pang ituloy ito sa hinaharap, ang
  natitirang di-pa-sinubukang paraan ay ang invokeURL download-then-upload route (Zoho
  Creator API v2.1), na kailangan ng API connection/token — see
  [[deluge_creator_gotchas]] point 13 para sa mga kumpirmadong endpoint format nito.


WORKFLOW — QC Approved sync to Crate or Order Aggregation
-----------------------------------------------------------------
Choose form: Checker_Checklist
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Successful form submission   (nasa grupong "After form submission")
Name the workflow: QC Approved/Rejected to Crate, Order Aggregation, or Exception Sync

Deluge script:

// Ang Form Event ay tatakbo lang PAGKATAPOS ma-save ang record — kaya kailangan pa
// rin ng sariling check dito kung TALAGANG "Approved" o "Rejected" na ang QC_Status,
// para hindi ito tumakbo kapag ibang field lang ang na-edit o kapag blangko pa.
soVal = input.SO + "";
skuVal = input.SKU + "";
pacVal = input.PAC + "";
qtyVal = input.Quantity + "";
qtyNum = 0;
if(qtyVal != "" && qtyVal != "null")
{
	qtyNum = qtyVal.toLong();
}

// ===== FULFILLMENT_STAGE SYNC (dinagdag 2026-07-28): kahit ano pa ang QC_Status
// (blangko, Approved, o Rejected), ang pagkakaroon na ng Checker_Checklist record para
// dito ay nangangahulugang "Quality Checking" na ang stage nito sa Sales_Order_
// Fulfillment — i-update agad. Isang Sales_Order_Fulfillment record per item (see
// so_fulfillment_sync.txt), kaya SO + Item + SKU ang batayan ng pagtugma. =====
itemNameForSOF = input.Item_Name + "";
sofMatches = Sales_Order_Fulfillment[SO_No == soVal];
for each  sofRec in sofMatches
{
	sofFullList = Sales_Order_Fulfillment[ID == sofRec.ID];
	for each  sofFull in sofFullList
	{
		sofFound = false;
		for each  sofRow in sofFull.Item_Details1
		{
			if(sofRow.Item + "" == itemNameForSOF && sofRow.SKU + "" == skuVal)
			{
				sofFound = true;
			}
		}
		if(sofFound == true && sofFull.Fulfillment_Stage != "Quality Checking")
		{
			update sofFull [ Fulfillment_Stage = "Quality Checking" ];
			info "Fulfillment_Stage updated to Quality Checking for SO " + soVal + " / SKU " + skuVal;
		}
	}
}

if(input.QC_Status == "Rejected")
{
	// ===== REJECTED -> Exception_Control1 =====
	// Per-item, matched SO+SKU+PAC — UPDATE-or-CREATE, parehong pattern gaya ng
	// Crate_Checklist branch sa ibaba. UNANG ROW LANG ng Spare_part_type subform ang
	// kinukuha (user's explicit choice, dahil flat field na lang ito sa Exception_
	// Control1, hindi subform).
	spareTypeVal = "";
	spareQtyVal = "";
	firstSpareRow = true;
	for each  row in input.Spare_part_type
	{
		if(firstSpareRow == true)
		{
			spareTypeVal = row.Spare_Part_Type;
			spareQtyVal = row.Quantity_of_damage_spare_s + "";
			firstSpareRow = false;
		}
	}
	alreadyExists = false;
	for each  existingExceptionRec in Exception_Control1[Sales_Order == soVal && SKU == skuVal && PAC == pacVal]
	{
		alreadyExists = true;
		update existingExceptionRec
		[
			RR_No = input.RR
			PR = input.PR
			Demo1 = input.Demo
			Order_Type = input.Order_Type
			DELIVERY_TYPE = input.Delivery_Type
			Source_Module = "Checker_Checklist (QC Rejected)"
			Checker = input.Quality_Checker
			Remarks = input.Remarks
			Customer_Name = input.Customer_Name
			Customer_Type = input.Customer_Type
			Customer_Address = input.Customer_Address
			Item_to_Replace3 = input.Item_to_Replace
			Quantity = input.Quantity_of_Damage_Items
			Item_to_Replace1 = spareTypeVal
			Quantity_of_damage_spare_s = spareQtyVal
			Item_Name = input.Item_Name
			Qty = qtyNum
		];
		info "Updated existing Exception_Control1 record for SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal;
	}
	if(alreadyExists == false)
	{
		newExceptionId = insert into Exception_Control1
		[
			Sales_Order = soVal
			SKU = skuVal
			PAC = pacVal
			RR_No = input.RR
			PR = input.PR
			Demo1 = input.Demo
			Order_Type = input.Order_Type
			DELIVERY_TYPE = input.Delivery_Type
			Source_Module = "Checker_Checklist (QC Rejected)"
			Checker = input.Quality_Checker
			Remarks = input.Remarks
			Customer_Name = input.Customer_Name
			Customer_Type = input.Customer_Type
			Customer_Address = input.Customer_Address
			Item_to_Replace3 = input.Item_to_Replace
			Quantity = input.Quantity_of_Damage_Items
			Item_to_Replace1 = spareTypeVal
			Quantity_of_damage_spare_s = spareQtyVal
			Item_Name = input.Item_Name
			Qty = qtyNum
		];
		info "Exception_Control1 record created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId;
	}
	return;
}
if(input.QC_Status != "Approved")
{
	info "QC Status is not Approved or Rejected — skipping sync.";
	return;
}

if(input.For_Crate == true)
{
	// ===== APPROVED + FOR CRATE -> Crate_Checklist =====
	// Per-item, matched SO+SKU+PAC. UPDATE-or-CREATE (2026-07-27, was skip-only
	// before): kung existing na ang Crate_Checklist record, ina-UPDATE ang lahat ng
	// field sa pinakabagong input, dahil possible na ma-edit ulit ang Checker_Checklist
	// record (hal. dinagdag lang ang Target Delivery Date matapos ma-Approve) at dapat
	// mag-propagate ang pagbabagong iyon papunta sa Crate_Checklist. Parehong pattern
	// gaya ng pick1_to_pack_sync.txt at pack_to_checker_checklist_sync.txt.
	alreadyExists = false;
	for each  existingRec in Crate_Checklist[SO == soVal && SKU == skuVal && Package_Order == pacVal]
	{
		alreadyExists = true;
		update existingRec
		[
			PR_if_any = input.PR
			RR_if_any = input.RR
			Order_Type = input.Order_Type
			Target_Delivery_Date = input.Target_Delivery_Date
			Delivery_Type = input.Delivery_Type
			Customer_Name = input.Customer_Name
			Customer_Address = input.Customer_Address
			Customer_Type = input.Customer_Type
			Item_Name = input.Item_Name
			Quantity = input.Quantity
			Assigned_Checker = input.Quality_Checker
		];
		info "Updated existing Crate_Checklist record for SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal;
	}
	if(alreadyExists == false)
	{
		// Photo_Documentation/Video_Documentation (Crate_Checklist) ay parehong EKSAKTONG
		// type (image/video) gaya ng Image_max_10_JPG_JPEG_PNG/Video_Upload_max_3_min_30_sec
		// (Checker_Checklist) — kaya isinama dito, INSERT block LANG (file fields hindi
		// puwede sa update multi-column, see [[deluge_creator_gotchas]] point 13).
		newCrateId = insert into Crate_Checklist
		[
			SO = soVal
			Package_Order = pacVal
			PR_if_any = input.PR
			RR_if_any = input.RR
			Order_Type = input.Order_Type
			Target_Delivery_Date = input.Target_Delivery_Date
			Delivery_Type = input.Delivery_Type
			Customer_Name = input.Customer_Name
			Customer_Address = input.Customer_Address
			Customer_Type = input.Customer_Type
			Item_Name = input.Item_Name
			SKU = skuVal
			Quantity = input.Quantity
			Assigned_Checker = input.Quality_Checker
			Photo_Documentation = input.Image_max_10_JPG_JPEG_PNG
			Video_Documentation = input.Video_Upload_max_3_min_30_sec
		];
		info "Crate_Checklist record created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newCrateId;
	}
}
else
{
	// ===== APPROVED + NOT FOR CRATE -> Order_Aggregation1 (isang record per SO,
	// item rows idinadagdag sa Item_Details grid) =====
	// Bagong row na isusulat papunta sa grid, common sa both branches sa ibaba.
	newRow = Order_Aggregation1.Item_Details();
	newRow.Item_Name = input.Item_Name;
	newRow.SKU = skuVal;
	newRow.QTY = qtyNum;
	newRow.Bin_Location = input.Bin_Location;

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
		// ===== WALA PANG Order_Aggregation1 record sa SO na ito — gumawa ng bago,
		// may kasamang unang item row. =====
		rows = Collection();
		rows.insert(newRow);
		newAggId = insert into Order_Aggregation1
		[
			SO = soVal
			PAC = pacVal
			ORDER_TYPE = input.Order_Type
			Target_Date = input.Target_Delivery_Date
			PR = input.PR
			DEMO = input.Demo
			DELIVERY_TYPE = input.Delivery_Type
			Customer_Name = input.Customer_Name
			Customer_Address = input.Customer_Address
			Customer_Type = input.Customer_Type
			Item_Details = rows
		];
		info "Order_Aggregation1 record created for SO " + soVal + ", new ID: " + newAggId + ", item " + skuVal + " added.";
	}
	else
	{
		// ===== MAY EXISTING Order_Aggregation1 record na sa SO na ito. =====
		// CONFIRMED SA LIVE TEST (2026-07-25): hindi pwedeng i-assign ang subform
		// field sa loob ng "update Form[criteria][field=value]" — Zoho error:
		// "The field(s) 'Item_Details' isn't supported for Update MultiColumn
		// task." Kaya sa halip na i-update ang record sa lugar, DELETE-then-
		// RE-INSERT na lang ang buong record.
		// UPDATE (2026-07-27): dati, basta kinokopya lang PABALIK ang LUMANG halaga ng
		// lahat ng top-level field (parang walang nagbago) — kaya kung na-edit ang
		// Checker_Checklist record pagkatapos ma-Approve (hal. dinagdag lang ang Target
		// Delivery Date), hindi ito na-uupdate sa Order_Aggregation1. Ngayon, ang mga
		// field na may live source sa Checker_Checklist (PAC, Order Type, Target Date,
		// PR, Demo, Delivery Type, Customer details) ay kinukuha na sa PINAKABAGONG
		// input sa halip na sa lumang record. For_Crate at Dispatch_Selected LANG ang
		// tunay na pina-preserve: For_Crate dahil manual/independent na desisyon ito sa
		// Order_Aggregation1 mismo (posibleng itinakda ng TRUE ng ibang crate item ng
		// parehong SO via crate_checklist_to_order_aggregation_sync.txt — hindi dapat
		// ma-reset kahit ang kasalukuyang item ay hindi For Crate), at Dispatch_Selected
		// dahil manual-only field ito ng Order Aggregation team, walang source kahit saan.
		fullAgg = Order_Aggregation1[ID == aggId];
		existingRows = List();
		forCratePreserved = "";
		dispatchSelectedPreserved = "";
		for each  fullRec in fullAgg
		{
			existingRows = fullRec.Item_Details;
			forCratePreserved = fullRec.For_Crate;
			dispatchSelectedPreserved = fullRec.Dispatch_Selected;
		}
		// I-rebuild ang bawat existing row gamit ang parehong CONFIRMED-safe paraan
		// (Form.Subform() + field assignment) na ginamit sa "wala pang record" na
		// branch sa itaas. Kung PAREHONG SKU ng kasalukuyang item ang isang row,
		// i-UPDATE ang laman nito (Item_Name/QTY/Bin_Location) sa halip na magdagdag ng
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
				r.Bin_Location = input.Bin_Location;
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
			PAC = pacVal
			ORDER_TYPE = input.Order_Type
			Target_Date = input.Target_Delivery_Date
			For_Crate = forCratePreserved
			PR = input.PR
			DEMO = input.Demo
			DELIVERY_TYPE = input.Delivery_Type
			Dispatch_Selected = dispatchSelectedPreserved
			Customer_Name = input.Customer_Name
			Customer_Address = input.Customer_Address
			Customer_Type = input.Customer_Type
			Item_Details = rebuiltRows
		];
		if(rowUpdated == true)
		{
			info "Order_Aggregation1 record for SO " + soVal + " updated — item " + skuVal + " row refreshed, top-level fields synced (old ID " + aggId + " deleted, new ID " + newAggId + ").";
		}
		else
		{
			info "Item " + skuVal + " added — Order_Aggregation1 record for SO " + soVal + " recreated (old ID " + aggId + " deleted, new ID " + newAggId + ").";
		}
	}
}


PAALALA — bagong pattern ito, mas mataas ang risk, i-test nang maingat
-----------------------------------------------------------------------------
Lahat ng ibang script sa pipeline na ito (Readiness Gate, Picker, Pick1, Pack,
Checker_Checklist) ay "isang record per item" lang, walang subform/grid na
kailangang i-modify. Order_Aggregation1 ang UNA at SATANGGI na script dito na
kailangang magdagdag ng row sa isang subform ng IBANG record (hindi yung sarili
niyang "input" record).

Ang UNANG bersyon ng script na ito ay gumamit ng "existingRows.insert(newRow);
update Order_Aggregation1[ID==aggId][ Item_Details = existingRows ]" — CONFIRMED
NA HINDI GUMAGANA ito sa live test (2026-07-25), Zoho error: "The field(s)
'Item_Details' isn't supported for Update MultiColumn task." Zoho Creator
simply does not allow assigning/replacing a subform field through the normal
update-multiple-fields statement, kahit gumagana ito para sa lahat ng ibang
(non-subform) fields sa buong codebase na ito.

FIX: sa halip na i-update ang subform sa lugar, DELETE-then-RE-INSERT na lang
ang buong Order_Aggregation1 record kada bagong item — parehong 100% confirmed-
safe na building blocks lang ang ginamit dito (delete, saka insert-into-may-
kasamang-subform-via-Collection(), pareho nang ginagamit at gumagana sa ibang
parts ng script na ito).

TRADE-OFF na dapat malaman: MAGBABAGO ang ID ng Order_Aggregation1 record
TUWING may bagong item na idadagdag sa parehong SO (dahil delete+re-insert, hindi
totoong "update" sa lugar). Kung may nakabukas na tab/link sa lumang record na
iyon, mag-e-error na iyon pagkatapos. Wala pang ibang script sa codebase na ito
na umaasa sa Order_Aggregation1's record ID, kaya safe muna ito — pero kung sa
hinaharap ay magkakaroon ng ibang form/script na magre-reference sa ID na iyon,
kailangan nating pag-usapan ulit ito.

UPDATE (2026-07-27) — parehong fix na inilapat sa Crate_Checklist branch AT sa
Order_Aggregation1 "existing record" branch (user: "dapat pag may iupdate sa QC mag
uupdate din dapat yan sa papasukan niyang form"):
  - Crate_Checklist branch: dating skip-only ("already exists — skipping creation",
    walang binabago). Ngayon UPDATE-or-CREATE na — kung existing na, ina-UPDATE ang
    lahat ng field sa pinakabagong input.
  - Order_Aggregation1 branch: dating pure-preserve (kinokopya lang PABALIK ang lumang
    halaga ng bawat top-level field, kahit may pagbabago sa Checker_Checklist record).
    Ngayon, ang mga field na may live source sa Checker_Checklist (PAC, Order Type,
    Target Date, PR, Demo, Delivery Type, Customer details) ay kinukuha na sa
    kasalukuyang input. For_Crate at Dispatch_Selected LANG ang tunay na pina-preserve:
    For_Crate dahil posibleng itinakda na ng TRUE ito ng ibang crate item ng parehong SO
    (galing sa crate_checklist_to_order_aggregation_sync.txt) — hindi dapat ma-reset
    kahit ang item na nagta-trigger dito ngayon ay hindi For Crate; Dispatch_Selected
    dahil manual-only field ito ng Order Aggregation team mismo. Kung PAREHONG SKU na ng
    existing row ang item, ina-UPDATE na rin ang laman ng row na iyon (Item_Name/QTY/
    Bin_Location) sa halip na basta i-skip nang walang ginagawa.

BAGONG BRANCH (2026-07-27) — REJECTED -> Exception_Control1:
  1. Field link name mismatches na dapat tandaan: Exception_Control1 gumagamit ng
     "Sales_Order" (hindi "SO"), "Demo1" (hindi "Demo"), at "DELIVERY_TYPE" (all-caps,
     gaya ng Order_Aggregation1 convention).
  2. Ang "Item_to_Replace" picklist sa Checker_Checklist ay may 3 values ("Whole
     Fixture"/"Spare Parts"/"No damage"), pero sa Exception_Control1 ("Item_to_Replace3")
     DALAWA lang ("Whole Fixture"/"Spare Parts") — walang "No damage". Hindi dapat
     mangyari na "No damage" pa rin ang Item to Replace ng isang Rejected item, pero kung
     mangyari man (maling data entry), posibleng mag-error ang pag-set ng value na wala
     sa allowed list ng target picklist — hindi pa na-live-test ang edge case na ito.
  3. Ang "Spare part type" sa Checker_Checklist ay SUBFORM (maramihang row posible), pero
     flat/single field na lang ito sa Exception_Control1 — UNANG ROW LANG ang kinukuha
     (user's explicit choice), kaya kung may 2+ row ang Spare_part_type, mawawala ang mga
     susunod na row pagdating sa Exception_Control1.
  4. Source_Module ay hard-coded na constant text ("Checker_Checklist (QC Rejected)"),
     hindi galing sa input — para lang malaman kung saang stage nanggaling ang exception.
  5. Parehong UPDATE-or-CREATE (SO+SKU+PAC match) pattern gaya ng ibang branch dito, hindi
     skip-only, consistent sa established norm ng buong pipeline.
  6. Image_max_10_JPG_JPEG_PNG at Video_Upload_max_3_min_30_sec ay HINDI kasama sa sync na
     ito (binawi pagkatapos mabigo ang apat na sinubukang paraan, see field mapping notes
     sa itaas) — manual na lang, gaya ng ibang stage ng pipeline.
  7. BAKIT GUMANA (malamang) SA CRATE_CHECKLIST PERO HINDI SA EXCEPTION_CONTROL1: kapag
     na-verify sa live test, ang teorya ay TYPE MISMATCH ang tunay na dahilan kung bakit
     blangko lumabas dati sa Exception_Control1 — ang Checker_Checklist's Image field ay
     type=image, Video field ay type=video; Crate_Checklist's Photo_Documentation/Video_
     Documentation ay EKSAKTONG type=image/type=video (parehong match), pero Exception_
     Control1's Image_max_10_JPG_JPEG_PNG/Video_Upload_max_3_min_30_sec ay generic
     type="upload file" (HINDI match). Kung gusto pa ring isama ito sa Exception_
     Control1, kailangang PALITAN muna ang TYPE ng dalawang field na iyon doon (sa Form
     Builder) papuntang "image" at "video" specifically, hindi generic "upload file" —
     baka doon pa lang gumana ang parehong direktang assignment. Hindi ko ito ginalaw sa
     script dahil form-design change ito, hindi script change — sabihin mo kung gusto mo
     itong gawin.


PAANO I-TEST
-------------
1. I-save ang workflow sa itaas sa Checker_Checklist (Quality Check) form.
2. TEST 1 — For Crate: buksan ang isang Checker_Checklist record na may value na sa
   "Target Delivery Date" at may naka-upload na Image/Video, i-check ang "For Crate",
   piliin ang "Approved" sa QC Status, i-save. Pumunta sa Crate_Checklist (Crate
   Checklist) form/report -> dapat may bagong record na naka-populate na yung SO/PAC/PR/
   RR/Order Type/Target Delivery Date/Delivery Type/Customer details/Item details, ang
   "Assigned Checker" ay dapat kapareho ng "Quality Checker" ng QC record, AT dapat
   lumabas ang Image sa "Photo Documentation" at Video sa "Video Documentation" (bagong
   pagsubok, dahil eksaktong match ang field type sa dalawang form — i-screenshot kung
   blangko pa rin ito).
3. TEST 2 — Order Aggregation, unang item ng SO: buksan ang ISA pang Checker_
   Checklist record na IBANG SO (walang existing Order_Aggregation1 record pa),
   huwag i-check ang "For Crate", piliin ang "Approved", i-save. Pumunta sa
   Order_Aggregation1 (Order Aggregation) form/report -> dapat may bagong record
   na, may isang row sa "Item Details" grid na naka-populate.
4. TEST 3 — Order Aggregation, pangalawang item ng PAREHONG SO: BAGO mo simulan
   ito, sa Order_Aggregation1 record na ginawa sa TEST 2, i-check muna nang manual
   ang "Dispatch Selected" (top-level) at ang "Select" (yung Select1, checkbox sa
   loob ng unang item row), i-save. Ngayon buksan ang ibang Checker_Checklist
   record na PAREHONG SO ng TEST 2 pero ibang SKU/item, huwag i-check ang "For
   Crate", "Approved", i-save. Balikan ang Order_Aggregation1 record ng SO na
   iyon -> dapat DALAWANG row na ngayon ang laman ng "Item Details" grid (hindi
   bagong record, dalawang row sa IISANG record), AT dapat NAKA-CHECK PA RIN ang
   "Dispatch Selected" at ang "Select" ng unang item row (hindi na-reset kahit
   nag-delete+re-insert ang record sa likod).
5. Balikan ang Checker_Checklist (All Qc Reports) report -> mananatili ang
   record doon (sync-only, walang hide/delete sa ngayon), hindi ito bug.
6. Kung may error o mali ang resulta, i-screenshot ang Execution Result /
   Workflow Logs para ma-diagnose.
7. TEST 4 — UPDATE path, Crate: buksan ulit yung Checker_Checklist record na ginamit sa
   TEST 1 (naka-Approved + For Crate na siya), palitan ang isang field (hal. ituwid ang
   Delivery Type), i-save ulit. Balikan ang Crate_Checklist record na nagawa sa TEST 1 ->
   dapat NA-UPDATE ang field na iyon (hindi bagong record ang nagawa).
8. TEST 5 — UPDATE path, Order Aggregation: buksan ulit yung Checker_Checklist record na
   ginamit sa TEST 2 (naka-Approved na, hindi For Crate), palitan ang Quantity o Order
   Type, i-save ulit. Balikan ang Order_Aggregation1 record -> dapat NA-UPDATE ang row ng
   item na iyon at/o ang top-level field na binago mo (hindi bagong row/record ang
   nagawa), AT dapat NAKA-CHECK PA RIN ang "Dispatch Selected"/"Select" kung sinet mo na
   ito noon (napreserve pa rin, hindi na-reset).
9. TEST 6 — Rejected, bagong record: buksan ang isang Checker_Checklist record na may
   value sa Item to Replace ("Whole Fixture" o "Spare Parts"), Quantity of Damage Items,
   at (kung "Spare Parts") isang row sa Spare part type grid, piliin ang "Rejected" sa
   QC Status, i-save. Pumunta sa Exception_Control1 (Exception Control) form/report ->
   dapat may bagong record na naka-populate na yung SO/SKU/PAC/RR/PR/Demo/Order Type/
   Delivery Type/Customer details/Item Name/Quantity/Checked By/Remarks, at ang Item to
   Replace + Quantity of Damage Items (o Spare Part Type + Quantity kung Spare Parts).
10. TEST 7 — Rejected, UPDATE path: buksan ulit yung Checker_Checklist record sa TEST 6,
    palitan ang isang field (hal. Remarks), i-save ulit. Balikan ang Exception_Control1
    record -> dapat NA-UPDATE ang field na iyon (hindi bagong record ang nagawa).
11. TEST 8 — Multiple spare part rows (kung applicable): kung 2+ row ang nilagay mo sa
    Spare part type grid, tiyaking UNANG ROW LANG ang lumabas sa Exception_Control1
    record (inaasahang gap ito, hindi bug).

Sources:
- https://www.zoho.com/deluge/help/miscellaneous/insert-subform-row.html
- https://www.zoho.com/deluge/help/miscellaneous/access-subform-fields.html
- https://www.zoho.com/deluge/help/data-access/add-record.html
- https://www.zoho.com/deluge/help/datatypes/file-data-type.html

````
