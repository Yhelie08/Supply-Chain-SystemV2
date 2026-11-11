---
title: "readiness_gate_release_to_picker"
source_file: "readiness_gate_release_to_picker.txt"
category: "Fulfillment/Order Readiness/Deluge"
associated_widget: "[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]"
lines: 201
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
  - readiness-gate
---

# readiness_gate_release_to_picker

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]
> - **Category:** `Fulfillment/Order Readiness/Deluge`
> - **Source File:** `readiness_gate_release_to_picker.txt`
> - **Lines of Code:** 201
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
RELEASE -> SYNC ALL RECORDS UNDER SAME SO TO PICKER
=====================================================
Goal: Pag na-check/naging TRUE ang "Release" field sa KAHIT ISANG Sales Order Readiness
Gate record (matapos i-Update/save), ibig sabihin ready na para sa PICKING ang BUONG SO —
kaya dapat mag-create (o mag-update, kung meron nang existing) ng record sa Picker form
para sa LAHAT ng Readiness Gate record na may PAREHONG SO #, kahit hindi individually
naka-check ang Release ng ibang item nito. Ang Readiness Gate record mismo ay MANANATILI —
hindi ito binubura, kokopyahin/ise-sync lang ang datos nito papuntang Picker.

BAKIT SO ang batayan, hindi Release per-record: hindi kailangang i-check ang Release ng
BAWAT item nang isa-isa — sapat na ang PAGKA-CHECK sa ISANG item para "ma-release" ang
buong SO. Kaya ang query mismo ay batay sa SO # lang (sales_order_number == soVal),
kasama LAHAT ng item nito, may Release man na naka-check o wala pa.

Field mapping (Readiness Gate -> Picker):
  sales_order_number -> SO
  Order_Type          -> Order_Type
  Package_Order       -> PAC
  Demo                -> Demo
  Delivery_Type       -> Delivery_Type
  Target_Delivery_Date -> Target_Delivery_Date
  For_Crate           -> For_Crate
  pr_number           -> PR
  rr_number           -> RR
  customer_name       -> Customer_Name
  customer_type       -> Customer_Type
  customer_address    -> Customer_Address
  Item_Name           -> Item_Name
  SKU                 -> SKU
  Quantity            -> Quantity
  Bin_Location        -> Bin_Location

  (Assign_Picker / Assign_to_Pick / Single_Line sa Picker form ay hindi kasama —
  para yan sa Picker staff na lang pupunuan mismo sa Picker form.)


WORKFLOW — Sync all same-SO Released records to Picker
----------------------------------------------------------
Choose form: Sales Order Readiness Gate
Run when a record is ( Record Event ): Created or Edited
When to trigger workflow ( Form Event ): Successful form submission   (nasa grupong "After form submission")
Name the workflow: Release Records to Picker (by SO)

Deluge script:

// ===== FULFILLMENT_STAGE SYNC (dinagdag 2026-07-28): kahit hindi pa naka-Release, ang
// pagkakaroon na ng Sales Order Readiness Gate record para dito ay nangangahulugang
// "Order Readiness" na ang stage nito sa Sales_Order_Fulfillment — i-update agad, hindi
// hihintayin pang ma-Release. Isang Sales_Order_Fulfillment record per item (see
// so_fulfillment_sync.txt), kaya SO + Item + SKU ang batayan ng pagtugma. =====
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
	// ===== KUNIN LAHAT ng Readiness Gate record sa PAREHONG SO — SO lang ang batayan,
	// hindi kailangang naka-Release na rin bawat isa. Kapag may isang item sa SO na
	// na-mark Released, ibig sabihin ready na para sa PICKING ang BUONG SO, kaya lahat
	// ng natitirang item nito (kahit hindi individually na-check ang Release nila) ay
	// sumasama na rin papuntang Picker. =====
	matchingGateRecords = Sales_Order_Readiness_Gate[sales_order_number == soVal];
	for each  gateRec in matchingGateRecords
	{
		skuVal = gateRec.SKU + "";
		itemNameVal = gateRec.Item_Name + "";
		alreadyExists = false;
		// Dapat magkatugma ang SO + SKU + Item_Name bago ituring na "existing" (update).
		// Kung magkaiba ang SKU o ang Item_Name (hal. parehong blangko/magkaparehong SKU
		// pero ibang item), hindi ito dapat mag-overwrite ng ibang item — dapat bagong
		// Picker record ang gawin para dito.
		for each  rec in Picker[SO == soVal && SKU == skuVal && Item_Name == itemNameVal]
		{
			alreadyExists = true;
			update rec
			[
				Order_Type = gateRec.Order_Type
				PAC = gateRec.Package_Order
				Demo = gateRec.Demo
				Delivery_Type = gateRec.Delivery_Type
				Target_Delivery_Date = gateRec.Target_Delivery_Date
				For_Crate = gateRec.For_Crate
				PR = gateRec.pr_number
				RR = gateRec.rr_number
				Customer_Name = gateRec.customer_name
				Customer_Type = gateRec.customer_type
				Customer_Address = gateRec.customer_address
				Item_Name = gateRec.Item_Name
				SKU = skuVal
				Quantity = gateRec.Quantity
				Bin_Location = gateRec.Bin_Location
			];
		}
		if(alreadyExists == false)
		{
			newPickerID = insert into Picker
			[
				SO = soVal
				Order_Type = gateRec.Order_Type
				PAC = gateRec.Package_Order
				Demo = gateRec.Demo
				Delivery_Type = gateRec.Delivery_Type
				Target_Delivery_Date = gateRec.Target_Delivery_Date
				For_Crate = gateRec.For_Crate
				PR = gateRec.pr_number
				RR = gateRec.rr_number
				Customer_Name = gateRec.customer_name
				Customer_Type = gateRec.customer_type
				Customer_Address = gateRec.customer_address
				Item_Name = gateRec.Item_Name
				SKU = skuVal
				Quantity = gateRec.Quantity
				Bin_Location = gateRec.Bin_Location
			];
			info "Created Picker record " + newPickerID + " for SO " + soVal + " / SKU " + skuVal + " / Item " + itemNameVal;
		}
		else
		{
			info "Updated existing Picker record for SO " + soVal + " / SKU " + skuVal + " / Item " + itemNameVal;
		}
	}
}


