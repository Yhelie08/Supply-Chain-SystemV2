---
title: "pack_to_checker_checklist_sync"
source_file: "pack_to_checker_checklist_sync.txt"
category: "Fulfillment/Pack/Deluge"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 205
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-order
  - qc
  - readiness-gate
---

# pack_to_checker_checklist_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `Fulfillment/Pack/Deluge`
> - **Source File:** `pack_to_checker_checklist_sync.txt`
> - **Lines of Code:** 205
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#qc`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
PACK SEND TO QC -> MOVE RECORD TO CHECKER_CHECKLIST
=====================================================
Goal: Kapag na-check ang "Send to QC" (Field Link Name: Send_to_QC) sa isang Pack record,
dapat awtomatikong gumawa ng bagong record sa Checker_Checklist form (displayname:
"Quality Check"), kasama ang detalye mula sa Pack record na iyon — at ang "Assign Packer"
mismo ang siyang ilalagay bilang "Quality Checker" (kung sino ang nag-pack, siya rin ang
mag-che-check).

UPDATE (2026-07-24): HINDI na dapat i-delete ang Pack record — panatilihin ito, ITAGO
(hide) na lang sa report view gamit ang existing "Send_to_QC" checkbox bilang criteria.
Kaya sa Pack report, dapat magdagdag ng Report Criteria (sa Zoho Creator report designer,
hindi sa Deluge script) na "Send to QC != true" (o "is not checked") para pag na-send to
QC na, mawawala na siya sa (default) view kahit hindi talaga nade-delete ang record.
Parehong pattern gaya ng ginawa natin sa picker_assign_to_pick_to_pick1.txt at
pick1_to_pack_sync.txt.

Per-item ito (isang Pack record = isang item) — walang bulk/cascade logic, parehong pattern
ng pick1_to_pack_sync.txt at picker_assign_to_pick_to_pick1.txt.

Field mapping (Pack -> Checker_Checklist):
  SO               -> SO
  PAC              -> PAC
  PR               -> PR
  Demo             -> Demo
  RR               -> RR
  Delivery_Type    -> Delivery_Type
  Order_Type       -> Order_Type
  Target_Delivery_Date -> Target_Delivery_Date
  For_Crate        -> For_Crate
  Customer_Name    -> Customer_Name
  Customer_Address -> Customer_Address
  Customer_Type    -> Customer_Type
  Item_Name        -> Item_Name
  Quantity         -> Quantity
  SKU              -> SKU
  Bin_Location     -> Bin_Location
  Assign_Packer    -> Quality_Checker   (kung sino ang packer, siya rin ang QC)

  (UPDATE: For_Crate ay dinagdag na sa Checker_Checklist form (checkbox, parehong field
  link name gaya ng nasa Pack) — kasama na ito ngayon sa sync. Date_Checked, ang mga
  checklist field (Fixture Body/LED/Uniformity), Type of Bulb, Kelvin, Color Temperature,
  Item to Replace, Spare part type, Image/Video Upload, Remarks, Signature, at QC Status
  ay para sa quality checker mismo na pupunuan sa loob ng Checker_Checklist form — hindi
  bahagi ng sync na ito.)


WORKFLOW — Move Pack record to Checker_Checklist on Send to QC
--------------------------------------------------------------------
Choose form: Pack
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Successful form submission   (nasa grupong "After form submission")
Name the workflow: Move Pack Record to Checker Checklist

Deluge script:

// ===== FULFILLMENT_STAGE SYNC (dinagdag 2026-07-28): kahit hindi pa naka-Send to QC,
// ang pagkakaroon na ng Pack record para dito ay nangangahulugang "Pack" na ang stage
// nito sa Sales_Order_Fulfillment — i-update agad. Isang Sales_Order_Fulfillment record
// per item (see so_fulfillment_sync.txt), kaya SO + Item + SKU ang batayan ng pagtugma. =====
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
		if(sofFound == true && sofFull.Fulfillment_Stage != "Pack")
		{
			update sofFull [ Fulfillment_Stage = "Pack" ];
			info "Fulfillment_Stage updated to Pack for SO " + soValStage + " / SKU " + skuValStage;
		}
	}
}

