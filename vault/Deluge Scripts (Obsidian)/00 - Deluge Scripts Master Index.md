---
title: "Deluge Scripts Master Index"
tags:
  - index
  - deluge
  - supply-chain
---

# 📦 Deluge Scripts Master Index

Every Deluge script, workflow and form/report definition in the **Supply Chain App**, as native Obsidian notes.

> [!INFO] How this vault is arranged
> Since 2026-11-06 the vault follows the repository's own module layout, so a note sits at the same path as the file it was generated from:
> `<Module>/<Sub-module>/{Deluge,Widget,IDE}/`.
> Reference documents and shared scripts live under `_Shared/`.
> 
> A `_variants/` folder means two copies of that script DISAGREE and neither was auto-resolved. Get the live Deluge before trusting either.

> [!SUCCESS] Current state (2026-11-12)
> The widgets now run outside Zoho on our own server, behind a login, hosted on Railway. Start with [[00 - Current System]]; what is still Zoho-only is in [[00 - Port Status]]; history in [[00 - Change Log]]; the look in [[00 - Design System]].
> The widget source for every tab is in the repository under `modules/<Section>/<Tab>/`, and each section has a README there listing its forms, reports, functions and workflows.

> [!WARNING] Old file links
> The `file:///C:/Users/Enduser/Desktop/Deluge script/...` links in these notes were written on the original author's computer and do not open here. Use the repository copies: widgets in `modules/`, parsed Zoho specs in `zoho-export/parsed/`.

## 📊 Summary
- **Script & definition notes:** 278
- **Reference documents:** 62
- **Unresolved variants:** 42

---

## 🗂️ Browse by module

### Procurement (117 notes)

#### Dashboard (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Dashboard/Widget/Procurement Dashboard Widget\|Procurement Dashboard Widget]] | `—` | — |

#### Exceptions (3)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Exceptions/IDE/form Exception_Control1\|form Exception_Control1]] | `Exception\form Exception_Control1.txt` | 379 |
| [[Procurement/Exceptions/IDE/list Exception_Control_Report\|list Exception_Control_Report]] | `Exception\list Exception_Control_Report.txt` | 163 |
| [[Procurement/Exceptions/Widget/Procurement Exception Widget\|Procurement Exception Widget]] | `—` | — |

#### Inquiry (25)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Inquiry/Deluge/_variants/Widget-Scripts/create_estimate_custom_api\|create_estimate_custom_api]] | `DMS\DelugeScripts\create_estimate_custom_api.txt` | 450 |
| [[Procurement/Inquiry/Deluge/_variants/Widget-Scripts/create_estimates_button\|create_estimates_button]] | `DMS\DelugeScripts\create_estimates_button.txt` | 476 |
| [[Procurement/Inquiry/Deluge/_variants/Widget-Scripts/create_estimates_inq_action\|create_estimates_inq_action]] | `DMS\DelugeScripts\create_estimates_inq_action.txt` | 354 |
| [[Procurement/Inquiry/Deluge/books_estimate_sync\|books_estimate_sync]] | `production\books_estimate_sync.txt` | 181 |
| [[Procurement/Inquiry/Deluge/create_books_contact\|create_books_contact]] | `create_books_contact.txt` | 264 |
| [[Procurement/Inquiry/Deluge/create_estimate_custom_api\|create_estimate_custom_api]] | `create_estimate_custom_api.txt` | 643 |
| [[Procurement/Inquiry/Deluge/create_estimates_button\|create_estimates_button]] | `create_estimates_button.txt` | 523 |
| [[Procurement/Inquiry/Deluge/create_estimates_inq_action\|create_estimates_inq_action]] | `create_estimates_inq_action.txt` | 442 |
| [[Procurement/Inquiry/Deluge/createEstimateForInquiry\|createEstimateForInquiry]] | `createEstimateForInquiry` | 434 |
| [[Procurement/Inquiry/Deluge/inquiry_autofill_product_image\|inquiry_autofill_product_image]] | `inquiry_autofill_product_image.txt` | 61 |
| [[Procurement/Inquiry/Deluge/inquiry_check_readiness\|inquiry_check_readiness]] | `inquiry_check_readiness.txt` | 274 |
| [[Procurement/Inquiry/Deluge/inquiry_generate_inq_no\|inquiry_generate_inq_no]] | `inquiry_generate_inq_no.txt` | 91 |
| [[Procurement/Inquiry/Deluge/PASTE_createEstimateForInquiry_2026-09-21\|PASTE_createEstimateForInquiry_2026-09-21]] | `PASTE_createEstimateForInquiry_2026-09-21.txt` | 464 |
| [[Procurement/Inquiry/Deluge/PASTE_Stage_Inquiry_Changed\|PASTE_Stage_Inquiry_Changed]] | `PASTE_Stage_Inquiry_Changed.txt` | 245 |
| [[Procurement/Inquiry/Deluge/PASTE_Stage_Inquiry_Changed_Production\|PASTE_Stage_Inquiry_Changed_Production]] | `NEw/PASTE_Stage_Inquiry_Changed_Production.txt` | 236 |
| [[Procurement/Inquiry/Deluge/PASTE_Stage_Supplier_Changed_Production\|PASTE_Stage_Supplier_Changed_Production]] | `NEw/PASTE_Stage_Supplier_Changed_Production.txt` | 154 |
| [[Procurement/Inquiry/Deluge/PASTE_Supplier_Populate_From_INQ\|PASTE_Supplier_Populate_From_INQ]] | `PASTE_Supplier_Populate_From_INQ.txt` | 267 |
| [[Procurement/Inquiry/Deluge/PASTE_Supplier_Populate_From_INQ_Production\|PASTE_Supplier_Populate_From_INQ_Production]] | `NEw/PASTE_Supplier_Populate_From_INQ_Production.txt` | 250 |
| [[Procurement/Inquiry/Deluge/PASTE_sync_inquiry_attachment_to_suppliers\|PASTE_sync_inquiry_attachment_to_suppliers]] | `PASTE_sync_inquiry_attachment_to_suppliers.txt` | 479 |
| [[Procurement/Inquiry/Deluge/Stage_Inquiry_Changed\|Stage_Inquiry_Changed]] | `Stage_Inquiry_Changed` | 232 |
| [[Procurement/Inquiry/Deluge/stage_inquiry_changed_actions\|stage_inquiry_changed_actions]] | `stage_inquiry_changed_actions.txt` | 261 |
| [[Procurement/Inquiry/Deluge/supplier1_workflow_changes\|supplier1_workflow_changes]] | `supplier1_workflow_changes.txt` | 298 |
| [[Procurement/Inquiry/Deluge/Supplier_Populate_From_INQ\|Supplier_Populate_From_INQ]] | `Supplier_Populate_From_INQ` | 246 |
| [[Procurement/Inquiry/Deluge/supplier_quotes_last_edited_scripts\|supplier_quotes_last_edited_scripts]] | `supplier_quotes_last_edited_scripts.txt` | 320 |
| [[Procurement/Inquiry/Widget/Inquiry Widget\|Inquiry Widget]] | `—` | — |

