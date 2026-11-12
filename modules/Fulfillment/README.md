# Fulfillment

Tabs, in app menu order. Each folder is the Zoho widget source (`app/` + `plugin-manifest.json`).

| Tab | Zoho page | Widget folder | Source zip |
|---|---|---|---|
| Fulfillment Dashboard | `Fulfillment_Dashboard` | [Fulfillment Dashboard](Fulfillment%20Dashboard/app/index.html) | `Fulfillment/Scoreboard/Widget/Scoreboard.zip` |
| Sales Order Report | `SOR` | [Sales Order Report](Sales%20Order%20Report/app/index.html) | `Fulfillment/SO Report/Widget/SO.zip` |
| Pre-Order | `Pre_Order2` | [Pre-Order](Pre-Order/app/index.html) | `Fulfillment/Pre-Order/Widget/PreOrderReport.zip` |
| Order Readiness | `Order_Readiness1` | [Order Readiness](Order%20Readiness/app/index.html) | `Fulfillment/Order Readiness/Widget/ReadinessGate.zip` |
| Pick | `Pick2` | [Pick](Pick/app/index.html) | `Fulfillment/Pick/Widget/Pick.zip` |
| Pack & QC | `Quality_Check` | [Pack & QC](Pack%20&%20QC/app/index.html) | `Fulfillment/QC Checklist/Widget/QCChecklist.zip` |
| Crate | `Crate1` | [Crate](Crate/app/index.html) | `Fulfillment/Crate/Widget/CrateChecklist.zip` |
| To Ship | `Order_Aggregation2` | [To Ship](To%20Ship/app/index.html) | `Fulfillment/Order Aggregation/Widget/OrderAggregation.zip` |
| Exception Control | `Exception_Control2` | [Exception Control](Exception%20Control/app/index.html) | `Fulfillment/Exception Control/Widget/ExceptionControl.zip` |
| Transfer Item | `Transfer_Item` | [Transfer Item](Transfer%20Item/app/index.html) | `Fulfillment/Transfer Item/Widget/TransferWarehouse.zip` |
| Pack (opened from other tabs) | `Pack1` | [Pack](Pack/app/index.html) | `Fulfillment/Pack/Widget/Pack.zip` |
| Kanban (opened from other tabs) | `KANBAN` | [Kanban](Kanban/app/index.html) | `Fulfillment/KANBAN/Widget/FulfillmentKanban.zip` |

## Custom APIs the tabs call

| Custom API | Deluge function | Local app |
|---|---|---|
| `add_item_by_id` | [addItemByIdBooks](../../zoho-export/parsed/functions/addItemByIdBooks.dg) | Ported |
| `check_payment_status` | [checkPaymentStatus](../../zoho-export/parsed/functions/checkPaymentStatus.dg) | Not ported yet |
| `create_package_ff` | [createPackageFF](../../zoho-export/parsed/functions/createPackageFF.dg) | Not ported yet |

## Forms (database tables)