BAKIT "Successful form submission" (hindi "User input of a field")
----------------------------------------------------------------------
Ginamit ang "On Success" (matapos ma-save, hindi habang chine-check pa lang yung box) para
hindi maka-gawa ng "phantom" Picker record kapag na-check ni user yung Release pero
na-Cancel pala yung edit bago ma-Update/save.

ISANG ITEM LANG NA-CHECK, LAHAT NG SO SUMASAMA
-------------------------------------------------------------
Hindi na kailangang i-check ang Release ng bawat item nang isa-isa. Ang ISANG item na
na-mark Released ang siyang nagpapa-trigger ng buong process — at dahil ang query mismo
(sales_order_number == soVal) ay hindi na naka-condition sa Release field, kasama na
LAHAT ng natitirang item ng SO na iyon, may sarili nilang Release na naka-check man o
wala pa.

Kung sakaling mangyari rin ang totoong sabay-sabay na bulk mass-update (maraming record
na parehong nag-trigger nang eksaktong magkasabay), maliit na posibilidad na ma-double
ang UPDATE ng ilang record — pero dahil UPDATE-or-CREATE (walang delete), hindi ito
sanhi ng nawawalang datos, sa pinakamalala ay ma-uulit lang ang parehong info log.

DAPAT MAGKATUGMA ANG SO + SKU + ITEM NAME BAGO MA-ITURING NA "EXISTING"
-------------------------------------------------------------
Ang dating tugma ay SO + SKU lang. Problema doon: kung magkaparehong SKU (o pareho
lang blangko) ang dalawang magkaibang item sa parehong SO, yung pangalawang item ay
nago-overwrite/nagsasama sa record ng una imbes na gumawa ng sarili niyang record —
parang na-"block" siya. Ngayon, SO + SKU + Item_Name ang tatlong dapat magkatugma
bago ituring na "existing" record (update). Kaya kahit parehong SO, kung magkaiba ang
Item_Name at/o SKU, gagawa pa rin ito ng BAGONG Picker record — hindi na ito mabo-block
o ma-overwrite ng ibang item.

PANATILIHIN ANG READINESS GATE RECORD
-------------------------------------------------------------
Hindi na binubura ang Readiness Gate record pagkatapos ma-sync sa Picker — nananatili ito
bilang record, magkasama na lang ang datos nito sa Picker.


PAANO I-TEST
-------------
1. I-save ang workflow sa itaas.
2. Sa Sales Order Readiness Gate report, dapat may ilang record na PAREHONG SO (magkaibang
   SKU). Buksan ang IISA lang sa mga iyon, i-check ang "Release", i-click ang Update
   (huwag munang galawin ang Release ng ibang item).
3. Pumunta sa Picker form/report -> dapat may bagong record PER ITEM (kasama yung mga
   item na hindi mo individually na-check ang Release) na naka-populate na yung SO #,
   PR #, RR #, PAC #, Demo #, Order Type, Delivery Type, Target Delivery Date, For
   Crate, Customer Name/Type/Address, at Item details.
4. Balikan ang Sales Order Readiness Gate report -> dapat NANDIYAN PA RIN ang lahat ng
   records ng SO na iyon (hindi nabura, magkasama na lang ang datos sa Picker).
5. Kung may error o mali ang resulta (hal. may hindi na-sync o may duplicate), i-screenshot
   ang Execution Result / Workflow Logs para ma-diagnose.
6. Test ng fix sa blocker: kung may dalawang Gate record sa parehong SO na magkaparehong
   SKU (o parehong blangko) pero magkaibang Item_Name, tiyaking dalawang HIWALAY na
   Picker record ang nagawa (hindi nag-overwrite/nagsama sa isang record).

Sources:
- https://www.zoho.com/deluge/help/data-access/add-record.html

````