#### Purchase Order (10)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Purchase Order/Deluge/_variants/Widget-Scripts/acknowledge_po_custom_api\|acknowledge_po_custom_api]] | `DMS\DelugeScripts\acknowledge_po_custom_api.txt` | 732 |
| [[Procurement/Purchase Order/Deluge/_variants/Widget-Scripts/pr_approve_po_custom_api\|pr_approve_po_custom_api]] | `DMS\DelugeScripts\pr_approve_po_custom_api.txt` | 1735 |
| [[Procurement/Purchase Order/Deluge/_variants/Widget-Scripts/pr_to_po_grouping\|pr_to_po_grouping]] | `DMS\DelugeScripts\pr_to_po_grouping.txt` | 2056 |
| [[Procurement/Purchase Order/Deluge/acknowledge_po_custom_api\|acknowledge_po_custom_api]] | `acknowledge_po_custom_api.txt` | 763 |
| [[Procurement/Purchase Order/Deluge/approvePOMain_PASTE_THIS_2026-10-01\|approvePOMain_PASTE_THIS_2026-10-01]] | `approvePOMain_PASTE_THIS_2026-10-01.txt` | 288 |
| [[Procurement/Purchase Order/Deluge/PASTE_ApprovePOMain_Production\|PASTE_ApprovePOMain_Production]] | `NEw/PASTE_ApprovePOMain_Production.txt` | 279 |
| [[Procurement/Purchase Order/Deluge/pr_approve_po_custom_api\|pr_approve_po_custom_api]] | `pr_approve_po_custom_api.txt` | 1728 |
| [[Procurement/Purchase Order/Deluge/pr_to_po_grouping\|pr_to_po_grouping]] | `pr_to_po_grouping.txt` | 2049 |
| [[Procurement/Purchase Order/Deluge/purchase_order_scripts\|purchase_order_scripts]] | `purchase_order_scripts.txt` | 894 |
| [[Procurement/Purchase Order/Widget/Purchase Order Widget\|Purchase Order Widget]] | `—` | — |

#### Purchase Request (28)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Purchase Request/Deluge/_variants/Archive-NEw/so_to_pr\|so_to_pr]] | `Deluge Script/so_to_pr.txt` | 484 |
| [[Procurement/Purchase Request/Deluge/_variants/Archive-NEw/so_to_pr_scripts\|so_to_pr_scripts]] | `NEw/DelugeScripts\so_to_pr_scripts.txt` | 217 |
| [[Procurement/Purchase Request/Deluge/_variants/Main-DelugeScripts/PR1_Created_Edited_Routing\|PR1_Created_Edited_Routing]] | `PR1_Created_Edited_Routing.txt` | 563 |
| [[Procurement/Purchase Request/Deluge/_variants/Main-DelugeScripts/pr_check_readiness\|pr_check_readiness]] | `pr_check_readiness.txt` | 167 |
| [[Procurement/Purchase Request/Deluge/_variants/Main-DelugeScripts/pr_sync_supplier_selected\|pr_sync_supplier_selected]] | `pr_sync_supplier_selected.txt` | 182 |
| [[Procurement/Purchase Request/Deluge/_variants/Widget-Scripts/pr_check_readiness\|pr_check_readiness]] | `DMS\DelugeScripts\pr_check_readiness.txt` | 155 |
| [[Procurement/Purchase Request/Deluge/_variants/Widget-Scripts/pr_sync_supplier_selected\|pr_sync_supplier_selected]] | `DMS\DelugeScripts\pr_sync_supplier_selected.txt` | 162 |
| [[Procurement/Purchase Request/Deluge/_variants/Widget-Scripts/so_to_pr_scripts_NewScripts\|so_to_pr_scripts_NewScripts]] | `DMS\DelugeScripts\production\so_to_pr_scripts_NewScripts.txt` | 1034 |
| [[Procurement/Purchase Request/Deluge/hc_system_local_sourcing_setup\|hc_system_local_sourcing_setup]] | `hc_system_local_sourcing_setup.txt` | 472 |
| [[Procurement/Purchase Request/Deluge/hc_system_pr_sync_supplier_selected_guard\|hc_system_pr_sync_supplier_selected_guard]] | `hc_system_pr_sync_supplier_selected_guard.txt` | 7 |
| [[Procurement/Purchase Request/Deluge/hc_system_purchase_request_setup\|hc_system_purchase_request_setup]] | `hc_system_purchase_request_setup.txt` | 13 |
| [[Procurement/Purchase Request/Deluge/PASTE_PR_Check_Readiness_Production\|PASTE_PR_Check_Readiness_Production]] | `NEw/PASTE_PR_Check_Readiness_Production.txt` | 93 |
| [[Procurement/Purchase Request/Deluge/PR\|PR]] | `PR` | 199 |
| [[Procurement/Purchase Request/Deluge/PR1_Created_Edited_Routing\|PR1_Created_Edited_Routing]] | `PR1_Created_Edited_Routing` | 216 |
| [[Procurement/Purchase Request/Deluge/PR_Approved_Action1_LIVE_paste_here\|PR_Approved_Action1_LIVE_paste_here]] | `PR_Approved_Action1_LIVE_paste_here.txt` | 1507 |
| [[Procurement/Purchase Request/Deluge/PR_Approved_Action1_PASTE_THIS_2026-10-01\|PR_Approved_Action1_PASTE_THIS_2026-10-01]] | `PR_Approved_Action1_PASTE_THIS_2026-10-01.txt` | 276 |
| [[Procurement/Purchase Request/Deluge/PR_Check_Readiness\|PR_Check_Readiness]] | `PR_Check_Readiness` | 105 |
| [[Procurement/Purchase Request/Deluge/pr_sync_supplier_load_balancing\|pr_sync_supplier_load_balancing]] | `pr_sync_supplier_load_balancing.txt` | 243 |
| [[Procurement/Purchase Request/Deluge/pr_sync_supplier_selected\|pr_sync_supplier_selected]] | `pr_sync_supplier_selected` | 124 |
| [[Procurement/Purchase Request/Deluge/purchase_request1_full_workflow_dump\|purchase_request1_full_workflow_dump]] | `purchase_request1_full_workflow_dump.txt` | 410 |
| [[Procurement/Purchase Request/Deluge/purchase_request_scripts\|purchase_request_scripts]] | `purchase_request_scripts.txt` | 173 |
| [[Procurement/Purchase Request/Deluge/purchase_request_scripts1\|purchase_request_scripts1]] | `purchase_request_scripts1.txt` | 662 |
| [[Procurement/Purchase Request/Deluge/sideUpdateScriptPR\|sideUpdateScriptPR]] | `sideUpdateScriptPR.txt` | 120 |
| [[Procurement/Purchase Request/Deluge/so_to_pr\|so_to_pr]] | `so_to_pr.txt` | 1317 |
| [[Procurement/Purchase Request/Deluge/so_to_pr_PASTE_THIS_2026-10-01\|so_to_pr_PASTE_THIS_2026-10-01]] | `so_to_pr_PASTE_THIS_2026-10-01.txt` | 1317 |
| [[Procurement/Purchase Request/Deluge/so_to_pr_scripts\|so_to_pr_scripts]] | `so_to_pr_scripts.txt` | 217 |
| [[Procurement/Purchase Request/Deluge/so_to_pr_scripts_NewScripts\|so_to_pr_scripts_NewScripts]] | `production\so_to_pr_scripts_NewScripts.txt` | 838 |
| [[Procurement/Purchase Request/Widget/Purchase Request Widget\|Purchase Request Widget]] | `—` | — |

