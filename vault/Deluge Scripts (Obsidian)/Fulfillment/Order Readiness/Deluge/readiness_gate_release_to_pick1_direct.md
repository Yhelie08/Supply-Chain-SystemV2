---
title: "readiness_gate_release_to_pick1_direct"
source_file: "readiness_gate_release_to_pick1_direct.txt"
category: "Fulfillment/Order Readiness/Deluge"
associated_widget: "[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]"
lines: 284
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
  - readiness-gate
  - zoho-books
---

# readiness_gate_release_to_pick1_direct

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]
> - **Category:** `Fulfillment/Order Readiness/Deluge`
> - **Source File:** `readiness_gate_release_to_pick1_direct.txt`
> - **Lines of Code:** 284
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#readiness-gate`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
READINESS GATE -> DIRETSONG SYNC SA PICK1 (Picker form REMOVED from pipeline)
==============================================================================
Goal: Tinatanggal na ang Picker form sa pipeline — ang "Assign Picker" na dating ginagawa
sa hiwalay na Picker form ay nilipat na sa Sales_Order_Readiness_Gate mismo (bagong
"Assign_Picker" field, values Hendel/Jayvon/Jazz/Edwin + others option). Kaya ang dating
2-hop na "Readiness Gate -> Picker -> Pick1" ay magiging 1-HOP na lang: "Readiness Gate ->
Pick1" DIRETSO — ito ang GAGAWIN NG BAGONG SCRIPT NA ITO.

BAGONG CONDITION: hindi dapat magamit/bukas ang "Release" checkbox hangga't wala pang
napiling "Assign Picker" sa record — kailangan munang mapili kung sinong picker ang mag-
pick bago pumayag mag-Release ang record papuntang Pick1. Ipinatutupad ito sa pamamagitan
ng HIDE/SHOW ng Release field (walang "disable" statement sa Deluge, hide/show lang ang
kaya, see [[deluge_creator_gotchas]] point 11) — nakatago ang Release hangga't blangko ang
Assign_Picker, lumalabas lang ito kapag may napiling picker na.

ITO AY DALAWANG HIWALAY NA WORKFLOW SA SALES_ORDER_READINESS_GATE FORM:
  A. Field visibility gate (Release hidden hangga't blangko ang Assign_Picker) — 2 native
     workflows (Load of the Form + On User Input), parehong script.
  B. Ang aktwal na SYNC (Release == true -> Pick1 diretso, SO-wide cascade, parehong
     business rule gaya ng dating Readiness Gate -> Picker sync).


MAHALAGANG MIGRATION STEPS SA ZOHO (gawin bago i-live ang bago script na ito)
------------------------------------------------------------------------------------
1. I-DISABLE o i-DELETE ang LUMANG "Release Records to Picker (by SO)" workflow sa
   Sales_Order_Readiness_Gate (mula sa readiness_gate_release_to_picker.txt) — kung
   naiwan itong active KASABAY ng bagong workflow B sa ibaba, DOBLE ang mangyayari sa
   bawat Release: gagawa PA RIN ng patay/gamit-nang-Picker record (obsolete) BUKOD sa
   bagong direktang Pick1 record. Isang beses lang dapat, ang bago (B) na lang.
2. Ang `picker_assign_to_pick_to_pick1.txt` (buong workflow sa Picker form) ay MAGIGING
   PATAY/OBSOLETE na — wala nang bagong Picker record na gagawin (Readiness Gate na
   diretso ang pupunta sa Pick1), kaya wala nang magti-trigger sa workflow na iyon. Puwede
   na itong i-disable/tanggalin sa Zoho kapag kumpirmadong gumagana na ang bago.
3. Kung may existing Picker records pa (mula sa lumang flow), sila na lang ang huling
   matitirang gumagamit ng Picker form/report — hindi na dagdagan pa.


WORKFLOW A — Itago ang Release hangga't walang Assign Picker
------------------------------------------------------------------------------------
A1. "On User Input" workflow:
    Choose form: Sales Order Readiness Gate
    Run when a record is ( Record Event ): Created or Edited
    Trigger field: Assign_Picker (Field Properties -> On User Input tab)
    Name the workflow: Show Release on Picker Assigned

    Deluge script:

    if(Assign_Picker != null && Assign_Picker != "")
    {
    	show Release;
    }
    else
    {
    	hide Release;
    }

A2. "Load of the Form" workflow — KAILANGAN DIN ITO, hindi sapat ang On User Input lang
    (per [[deluge_creator_gotchas]] point 11 — hindi tumatakbo ang On User Input sa
    UNANG pagbukas ng record, blangko/naka-shown pa rin ang field bago pa man i-touch):
    Choose form: Sales Order Readiness Gate
    When to trigger workflow ( Form Event ): Load of the Form
    Name the workflow: Set Release Visibility on Load

    "On Add" block AT "On Edit" block — PAREHONG script sa DALAWA:

    if(Assign_Picker != null && Assign_Picker != "")
    {
    	show Release;
    }
    else
    {
    	hide Release;
    }


WORKFLOW B — Release -> diretsong sync sa Pick1 (SO-wide cascade)
------------------------------------------------------------------------------------
Choose form: Sales Order Readiness Gate
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Successful form submission
Name the workflow: Release Records to Pick1 (by SO, direct)

Field mapping (Readiness Gate -> Pick1, kinombinang mapping mula sa dating 2-hop na
Gate->Picker at Picker->Pick1):
  Assign_Picker        -> Picker            (BAGO — dati'y sa Picker form pa lang mismo
                                              pinupunan, ngayon galing na sa Gate)
  sales_order_number   -> SO
  Package_Order        -> Package_Order     (parehong link name, "PAC #" sa Pick1)
  pr_number            -> PR_if_any
  rr_number            -> RR
  Demo                 -> Demo
  Delivery_Type        -> Delivery_Type
  Order_Type            -> Order_Type
  Target_Delivery_Date -> Target_Delivery_Date
  For_Crate            -> For_Crate
  Item_Name            -> Item_Name
  Bin_Location         -> Bin_Location
  SKU                  -> SKU
  Quantity             -> Quantity_to_Pick
  customer_name        -> Customer_Name
  customer_address     -> Customer_Address
  customer_type        -> Customer_Type

  ("Marked"/"Mark Picked" sa Pick1 ay hindi kasama — para sa picker staff mismo na
  che-check pag natapos na niya i-pick, sa loob ng Pick form, gaya ng dati.)

Deluge script:

// ===== FULFILLMENT_STAGE SYNC — "Order Readiness": kahit hindi pa naka-Release, ang
// pagkakaroon na ng Readiness Gate record ay nangangahulugang "Order Readiness" na ang
// stage nito. Unconditional, tumatakbo sa BAWAT save (parehong logic na dati na sa
// readiness_gate_release_to_picker.txt). =====
soValStage = input.sales_order_number + "";
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
		if(sofFound == true && sofFull.Fulfillment_Stage != "Order Readiness")
		{
			update sofFull [ Fulfillment_Stage = "Order Readiness" ];
			info "Fulfillment_Stage updated to Order Readiness for SO " + soValStage + " / SKU " + skuValStage;
		}
	}
}

