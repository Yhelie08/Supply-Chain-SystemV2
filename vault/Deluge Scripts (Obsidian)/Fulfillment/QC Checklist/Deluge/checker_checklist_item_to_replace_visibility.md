---
title: "checker_checklist_item_to_replace_visibility"
source_file: "checker_checklist_item_to_replace_visibility.txt"
category: "Fulfillment/QC Checklist/Deluge"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 148
tags:
  - deluge
  - fulfillment
  - pick
  - procurement
  - purchase-order
  - qc
---

# checker_checklist_item_to_replace_visibility

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `Fulfillment/QC Checklist/Deluge`
> - **Source File:** `checker_checklist_item_to_replace_visibility.txt`
> - **Lines of Code:** 148
> - **Tags:** `#deluge`, `#fulfillment`, `#pick`, `#procurement`, `#purchase-order`, `#qc`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
CHECKER_CHECKLIST — SHOW/HIDE DAMAGE DETAIL FIELDS BY "ITEM TO REPLACE"
=====================================================
Goal: Sa Checker_Checklist (Quality Check) form, ang "Item to Replace" dropdown (Field
Link Name: Item_to_Replace, values: "Whole Fixture" / "Spare Parts" / "No damage") ay
dapat mag-show/hide ng DALAWANG kaugnay na field depende sa napiling value:

  - "Whole Fixture" -> IPAKITA ang "Quantity of Damage Items" (Quantity_of_Damage_Items),
                        ITAGO ang "Spare part type" (Spare_part_type, subform/grid)
  - "Spare Parts"    -> ITAGO ang "Quantity of Damage Items",
                        IPAKITA ang "Spare part type"
  - "No damage" (o blangko pa/wala pang napili) -> ITAGO ang dalawa

IBA ITO SA LAHAT NG IBANG SCRIPT SA PROJECT NA ITO: hindi ito record-sync workflow
(walang insert/update/delete ng record) — ito ay FIELD-LEVEL na workflow na
nagpapakita/nagtatago lang ng ibang field sa PAREHONG form. KAILANGAN ng DALAWANG
workflow para gumana ito nang tama sa lahat ng sitwasyon (bagong record, existing
record, at live habang pinipili ang dropdown) — see WORKFLOW 1 at WORKFLOW 2 sa ibaba.

CONFIRMED VIA LIVE TEST (2026-07-27): kapag "On User Input" LANG ang gawa (WORKFLOW 2
sa ibaba), NAKA-SHOW pa rin ang dalawang field kahit blangko/"-Select-" pa ang Item to
Replace sa isang bagong-bukas na form — dahil ang script na iyon ay tumatakbo lang
KAPAG may PAGBABAGO (on change), hindi kapag bagong bukas lang ang form. Kailangan ng
IBANG workflow (Form Event: "Load of the form") para itakda ang tamang unang
visibility bago pa man ma-touch ang dropdown.

HINDI GINAMIT ang Form Builder > Field Properties > Visibility > "Hide field" (yung
built-in toggle sa form design mismo) para itago ang dalawang field bilang default —
may kilalang isyu sa Zoho na kapag doon hinide ang isang field, HINDI na ito
ma-shoshow pabalik gamit ang "show" na Deluge statement (parang permanenteng naka-hide
na). Kaya sa halip, DELUGE SCRIPT lang (dalawang workflow) ang ginamit dito, walang
built-in visibility toggle na ginalaw sa Form Builder.