#### Receiving (19)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Receiving/Deluge/_variants/Widget-Scripts/receiving_sync_shipment_arrived\|receiving_sync_shipment_arrived]] | `DMS\DelugeScripts\receiving_sync_shipment_arrived.txt` | 212 |
| [[Procurement/Receiving/Deluge/_variants/Widget-Scripts/receiving_validations_and_damage_missing\|receiving_validations_and_damage_missing]] | `DMS\DelugeScripts\receiving_validations_and_damage_missing.txt` | 680 |
| [[Procurement/Receiving/Deluge/Create_Bin_Receiving\|Create_Bin_Receiving]] | `Create_Bin_Receiving` | 1847 |
| [[Procurement/Receiving/Deluge/createBinReceivingWidget\|createBinReceivingWidget]] | `createBinReceivingWidget` | 1822 |
| [[Procurement/Receiving/Deluge/paste-createBinReceivingWidget\|paste-createBinReceivingWidget]] | `paste-createBinReceivingWidget.txt` | 1854 |
| [[Procurement/Receiving/Deluge/PASTE_CreateBinReceivingWidget_Production\|PASTE_CreateBinReceivingWidget_Production]] | `NEw/PASTE_CreateBinReceivingWidget_Production.txt` | 1821 |
| [[Procurement/Receiving/Deluge/PASTE_ReceivingSyncShipmentArrived_Production\|PASTE_ReceivingSyncShipmentArrived_Production]] | `NEw/PASTE_ReceivingSyncShipmentArrived_Production.txt` | 125 |
| [[Procurement/Receiving/Deluge/receiving_bin_location_choices\|receiving_bin_location_choices]] | `receiving_bin_location_choices.txt` | 115 |
| [[Procurement/Receiving/Deluge/receiving_check_fulfillment_ready\|receiving_check_fulfillment_ready]] | `receiving_check_fulfillment_ready.txt` | 65 |
| [[Procurement/Receiving/Deluge/receiving_create_bin_receiving\|receiving_create_bin_receiving]] | `receiving_create_bin_receiving.txt` | 2370 |
| [[Procurement/Receiving/Deluge/receiving_shipment_populate\|receiving_shipment_populate]] | `receiving_shipment_populate.txt` | 432 |
| [[Procurement/Receiving/Deluge/receiving_status_workflow\|receiving_status_workflow]] | `receiving_status_workflow.txt` | 161 |
| [[Procurement/Receiving/Deluge/receiving_sync_shipment_arrived\|receiving_sync_shipment_arrived]] | `receiving_sync_shipment_arrived.txt` | 133 |
| [[Procurement/Receiving/Deluge/receiving_sync_shipment_mode\|receiving_sync_shipment_mode]] | `receiving_sync_shipment_mode.txt` | 76 |
| [[Procurement/Receiving/Deluge/receiving_validations_and_damage_missing\|receiving_validations_and_damage_missing]] | `receiving_validations_and_damage_missing.txt` | 664 |
| [[Procurement/Receiving/Deluge/receiving_widget_custom_api\|receiving_widget_custom_api]] | `receiving_widget_custom_api.txt` | 2320 |
| [[Procurement/Receiving/Deluge/shipment_populate_receiving\|shipment_populate_receiving]] | `shipment_populate_receiving.txt` | 161 |
| [[Procurement/Receiving/Deluge/shipments_sync_shipment_mode_to_receiving\|shipments_sync_shipment_mode_to_receiving]] | `shipments_sync_shipment_mode_to_receiving.txt` | 76 |
| [[Procurement/Receiving/Widget/Receiving Widget\|Receiving Widget]] | `—` | — |

#### Replacement (10)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Replacement/Deluge/_variants/Widget-Scripts/create_rr_button\|create_rr_button]] | `DMS\DelugeScripts\create_rr_button.txt` | 772 |
| [[Procurement/Replacement/Deluge/_variants/Widget-Scripts/create_rr_custom_api\|create_rr_custom_api]] | `DMS\DelugeScripts\create_rr_custom_api.txt` | 711 |
| [[Procurement/Replacement/Deluge/approve_rr_custom_api\|approve_rr_custom_api]] | `approve_rr_custom_api.txt` | 179 |
| [[Procurement/Replacement/Deluge/approve_rr_supplier\|approve_rr_supplier]] | `approve_rr_supplier.txt` | 183 |
| [[Procurement/Replacement/Deluge/clone_shipment_for_replacement\|clone_shipment_for_replacement]] | `clone_shipment_for_replacement.txt` | 782 |
| [[Procurement/Replacement/Deluge/create_rr_button\|create_rr_button]] | `create_rr_button.txt` | 624 |
| [[Procurement/Replacement/Deluge/create_rr_custom_api\|create_rr_custom_api]] | `create_rr_custom_api.txt` | 566 |
| [[Procurement/Replacement/Deluge/hc_system_po_shipment_receiving_rr_setup\|hc_system_po_shipment_receiving_rr_setup]] | `hc_system_po_shipment_receiving_rr_setup.txt` | 9 |
| [[Procurement/Replacement/Deluge/paste-cloneShipmentForReplacement\|paste-cloneShipmentForReplacement]] | `paste-cloneShipmentForReplacement.txt` | 419 |
| [[Procurement/Replacement/Widget/Replacement Widget\|Replacement Widget]] | `—` | — |

#### Shipments (12)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Shipments/Deluge/_variants/Widget-Scripts/shipment_status_back_sync\|shipment_status_back_sync]] | `DMS\DelugeScripts\shipment_status_back_sync.txt` | 181 |
| [[Procurement/Shipments/Deluge/paste-shipments_auto_create_supplier_shipment\|paste-shipments_auto_create_supplier_shipment]] | `paste-shipments_auto_create_supplier_shipment.txt` | 42 |
| [[Procurement/Shipments/Deluge/PASTE_CreateShipmentOrder_Production\|PASTE_CreateShipmentOrder_Production]] | `NEw/PASTE_CreateShipmentOrder_Production.txt` | 213 |
| [[Procurement/Shipments/Deluge/PASTE_ShipmentStatusBackSync_Production\|PASTE_ShipmentStatusBackSync_Production]] | `NEw/PASTE_ShipmentStatusBackSync_Production.txt` | 116 |
| [[Procurement/Shipments/Deluge/PR_Compute_Shipment_Timeline\|PR_Compute_Shipment_Timeline]] | `PR_Compute_Shipment_Timeline` | 52 |
| [[Procurement/Shipments/Deluge/shipment_delay_status_schedule\|shipment_delay_status_schedule]] | `shipment_delay_status_schedule.txt` | 198 |
| [[Procurement/Shipments/Deluge/shipment_previous_status\|shipment_previous_status]] | `shipment_previous_status.txt` | 42 |
| [[Procurement/Shipments/Deluge/shipment_status_back_sync\|shipment_status_back_sync]] | `shipment_status_back_sync.txt` | 122 |
| [[Procurement/Shipments/Deluge/shipments_auto_create_supplier_shipment\|shipments_auto_create_supplier_shipment]] | `shipments_auto_create_supplier_shipment.txt` | 133 |
| [[Procurement/Shipments/Deluge/supplier_shipment_forms\|supplier_shipment_forms]] | `supplier_shipment_forms.txt` | 276 |
| [[Procurement/Shipments/Deluge/supplier_shipment_sync\|supplier_shipment_sync]] | `supplier_shipment_sync.txt` | 488 |
| [[Procurement/Shipments/Widget/Shipment Widget\|Shipment Widget]] | `—` | — |

#### Supplier - Fenteng (4)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Supplier - Fenteng/Deluge/list Fenteng_Notifications_Report\|list Fenteng_Notifications_Report]] | `Deluge Script/Notification\list Fenteng_Notifications_Report.txt` | 94 |
| [[Procurement/Supplier - Fenteng/Deluge/paste-approveRRFenteng\|paste-approveRRFenteng]] | `paste-approveRRFenteng.txt` | 42 |
| [[Procurement/Supplier - Fenteng/Deluge/PASTE_Fenteng_Shipment_Sync\|PASTE_Fenteng_Shipment_Sync]] | `NEw/PASTE_Fenteng_Shipment_Sync.txt` | 175 |
| [[Procurement/Supplier - Fenteng/Widget/Supplier Portal - Fenteng\|Supplier Portal - Fenteng]] | `—` | — |

