# Analytic

Tabs, in app menu order. Each folder is the Zoho widget source (`app/` + `plugin-manifest.json`).

| Tab | Zoho page | Widget folder | Source zip |
|---|---|---|---|
| Supply Chain Analytic (widget matched by name, check against Zoho) | `Supply_Chain_Analytic` | [Supply Chain Analytic](Supply%20Chain%20Analytic/app/index.html) | `_Shared/Widget/Supply Chain Conversion/SupplyChainConversion.zip` |

## Custom APIs the tabs call

None.

## Forms (database tables)

| Form | Fields | Spec |
|---|---|---|
| DMS Exception Queue | 15 | [DMS_Exception_Queue.json](../../zoho-export/parsed/forms/DMS_Exception_Queue.json) |
| Exception Control | 46 | [Exception_Control1.json](../../zoho-export/parsed/forms/Exception_Control1.json) |
| Exceptions | 30 | [Exceptions.json](../../zoho-export/parsed/forms/Exceptions.json) |
| Pack | 22 | [Pack.json](../../zoho-export/parsed/forms/Pack.json) |
| Purchase Order | 25 | [Purchase_Order.json](../../zoho-export/parsed/forms/Purchase_Order.json) |
| Purchase Request | 77 | [Purchase_Request1.json](../../zoho-export/parsed/forms/Purchase_Request1.json) |
| Sales Order Fulfillment | 28 | [Sales_Order_Fulfillment.json](../../zoho-export/parsed/forms/Sales_Order_Fulfillment.json) |
| Service Appointment Form | 99 | [Service_Appointment_Form.json](../../zoho-export/parsed/forms/Service_Appointment_Form.json) |

## Reports

- `All_DMS_Exception_Queue` (form `DMS_Exception_Queue`)
- `All_Purchase_Orders` (form `Purchase_Order`)
- `All_Purchase_Request` (form `Purchase_Request1`)
- `Exception_Control_Report` (form `Exception_Control1`)
- `Exceptions_Report` (form `Exceptions`)
- `Sales_Order_Fulfillment_Report` (form `Sales_Order_Fulfillment`)
- `Service_Appointment` (form `Service_Appointment_Form`)

## Deluge functions

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
| Purchase_Request1 | PR_Compute_Priority | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Compute_Priority.dg) |
| Purchase_Order | PO_Lock_UI_Fields | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Lock_UI_Fields.dg) |
| Purchase_Request1 | PR1_Sync_Own_Image | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR1_Sync_Own_Image.dg) |
| Exceptions | EXC_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Generate_Number.dg) |
| Exceptions | EXC_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Set_Defaults.dg) |
| Exceptions | EXC_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Status_Timestamps.dg) |
| Exceptions | EXC_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Validate_Status.dg) |
| Service_Appointment_Form | SA_Site_Confirmation_Initiate | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Init__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Init__2.dg) |
| Service_Appointment_Form | SA_Site_Confirmation_Validate | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Vali.dg) |
| Service_Appointment_Form | SA_Scheduling_Engine | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__2.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__3.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__4.dg) |
| Service_Appointment_Form | SA_Scheduling_Override_Validate | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Override_Va.dg) |
| Service_Appointment_Form | SA_Sync_Sales_Order_Display | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Sync_Sales_Order_Displ.dg) |
| DMS_Exception_Queue | EXC_Resolve_Sync | on add or edit | [on success](../../zoho-export/parsed/workflows/form/DMS_Exception_Queue/EXC_Resolve_Sync.dg) |
| Sales_Order_Fulfillment | SO to Readiness | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SO_to_Readiness.dg) |
| Service_Appointment_Form | SA_Geocode_Address | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Geocode_Address.dg) |
| Pack | PACK SEND TO QC | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pack/PACK_SEND_TO_QC.dg) |
| Purchase_Request1 | Notify on Purchase Request - Add | on add | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/Notify_on_Purchase_Reques1.dg) |
| Exceptions | Notify on Created Exception | on add | [on success](../../zoho-export/parsed/workflows/form/Exceptions/Notify_on_Created_Excepti.dg) |
| Sales_Order_Fulfillment | SOF_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Notify_New_Record.dg) |
| Pack | Pack_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Pack/Pack_Notify_New_Record.dg) |
| Service_Appointment_Form | SA_Sync_Sales_Order_Display | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Sync_Sales_Order_Displ1.dg) |
| Purchase_Request1 | PR1_Forecast_Stamp | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR1_Forecast_Stamp.dg) |
| Service_Appointment_Form | SA_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Instant_Forecast.dg) |
| Sales_Order_Fulfillment | SOF_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Instant_Forecast.dg) |
| Purchase_Request1 | PR_Approved | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__3.dg) |
| Exceptions | Create_RR | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__3.dg) |
| Service_Appointment_Form | Re_Schedule | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Service_Appointment_Form/Re_Schedule.dg) |