if(input.Release == true)
{
	soVal = input.sales_order_number + "";
	// ===== CHANGED 2026-09-03, per direct user instruction ("per item lang ang
	// release dapat") — real bug found live: releasing ONE item under an SO (e.g.
	// PAC-16585's Ladale row) was pulling its SIBLING item under the SAME SO (Finn,
	// still Pending/Unassigned, Release never checked) into Pick1 too — the old
	// design below deliberately treated ANY one Release as "the whole SO is ready
	// for picking." Now scoped strictly per item: only Readiness Gate records that
	// are THEMSELVES Release==true sync to Pick1. An unreleased sibling stays
	// exactly where it is (still Pending in Readiness Gate, never appears in Pick)
	// until its OWN Release is checked. Still re-syncs every already-released
	// record in the SO on each save (not just the one just edited) — that part is
	// unchanged/harmless, it just no longer reaches into UNreleased siblings. =====
	matchingGateRecords = Sales_Order_Readiness_Gate[sales_order_number == soVal && Release == true];
	for each  gateRec in matchingGateRecords
	{
		skuVal = gateRec.SKU + "";
		itemNameVal = gateRec.Item_Name + "";
		pacValGate = gateRec.Package_Order + "";
		rrValGate = gateRec.rr_number + "";
		if(rrValGate == "null")
		{
			rrValGate = "";
		}
		alreadyExists = false;
		// WIDENED 2026-08-13, real bug found live (SO-16468, Aqi/JF-001) — SO+SKU+
		// Item_Name alone isn't enough once an RR replacement deliberately reuses the
		// SAME Package_Order as the original item it's replacing (per this same day's
		// checker_checklist_qc_sync.txt redesign — a replacement never gets its own
		// new Books package anymore). Releasing the replacement's own Readiness Gate
		// row silently UPDATED the ORIGINAL's already-Marked (already hidden in the
		// Pick widget) Pick1 record instead of creating a new one — looked like the
		// Release button "did nothing" / the record just disappeared. Widened to also
		// match Package_Order + RR (same fix applied the same day to
		// pick1_to_pack_sync.txt and pack_to_checker_checklist_sync.txt further down
		// this same pipeline, for the identical reason).
		for each  rec in Pick1[SO == soVal && SKU == skuVal && Item_Name == itemNameVal && Package_Order == pacValGate && RR == rrValGate]
		{
			alreadyExists = true;
			update rec
			[
				Picker = gateRec.Assign_Picker
				Package_Order = gateRec.Package_Order
				PR_if_any = gateRec.pr_number
				RR = gateRec.rr_number
				Demo = gateRec.Demo
				Delivery_Type = gateRec.Delivery_Type
				Order_Type = gateRec.Order_Type
				Target_Delivery_Date = gateRec.Target_Delivery_Date
				For_Crate = gateRec.For_Crate
				Item_Name = gateRec.Item_Name
				Bin_Location = gateRec.Bin_Location
				SKU = skuVal
				Quantity_to_Pick = gateRec.Quantity
				Customer_Name = gateRec.customer_name
				Customer_Address = gateRec.customer_address
				Customer_Type = gateRec.customer_type
			];
		}
		if(alreadyExists == false)
		{
			newPickID = insert into Pick1
			[
				SO = soVal
				Picker = gateRec.Assign_Picker
				Package_Order = gateRec.Package_Order
				PR_if_any = gateRec.pr_number
				RR = gateRec.rr_number
				Demo = gateRec.Demo
				Delivery_Type = gateRec.Delivery_Type
				Order_Type = gateRec.Order_Type
				Target_Delivery_Date = gateRec.Target_Delivery_Date
				For_Crate = gateRec.For_Crate
				Item_Name = gateRec.Item_Name
				Bin_Location = gateRec.Bin_Location
				SKU = skuVal
				Quantity_to_Pick = gateRec.Quantity
				Customer_Name = gateRec.customer_name
				Customer_Address = gateRec.customer_address
				Customer_Type = gateRec.customer_type
			];
			info "Created Pick1 record " + newPickID + " for SO " + soVal + " / SKU " + skuVal + " / Item " + itemNameVal;
		}
		else
		{
			info "Updated existing Pick1 record for SO " + soVal + " / SKU " + skuVal + " / Item " + itemNameVal;
		}

		// ===== FULFILLMENT_STAGE SYNC — "Picking": dating ginagawa ito ng Picker form's
		// sariling FULFILLMENT_STAGE SYNC block (picker_assign_to_pick_to_pick1.txt), pero
		// dahil tinanggal na ang Picker form sa gitna, dito na ito ginagawa (parehong
		// destinasyong stage, "Picking"). =====
		sofMatches2 = Sales_Order_Fulfillment[SO_No == soVal];
		for each  sofRec2 in sofMatches2
		{
			sofFullList2 = Sales_Order_Fulfillment[ID == sofRec2.ID];
			for each  sofFull2 in sofFullList2
			{
				sofFound2 = false;
				for each  sofRow2 in sofFull2.Item_Details1
				{
					if(sofRow2.Item + "" == itemNameVal && sofRow2.SKU + "" == skuVal)
					{
						sofFound2 = true;
					}
				}
				if(sofFound2 == true && sofFull2.Fulfillment_Stage != "Picking")
				{
					update sofFull2 [ Fulfillment_Stage = "Picking" ];
					info "Fulfillment_Stage updated to Picking for SO " + soVal + " / SKU " + skuVal;
				}
			}
		}
	}
	// ===== HINDI dinedelete ang Readiness Gate record — nananatili ito, parehong
	// pattern gaya ng dati (sync-only, walang delete). =====
}


