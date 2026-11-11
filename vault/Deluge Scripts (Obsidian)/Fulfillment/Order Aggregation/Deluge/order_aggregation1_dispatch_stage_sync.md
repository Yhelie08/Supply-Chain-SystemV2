---
title: "order_aggregation1_dispatch_stage_sync"
source_file: "order_aggregation1_dispatch_stage_sync.txt"
category: "Fulfillment/Order Aggregation/Deluge"
associated_widget: "[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]"
lines: 113
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
  - qc
  - readiness-gate
---

# order_aggregation1_dispatch_stage_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]
> - **Category:** `Fulfillment/Order Aggregation/Deluge`
> - **Source File:** `order_aggregation1_dispatch_stage_sync.txt`
> - **Lines of Code:** 113
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#qc`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget|Order Aggregation Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
ORDER AGGREGATION -> UPDATE FULFILLMENT_STAGE (FOR DELIVERY)
==============================================================================
Goal: Bahagi ito ng automation ng "Fulfillment Stage" (Fulfillment_Stage) field sa
Sales_Order_Fulfillment (see rin: readiness_gate_release_to_picker.txt,
picker_assign_to_pick_to_pick1.txt, pick1_to_pack_sync.txt, pack_to_checker_checklist_
sync.txt, checker_checklist_qc_approved_sync.txt, crate_checklist_to_order_aggregation_
sync.txt — bawat isa dito may sariling FULFILLMENT_STAGE SYNC block na dinagdag 2026-07-28).

BAKIT HIWALAY NA BAGONG FILE ITO (hindi idinagdag sa checker_checklist_qc_approved_sync.txt
o crate_checklist_to_order_aggregation_sync.txt): yung dalawang script na iyon ang
GUMAGAWA/nag-a-UPDATE ng Order_Aggregation1 record sa pamamagitan ng Deluge
"insert into"/"delete+re-insert", pero WALA silang paraan para malaman kung na-check na ba
ang "Dispatch Selected" — manual field ito, ise-check lang mismo sa loob ng Order_
Aggregation1 form ng Order Aggregation team pagdating ng oras ng dispatch. Kaya kailangan
ng SARILING workflow ang Order_Aggregation1 form mismo (Successful Form Submission), para
ma-detect kapag na-check/na-save ang Dispatch Selected nito.

Order_Aggregation1 ay ISANG RECORD PER SO (may Item_Details GRID na maramihang item row),
kaya IBA ang hugis nito kumpara sa ibang 6 na pipeline form (isang record = isang item
doon) — dito, LAHAT ng row sa grid ay kailangang i-loop, dahil lahat ng item sa loob nito
ay dapat magkaroon ng parehong Fulfillment_Stage kapag na-Dispatch (o "To Ship" habang
hindi pa) ang SO record na ito.

Stage logic:
  UPDATE 2026-07-29, per user: tinanggal na ang "To Ship" sa Fulfillment_Stage picklist,
  at kinumpirma ng user na "For delivery pag nasa order aggregation" — kaya "For Delivery"
  na LAGI ang stage sa sandaling makarating ang item sa Order_Aggregation1, kahit hindi
  pa naka-check ang "Dispatch Selected". Wala nang pagkakaiba/branching batay sa Dispatch
  Selected para sa Fulfillment_Stage — parehong "For Delivery" ang resulta. (Ang Dispatch
  Selected checkbox mismo ay nananatili pa rin bilang totoong manual field sa Order_
  Aggregation1 form para sa ibang gamit ng Order Aggregation team — hindi ito tinanggal,
  Fulfillment_Stage lang ang hindi na nagbabago batay dito.)

Walang hiwalay na form pagkatapos ng Order_Aggregation1 — ang "Dispatch_Selected" checkbox
dito ang HULING signal sa buong pipeline.

BAGONG RECORD BA O NA-EDIT LANG — HINDI PA 100% NATETEST: hindi pa kumpirmado kung ang
"insert into Order_Aggregation1" na ginagawa ng checker_checklist_qc_approved_sync.txt at
crate_checklist_to_order_aggregation_sync.txt (mula sa IBANG script) ay nag-tri-trigger din
ng workflow na ito sa Order_Aggregation1 mismo (chained trigger). Kung HINDI ito automatic
na tumatakbo pagkatapos ma-create ng ibang script, kailangan munang buksan (Edit) at i-Save
nang isang beses ang bagong Order_Aggregation1 record para ma-set ang unang "To Ship" nito
— pagkatapos noon, otomatiko na ang updates sa tuwing ie-edit/Save ito (hal. pag na-check
ang Dispatch Selected). I-TEST ito, at sabihin kung kailangan pang hanapan ng ibang paraan.


PAANO I-SETUP
------------------------------------------------------------------------------------
Choose form: Order Aggregation (form link name: Order_Aggregation1)
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Successful form submission   (nasa grupong "After form submission")
Name the workflow: Sync Fulfillment Stage on Dispatch


Deluge script:
------------------------------------------------

// UPDATE 2026-07-29, per user: "For Delivery" na LAGI ang stage, kahit hindi pa naka-
// check ang Dispatch Selected — tinanggal na ang "To Ship" na value, kaya wala nang
// dahilan para mag-iba ang Fulfillment_Stage batay sa Dispatch_Selected.
soValStage = input.SO + "";
newStageForRows = "For Delivery";

for each  aggRow in input.Item_Details
{
	itemNameForSOF = aggRow.Item_Name + "";
	skuValStage = aggRow.SKU + "";
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
			if(sofFound == true && sofFull.Fulfillment_Stage != newStageForRows)
			{
				update sofFull [ Fulfillment_Stage = newStageForRows ];
				info "Fulfillment_Stage updated to " + newStageForRows + " for SO " + soValStage + " / SKU " + skuValStage;
			}
		}
	}
}


PAANO I-TEST
-------------
1. I-save ang workflow sa itaas sa Order Aggregation (Order_Aggregation1) form.
2. Kumuha ng isang SO na may item na kararating lang sa Order Aggregation (Fulfillment_Stage
   nito sa Sales_Order_Fulfillment ay dapat "Quality Checking" pa, depende kung naka-trigger
   na ang bagong-record case sa itaas) -> buksan (Edit) ang Order_Aggregation1 record nito,
   i-save kahit walang binabago -> tingnan sa Sales_Order_Fulfillment report kung naging
   "For Delivery" na agad ang Fulfillment_Stage ng item(s) na iyon.
3. I-check ang "Dispatch Selected" sa parehong record, i-save -> "For Delivery" pa rin ang
   dapat lumabas (walang binabago ang Dispatch Selected sa Fulfillment_Stage — parehong
   "For Delivery" na ang value bago at pagkatapos i-check ito).
4. Kung may error o mali ang resulta, i-screenshot ang Execution Result log para ma-
   diagnose.
5. Kung LAGING "Quality Checking" pa rin lumalabas kahit pagkatapos ng step 2 (ibig sabihin
   hindi automatic tumatakbo ang workflow na ito pagkatapos i-create ng ibang script ang
   Order_Aggregation1 record) — normal lang na kailangan munang buksan-at-i-save nang isang
   beses ang bagong record, per note sa itaas. Sabihin lang kung gusto mong hanapan pa ng
   paraan para maging automatic din ito kahit hindi pa binubuksan.

Sources:
- https://www.zoho.com/deluge/help/miscellaneous/access-subform-fields.html
- https://www.zoho.com/deluge/help/data-access/update-multiple-fields.html

````
