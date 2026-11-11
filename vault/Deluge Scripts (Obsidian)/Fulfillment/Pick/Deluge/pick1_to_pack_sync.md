---
title: "pick1_to_pack_sync"
source_file: "pick1_to_pack_sync.txt"
category: "Fulfillment/Pick/Deluge"
associated_widget: "[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]"
lines: 204
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
  - purchase-request
  - qc
  - zoho-books
---

# pick1_to_pack_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]
> - **Category:** `Fulfillment/Pick/Deluge`
> - **Source File:** `pick1_to_pack_sync.txt`
> - **Lines of Code:** 204
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
PICK1 MARKED -> MOVE RECORD TO PACK
=====================================================
Goal: Kapag na-check ang "Mark Picked" (Field Link Name: Marked) sa isang Pick1 record,
dapat awtomatikong gumawa ng bagong record sa Pack form, kasama ang detalye mula sa
Pick1 record na iyon (SO, PR, RR, PAC, Demo, Order_Type, Delivery_Type, Target_Delivery_Date,
For_Crate, Customer Name/Type/Address, Item_Name, SKU, Bin_Location, Quantity).

FIX (2026-07-28): ang laman ng Deluge script sa file na ito ay MALI/NA-MIX-UP dati —
literal na kopya pala ito ng laman ng pack_to_checker_checklist_sync.txt (chinicheck ang
input.Send_to_QC, input.PAC, input.Assign_Packer — mga field na WALA sa Pick1 form, at
gumagawa pa ng record sa Checker_Checklist sa halip na sa Pack). Ibig sabihin kung ito
talaga ang naka-live noon sa Zoho, walang gumagana talagang Pick1 -> Pack sync (posibleng
mag-error pa dahil walang "Send_to_QC" field sa Pick1). Na-rewrite na ito para tumugma sa
GOAL/description sa taas — trigger field ay "Marked", destinasyon ay Pack, tamang field
mapping mula sa Pick1's sariling fields (Package_Order, PR_if_any, atbp., hindi PAC/
Assign_Packer na Pack fields).

UPDATE (2026-07-27, bago pa ang fix sa itaas): dinagdag na ang "For_Crate" field sa Pick1
form (checkbox, parehong field link name gaya ng nasa Pack form) — dating wala pa itong
field kaya "left unset" ito noon. Ngayon isinama na sa sync papuntang Pack.

UPDATE (2026-07-24): HINDI na dapat i-delete ang Pick1 record — panatilihin ito, ITAGO
(hide) na lang sa report view gamit ang existing "Marked" checkbox bilang criteria. Kaya
sa Pick1 report, dapat magdagdag ng Report Criteria (sa Zoho Creator report designer,
hindi sa Deluge script) na "Marked != true" (o "is not checked") para pag na-mark Picked
na, mawawala na siya sa (default) view kahit hindi talaga nade-delete ang record. Parehong
pattern gaya ng ginawa natin sa picker_assign_to_pick_to_pick1.txt.

Isang WORKFLOW lang ang kailangan, nasa Pick1 form (Form Builder > Workflow tab).

Field mapping (Pick1 -> Pack):
  SO                    -> SO
  Package_Order         -> PAC
  PR_if_any             -> PR
  RR                    -> RR
  Demo                  -> Demo
  Delivery_Type         -> Delivery_Type
  Order_Type            -> Order_Type
  Target_Delivery_Date  -> Target_Delivery_Date
  For_Crate             -> For_Crate
  Item_Name             -> Item_Name
  Bin_Location          -> Bin_Location
  SKU                   -> SKU
  Quantity_to_Pick      -> Quantity
  Customer_Name         -> Customer_Name
  Customer_Address      -> Customer_Address
  Customer_Type         -> Customer_Type

  ("Picker" sa Pick1 ay hindi kasama — hiwalay na tao/role ang "Assign Packer" sa Pack,
  para sa packer staff na lang mismo pupunuan sa loob ng Pack form, hindi awtomatikong
  kokopyahin mula sa Picker.)


WORKFLOW — Sync to Pack kapag na-mark Picked
-----------------------------------------------
Choose form: Pick1
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Successful form submission   (nasa grupong "After form submission")
Name the workflow: Pick1 Marked to Pack Sync

Deluge script:

// ===== FULFILLMENT_STAGE SYNC (dinagdag 2026-07-28): kahit hindi pa naka-Mark Picked,
// ang pagkakaroon na ng Pick1 record para dito ay nangangahulugang "Picking" na ang
// stage nito sa Sales_Order_Fulfillment — i-update agad. Isang Sales_Order_Fulfillment
// record per item (see so_fulfillment_sync.txt), kaya SO + Item + SKU ang batayan ng
// pagtugma. =====
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
		if(sofFound == true && sofFull.Fulfillment_Stage != "Picking")
		{
			update sofFull [ Fulfillment_Stage = "Picking" ];
			info "Fulfillment_Stage updated to Picking for SO " + soValStage + " / SKU " + skuValStage;
		}
	}
}