#### Supplier - Tony Fan (5)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Procurement/Supplier - Tony Fan/Deluge/list Tony_Notifications_Report\|list Tony_Notifications_Report]] | `Deluge Script/Notification\list Tony_Notifications_Report.txt` | 94 |
| [[Procurement/Supplier - Tony Fan/Deluge/paste-approveRRTony\|paste-approveRRTony]] | `paste-approveRRTony.txt` | 42 |
| [[Procurement/Supplier - Tony Fan/Deluge/PASTE_ApprovePOFenteng_ApprovePOTony_Production\|PASTE_ApprovePOFenteng_ApprovePOTony_Production]] | `NEw/PASTE_ApprovePOFenteng_ApprovePOTony_Production.txt` | 1205 |
| [[Procurement/Supplier - Tony Fan/Deluge/PASTE_Tony_Shipment_Sync\|PASTE_Tony_Shipment_Sync]] | `NEw/PASTE_Tony_Shipment_Sync.txt` | 175 |
| [[Procurement/Supplier - Tony Fan/Widget/Supplier Portal - Tony Fan\|Supplier Portal - Tony Fan]] | `—` | — |

### Fulfillment (84 notes)

#### Crate (5)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Crate/Deluge/_variants/Archive-NEw/crate_checklist_to_order_aggregation_sync\|crate_checklist_to_order_aggregation_sync]] | `Deluge Script/crate_checklist_to_order_aggregation_sync.txt` | 286 |
| [[Fulfillment/Crate/Deluge/crate_checklist_to_order_aggregation_sync\|crate_checklist_to_order_aggregation_sync]] | `crate_checklist_to_order_aggregation_sync.txt` | 161 |
| [[Fulfillment/Crate/IDE/form Crate_Checklist\|form Crate_Checklist]] | `Crate\form Crate_Checklist.txt` | 262 |
| [[Fulfillment/Crate/IDE/list All_Crates\|list All_Crates]] | `Crate\list All_Crates.txt` | 125 |
| [[Fulfillment/Crate/Widget/Crate Checklist Widget\|Crate Checklist Widget]] | `—` | — |

#### Exception Control (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Exception Control/Widget/Exception Control Widget\|Exception Control Widget]] | `—` | — |

#### KANBAN (5)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/KANBAN/Deluge/_variants/Main-DelugeScripts/so_kanban_sync\|so_kanban_sync]] | `production\so_kanban_sync.txt` | 964 |
| [[Fulfillment/KANBAN/Deluge/_variants/Widget-Scripts/so_kanban_sync\|so_kanban_sync]] | `DMS\DelugeScripts\production\so_kanban_sync.txt` | 986 |
| [[Fulfillment/KANBAN/Deluge/so_kanban\|so_kanban]] | `so_kanban` | 969 |
| [[Fulfillment/KANBAN/Deluge/so_kanban_sync\|so_kanban_sync]] | `so_kanban_sync.txt` | 969 |
| [[Fulfillment/KANBAN/Widget/KANBAN Widget\|KANBAN Widget]] | `—` | — |

#### Order Aggregation (7)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Order Aggregation/Deluge/_variants/Archive-NEw/order_aggregation1_dispatch_stage_sync\|order_aggregation1_dispatch_stage_sync]] | `Deluge Script/order_aggregation1_dispatch_stage_sync.txt` | 109 |
| [[Fulfillment/Order Aggregation/Deluge/order_aggregation1_dispatch_stage_sync\|order_aggregation1_dispatch_stage_sync]] | `order_aggregation1_dispatch_stage_sync.txt` | 113 |
| [[Fulfillment/Order Aggregation/IDE/_variants/Archive-NEw/form Order_Aggregation1\|form Order_Aggregation1]] | `Deluge Script/Application IDE\Order Aggregation\form Order_Aggregation1.txt` | 196 |
| [[Fulfillment/Order Aggregation/IDE/_variants/Archive-NEw/list Order_Aggregation1_Report\|list Order_Aggregation1_Report]] | `Deluge Script/Application IDE\Order Aggregation\list Order_Aggregation1_Report.txt` | 113 |
| [[Fulfillment/Order Aggregation/IDE/form Order_Aggregation1\|form Order_Aggregation1]] | `Order Aggregation\form Order_Aggregation1.txt` | 204 |
| [[Fulfillment/Order Aggregation/IDE/list Order_Aggregation1_Report\|list Order_Aggregation1_Report]] | `Order Aggregation\list Order_Aggregation1_Report.txt` | 116 |
| [[Fulfillment/Order Aggregation/Widget/Order Aggregation Widget\|Order Aggregation Widget]] | `—` | — |

#### Order Readiness (14)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Order Readiness/Deluge/_variants/Archive-NEw/readiness_gate_release_to_pick1_direct\|readiness_gate_release_to_pick1_direct]] | `Deluge Script/readiness_gate_release_to_pick1_direct.txt` | 166 |
| [[Fulfillment/Order Readiness/Deluge/_variants/Archive-NEw/release_records_to_pick1_sync\|release_records_to_pick1_sync]] | `NEw/DelugeScripts\release_records_to_pick1_sync.txt` | 146 |
| [[Fulfillment/Order Readiness/Deluge/_variants/Widget-Scripts/so_fulfillment_to_readiness_gate\|so_fulfillment_to_readiness_gate]] | `DMS\DelugeScripts\so_fulfillment_to_readiness_gate.txt` | 267 |
| [[Fulfillment/Order Readiness/Deluge/assign_to_pick_gate\|assign_to_pick_gate]] | `assign_to_pick_gate.txt` | 54 |
| [[Fulfillment/Order Readiness/Deluge/PO to Readiness\|PO to Readiness]] | `PO to Readiness` | 129 |
| [[Fulfillment/Order Readiness/Deluge/preorder_to_readiness_gate\|preorder_to_readiness_gate]] | `preorder_to_readiness_gate.txt` | 167 |
| [[Fulfillment/Order Readiness/Deluge/readiness_gate_check_payment_status\|readiness_gate_check_payment_status]] | `readiness_gate_check_payment_status.txt` | 208 |
| [[Fulfillment/Order Readiness/Deluge/readiness_gate_release_to_pick1_direct\|readiness_gate_release_to_pick1_direct]] | `readiness_gate_release_to_pick1_direct.txt` | 284 |
| [[Fulfillment/Order Readiness/Deluge/readiness_gate_release_to_picker\|readiness_gate_release_to_picker]] | `readiness_gate_release_to_picker.txt` | 201 |
| [[Fulfillment/Order Readiness/Deluge/release_records_to_pick1_sync\|release_records_to_pick1_sync]] | `DMS\DelugeScripts\release_records_to_pick1_sync.txt` | 199 |
| [[Fulfillment/Order Readiness/Deluge/so_fulfillment_to_readiness_gate\|so_fulfillment_to_readiness_gate]] | `so_fulfillment_to_readiness_gate.txt` | 215 |
| [[Fulfillment/Order Readiness/IDE/form Sales_Order_Readiness_Gate\|form Sales_Order_Readiness_Gate]] | `Sales Order Readiness Gate\form Sales_Order_Readiness_Gate.txt` | 267 |
| [[Fulfillment/Order Readiness/IDE/Sales_Order_Readiness_Gate_Report\|Sales_Order_Readiness_Gate_Report]] | `Sales Order Readiness Gate\Sales_Order_Readiness_Gate_Report.txt` | 146 |
| [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget\|Sales Order Readiness Gate Widget]] | `—` | — |