| Form | Fields | Spec |
|---|---|---|
| Quality Check | 52 | [Checker_Checklist.json](../../zoho-export/parsed/forms/Checker_Checklist.json) |
| Crate Checklist | 31 | [Crate_Checklist.json](../../zoho-export/parsed/forms/Crate_Checklist.json) |
| Customer | 10 | [Customer.json](../../zoho-export/parsed/forms/Customer.json) |
| Delivery Scheduling Form | 34 | [Delivery_Scheduling.json](../../zoho-export/parsed/forms/Delivery_Scheduling.json) |
| ExceptionControl Notifications | 9 | [ExceptionControl_Notifications.json](../../zoho-export/parsed/forms/ExceptionControl_Notifications.json) |
| Exception Control | 46 | [Exception_Control1.json](../../zoho-export/parsed/forms/Exception_Control1.json) |
| Exception Control Media | 7 | [Exception_Control_Media.json](../../zoho-export/parsed/forms/Exception_Control_Media.json) |
| Exceptions | 30 | [Exceptions.json](../../zoho-export/parsed/forms/Exceptions.json) |
| Fenteng Lighting Purchase Order | 20 | [Fenteng_Lighting_Purchase_Order.json](../../zoho-export/parsed/forms/Fenteng_Lighting_Purchase_Order.json) |
| Fenteng Lighting Replacement  Request | 28 | [Fenteng_Lighting_Replacement_Request.json](../../zoho-export/parsed/forms/Fenteng_Lighting_Replacement_Request.json) |
| Items | 12 | [Items.json](../../zoho-export/parsed/forms/Items.json) |
| OrderAgg Notifications | 9 | [OrderAgg_Notifications.json](../../zoho-export/parsed/forms/OrderAgg_Notifications.json) |
| Order Aggregation | 25 | [Order_Aggregation1.json](../../zoho-export/parsed/forms/Order_Aggregation1.json) |
| Pack | 22 | [Pack.json](../../zoho-export/parsed/forms/Pack.json) |
| Pack Notifications | 9 | [Pack_Notifications.json](../../zoho-export/parsed/forms/Pack_Notifications.json) |
| Package Shipments | 8 | [Package_Shipments.json](../../zoho-export/parsed/forms/Package_Shipments.json) |
| Pick | 26 | [Pick1.json](../../zoho-export/parsed/forms/Pick1.json) |
| Pick Notifications | 9 | [Pick_Notifications.json](../../zoho-export/parsed/forms/Pick_Notifications.json) |
| PreOrder Notifications | 9 | [PreOrder_Notifications.json](../../zoho-export/parsed/forms/PreOrder_Notifications.json) |
| Pre Order FF | 36 | [Pre_Order_FF.json](../../zoho-export/parsed/forms/Pre_Order_FF.json) |
| Purchase Order | 25 | [Purchase_Order.json](../../zoho-export/parsed/forms/Purchase_Order.json) |
| Purchase Request | 77 | [Purchase_Request1.json](../../zoho-export/parsed/forms/Purchase_Request1.json) |
| QC Notifications | 9 | [QC_Notifications.json](../../zoho-export/parsed/forms/QC_Notifications.json) |
| ReadinessGate Notifications | 9 | [ReadinessGate_Notifications.json](../../zoho-export/parsed/forms/ReadinessGate_Notifications.json) |
| Receiving | 38 | [Receiving.json](../../zoho-export/parsed/forms/Receiving.json) |
| Replacement  Request | 31 | [Replacement_Request.json](../../zoho-export/parsed/forms/Replacement_Request.json) |
| SOF Internal Messages | 7 | [SOF_Internal_Messages.json](../../zoho-export/parsed/forms/SOF_Internal_Messages.json) |
| SOF Timeline | 8 | [SOF_Timeline.json](../../zoho-export/parsed/forms/SOF_Timeline.json) |
| SO Notifications | 9 | [SO_Notifications.json](../../zoho-export/parsed/forms/SO_Notifications.json) |
| Sales Order Fulfillment | 28 | [Sales_Order_Fulfillment.json](../../zoho-export/parsed/forms/Sales_Order_Fulfillment.json) |
| Sales Order Readiness Gate | 38 | [Sales_Order_Readiness_Gate.json](../../zoho-export/parsed/forms/Sales_Order_Readiness_Gate.json) |
| Service Appointment Form | 99 | [Service_Appointment_Form.json](../../zoho-export/parsed/forms/Service_Appointment_Form.json) |
| Tony Fan Purchase Order | 20 | [Tony_Fan_Purchase_Order.json](../../zoho-export/parsed/forms/Tony_Fan_Purchase_Order.json) |
| Tony Fan Replacement  Request | 28 | [Tony_Fan_Replacement_Request.json](../../zoho-export/parsed/forms/Tony_Fan_Replacement_Request.json) |
| Transfer Warehouse | 10 | [Transfer_Warehouse.json](../../zoho-export/parsed/forms/Transfer_Warehouse.json) |
| Warehouse Request | 13 | [Warehouse_Request.json](../../zoho-export/parsed/forms/Warehouse_Request.json) |