// Ang Form Event ay tatakbo lang PAGKATAPOS ma-save ang record — kaya kailangan pa rin
// ng sariling check dito kung TALAGANG naka-check na ang Send_to_QC, para hindi ito
// tumakbo kapag ibang field lang ang na-edit.
if(input.Send_to_QC != true)
{
	info "Send to QC is not checked — skipping Checker_Checklist sync.";
	return;
}
soVal = input.SO + "";
skuVal = input.SKU + "";
pacVal = input.PAC + "";
// ADDED 2026-08-13, real bug found live (SO-16468, Aqi/JF-001) — same collision as
// pick1_to_pack_sync.txt's own 2026-08-13 fix (see that file's comment for the full
// writeup): an RR replacement now deliberately reuses the ORIGINAL item's own
// Package_Order, so SO+SKU+PAC alone can no longer tell the original's Pack->QC row
// apart from its RR replacement's. Widened to also match RR. Guards the "null" +
// "" -> literal string "null" gotcha (see [[deluge_creator_gotchas]]) so a
// genuinely blank RR normalizes to "" here, matching how existing records read.
rrVal = input.RR + "";
if(rrVal == "null")
{
	rrVal = "";
}
// FIXED 2026-08-13, real bug found live (user's own words: "pag nasa pack na and
// isesend na sa qc, iuupdate niya lang yung data na existing na... dapat mangyari
// mag create ng new QC pag kagaling sa Pack") — SO+SKU+PAC+RR alone still wasn't
// enough for an RR item that loops back through Pick/Pack a SECOND time (per
// checker_checklist_qc_sync.txt's own RR-redirect design, this same day): the
// SO+SKU+PAC+RR key is IDENTICAL between the first Checker_Checklist record (the
// one already Approved, which is what triggered the redirect to Order Readiness
// in the first place) and this second Send-to-QC. Matching it just re-updated the
// already-Approved record in place — QC_Status stayed "Approved" with nothing
// fresh for the quality checker to actually review, which is what looked like the
// whole cycle "umiikot lang" (going in circles) with no real second QC checkpoint.
// Added QC_Status=="" to the match: an existing record only counts as "the same
// one" if it's STILL Pending (never reviewed yet) — a record that's already been
// Approved/Rejected is treated as a closed, historical record, not something to
// reopen, so a fresh Send-to-QC always gets its own brand-new Checker_Checklist
// record to actually review.
// ===== UPDATE-or-CREATE — same SO + SKU + PAC + RR + still-Pending QC_Status
// already has a Checker_Checklist record: UPDATE it (lahat ng field) imbes na basta
// i-skip, dahil possible na ma-edit ulit ang Pack record (hal. ituwid ang
// Bin_Location o Quality_Checker) pagkatapos nang unang pag-Send to QC, bago pa ito
// ma-review. Parehong pattern gaya ng pick1_to_pack_sync.txt. =====
alreadyExists = false;
for each  existingRec in Checker_Checklist[SO == soVal && SKU == skuVal && PAC == pacVal && RR == rrVal && QC_Status == ""]
{
	alreadyExists = true;
	update existingRec
	[
		PR = input.PR
		Demo = input.Demo
		RR = input.RR
		Delivery_Type = input.Delivery_Type
		Order_Type = input.Order_Type
		Target_Delivery_Date = input.Target_Delivery_Date
		For_Crate = input.For_Crate
		Customer_Name = input.Customer_Name
		Customer_Address = input.Customer_Address
		Customer_Type = input.Customer_Type
		Item_Name = input.Item_Name
		Quantity = input.Quantity
		Bin_Location = input.Bin_Location
		Quality_Checker = input.Assign_Packer
	];
	info "Updated existing Checker_Checklist record for SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal;
}
if(alreadyExists == false)
{
	// ===== CREATE Checker_Checklist RECORD =====
	newId = insert into Checker_Checklist
	[
		SO = soVal
		PAC = pacVal
		PR = input.PR
		Demo = input.Demo
		RR = input.RR
		Delivery_Type = input.Delivery_Type
		Order_Type = input.Order_Type
		Target_Delivery_Date = input.Target_Delivery_Date
		For_Crate = input.For_Crate
		Customer_Name = input.Customer_Name
		Customer_Address = input.Customer_Address
		Customer_Type = input.Customer_Type
		Item_Name = input.Item_Name
		Quantity = input.Quantity
		SKU = skuVal
		Bin_Location = input.Bin_Location
		Quality_Checker = input.Assign_Packer
	];
	info "Checker_Checklist record created from Pack (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newId;
}
// ===== HINDI na dinedelete ang Pack record. Nananatili ito bilang record — ang
// Send_to_QC checkbox mismo (naka-TRUE na dahil ito na ang nag-trigger ng workflow na
// ito) ang siyang ginagamit bilang Report Criteria sa Pack report para itago/i-hide ito
// sa view kapag na-send to QC na, kahit nasa database pa rin ito. Setup ng criteria ay
// sa Report Designer mismo ng Zoho Creator (hindi kaya ng Deluge script), see WORKFLOW
// notes sa taas. =====


PAANO I-TEST
-------------
1. I-save ang workflow sa itaas sa Pack form.
2. Sa Pack report, magdagdag ng Report Criteria (sa Report Designer, hindi sa script):
   ipakita lang ang mga record kung saan "Send to QC" ay hindi naka-check (di kasama sa
   default view yung mga naka-check na). Ito ang gagawang "hide" — hindi talaga dinedelete.
3. Buksan ang isang existing Pack record na may value na sa "Assign Packer", i-check ang
   "Send to QC", i-click ang Update.
4. Pumunta sa Checker_Checklist (Quality Check) form/report -> dapat may bagong record na
   naka-populate na yung SO/PAC/PR/Demo/RR/Delivery Type/Order Type/Target Delivery Date/
   For Crate/Customer details/Item details, at ang "Quality Checker" ay dapat kapareho ng
   "Assign Packer" ng Pack record.
5. Balikan ang Pack report (yung view na may Report Criteria) -> dapat WALA na doon ang
   record na na-Send to QC (natago lang dahil sa criteria, hindi nabura — makikita mo pa
   rin ito sa buong Pack report na walang criteria, o i-uncheck ulit ang Send to QC nito).
6. Kung may error o mali ang resulta, i-screenshot ang Execution Result / Workflow Logs
   para ma-diagnose.
7. TEST ng UPDATE path: buksan ulit yung Pack record na ginamit sa step 3 (naka-Send to QC
   na siya), palitan ang isang field (hal. ituwid ang Bin Location), i-save ulit. Balikan
   ang Checker_Checklist record na nagawa sa step 4 -> dapat na-UPDATE ang mga field nito
   (hindi bagong record ang nagawa, at hindi rin na-skip ang pag-carry ng bagong value).

````