PAANO I-TEST
-------------
1. WORKFLOW A muna: i-save ang On User Input (A1) at Load of the Form (A2) workflows sa
   Sales Order Readiness Gate. Buksan ang isang BAGONG record (Add) -> dapat NAKATAGO ang
   "Release" field (blangko pa ang Assign Picker). Piliin ang isang Assign Picker -> dapat
   LUMABAS agad ang "Release" field. I-save, buksan ulit (Edit) -> dapat NAKA-SHOW pa rin
   ang Release dahil may laman na ang Assign Picker. I-clear ang Assign Picker (kung
   puwede) -> dapat magtago ulit ang Release.
2. WORKFLOW B: i-save ang Successful Form Submission workflow. Kumuha ng SO na may ilang
   Readiness Gate record (magkaibang SKU, parehong SO). Piliin ang Assign Picker sa isa sa
   kanila (dapat lumabas na ang Release), i-check ang Release, i-click Update.
3. Pumunta sa Pick1 (Pick) form/report -> dapat may BAGONG record PER ITEM ng SO na iyon
   (kasama yung mga item na hindi mo individually na-check ang Release), naka-populate na
   ang Picker (mula sa Assign Picker ng bawat gateRec), SO, PAC#, PR#, RR#, Demo#, Order
   Type, Delivery Type, Target Delivery Date, For Crate, Item details, at Customer details.
4. Balikan ang Readiness Gate report -> dapat NANDIYAN PA RIN lahat ng record ng SO na
   iyon (hindi nabura).
5. Tingnan ang Sales_Order_Fulfillment report -> dapat "Picking" na ang Fulfillment_Stage
   ng lahat ng item ng SO na iyon.
6. Kung may error o mali ang resulta, i-screenshot ang Execution Result / Workflow Logs
   para ma-diagnose.
7. Kapag kumpirmadong gumagana lahat ng ito, gawin ang MIGRATION STEPS sa itaas (i-disable
   ang lumang Gate->Picker workflow at ang buong Picker-form workflow).

Sources:
- https://www.zoho.com/deluge/help/data-access/add-record.html
- https://www.zoho.com/deluge/help/data-access/update-multiple-fields.html

````