## Reports

- `All_Crates` (form `Crate_Checklist`)
- `All_Items` (form `Items`)
- `All_Purchase_Orders` (form `Purchase_Order`)
- `All_Purchase_Request` (form `Purchase_Request1`)
- `All_Qc_Reports1` (form `Checker_Checklist`)
- `All_Warehouse_Requests` (form `Warehouse_Request`)
- `ExceptionControl_Notifications_Report` (form `ExceptionControl_Notifications`)
- `Exception_Control_Media_Report` (form `Exception_Control_Media`)
- `Exception_Control_Report` (form `Exception_Control1`)
- `Fenteng_Lighting_Purchase_Order_Report` (form `Fenteng_Lighting_Purchase_Order`)
- `Fenteng_Lighting_Replacement_Request_Report` (form `Fenteng_Lighting_Replacement_Request`)
- `OrderAgg_Notifications_Report` (form `OrderAgg_Notifications`)
- `Order_Aggregation1_Report` (form `Order_Aggregation1`)
- `Pack_Notifications_Report` (form `Pack_Notifications`)
- `Pack_Report` (form `Pack`)
- `Pick1_Report` (form `Pick1`)
- `Pick_Notifications_Report` (form `Pick_Notifications`)
- `PreOrder_Notifications_Report` (form `PreOrder_Notifications`)
- `Pre_Order1_Report` (form `Pre_Order_FF`)
- `QC_Notifications_Report` (form `QC_Notifications`)
- `ReadinessGate_Notifications_Report` (form `ReadinessGate_Notifications`)
- `Replacement_Request_Report` (form `Replacement_Request`)
- `SOF_Internal_Messages_Report` (form `SOF_Internal_Messages`)
- `SOF_Timeline_Report` (form `SOF_Timeline`)
- `SO_Notifications_Report` (form `SO_Notifications`)
- `Sales_Order_Fulfillment_Report` (form `Sales_Order_Fulfillment`)
- `Sales_Order_Readiness_Gate_Report` (form `Sales_Order_Readiness_Gate`)
- `Tony_Fan_Purchase_Order_Report` (form `Tony_Fan_Purchase_Order`)
- `Tony_Fan_Replacement_Request_Report` (form `Tony_Fan_Replacement_Request`)
- `Transfer_Warehouse_Report` (form `Transfer_Warehouse`)

## Deluge functions

- [addItemByIdBooks](../../zoho-export/parsed/functions/addItemByIdBooks.dg)(String itemBooksId)
- [checkPaymentStatus](../../zoho-export/parsed/functions/checkPaymentStatus.dg)(String recordId)
- [createPackageFF](../../zoho-export/parsed/functions/createPackageFF.dg)(string recordIdsCsv, string deliveryType)
- [dmsScheduleSlot](../../zoho-export/parsed/functions/dmsScheduleSlot.dg)(String recordId, bool isRerun)
- [fcPrToPreOrder](../../zoho-export/parsed/functions/fcPrToPreOrder.dg)(int prId)
- [fcStampBySoNo](../../zoho-export/parsed/functions/fcStampBySoNo.dg)(string soNo)
- [fcStampDelivery](../../zoho-export/parsed/functions/fcStampDelivery.dg)(string soText)
- [fcStampPurchaseRequest](../../zoho-export/parsed/functions/fcStampPurchaseRequest.dg)(int prId)

## Workflows on these forms