#### Pack (6)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Pack/Deluge/_variants/Archive-NEw/pack_to_checker_checklist_sync\|pack_to_checker_checklist_sync]] | `Deluge Script/pack_to_checker_checklist_sync.txt` | 242 |
| [[Fulfillment/Pack/Deluge/pack_to_checker_checklist_sync\|pack_to_checker_checklist_sync]] | `pack_to_checker_checklist_sync.txt` | 205 |
| [[Fulfillment/Pack/IDE/_variants/Archive-NEw/Pack_Report\|Pack_Report]] | `Deluge Script/Application IDE\Pack\Pack_Report.txt` | 124 |
| [[Fulfillment/Pack/IDE/form Pack\|form Pack]] | `Pack\form Pack.txt` | 212 |
| [[Fulfillment/Pack/IDE/Pack_Report\|Pack_Report]] | `Pack\Pack_Report.txt` | 212 |
| [[Fulfillment/Pack/Widget/Pack Widget\|Pack Widget]] | `—` | — |

#### Pick (4)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Pick/Deluge/pick1_to_pack_sync\|pick1_to_pack_sync]] | `pick1_to_pack_sync.txt` | 204 |
| [[Fulfillment/Pick/IDE/form Pick1\|form Pick1]] | `Pick\form Pick1.txt` | 210 |
| [[Fulfillment/Pick/IDE/Pick1_Report\|Pick1_Report]] | `Pick\Pick1_Report.txt` | 121 |
| [[Fulfillment/Pick/Widget/Pick Widget\|Pick Widget]] | `—` | — |

#### Pre-Order (5)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Pre-Order/Deluge/preorder_create_package\|preorder_create_package]] | `preorder_create_package.txt` | 1270 |
| [[Fulfillment/Pre-Order/IDE/_variants/Archive-NEw/Pre_Order_FF\|Pre_Order_FF]] | `Deluge Script/Application IDE\Pre Order\Pre_Order_FF.txt` | 245 |
| [[Fulfillment/Pre-Order/IDE/Pre_Order1_Report\|Pre_Order1_Report]] | `Pre Order\Pre_Order1_Report.txt` | 168 |
| [[Fulfillment/Pre-Order/IDE/Pre_Order_FF\|Pre_Order_FF]] | `Pre Order\Pre_Order_FF.txt` | 254 |
| [[Fulfillment/Pre-Order/Widget/Pre Order Report Widget\|Pre Order Report Widget]] | `—` | — |

#### QC Checklist (11)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/QC Checklist/Deluge/_variants/Archive-NEw/checker_checklist_qc_approved_sync\|checker_checklist_qc_approved_sync]] | `Deluge Script/checker_checklist_qc_approved_sync.txt` | 638 |
| [[Fulfillment/QC Checklist/Deluge/_variants/Widget-Scripts/checker_checklist_qc_sync\|checker_checklist_qc_sync]] | `DMS\DelugeScripts\production\checker_checklist_qc_sync.txt` | 836 |
| [[Fulfillment/QC Checklist/Deluge/checker_checklist_item_to_replace_visibility\|checker_checklist_item_to_replace_visibility]] | `checker_checklist_item_to_replace_visibility.txt` | 148 |
| [[Fulfillment/QC Checklist/Deluge/checker_checklist_qc_approved_sync\|checker_checklist_qc_approved_sync]] | `checker_checklist_qc_approved_sync.txt` | 1080 |
| [[Fulfillment/QC Checklist/Deluge/checker_checklist_qc_sync\|checker_checklist_qc_sync]] | `production\checker_checklist_qc_sync.txt` | 825 |
| [[Fulfillment/QC Checklist/Deluge/PASTE_CheckerChecklistQCSync_Production\|PASTE_CheckerChecklistQCSync_Production]] | `NEw/PASTE_CheckerChecklistQCSync_Production.txt` | 1012 |
| [[Fulfillment/QC Checklist/IDE/_variants/Archive-NEw/All_Qc_Reports1\|All_Qc_Reports1]] | `Deluge Script/Application IDE\Quality Check\All_Qc_Reports1.txt` | 170 |
| [[Fulfillment/QC Checklist/IDE/_variants/Archive-NEw/form Checker_Checklist\|form Checker_Checklist]] | `Deluge Script/Application IDE\Quality Check\form Checker_Checklist.txt` | 392 |
| [[Fulfillment/QC Checklist/IDE/All_Qc_Reports1\|All_Qc_Reports1]] | `Quality Check\All_Qc_Reports1.txt` | 177 |
| [[Fulfillment/QC Checklist/IDE/form Checker_Checklist\|form Checker_Checklist]] | `Quality Check\form Checker_Checklist.txt` | 406 |
| [[Fulfillment/QC Checklist/Widget/QC Checklist Widget\|QC Checklist Widget]] | `—` | — |

#### SO Report (21)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/SO Report/Deluge/_variants/Archive-NEw/invoice_payment_status_to_so_fulfillment_sync\|invoice_payment_status_to_so_fulfillment_sync]] | `Deluge Script/invoice_payment_status_to_so_fulfillment_sync.txt` | 356 |
| [[Fulfillment/SO Report/Deluge/_variants/Archive-NEw/SO to Readiness\|SO to Readiness]] | `Deluge Script/SO to Readiness` | 191 |
| [[Fulfillment/SO Report/Deluge/_variants/Archive-NEw/so_creation_sync\|so_creation_sync]] | `Deluge Script/so_creation_sync.txt` | 723 |
| [[Fulfillment/SO Report/Deluge/_variants/Archive-NEw/syncpackagetofulfillment\|syncpackagetofulfillment]] | `Deluge Script/syncpackagetofulfillment.txt` | 968 |
| [[Fulfillment/SO Report/Deluge/_variants/Main-DelugeScripts/so_fulfillment_sync\|so_fulfillment_sync]] | `production\so_fulfillment_sync.txt` | 627 |
| [[Fulfillment/SO Report/Deluge/deletepackage\|deletepackage]] | `deletepackage` | 55 |
| [[Fulfillment/SO Report/Deluge/deletepackageFF\|deletepackageFF]] | `deletepackageFF` | 43 |
| [[Fulfillment/SO Report/Deluge/invoice_payment_status_to_so_fulfillment_sync\|invoice_payment_status_to_so_fulfillment_sync]] | `invoice_payment_status_to_so_fulfillment_sync.txt` | 474 |
| [[Fulfillment/SO Report/Deluge/item_details_readonly_on_load\|item_details_readonly_on_load]] | `item_details_readonly_on_load.txt` | 44 |
| [[Fulfillment/SO Report/Deluge/PASTE_createPackageFF\|PASTE_createPackageFF]] | `NEw/PASTE_createPackageFF.txt` | 1163 |
| [[Fulfillment/SO Report/Deluge/PASTE_createPackageFF_NATIVE_TEST\|PASTE_createPackageFF_NATIVE_TEST]] | `NEw/PASTE_createPackageFF_NATIVE_TEST.txt` | 1249 |
| [[Fulfillment/SO Report/Deluge/PASTE_SyncPackageToFulfillment_Production\|PASTE_SyncPackageToFulfillment_Production]] | `NEw/PASTE_SyncPackageToFulfillment_Production.txt` | 358 |
| [[Fulfillment/SO Report/Deluge/sales_order_fulfillment_stage_sync\|sales_order_fulfillment_stage_sync]] | `sales_order_fulfillment_stage_sync.txt` | 34 |
| [[Fulfillment/SO Report/Deluge/SO to Readiness\|SO to Readiness]] | `SO to Readiness` | 262 |
| [[Fulfillment/SO Report/Deluge/so_creation_sync\|so_creation_sync]] | `so_creation_sync.txt` | 723 |
| [[Fulfillment/SO Report/Deluge/so_fulfillment_sync\|so_fulfillment_sync]] | `so_fulfillment_sync.txt` | 1086 |
| [[Fulfillment/SO Report/Deluge/syncpackagetofulfillment\|syncpackagetofulfillment]] | `syncpackagetofulfillment.txt` | 672 |
| [[Fulfillment/SO Report/IDE/_variants/Archive-NEw/Sales_Order_Fulfillment\|Sales_Order_Fulfillment]] | `Deluge Script/Application IDE\Sales Order Fulfillment\Sales_Order_Fulfillment.txt` | 243 |
| [[Fulfillment/SO Report/IDE/Sales_Order_Fulfillment\|Sales_Order_Fulfillment]] | `Sales Order Fulfillment\Sales_Order_Fulfillment.txt` | 243 |
| [[Fulfillment/SO Report/IDE/Sales_Order_Fulfillment_Report\|Sales_Order_Fulfillment_Report]] | `Sales Order Fulfillment\Sales_Order_Fulfillment_Report.txt` | 134 |
| [[Fulfillment/SO Report/Widget/SO Report Widget\|SO Report Widget]] | `—` | — |

