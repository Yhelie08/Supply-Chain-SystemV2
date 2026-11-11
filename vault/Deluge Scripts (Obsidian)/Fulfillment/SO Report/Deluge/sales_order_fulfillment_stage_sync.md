---
title: "sales_order_fulfillment_stage_sync"
source_file: "sales_order_fulfillment_stage_sync.txt"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]"
lines: 34
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

# sales_order_fulfillment_stage_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `sales_order_fulfillment_stage_sync.txt`
> - **Lines of Code:** 34
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#qc`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pick/Widget/Pick Widget|Pick Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
RETIRED — Fulfillment_Stage automation moved into the pipeline forms themselves
==============================================================================
Ang "Load of the Form" approach na dating nasa file na ito ay HINDI GUMAGANA — confirmed
live error sa Zoho Creator editor: "Update MultiColumn task isn't supported for action ''."
Ibig sabihin, hindi pala pwedeng mag-`update`/mag-save ng record sa loob ng "Load of the
Form" workflow — display/UI logic lang (show/hide field, atbp.) ang kaya nito, hindi
pwedeng gamitin para mag-persist ng data.

Sinubukan din bago ito ang Schedule/Custom Function approach — binawi rin ito dahil
Daily/Weekly/Monthly na lang ang pinakamadalas na frequency ng Zoho Creator Schedule
(walang per-minute/hourly), masyadong matagal para sa isang mabilis gumalaw na fulfillment
pipeline.

BAGONG APPROACH (2026-07-28): sa halip na iisang standalone script, idinagdag na lang ang
Fulfillment_Stage update logic sa "Successful Form Submission" workflow ng BAWAT isa sa 7
pipeline forms mismo — pinaka-real-time, dahil sa sandaling gumalaw/ma-save ang isang item
sa isang stage, doon mismo agad ma-a-update ang Fulfillment_Stage nito sa Sales_Order_
Fulfillment. Tingnan ang FULFILLMENT_STAGE SYNC block sa itaas ng "Deluge script:" na
bahagi ng bawat isa sa mga sumusunod na file:

  1. readiness_gate_release_to_picker.txt          -> "Order Readiness"
  2. picker_assign_to_pick_to_pick1.txt             -> "Picking"
  3. pick1_to_pack_sync.txt                          -> "Picking"
  4. pack_to_checker_checklist_sync.txt              -> "Pack"
  5. checker_checklist_qc_approved_sync.txt          -> "Quality Checking"
  6. crate_checklist_to_order_aggregation_sync.txt   -> "To Ship"
  7. order_aggregation1_dispatch_stage_sync.txt (BAGONG FILE, sariling workflow sa
     Order_Aggregation1 form mismo, dahil ito lang ang may access sa "Dispatch Selected")
                                                     -> "To Ship" o "For Delivery"

Wala nang kailangang gawin sa file na ito — panatilihin na lang bilang paalala/history kung
bakit hindi ito ang ginamit na approach. Basahin ang bawat isa sa 7 file sa itaas para sa
kanilang WORKFLOW setup instructions (Choose form / Record Event / Form Event / Name) at
Deluge script.

````