| Form | Workflow | Trigger | Script |
|---|---|---|---|
| Purchase_Request1 | PR_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Generate_Number.dg) |
| Purchase_Request1 | PR_AutoFill_Item_Details | on add or edit | [on user input of Items](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_AutoFill_Item_Details.dg) |
| Purchase_Request1 | autofill customer type | on add or edit | [on user input of Customer](../../zoho-export/parsed/workflows/form/Purchase_Request1/autofill_customer_type.dg) |
| Purchase_Request1 | PR_Sync_Supplier_Load_Balancing | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Sync_Supplier_Load_Bal.dg) |
| Purchase_Request1 | PR_Sync_Supplier_Selected | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Sync_Supplier_Selected.dg) |
| Purchase_Request1 | PR_Check_Readiness | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Check_Readiness.dg) |
| Purchase_Request1 | Select_Unselect_Supplier | on add or edit | [on user input of Supplier_Selected.Selected](../../zoho-export/parsed/workflows/form/Purchase_Request1/Select_Unselect_Supplier.dg) |
| Purchase_Request1 | PR_Set_Default_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Set_Default_Status.dg) |
| Purchase_Order | PO_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Generate_Number.dg) |
| Purchase_Request1 | PR_Lock_After_PO | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Lock_After_PO1.dg) |
| Purchase_Request1 | PR_Lock_UI_Fields | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Lock_UI_Fields.dg) |
| Purchase_Request1 | PR_Populate_From_PR | on add | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Populate_From_PR__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Populate_From_PR__2.dg) |
| Purchase_Request1 | PR_Changed | on edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Changed__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Changed__2.dg) |
| Purchase_Request1 | PR_Deleted | on delete | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Deleted.dg) |
| Purchase_Request1 | PR_Export_Selected_Supplier | on edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Export_Selected_Suppli.dg) |
| Purchase_Request1 | PR_Compute_Shipment_Timeline | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Compute_Shipment_Timel.dg) |
| Purchase_Order | PO_Compute_Totals | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Compute_Totals.dg) |
| Purchase_Order | PO_Detect_Mixed | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Detect_Mixed.dg) |
| Purchase_Order | PO_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Status_Timestamps.dg) |
| Purchase_Request1 | PR_Set_Shipment_Mode | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Set_Shipment_Mode.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Generate_Number2.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Compute_Totals | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Compute_Totals2.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Detect_Mixed | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Detect_Mixed2.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Status_Timestamps2.dg) |
| Tony_Fan_Purchase_Order | Disable_All_Fields_PO_Supplier2 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Order/Disable_All_Fields_PO_Sup.dg) |
| Fenteng_Lighting_Purchase_Order | Disable_All_Fields_PO_Supplier1 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/Disable_All_Fields_PO_Sup1.dg) |
| Receiving | Receiving_Populate_From_Shipment | on add or edit | [on user input of Shipments](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Populate_From_S.dg) |
| Purchase_Request1 | PR_Compute_Priority | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Compute_Priority.dg) |
| Purchase_Order | PO_Lock_UI_Fields | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Lock_UI_Fields.dg) |
| Purchase_Request1 | PR1_Sync_Own_Image | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR1_Sync_Own_Image.dg) |
| Exceptions | EXC_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Generate_Number.dg) |
| Exceptions | EXC_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Set_Defaults.dg) |
| Exceptions | EXC_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Status_Timestamps.dg) |
| Exceptions | EXC_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Validate_Status.dg) |
| Receiving | Receiving_Compute_Totals | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Compute_Totals.dg) |
| Receiving | Receiving_Set_Line_Result | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Set_Line_Result.dg) |
| Receiving | Receiving_Validate_Qty | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Validate_Qty.dg) |
| Receiving | Receiving_Auto_Exception | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Auto_Exception.dg) |
| Replacement_Request | RR_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Replacement_Request/RR_Generate_Number.dg) |
| Replacement_Request | RR_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Replacement_Request/RR_Set_Defaults.dg) |
| Replacement_Request | RR_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Replacement_Request/RR_Status_Timestamps.dg) |
| Replacement_Request | RR_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Replacement_Request/RR_Validate_Status.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Generate_Number1.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Set_Defaults1.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Status_Timestamps1.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Validate_Status1.dg) |
| Tony_Fan_Replacement_Request | RR_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Generate_Number2.dg) |
| Tony_Fan_Replacement_Request | RR_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Set_Defaults2.dg) |
| Tony_Fan_Replacement_Request | RR_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Status_Timestamps2.dg) |
| Tony_Fan_Replacement_Request | RR_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Validate_Status2.dg) |
| Receiving | Damage_Missing_Details | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Damage_Missing_Details.dg) |
| Receiving | Receiving_Set_Receive_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Set_Receive_Sta.dg) |
| Receiving | Receiving_Sync_Product_Context | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Sync_Product_Co.dg) |
| Receiving | Receiving_Sync_Shipment_Mode | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Sync_Shipment_M.dg) |
| Service_Appointment_Form | SA_Site_Confirmation_Initiate | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Init__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Init__2.dg) |
| Service_Appointment_Form | SA_Site_Confirmation_Validate | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Vali.dg) |
| Service_Appointment_Form | SA_Scheduling_Engine | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__2.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__3.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__4.dg) |
| Service_Appointment_Form | SA_Scheduling_Override_Validate | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Override_Va.dg) |
| Service_Appointment_Form | SA_Sync_Sales_Order_Display | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Sync_Sales_Order_Displ.dg) |
| Sales_Order_Fulfillment | SO to Readiness | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SO_to_Readiness.dg) |
| Service_Appointment_Form | SA_Geocode_Address | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Geocode_Address.dg) |
| Receiving | Receiving_Sync_Shipment_Arrived | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Sync_Shipment_A.dg) |
| Pick1 | Pick1 Marked to Pack Sync | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pick1/Pick1_Marked_to_Pack_Sync.dg) |
| Pack | PACK SEND TO QC | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pack/PACK_SEND_TO_QC.dg) |
| Checker_Checklist | QC Approved sync to Crate or Order Aggregation | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Checker_Checklist/QC_Approved_sync_to_Crate.dg) |
| Crate_Checklist | Crating Done sync to Order Aggregation | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Crate_Checklist/Crating_Done_sync_to_Orde.dg) |
| Checker_Checklist | Show/Hide Damage Detail Fields | on add or edit | [on user input of Item_to_Replace](../../zoho-export/parsed/workflows/form/Checker_Checklist/Show_Hide_Damage_Detail_F.dg) |
| Checker_Checklist | Set initial visibility | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Checker_Checklist/Set_initial_visibility.dg) |
| Sales_Order_Readiness_Gate | Show Release on Picker Assigned | on add or edit | [on user input of Assign_Picker](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Show_Release_on_Picker_As.dg) |
| Sales_Order_Readiness_Gate | Set Release Visibility on Load | on edit | [on load](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Set_Release_Visibility_on.dg) |
| Sales_Order_Readiness_Gate | Release Records to Pick1 | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Release_Records_to_Pick1.dg) |
| Purchase_Request1 | Notify on Purchase Request - Add | on add | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/Notify_on_Purchase_Reques1.dg) |
| Receiving | Notify on Receiving Completed | on edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Notify_on_Receiving_Compl.dg) |
| Receiving | Notify on Receiving Quantity Mismatch | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Notify_on_Receiving_Quant.dg) |
| Exceptions | Notify on Created Exception | on add | [on success](../../zoho-export/parsed/workflows/form/Exceptions/Notify_on_Created_Excepti.dg) |
| Sales_Order_Fulfillment | SOF_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Notify_New_Record.dg) |
| Pre_Order_FF | PreOrderFF_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Pre_Order_FF/PreOrderFF_Notify_New_Rec.dg) |
| Sales_Order_Readiness_Gate | ReadinessGate_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/ReadinessGate_Notify_New_.dg) |
| Checker_Checklist | QC_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Checker_Checklist/QC_Notify_New_Record.dg) |
| Order_Aggregation1 | OrderAgg_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Order_Aggregation1/OrderAgg_Notify_New_Recor.dg) |
| Pick1 | Pick1_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Pick1/Pick1_Notify_New_Record.dg) |
| Pack | Pack_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Pack/Pack_Notify_New_Record.dg) |
| Fenteng_Lighting_Replacement_Request | Notify Fenteng on Replacement Request added | on add | [on success](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/Notify_Fenteng_on_Replace.dg) |
| Fenteng_Lighting_Purchase_Order | Notify Fenteng on Purchase Order added | on add | [on success](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/Notify_Fenteng_on_Purchas.dg) |
| Tony_Fan_Purchase_Order | Notify Tony on Purchase Order added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Order/Notify_Tony_on_Purchase_O.dg) |
| Tony_Fan_Replacement_Request | Notify Tony on Replacement Request Added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/Notify_Tony_on_Replacemen.dg) |
| Pre_Order_FF | PO to Readiness | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pre_Order_FF/PO_to_Readiness.dg) |
| Order_Aggregation1 | Sync Fulfillment Stage on Dispatch | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Order_Aggregation1/Sync_Fulfillment_Stage_on.dg) |
| Service_Appointment_Form | SA_Sync_Sales_Order_Display | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Sync_Sales_Order_Displ1.dg) |
| Warehouse_Request | Warehouse_Request_Item_Image_Backfill | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Warehouse_Request/Warehouse_Request_Item_Im.dg) |
| Delivery_Scheduling | DS_Validate_Team_Capacity | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Delivery_Scheduling/DS_Validate_Team_Capacity1.dg) |
| Pick1 | Pick1 Marked to QC Sync | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pick1/Pick1_Marked_to_QC_Sync.dg) |
| Purchase_Request1 | PR1_Forecast_Stamp | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR1_Forecast_Stamp.dg) |
| Sales_Order_Readiness_Gate | GATE_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/GATE_Instant_Forecast.dg) |
| Pre_Order_FF | PREORDER_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pre_Order_FF/PREORDER_Instant_Forecast.dg) |
| Pick1 | GATE_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pick1/GATE_Instant_Forecast1.dg) |
| Checker_Checklist | QC_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Checker_Checklist/QC_Instant_Forecast.dg) |
| Crate_Checklist | CRATE_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Crate_Checklist/CRATE_Instant_Forecast.dg) |
| Order_Aggregation1 | OA_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Order_Aggregation1/OA_Instant_Forecast.dg) |
| Delivery_Scheduling | ISCHED_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Delivery_Scheduling/ISCHED_Instant_Forecast.dg) |
| Service_Appointment_Form | SA_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Instant_Forecast.dg) |
| Sales_Order_Fulfillment | SOF_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Instant_Forecast.dg) |
| Purchase_Request1 | PR_Approved | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__3.dg) |
| Tony_Fan_Purchase_Order | Acknowledged_PO_Supplier2 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Tony_Fan_Purchase_Order/Acknowledged_PO_Supplier2.dg) |
| Fenteng_Lighting_Purchase_Order | Acknowledged_PO_Supplier1 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Fenteng_Lighting_Purchase_Order/Acknowledged_PO_Supplier1.dg) |
| Receiving | Create_Bin_Receiving | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Receiving/Create_Bin_Receiving.dg) |
| Exceptions | Create_RR | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__3.dg) |
| Fenteng_Lighting_Replacement_Request | Approve_RR_Supplier1 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Fenteng_Lighting_Replacement_Request/Approve_RR_Supplier1.dg) |
| Tony_Fan_Replacement_Request | Approve_RR_Supplier2 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Tony_Fan_Replacement_Request/Approve_RR_Supplier2.dg) |
| Service_Appointment_Form | Re_Schedule | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Service_Appointment_Form/Re_Schedule.dg) |
| Pre_Order_FF | Create_Package_FF | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Pre_Order_FF/Create_Package_FF.dg) |

## Obsidian notes

[Deluge Scripts (Obsidian)/Fulfillment](../../vault/Deluge%20Scripts%20(Obsidian)/Fulfillment)