#### Scoreboard (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Scoreboard/Widget/Scoreboard Widget\|Scoreboard Widget]] | `—` | — |

#### Transfer Item (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Transfer Item/Widget/Transfer Warehouse Widget\|Transfer Warehouse Widget]] | `—` | — |

#### Warehouse Request (3)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Fulfillment/Warehouse Request/Deluge/warehouse_request_item_image_backfill\|warehouse_request_item_image_backfill]] | `Deluge Script/warehouse_request_item_image_backfill.txt` | 75 |
| [[Fulfillment/Warehouse Request/IDE/IDE Warehouse Request\|IDE Warehouse Request]] | `IDE Warehouse Request` | 178 |
| [[Fulfillment/Warehouse Request/Widget/Warehouse Request Widget\|Warehouse Request Widget]] | `—` | — |

### Delivery Management (31 notes)

#### DMS Exception Queue (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget\|DMSExceptionQueue Widget]] | `—` | — |

#### Daily Team Availability (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/Daily Team Availability/Widget/DailyTeamAvailability Widget\|DailyTeamAvailability Widget]] | `—` | — |

#### Delivery Analytics (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/Delivery Analytics/Widget/DeliveryAnalytics Widget\|DeliveryAnalytics Widget]] | `—` | — |

#### Field Service Site Visits (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/Field Service Site Visits/Widget/FieldServiceSiteVisits Widget\|FieldServiceSiteVisits Widget]] | `—` | — |

#### Ongoing Service (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/Ongoing Service/Widget/OngoingService Widget\|OngoingService Widget]] | `—` | — |

#### Sales Returns (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/Sales Returns/Widget/SalesReturns Widget\|SalesReturns Widget]] | `—` | — |

#### Schedule Requests (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/Schedule Requests/Widget/ScheduleRequest Widget\|ScheduleRequest Widget]] | `—` | — |

#### Truck Maintenance (3)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/Truck Maintenance/Deluge/Fuel_Entries\|Fuel_Entries]] | `Fuel_Entries` | 212 |
| [[Delivery Management/Truck Maintenance/Deluge/Service_Entries\|Service_Entries]] | `Service_Entries` | 228 |
| [[Delivery Management/Truck Maintenance/Widget/DailyChecklistVehicle Widget\|DailyChecklistVehicle Widget]] | `—` | — |

#### _Deluge (19)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/_Deluge/Deluge/ACTION2_ASAP_OVERRIDE_PASTE_DITO\|ACTION2_ASAP_OVERRIDE_PASTE_DITO]] | `DMS\ACTION2_ASAP_OVERRIDE_PASTE_DITO.txt` | 159 |
| [[Delivery Management/_Deluge/Deluge/ACTION3_PASTE_DITO\|ACTION3_PASTE_DITO]] | `DMS\ACTION3_PASTE_DITO.txt` | 34 |
| [[Delivery Management/_Deluge/Deluge/dms_create_shipment_order\|dms_create_shipment_order]] | `dms_create_shipment_order.txt` | 287 |
| [[Delivery Management/_Deluge/Deluge/dms_field_work_completion_sync\|dms_field_work_completion_sync]] | `dms_field_work_completion_sync.txt` | 311 |
| [[Delivery Management/_Deluge/Deluge/dms_field_work_reschedule\|dms_field_work_reschedule]] | `dms_field_work_reschedule.txt` | 154 |
| [[Delivery Management/_Deluge/Deluge/dms_location_route_geocode\|dms_location_route_geocode]] | `dms_location_route_geocode.txt` | 267 |
| [[Delivery Management/_Deluge/Deluge/dms_reschedule_custom_api\|dms_reschedule_custom_api]] | `dms_reschedule_custom_api.txt` | 470 |
| [[Delivery Management/_Deluge/Deluge/dms_sales_returns_form\|dms_sales_returns_form]] | `dms_sales_returns_form.txt` | 244 |
| [[Delivery Management/_Deluge/Deluge/dms_scheduling_engine\|dms_scheduling_engine]] | `dms_scheduling_engine.txt` | 1650 |
| [[Delivery Management/_Deluge/Deluge/dms_site_confirmation\|dms_site_confirmation]] | `dms_site_confirmation.txt` | 308 |
| [[Delivery Management/_Deluge/Deluge/PASTE_Action1_SA_Scheduling_Engine\|PASTE_Action1_SA_Scheduling_Engine]] | `DMS\PASTE_Action1_SA_Scheduling_Engine.txt` | 443 |
| [[Delivery Management/_Deluge/Deluge/PASTE_DailyChecklistStatusOnAdd\|PASTE_DailyChecklistStatusOnAdd]] | `DMS\PASTE_DailyChecklistStatusOnAdd.txt` | 45 |
| [[Delivery Management/_Deluge/Deluge/PASTE_ReSchedule_ReportActionItem\|PASTE_ReSchedule_ReportActionItem]] | `DMS\PASTE_ReSchedule_ReportActionItem.txt` | 269 |
| [[Delivery Management/_Deluge/Deluge/sales_return_to_books\|sales_return_to_books]] | `sales_return_to_books.txt` | 341 |
| [[Delivery Management/_Deluge/Deluge/schedule_test_settings_form\|schedule_test_settings_form]] | `schedule_test_settings_form.txt` | 58 |
| [[Delivery Management/_Deluge/dms_exception_queue\|dms_exception_queue]] | `dms_exception_queue.txt` | 339 |
| [[Delivery Management/_Deluge/In_Bound_Delivery\|In_Bound_Delivery]] | `In_Bound_Delivery.txt` | 630 |
| [[Delivery Management/_Deluge/PASTE_reScheduleDelivery_2026-09-17\|PASTE_reScheduleDelivery_2026-09-17]] | `PASTE_reScheduleDelivery_2026-09-17.txt` | 381 |
| [[Delivery Management/_Deluge/UPDATE_FleetDecision_2026-09-16\|UPDATE_FleetDecision_2026-09-16]] | `UPDATE_FleetDecision_2026-09-16.txt` | 1699 |

#### _Docs (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/_Docs/PASTE_FieldWorkCompletionSync\|PASTE_FieldWorkCompletionSync]] | `DMS\PASTE_FieldWorkCompletionSync.txt` | 196 |

#### _Retired (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[Delivery Management/_Retired/DeliveryQueue Widget\|DeliveryQueue Widget]] | `—` | — |

### _Shared (46 notes)