// Ang Form Event ay tatakbo lang PAGKATAPOS ma-save ang record — kaya kailangan pa rin
// ng sariling check dito kung TALAGANG naka-check na ang Marked, para hindi ito tumakbo
// kapag ibang field lang ang na-edit.
if(input.Marked != true)
{
	info "Marked (Mark Picked) is not checked — skipping Pack sync.";
	return;
}
soVal = input.SO + "";
skuVal = input.SKU + "";
pacVal = input.Package_Order + "";
// ADDED 2026-08-13, real bug found live (SO-16468, Aqi/JF-001) — an RR replacement
// now deliberately REUSES the same original Package_Order (per this same day's
// checker_checklist_qc_sync.txt redesign, so a replacement never needs its own new
// Books package). That means SO+SKU+PAC alone can no longer tell the ORIGINAL
// item's Pick1->Pack row apart from its RR REPLACEMENT's — both can legitimately
// share all three. Without this, marking the replacement's Pick1 record Picked
// silently UPDATED the original's already-Marked (already hidden) Pack record
// instead of creating its own — looked like "walang nangyari" / the record just
// vanished. Widened to also match RR (blank RR on the original still matches
// blank RR consistently, since both sides are the same stringified input.RR).
// Guards the "null" + "" -> literal string "null" gotcha (see [[deluge_creator_gotchas]]) so a genuinely blank RR normalizes to "" here, matching how existing
// records with a blank RR actually read back, not the literal word "null".
rrVal = input.RR + "";
if(rrVal == "null")
{
	rrVal = "";
}
alreadyExists = false;
for each  existingRec in Pack[SO == soVal && SKU == skuVal && PAC == pacVal && RR == rrVal]
{
	alreadyExists = true;
	update existingRec
	[
		PR = input.PR_if_any
		RR = input.RR
		Demo = input.Demo
		Delivery_Type = input.Delivery_Type
		Order_Type = input.Order_Type
		Target_Delivery_Date = input.Target_Delivery_Date
		For_Crate = input.For_Crate
		Customer_Name = input.Customer_Name
		Customer_Address = input.Customer_Address
		Customer_Type = input.Customer_Type
		Item_Name = input.Item_Name
		Quantity = input.Quantity_to_Pick
		Bin_Location = input.Bin_Location
	];
	info "Updated existing Pack record for SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal;
}
if(alreadyExists == false)
{
	// ===== CREATE Pack RECORD =====
	newId = insert into Pack
	[
		SO = soVal
		PAC = pacVal
		PR = input.PR_if_any
		RR = input.RR
		Demo = input.Demo
		Delivery_Type = input.Delivery_Type
		Order_Type = input.Order_Type
		Target_Delivery_Date = input.Target_Delivery_Date
		For_Crate = input.For_Crate
		Customer_Name = input.Customer_Name
		Customer_Address = input.Customer_Address
		Customer_Type = input.Customer_Type
		Item_Name = input.Item_Name
		SKU = skuVal
		Quantity = input.Quantity_to_Pick
		Bin_Location = input.Bin_Location
	];
	info "Pack record created from Pick1 (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newId;
}

// ===== HINDI na dinedelete ang Pick1 record. Nananatili ito bilang record — ang
// Marked (Mark Picked) checkbox mismo (naka-TRUE na dahil ito na ang nag-trigger ng
// workflow na ito) ang siyang ginagamit bilang Report Criteria sa Pick1 report para
// itago/i-hide ito sa view kapag na-mark Picked na, kahit nasa database pa rin ito.
// Setup ng criteria ay sa Report Designer mismo ng Zoho Creator (hindi kaya ng
// Deluge script), see WORKFLOW notes sa taas. =====


PAANO I-TEST
-------------
1. I-save ang workflow sa itaas sa Pick1 form (palitan ang dating script ng buong bagong
   bersyon — mahalaga ito dahil ang dating laman ay mali/hindi talaga Pick1->Pack).
2. Sa Pick1 report, magdagdag ng Report Criteria (sa Report Designer, hindi sa script):
   ipakita lang ang mga record kung saan "Mark Picked" ay hindi naka-check (di kasama sa
   default view yung mga naka-check na). Ito ang gagawang "hide" — hindi talaga dinedelete.
3. Buksan ang isang existing Pick1 record na may value na sa "PAC #", i-check ang "Mark
   Picked", i-save.
4. Pumunta sa Pack form/report -> dapat may bagong record na lumabas na may parehong
   SO/PAC/PR/RR/Demo/Item details, kasama ang Target Delivery Date at ang For Crate
   (dapat kapareho ng value nito sa Pick1 record na pinagmulan). Dapat BLANGKO pa ang
   "Assign Packer" (para sa packer staff na lang mismo pupunuan).
5. Balikan ang Pick1 report (yung view na may Report Criteria) -> dapat WALA na doon ang
   record na na-mark Picked (natago lang dahil sa criteria, hindi nabura — makikita mo pa
   rin ito sa buong Pick1 report na walang criteria, o i-uncheck ulit ang Marked nito).
6. Kung may error o mali ang resulta, i-screenshot ang Execution Result / Workflow Logs para ma-diagnose.
7. TEST ng UPDATE path: buksan ulit yung Pick1 record na ginamit sa step 3 (naka-Marked na
   siya), palitan ang isang field (hal. i-check ang For Crate kung hindi pa, o ituwid ang
   Bin Location), i-save ulit. Balikan ang Pack record na nagawa sa step 4 -> dapat
   na-UPDATE ang mga field nito (hindi bagong record ang nagawa, at hindi rin na-skip
   ang pag-carry ng bagong value).
8. Test ng fix: kung may dalawang Pick1 record sa parehong SO+PAC pero magkaibang
   Item_Name/SKU, i-check ang "Mark Picked" ng dalawa, tapos tiyaking dalawang HIWALAY
   na Pack record ang nagawa (hindi nag-overwrite sa isa't isa).

Sources:
- https://www.zoho.com/deluge/help/data-access/add-record.html

````