WORKFLOW 1 — Set initial visibility pag-bukas ng form (Load of the form)
------------------------------------------------------------------------------
Choose form: Checker_Checklist
When to trigger workflow ( Form Event ): Load of the form   (may hiwalay na "On Add" at
"On Edit" block/tab sa loob ng script builder na ito — ILAGAY ANG PAREHONG SCRIPT SA
DALAWA, tingnan ang PAALALA #4)
Name the workflow: Set Initial Damage Detail Visibility on Load

Deluge script (ilagay sa PAREHONG "On Add" at "On Edit" block):

// Parehong logic lang gaya ng WORKFLOW 2 — pero tumatakbo ito PAG-BUKAS ng form (bago
// pa man ma-touch ang dropdown), kaya ito ang nagtatakda ng TAMANG unang visibility:
// blangko sa Add mode (papasok sa "else", ITATAGO ang dalawa), o kung ano na ang
// existing value sa Edit mode (ipapakita ang tamang field agad, kahit hindi pa
// na-touch ang dropdown).
if(Item_to_Replace == "Whole Fixture")
{
	show Quantity_of_Damage_Items;
	hide Spare_part_type;
}
else if(Item_to_Replace == "Spare Parts")
{
	hide Quantity_of_Damage_Items;
	show Spare_part_type;
}
else
{
	hide Quantity_of_Damage_Items;
	hide Spare_part_type;
}


WORKFLOW 2 — Live show/hide habang pinipili ang dropdown (User Input)
------------------------------------------------------------------------------
Choose form: Checker_Checklist
Field: Item_to_Replace
When to trigger workflow ( Form Event ): User input of a field   (hindi "Successful form
submission" — kailangan LIVE/instant ito habang pinipili pa lang, hindi pagkatapos
ma-save)
Name the workflow: Show/Hide Damage Detail Fields by Item to Replace

Deluge script:

// "On User Input" ito sa SARILI niyang field (Item_to_Replace) — bare field name
// (walang "input." prefix), gaya ng opisyal na halimbawa sa Zoho Deluge docs para sa
// ganitong uri ng workflow. "show"/"hide" ay mga STATEMENT/task, hindi function na may
// parenthesis, at walang quotes ang pangalan ng field (link name, hindi displayname).
// Ito lang ang tumatakbo HABANG binabago ang dropdown pagkatapos naka-bukas na ang
// form — WORKFLOW 1 sa itaas ang bahala sa unang/initial na visibility pag-bukas.
if(Item_to_Replace == "Whole Fixture")
{
	show Quantity_of_Damage_Items;
	hide Spare_part_type;
}
else if(Item_to_Replace == "Spare Parts")
{
	hide Quantity_of_Damage_Items;
	show Spare_part_type;
}
else
{
	// Kasama dito ang "No damage" AT ang blangkong/wala pang napiling state.
	hide Quantity_of_Damage_Items;
	hide Spare_part_type;
}


PAALALA
-------------
1. Ang picklist values ng Item_to_Replace mismo (per form definition) ay "Whole Fixture",
   "Spare Parts" (may space, malaking P), at "No damage" (maliit na d) — eksaktong ito
   ang ginamit sa script, kailangang eksakto ring itugma kung magbabago pa ang mga ito sa
   Form Builder.
2. Bakit DALAWANG workflow: ang WORKFLOW 2 ("On User Input") ay tumatakbo lang KAPAG may
   PAGBABAGO sa dropdown, hindi kapag bagong bukas lang ang form — CONFIRMED ito sa live
   test (2026-07-27), naka-show pa rin ang dalawang field sa isang bagong-bukas na form
   kahit blangko/"-Select-" pa ang Item to Replace. Kaya idinagdag ang WORKFLOW 1 ("Load
   of the form") na siyang nagtatakda ng TAMANG unang visibility pag-bukas ng form
   (parehong sa Add at Edit mode).
3. Bakit hindi ginamit ang Form Builder's built-in "Hide field" visibility toggle: may
   kilalang isyu sa Zoho na kapag doon hinide ang field, hindi na ito ma-shoshow pabalik
   ng "show" na Deluge statement. Kaya DELUGE SCRIPT LANG (dalawang workflow) ang
   ginamit, walang built-in visibility na ginalaw sa Form Builder.
4. WORKFLOW 1 ay may HIWALAY na "On Add" at "On Edit" block/tab sa loob ng script
   builder nito (parehong bahagi ng iisang "Load of the form" workflow) — kailangang
   parehong nailagay ang SAME script sa DALAWA, hindi lang sa isa, kundi hindi
   gagana ang isa sa dalawang mode (Add o Edit).


PAANO I-TEST
-------------
1. Sa Checker_Checklist form (Form Builder), gumawa ng WORKFLOW 1 (Form Event: "Load of
   the form") — ilagay ang parehong script sa "On Add" at "On Edit" block.
2. Gumawa ng WORKFLOW 2 — i-click ang "Item to Replace" field -> Field Properties ->
   "On User Input" tab -> i-save ang script doon.
3. Buksan ang isang BAGONG Checker_Checklist record (Add mode), HUWAG pa munang hawakan
   ang Item to Replace -> dapat NAKATAGO na agad ang dalawang field (ito ang na-confirm
   na SIRA bago maidagdag ang WORKFLOW 1).
4. Piliin ang "Whole Fixture" sa Item to Replace -> dapat LUMABAS ang "Quantity of Damage
   Items", at manatiling NAKATAGO ang "Spare part type".
5. Palitan ang dropdown papuntang "Spare Parts" -> dapat mag-switch: MATAGO ang
   "Quantity of Damage Items", LUMABAS ang "Spare part type" (subform/grid).
6. Palitan papuntang "No damage" -> dapat NAKATAGO na ang dalawa. I-save ang record.
7. TEST sa EDIT mode: buksan ulit ang record na ginamit sa TEST 4-6 (naka-"Spare Parts"
   dapat ang huling na-save), BAGO mo pa ma-touch ang dropdown -> dapat TAMA na AGAD ang
   visibility (lumalabas ang Spare part type, nakatago ang Quantity of Damage Items) sa
   pagbukas pa lang, dahil sa WORKFLOW 1's "On Edit" block.
8. Kung may error o mali ang resulta, i-screenshot ang Execution Result / error panel
   para ma-diagnose.

Sources:
- https://www.zoho.com/deluge/help/client-functions/hide-show.html
- https://help.zoho.com/portal/en/kb/creator/developer-guide/workflows/create-and-manage-on-user-input-actions/articles/configure-deluge-script-on-user-input-in-form-workflows
- https://help.zoho.com/portal/en/kb/creator/developer-guide/workflows/create-and-manage-on-load-actions/articles/configure-deluge-script-on-load-in-form-workflows
- https://help.zoho.com/portal/en/community/topic/cant-unhide-a-form-field-hidden-via-builder-field-properties-visibility

````