#### Deluge (20)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[_Shared/Deluge/_Unlabelled/Deluge/check pac\|check pac]] | `check pac` | 583 |
| [[_Shared/Deluge/_Unlabelled/Deluge/Create PR (Fixed)\|Create PR (Fixed)]] | `Create PR (Fixed)` | 227 |
| [[_Shared/Deluge/_Unlabelled/Deluge/Create PR\|Create PR]] | `Create PR` | 199 |
| [[_Shared/Deluge/_Unlabelled/Deluge/Fix this\|Fix this]] | `Fix this` | 995 |
| [[_Shared/Deluge/_Unlabelled/Deluge/Payment\|Payment]] | `Payment` | 351 |
| [[_Shared/Deluge/_Unlabelled/Deluge/Report\|Report]] | `Report` | 104 |
| [[_Shared/Deluge/_Unlabelled/Deluge/sideUpdateScript\|sideUpdateScript]] | `sideUpdateScript.txt` | 382 |
| [[_Shared/Deluge/_Unlabelled/IPAPASTE_KO_2026-09-16\|IPAPASTE_KO_2026-09-16]] | `IPAPASTE_KO_2026-09-16.txt` | 1670 |
| [[_Shared/Deluge/Deluge/_variants/Main-DelugeScripts/error\|error]] | `error.txt` | 307 |
| [[_Shared/Deluge/Deluge/add_item_by_id_custom_api\|add_item_by_id_custom_api]] | `add_item_by_id_custom_api.txt` | 381 |
| [[_Shared/Deluge/Deluge/ApplyNow\|ApplyNow]] | `ApplyNow.txt` | 432 |
| [[_Shared/Deluge/Deluge/Customer_Form_Schema\|Customer_Form_Schema]] | `Customer_Form_Schema.txt` | 258 |
| [[_Shared/Deluge/Deluge/edit_counter_scripts\|edit_counter_scripts]] | `edit_counter_scripts.txt` | 589 |
| [[_Shared/Deluge/Deluge/Error\|Error]] | `Error` | 37 |
| [[_Shared/Deluge/Deluge/finalization_scripts\|finalization_scripts]] | `finalization_scripts.txt` | 212 |
| [[_Shared/Deluge/Deluge/get_subform_file_custom_api\|get_subform_file_custom_api]] | `get_subform_file_custom_api.txt` | 282 |
| [[_Shared/Deluge/Deluge/lookatthis\|lookatthis]] | `lookatthis.txt` | 5 |
| [[_Shared/Deluge/Deluge/temp\|temp]] | `temp.txt` | 68 |
| [[_Shared/Deluge/Deluge/zoho_api_setup\|zoho_api_setup]] | `zoho_api_setup.txt` | 18 |
| [[_Shared/Deluge/Zoho Books & Inventory Core Sync\|Zoho Books & Inventory Core Sync]] | `—` | — |

#### Notifications (25)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[_Shared/Notifications/Deluge/ff_notifications_all_modules\|ff_notifications_all_modules]] | `production\ff_notifications_all_modules.txt` | 255 |
| [[_Shared/Notifications/Deluge/ff_notifications_inline_patches\|ff_notifications_inline_patches]] | `production\ff_notifications_inline_patches.txt` | 243 |
| [[_Shared/Notifications/Deluge/notification_urls_ready_to_paste\|notification_urls_ready_to_paste]] | `notification_urls_ready_to_paste.txt` | 804 |
| [[_Shared/Notifications/Deluge/Notify_Fenteng_on_Purchase_Order_added\|Notify_Fenteng_on_Purchase_Order_added]] | `Deluge Script/Notification\Notify_Fenteng_on_Purchase_Order_added.txt` | 39 |
| [[_Shared/Notifications/Deluge/Notify_Fenteng_on_Purchase_Request_added\|Notify_Fenteng_on_Purchase_Request_added]] | `Deluge Script/Notification\Notify_Fenteng_on_Purchase_Request_added.txt` | 40 |
| [[_Shared/Notifications/Deluge/Notify_Fenteng_on_Replacement_Request_added\|Notify_Fenteng_on_Replacement_Request_added]] | `Deluge Script/Notification\Notify_Fenteng_on_Replacement_Request_added.txt` | 39 |
| [[_Shared/Notifications/Deluge/Notify_Fenteng_on_Shipment_Added\|Notify_Fenteng_on_Shipment_Added]] | `Deluge Script/Notification\Notify_Fenteng_on_Shipment_Added.txt` | 39 |
| [[_Shared/Notifications/Deluge/Notify_on_Created_Exception\|Notify_on_Created_Exception]] | `Deluge Script/Notification\Notify_on_Created_Exception.txt` | 29 |
| [[_Shared/Notifications/Deluge/Notify_on_DMS_Exception_Raised\|Notify_on_DMS_Exception_Raised]] | `Deluge Script/Notification\Notify_on_DMS_Exception_Raised.txt` | 89 |
| [[_Shared/Notifications/Deluge/Notify_on_Purchase_Request_Add\|Notify_on_Purchase_Request_Add]] | `Deluge Script/Notification\Notify_on_Purchase_Request_Add.txt` | 40 |
| [[_Shared/Notifications/Deluge/Notify_on_Receiving_Completed\|Notify_on_Receiving_Completed]] | `Deluge Script/Notification\Notify_on_Receiving_Completed.txt` | 32 |
| [[_Shared/Notifications/Deluge/Notify_on_Receiving_Quantity_Mismatch\|Notify_on_Receiving_Quantity_Mismatch]] | `Deluge Script/Notification\Notify_on_Receiving_Quantity_Mismatch.txt` | 32 |
| [[_Shared/Notifications/Deluge/Notify_on_supplier_Inquiry_response\|Notify_on_supplier_Inquiry_response]] | `Deluge Script/Notification\Notify_on_supplier_Inquiry_response.txt` | 32 |
| [[_Shared/Notifications/Deluge/Notify_Suppliers_on_Inquiry_Added\|Notify_Suppliers_on_Inquiry_Added]] | `Deluge Script/Notification\Notify_Suppliers_on_Inquiry_Added.txt` | 59 |
| [[_Shared/Notifications/Deluge/Notify_Tony_on_Inquiry_added\|Notify_Tony_on_Inquiry_added]] | `Deluge Script/Notification\Notify_Tony_on_Inquiry_added.txt` | 36 |
| [[_Shared/Notifications/Deluge/Notify_Tony_on_Purchase_Order_added\|Notify_Tony_on_Purchase_Order_added]] | `Deluge Script/Notification\Notify_Tony_on_Purchase_Order_added.txt` | 53 |
| [[_Shared/Notifications/Deluge/Notify_Tony_on_Purchase_Request_added\|Notify_Tony_on_Purchase_Request_added]] | `Deluge Script/Notification\Notify_Tony_on_Purchase_Request_added.txt` | 42 |
| [[_Shared/Notifications/Deluge/Notify_Tony_on_Replacement_Request_Added\|Notify_Tony_on_Replacement_Request_Added]] | `Deluge Script/Notification\Notify_Tony_on_Replacement_Request_Added.txt` | 53 |
| [[_Shared/Notifications/Deluge/Notify_Tony_on_Shipment_added\|Notify_Tony_on_Shipment_added]] | `Deluge Script/Notification\Notify_Tony_on_Shipment_added.txt` | 53 |
| [[_Shared/Notifications/Deluge/OrderAgg_Notify_New_Record\|OrderAgg_Notify_New_Record]] | `Deluge Script/Notification\OrderAgg_Notify_New_Record.txt` | 30 |
| [[_Shared/Notifications/Deluge/Pack_Notify_New_Record\|Pack_Notify_New_Record]] | `Deluge Script/Notification\Pack_Notify_New_Record.txt` | 30 |
| [[_Shared/Notifications/Deluge/Pick1_Notify_New_Record\|Pick1_Notify_New_Record]] | `Deluge Script/Notification\Pick1_Notify_New_Record.txt` | 30 |
| [[_Shared/Notifications/Deluge/QC_Notify_New_Record\|QC_Notify_New_Record]] | `QC_Notify_New_Record` | 12 |
| [[_Shared/Notifications/Deluge/ReadinessGate_Notify_New_Record\|ReadinessGate_Notify_New_Record]] | `ReadinessGate_Notify_New_Record` | 12 |
| [[_Shared/Notifications/Deluge/SOF_Notify_New_Record\|SOF_Notify_New_Record]] | `SOF_Notify_New_Record` | 12 |

#### Widget (1)

| Note | Source file | Lines |
| :--- | :--- | ---: |
| [[_Shared/Widget/Supply Chain Conversion Widget\|Supply Chain Conversion Widget]] | `—` | — |

---

## 📚 Reference documents

### (root) (2)

- [[_Shared/Docs/00 - Manuals & PDF Documentation Index\|00 - Manuals & PDF Documentation Index]]
- [[_Shared/Docs/deluge_creator_gotchas\|deluge_creator_gotchas]]

### 01 - Staff & Operations Manuals (17)

- [[_Shared/Docs/01 - Staff & Operations Manuals/Delivery Management System Manual (English)\|Delivery Management System Manual (English)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Delivery Management System Manual (Tagalog)\|Delivery Management System Manual (Tagalog)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/DMS System Guide\|DMS System Guide]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Fenteng Lighting Supplier Portal Guide\|Fenteng Lighting Supplier Portal Guide]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Fulfillment Mobile Phone Manual\|Fulfillment Mobile Phone Manual]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Fulfillment System Manual (English)\|Fulfillment System Manual (English)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Fulfillment System Manual (Tagalog)\|Fulfillment System Manual (Tagalog)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Inquiry Operations Manual (English)\|Inquiry Operations Manual (English)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Inquiry Operations Manual\|Inquiry Operations Manual]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Procurement System Manual\|Procurement System Manual]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Supplier Portal Operations Manual (2026-08-24)\|Supplier Portal Operations Manual (2026-08-24)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Supply Chain App UAT Manual\|Supply Chain App UAT Manual]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Tony Fan Portal Guide (Chinese)\|Tony Fan Portal Guide (Chinese)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Tony Fan Portal Guide (English)\|Tony Fan Portal Guide (English)]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Tony Fan Portal UAT Test Plan\|Tony Fan Portal UAT Test Plan]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Tony Fan Portal Walkthrough Script\|Tony Fan Portal Walkthrough Script]]
- [[_Shared/Docs/01 - Staff & Operations Manuals/Tony Fan Supplier Portal Guide\|Tony Fan Supplier Portal Guide]]

### 02 - Architecture, Blueprints & Swimlanes (19)

- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Automated Pricing Process Flow (2026-10-07)\|Automated Pricing Process Flow (2026-10-07)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Automated Pricing System Plan (2026-10-07)\|Automated Pricing System Plan (2026-10-07)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Business Process Blueprint (PDF)\|Business Process Blueprint (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Delivery Confirmation Policy — Client Not On Site (PDF)\|Delivery Confirmation Policy — Client Not On Site (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Delivery Confirmation Policy — Client Not On Site\|Delivery Confirmation Policy — Client Not On Site]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/End-to-End Process Flow Swimlane (PDF)\|End-to-End Process Flow Swimlane (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Exception Flagging Proposal (PDF)\|Exception Flagging Proposal (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Procurement End-to-End Process Flow (PDF)\|Procurement End-to-End Process Flow (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Procurement End-to-End Process Flow\|Procurement End-to-End Process Flow]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Procurement Swimlane Diagram (PDF)\|Procurement Swimlane Diagram (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Procurement Swimlane Diagram\|Procurement Swimlane Diagram]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Remote Client Signature Proposal (PDF)\|Remote Client Signature Proposal (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Remote Client Signature — Concept Demo\|Remote Client Signature — Concept Demo]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Remote Client Signature — Proposal\|Remote Client Signature — Proposal]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Supply Chain App — Business Process Blueprint\|Supply Chain App — Business Process Blueprint]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Supply Chain App — Deployment Sprint Plan\|Supply Chain App — Deployment Sprint Plan]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Supply Chain App — Deployment Sprint Report\|Supply Chain App — Deployment Sprint Report]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Supply Chain Swimlane Diagram (PDF)\|Supply Chain Swimlane Diagram (PDF)]]
- [[_Shared/Docs/02 - Architecture, Blueprints & Swimlanes/Supply Chain Swimlane Diagram\|Supply Chain Swimlane Diagram]]

### 03 - Sprint, UAT & Quality Reports (7)

- [[_Shared/Docs/03 - Sprint, UAT & Quality Reports/Deployment Sprint Plan (2026-09-01)\|Deployment Sprint Plan (2026-09-01)]]
- [[_Shared/Docs/03 - Sprint, UAT & Quality Reports/Deployment Sprint Report (2026-09-01)\|Deployment Sprint Report (2026-09-01)]]
- [[_Shared/Docs/03 - Sprint, UAT & Quality Reports/Supply Chain App Findings Report (2026-08-24)\|Supply Chain App Findings Report (2026-08-24)]]
- [[_Shared/Docs/03 - Sprint, UAT & Quality Reports/Supply Chain App Health Report (2026-08-15)\|Supply Chain App Health Report (2026-08-15)]]
- [[_Shared/Docs/03 - Sprint, UAT & Quality Reports/Supply Chain App Sprint Checklist (Excel)\|Supply Chain App Sprint Checklist (Excel)]]
- [[_Shared/Docs/03 - Sprint, UAT & Quality Reports/Supply Chain App UAT Report (2026-08-20)\|Supply Chain App UAT Report (2026-08-20)]]
- [[_Shared/Docs/03 - Sprint, UAT & Quality Reports/Supply Chain App User Deployment Sprint (Excel)\|Supply Chain App User Deployment Sprint (Excel)]]

### 04 - Zoho Reference Guides (17)

- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Advance Last Part\|Deluge Scripting — Advance Last Part]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Advance Part 1\|Deluge Scripting — Advance Part 1]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Advance Part 2\|Deluge Scripting — Advance Part 2]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Advance Part 3\|Deluge Scripting — Advance Part 3]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Advance Part 4\|Deluge Scripting — Advance Part 4]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Basic Guide\|Deluge Scripting — Basic Guide]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Intermediate Last Part\|Deluge Scripting — Intermediate Last Part]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Intermediate Part 1\|Deluge Scripting — Intermediate Part 1]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Deluge Scripting — Intermediate Part 2\|Deluge Scripting — Intermediate Part 2]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Books — AI Features & Invoices\|Zoho Books — AI Features & Invoices]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Books — Developer & Data Management\|Zoho Books — Developer & Data Management]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Books — Payment Received & Accounting\|Zoho Books — Payment Received & Accounting]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Books — Projects & Timesheet Approval\|Zoho Books — Projects & Timesheet Approval]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Developer API Reference\|Zoho Developer API Reference]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Inventory — Customers, Vendors & Purchase Transactions\|Zoho Inventory — Customers, Vendors & Purchase Transactions]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Inventory — Purchase Returns & Migrations\|Zoho Inventory — Purchase Returns & Migrations]]
- [[_Shared/Docs/04 - Zoho Reference Guides/Zoho Inventory — Warehouses & Stock Management\|Zoho Inventory — Warehouses & Stock Management]]

