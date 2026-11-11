# Procurement

Tabs, in app menu order. Each folder is the Zoho widget source (`app/` + `plugin-manifest.json`).

| Tab | Zoho page | Widget folder | Source zip |
|---|---|---|---|
| Dashboard | `Dashboard` | [Dashboard](Dashboard/app/index.html) | `Procurement/Dashboard/Widget/ProcurementDashboard.zip` |
| Inquiry List | `Inquiry` | [Inquiry List](Inquiry%20List/app/index.html) | `Procurement/Inquiry/Widget/INQsv2.zip` |
| Purchase Request | `Purchase_Request` | [Purchase Request](Purchase%20Request/app/index.html) | `Procurement/Purchase Request/Widget/PRs.zip` |
| Purchase Order | `Purchase_Order1` | [Purchase Order](Purchase%20Order/app/PO.html) | `Procurement/Purchase Order/Widget/POs.zip` |
| Shipments | `Shipments1` | [Shipments](Shipments/app/index.html) | `Procurement/Shipments/Widget/Shipmentsv2.zip` |
| Receiving | `Receiving1` | [Receiving](Receiving/app/index.html) | `Procurement/Receiving/Widget/Receiving.zip` |
| Replacement Request | `Replacement_Request1` | [Replacement Request](Replacement%20Request/app/index.html) | `Procurement/Replacement/Widget/ReplacementRequest.zip` |
| Exceptions | `Exceptions1` | [Exceptions](Exceptions/app/index.html) | `Procurement/Exceptions/Widget/Exception.zip` |
| Forecast Setting (widget matched by name, check against Zoho) | `Forecast_Setting` | [Forecast Setting](Forecast%20Setting/app/index.html) | `_Shared/Forecast/Widget/Delivery Forecast/DeliveryForecast.zip` |

## Custom APIs the tabs call

| Custom API | Deluge function | Local app |
|---|---|---|
| `add_item_by_id` | [addItemByIdBooks](../../zoho-export/parsed/functions/addItemByIdBooks.dg) | Not ported yet |
| `clone_shipment_for_replacement` | [cloneShipmentForReplacement](../../zoho-export/parsed/functions/cloneShipmentForReplacement.dg) | Not ported yet |
| `create_bin_receiving` | [createBinReceivingWidget](../../zoho-export/parsed/functions/createBinReceivingWidget.dg) | Not ported yet |
| `create_books_contact` | [createBooksContact](../../zoho-export/parsed/functions/createBooksContact.dg) | Not ported yet |
| `create_estimate` | [createEstimateForInquiry](../../zoho-export/parsed/functions/createEstimateForInquiry.dg) | Not ported yet |
| `create_receiving_from_shipment` | [createReceivingFromShipmentWidget](../../zoho-export/parsed/functions/createReceivingFromShipmentWidget.dg) | Not ported yet |
| `create_rr_fenteng` | [createRRFenteng](../../zoho-export/parsed/functions/createRRFenteng.dg) | Not ported yet |
| `create_rr_main` | [createRRMain](../../zoho-export/parsed/functions/createRRMain.dg) | Not ported yet |
| `create_rr_tony` | [createRRTony](../../zoho-export/parsed/functions/createRRTony.dg) | Not ported yet |

## Forms (database tables)

| Form | Fields | Spec |
|---|---|---|
| App Notifications | 9 | [App_Notifications.json](../../zoho-export/parsed/forms/App_Notifications.json) |
| Quality Check | 52 | [Checker_Checklist.json](../../zoho-export/parsed/forms/Checker_Checklist.json) |
| Crate Checklist | 31 | [Crate_Checklist.json](../../zoho-export/parsed/forms/Crate_Checklist.json) |
| Customer | 10 | [Customer.json](../../zoho-export/parsed/forms/Customer.json) |
| Evidence Photos | 7 | [Evidence_Photos.json](../../zoho-export/parsed/forms/Evidence_Photos.json) |
| Exception Control | 46 | [Exception_Control1.json](../../zoho-export/parsed/forms/Exception_Control1.json) |
| Exception Internal Messages | 6 | [Exception_Internal_Messages.json](../../zoho-export/parsed/forms/Exception_Internal_Messages.json) |
| Exception Timeline | 7 | [Exception_Timeline.json](../../zoho-export/parsed/forms/Exception_Timeline.json) |
| Exceptions | 30 | [Exceptions.json](../../zoho-export/parsed/forms/Exceptions.json) |
| Fenteng Lighting Purchase Order | 20 | [Fenteng_Lighting_Purchase_Order.json](../../zoho-export/parsed/forms/Fenteng_Lighting_Purchase_Order.json) |
| Fenteng Lighting Replacement  Request | 28 | [Fenteng_Lighting_Replacement_Request.json](../../zoho-export/parsed/forms/Fenteng_Lighting_Replacement_Request.json) |
| Fenteng Shipment | 5 | [Fenteng_Shipment.json](../../zoho-export/parsed/forms/Fenteng_Shipment.json) |
| Forecast Settings | 25 | [Forecast_Settings.json](../../zoho-export/parsed/forms/Forecast_Settings.json) |
| Inquiry Form | 66 | [Inquiry_Form.json](../../zoho-export/parsed/forms/Inquiry_Form.json) |
| Inquiry Internal Messages | 6 | [Inquiry_Internal_Messages.json](../../zoho-export/parsed/forms/Inquiry_Internal_Messages.json) |
| Inquiry Messages | 7 | [Inquiry_Messages.json](../../zoho-export/parsed/forms/Inquiry_Messages.json) |
| Inquiry Timeline | 7 | [Inquiry_Timeline.json](../../zoho-export/parsed/forms/Inquiry_Timeline.json) |
| Items | 12 | [Items.json](../../zoho-export/parsed/forms/Items.json) |
| PO Messages | 7 | [PO_Messages.json](../../zoho-export/parsed/forms/PO_Messages.json) |
| PR Internal Messages | 6 | [PR_Internal_Messages.json](../../zoho-export/parsed/forms/PR_Internal_Messages.json) |
| PR Messages | 7 | [PR_Messages.json](../../zoho-export/parsed/forms/PR_Messages.json) |
| PR Timeline | 7 | [PR_Timeline.json](../../zoho-export/parsed/forms/PR_Timeline.json) |
| Pack | 22 | [Pack.json](../../zoho-export/parsed/forms/Pack.json) |
| Pick | 26 | [Pick1.json](../../zoho-export/parsed/forms/Pick1.json) |
| Policy Settings | 7 | [Policy_Settings.json](../../zoho-export/parsed/forms/Policy_Settings.json) |
| Projects | 9 | [Projects.json](../../zoho-export/parsed/forms/Projects.json) |
| Purchase Order | 25 | [Purchase_Order.json](../../zoho-export/parsed/forms/Purchase_Order.json) |
| Purchase Request | 77 | [Purchase_Request1.json](../../zoho-export/parsed/forms/Purchase_Request1.json) |
| Receiving | 38 | [Receiving.json](../../zoho-export/parsed/forms/Receiving.json) |
| Receiving Internal Messages | 6 | [Receiving_Internal_Messages.json](../../zoho-export/parsed/forms/Receiving_Internal_Messages.json) |
| Receiving Timeline | 7 | [Receiving_Timeline.json](../../zoho-export/parsed/forms/Receiving_Timeline.json) |
| Replacement  Request | 31 | [Replacement_Request.json](../../zoho-export/parsed/forms/Replacement_Request.json) |
| Sales Order | 42 | [Sales_Order.json](../../zoho-export/parsed/forms/Sales_Order.json) |
| Sales Order Fulfillment | 28 | [Sales_Order_Fulfillment.json](../../zoho-export/parsed/forms/Sales_Order_Fulfillment.json) |
| Sales Order Readiness Gate | 38 | [Sales_Order_Readiness_Gate.json](../../zoho-export/parsed/forms/Sales_Order_Readiness_Gate.json) |
| Shipment Internal Messages | 6 | [Shipment_Internal_Messages.json](../../zoho-export/parsed/forms/Shipment_Internal_Messages.json) |
| Shipment Timeline | 7 | [Shipment_Timeline.json](../../zoho-export/parsed/forms/Shipment_Timeline.json) |
| Shipments | 34 | [Shipments.json](../../zoho-export/parsed/forms/Shipments.json) |
| Fenteng Lighting | 33 | [Supplier_1.json](../../zoho-export/parsed/forms/Supplier_1.json) |
| Tony Fan | 33 | [Supplier_2.json](../../zoho-export/parsed/forms/Supplier_2.json) |
| Suppliers | 9 | [Suppliers.json](../../zoho-export/parsed/forms/Suppliers.json) |
| Tony Fan Purchase Order | 20 | [Tony_Fan_Purchase_Order.json](../../zoho-export/parsed/forms/Tony_Fan_Purchase_Order.json) |
| Tony Fan Replacement  Request | 28 | [Tony_Fan_Replacement_Request.json](../../zoho-export/parsed/forms/Tony_Fan_Replacement_Request.json) |
| Tony Shipment | 5 | [Tony_Shipment.json](../../zoho-export/parsed/forms/Tony_Shipment.json) |

## Reports

- `All_Crates` (form `Crate_Checklist`)
- `All_Customers` (form `Customer`)
- `All_Evidence_Photos` (form `Evidence_Photos`)
- `All_Inquiries` (form `Inquiry_Form`)
- `All_Inquiry_Messages` (form `Inquiry_Messages`)
- `All_Items` (form `Items`)
- `All_PO_Messages` (form `PO_Messages`)
- `All_PR_Messages` (form `PR_Messages`)
- `All_Purchase_Orders` (form `Purchase_Order`)
- `All_Purchase_Request` (form `Purchase_Request1`)
- `All_Qc_Reports1` (form `Checker_Checklist`)
- `All_Shipments` (form `Shipments`)
- `All_Suppliers` (form `Suppliers`)
- `App_Notifications_Report` (form `App_Notifications`)
- `Exception_Control_Report` (form `Exception_Control1`)
- `Exception_Internal_Messages_Report` (form `Exception_Internal_Messages`)
- `Exception_Timeline_Report` (form `Exception_Timeline`)
- `Exceptions_Report` (form `Exceptions`)
- `Fenteng_Lighting_Purchase_Order_Report` (form `Fenteng_Lighting_Purchase_Order`)
- `Fenteng_Lighting_Replacement_Request_Report` (form `Fenteng_Lighting_Replacement_Request`)
- `Fenteng_Shipment_Report` (form `Fenteng_Shipment`)
- `Inquiry_Internal_Messages_Report` (form `Inquiry_Internal_Messages`)
- `Inquiry_Timeline_Report` (form `Inquiry_Timeline`)
- `PO_Grouping` (form `Purchase_Request1`)
- `PR_Internal_Messages_Report` (form `PR_Internal_Messages`)
- `PR_Timeline_Report` (form `PR_Timeline`)
- `Pick1_Report` (form `Pick1`)
- `Projects_Report` (form `Projects`)
- `Quote_Groups` (form `Inquiry_Form`)
- `Receiving_Group` (form `Receiving`)
- `Receiving_Internal_Messages_Report` (form `Receiving_Internal_Messages`)
- `Receiving_Report` (form `Receiving`)
- `Receiving_Timeline_Report` (form `Receiving_Timeline`)
- `Replacement_Request_Report` (form `Replacement_Request`)
- `Sales_Order_Fulfillment_Report` (form `Sales_Order_Fulfillment`)
- `Sales_Order_Readiness_Gate_Report` (form `Sales_Order_Readiness_Gate`)
- `Shipment_Groupings` (form `Shipments`)
- `Shipment_Internal_Messages_Report` (form `Shipment_Internal_Messages`)
- `Shipment_Timeline_Report` (form `Shipment_Timeline`)
- `Supplier_1_Report` (form `Supplier_1`)
- `Supplier_2_Report` (form `Supplier_2`)
- `Tony_Fan_Purchase_Order_Report` (form `Tony_Fan_Purchase_Order`)
- `Tony_Fan_Replacement_Request_Report` (form `Tony_Fan_Replacement_Request`)
- `Tony_Shipment_Report` (form `Tony_Shipment`)

## Deluge functions

- [addItemByIdBooks](../../zoho-export/parsed/functions/addItemByIdBooks.dg)(String itemBooksId)
- [cloneShipmentForReplacement](../../zoho-export/parsed/functions/cloneShipmentForReplacement.dg)(String rrRecordId)
- [createBinReceivingWidget](../../zoho-export/parsed/functions/createBinReceivingWidget.dg)(String receivingId)
- [createBooksContact](../../zoho-export/parsed/functions/createBooksContact.dg)(String customerId, String custName, String custType, String custEmail, String custPhone, String custMobile, String companyName, String custSubType, String salutation, String firstName, String lastName, String billAddress, String billCity, String billState, String billZip, String billCountry, String billAttention, String billPhone, String billFax, String shipAddress, String shipCity, String shipState, String shipZip, String shipCountry, String shipAttention, String shipPhone, String shipFax)
- [createEstimateForInquiry](../../zoho-export/parsed/functions/createEstimateForInquiry.dg)(String inqNo)
- [createRRFenteng](../../zoho-export/parsed/functions/createRRFenteng.dg)(String exceptionId)
- [createRRMain](../../zoho-export/parsed/functions/createRRMain.dg)(String exceptionId)
- [createRRTony](../../zoho-export/parsed/functions/createRRTony.dg)(String exceptionId)
- [createReceivingFromShipmentWidget](../../zoho-export/parsed/functions/createReceivingFromShipmentWidget.dg)(String shipmentId)
- [fcPrToPreOrder](../../zoho-export/parsed/functions/fcPrToPreOrder.dg)(int prId)
- [fcStampBySoNo](../../zoho-export/parsed/functions/fcStampBySoNo.dg)(string soNo)
- [fcStampPurchaseRequest](../../zoho-export/parsed/functions/fcStampPurchaseRequest.dg)(int prId)

## Workflows on these forms

| Form | Workflow | Trigger | Script |
|---|---|---|---|
| Inquiry_Form | INQ_Auto_Populate_Supplier_Quotes | on add | [on validate](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_Auto_Populate_Supplie1.dg) |
| Inquiry_Form | Supplier_Populate_From_INQ | on add | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Supplier_Populate_From_IN__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Supplier_Populate_From_IN__2.dg) |
| Inquiry_Form | INQ_Load_Unit_Choices | on add | [on load](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_Load_Unit_Choices.dg) |
| Supplier_2 | Disable_Item_Field_Supplier | on add | [field rules](../../zoho-export/parsed/workflows/form/Supplier_2/Disable_Item_Field_Suppli.dg) |
| Supplier_2 | Disable_Item_Field_Edit_Supplier | on edit | [on load](../../zoho-export/parsed/workflows/form/Supplier_2/Disable_Item_Field_Edit_S__1.dg)<br>[on load](../../zoho-export/parsed/workflows/form/Supplier_2/Disable_Item_Field_Edit_S__2.dg) |
| Inquiry_Form | INQ_Default_All_Suppliers | on add | [on load](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_Default_All_Suppliers.dg) |
| Inquiry_Form | INQ_AutoFill_Customer_Type | on add or edit | [on user input of Customer](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_AutoFill_Customer_Typ.dg) |
| Purchase_Request1 | PR_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Generate_Number.dg) |
| Purchase_Request1 | PR_AutoFill_Item_Details | on add or edit | [on user input of Items](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_AutoFill_Item_Details.dg) |
| Supplier_2 | Stage_Supplier_Changed | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Supplier_2/Stage_Supplier_Changed__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Supplier_2/Stage_Supplier_Changed__2.dg) |
| Inquiry_Form | Selected_Uncheck_Others | on add or edit | [on user input of Supplier_Quotes.Selected](../../zoho-export/parsed/workflows/form/Inquiry_Form/Selected_Uncheck_Others.dg) |
| Inquiry_Form | Stage_Inquiry_Changed | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Stage_Inquiry_Changed__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Stage_Inquiry_Changed__2.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Stage_Inquiry_Changed__3.dg) |
| Supplier_2 | Mandatory_Supplier_Fields | on edit | [on validate](../../zoho-export/parsed/workflows/form/Supplier_2/Mandatory_Supplier_Fields.dg) |
| Purchase_Request1 | autofill customer type | on add or edit | [on user input of Customer](../../zoho-export/parsed/workflows/form/Purchase_Request1/autofill_customer_type.dg) |
| Inquiry_Form | INQ_AutoFill_Item_Details_2 | on add or edit | [on user input of Items](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_AutoFill_Item_Details1.dg) |
| Projects | Proj_Code_AutoNumber | on add | [on validate](../../zoho-export/parsed/workflows/form/Projects/Proj_Code_AutoNumber.dg) |
| Inquiry_Form | INQ_AutoFill_Project_Name | on add or edit | [on user input of Projects](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_AutoFill_Project_Name.dg) |
| Supplier_1 | Disable_Item_Field_Supplier | on add | [field rules](../../zoho-export/parsed/workflows/form/Supplier_1/Disable_Item_Field_Suppli1.dg) |
| Supplier_1 | Disable_Item_Field_Edit_Supplier | on edit | [on load](../../zoho-export/parsed/workflows/form/Supplier_1/Disable_Item_Field_Edit_S1__1.dg)<br>[on load](../../zoho-export/parsed/workflows/form/Supplier_1/Disable_Item_Field_Edit_S1__2.dg) |
| Supplier_1 | Stage_Supplier_Changed | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Supplier_1/Stage_Supplier_Changed1__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Supplier_1/Stage_Supplier_Changed1__2.dg) |
| Supplier_1 | Mandatory_Supplier_Fields | on edit | [on validate](../../zoho-export/parsed/workflows/form/Supplier_1/Mandatory_Supplier_Fields1.dg) |
| Inquiry_Form | Disable_Supplier_Quotes_LastEdited | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Inquiry_Form/Disable_Supplier_Quotes_L.dg) |
| Purchase_Request1 | PR_Sync_Supplier_Load_Balancing | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Sync_Supplier_Load_Bal.dg) |
| Purchase_Request1 | PR_Sync_Supplier_Selected | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Sync_Supplier_Selected.dg) |
| Purchase_Request1 | PR_Check_Readiness | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Check_Readiness.dg) |
| Purchase_Request1 | Select_Unselect_Supplier | on add or edit | [on user input of Supplier_Selected.Selected](../../zoho-export/parsed/workflows/form/Purchase_Request1/Select_Unselect_Supplier.dg) |
| Purchase_Request1 | PR_Set_Default_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Set_Default_Status.dg) |
| Purchase_Order | PO_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Generate_Number.dg) |
| Purchase_Request1 | PR_Lock_After_PO | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Lock_After_PO1.dg) |
| Purchase_Request1 | PR_Lock_UI_Fields | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Lock_UI_Fields.dg) |
| Supplier_2 | Disable_Item_Field_Edit_Supplier1 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Supplier_2/Disable_Item_Field_Edit_S2.dg) |
| Supplier_1 | Disable_Item_Field_Edit_Supplier1 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Supplier_1/Disable_Item_Field_Edit_S3.dg) |
| Inquiry_Form | Delete_Item_On_Supplier | on delete | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Delete_Item_On_Supplier.dg) |
| Purchase_Request1 | PR_Populate_From_PR | on add | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Populate_From_PR__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Populate_From_PR__2.dg) |
| Purchase_Request1 | PR_Changed | on edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Changed__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Changed__2.dg) |
| Purchase_Request1 | PR_Deleted | on delete | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Deleted.dg) |
| Shipments | Shipment_Autofill_From_PO | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Autofill_From_PO1.dg) |
| Shipments | Shipment_Autofill_From_PO_Live | on add or edit | [on user input of PO_No](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Autofill_From_PO2.dg) |
| Shipments | Shipment_Refresh_PR_Details_OnLoad | on add or edit | [on user input of PO_No](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Refresh_PR_Detai.dg) |
| Shipments | Shipment_Lock_PO_Fields | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Lock_PO_Fields.dg) |
| Purchase_Request1 | PR_Export_Selected_Supplier | on edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Export_Selected_Suppli.dg) |
| Purchase_Request1 | PR_Compute_Shipment_Timeline | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Compute_Shipment_Timel.dg) |
| Purchase_Order | PO_Compute_Totals | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Compute_Totals.dg) |
| Purchase_Order | PO_Detect_Mixed | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Detect_Mixed.dg) |
| Purchase_Order | PO_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Order/PO_Status_Timestamps.dg) |
| Inquiry_Form | Item_Image_Create_Update | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Item_Image_Create_Update.dg) |
| Purchase_Request1 | PR_Set_Shipment_Mode | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Set_Shipment_Mode.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Generate_Number2.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Compute_Totals | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Compute_Totals2.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Detect_Mixed | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Detect_Mixed2.dg) |
| Fenteng_Lighting_Purchase_Order | PO_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/PO_Status_Timestamps2.dg) |
| Tony_Fan_Purchase_Order | Disable_All_Fields_PO_Supplier2 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Order/Disable_All_Fields_PO_Sup.dg) |
| Fenteng_Lighting_Purchase_Order | Disable_All_Fields_PO_Supplier1 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/Disable_All_Fields_PO_Sup1.dg) |
| Receiving | Receiving_Populate_From_Shipment | on add or edit | [on user input of Shipments](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Populate_From_S.dg) |
| Shipments | Shipment_Edited_Sync_Receiving | on edit | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Edited_Sync_Rece.dg) |
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
| Inquiry_Form | INQ_Check_Readiness | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_Check_Readiness.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Generate_Number1.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Set_Defaults1.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Status_Timestamps1.dg) |
| Fenteng_Lighting_Replacement_Request | RR_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/RR_Validate_Status1.dg) |
| Tony_Fan_Replacement_Request | RR_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Generate_Number2.dg) |
| Tony_Fan_Replacement_Request | RR_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Set_Defaults2.dg) |
| Tony_Fan_Replacement_Request | RR_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Status_Timestamps2.dg) |
| Tony_Fan_Replacement_Request | RR_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/RR_Validate_Status2.dg) |
| Inquiry_Form | INQ_AutoFill_Product_Image | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_AutoFill_Product_Imag.dg) |
| Receiving | Damage_Missing_Details | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Damage_Missing_Details.dg) |
| Receiving | Receiving_Set_Receive_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Set_Receive_Sta.dg) |
| Shipments | Shipment_Track_Previous_Status | on edit | [on validate](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Track_Previous_S.dg) |
| Receiving | Receiving_Sync_Product_Context | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Sync_Product_Co.dg) |
| Receiving | Receiving_Sync_Shipment_Mode | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Sync_Shipment_M.dg) |
| Shipments | Shipments_Sync_Shipment_Mode_To_Receiving | on edit | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipments_Sync_Shipment_M.dg) |
| Sales_Order_Fulfillment | SO to Readiness | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SO_to_Readiness.dg) |
| Shipments | Shipment_Status_Back_Sync | on edit | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Status_Back_Sync.dg) |
| Receiving | Receiving_Sync_Shipment_Arrived | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Sync_Shipment_A.dg) |
| Shipments | Shipment_Generate_Number | on add | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Generate_Number.dg) |
| Pick1 | Pick1 Marked to Pack Sync | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pick1/Pick1_Marked_to_Pack_Sync.dg) |
| Pack | PACK SEND TO QC | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pack/PACK_SEND_TO_QC.dg) |
| Checker_Checklist | QC Approved sync to Crate or Order Aggregation | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Checker_Checklist/QC_Approved_sync_to_Crate.dg) |
| Crate_Checklist | Crating Done sync to Order Aggregation | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Crate_Checklist/Crating_Done_sync_to_Orde.dg) |
| Checker_Checklist | Show/Hide Damage Detail Fields | on add or edit | [on user input of Item_to_Replace](../../zoho-export/parsed/workflows/form/Checker_Checklist/Show_Hide_Damage_Detail_F.dg) |
| Checker_Checklist | Set initial visibility | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Checker_Checklist/Set_initial_visibility.dg) |
| Inquiry_Form | Log Updated Itemm | on edit |  |
| Sales_Order_Readiness_Gate | Show Release on Picker Assigned | on add or edit | [on user input of Assign_Picker](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Show_Release_on_Picker_As.dg) |
| Sales_Order_Readiness_Gate | Set Release Visibility on Load | on edit | [on load](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Set_Release_Visibility_on.dg) |
| Sales_Order_Readiness_Gate | Release Records to Pick1 | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Release_Records_to_Pick1.dg) |
| Purchase_Request1 | Notify on Purchase Request - Add | on add | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/Notify_on_Purchase_Reques1.dg) |
| PR_Messages | Notify on PR supplier reply | on add | [on success](../../zoho-export/parsed/workflows/form/PR_Messages/Notify_on_PR_supplier_rep.dg) |
| Receiving | Notify on Receiving Completed | on edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Notify_on_Receiving_Compl.dg) |
| Receiving | Notify on Receiving Quantity Mismatch | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Notify_on_Receiving_Quant.dg) |
| Exceptions | Notify on Created Exception | on add | [on success](../../zoho-export/parsed/workflows/form/Exceptions/Notify_on_Created_Excepti.dg) |
| Inquiry_Form | INQ_Generate_Number | on add | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_Generate_Number.dg) |
| Sales_Order_Fulfillment | SOF_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Notify_New_Record.dg) |
| Sales_Order_Readiness_Gate | ReadinessGate_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/ReadinessGate_Notify_New_.dg) |
| Checker_Checklist | QC_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Checker_Checklist/QC_Notify_New_Record.dg) |
| Pick1 | Pick1_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Pick1/Pick1_Notify_New_Record.dg) |
| Pack | Pack_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Pack/Pack_Notify_New_Record.dg) |
| Inquiry_Messages | Notify on supplier Inquiry response | on add | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Messages/Notify_on_supplier_Inquir.dg) |
| Inquiry_Form | Notify Suppliers on Inquiry Added | on add | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Notify_Suppliers_on_Inqui.dg) |
| Fenteng_Lighting_Replacement_Request | Notify Fenteng on Replacement Request added | on add | [on success](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Replacement_Request/Notify_Fenteng_on_Replace.dg) |
| Fenteng_Lighting_Purchase_Order | Notify Fenteng on Purchase Order added | on add | [on success](../../zoho-export/parsed/workflows/form/Fenteng_Lighting_Purchase_Order/Notify_Fenteng_on_Purchas.dg) |
| Fenteng_Shipment | Notify Fenteng on Shipment Added | on add | [on success](../../zoho-export/parsed/workflows/form/Fenteng_Shipment/Notify_Fenteng_on_Shipmen.dg) |
| Fenteng_Shipment | Fenteng_Shipment_Sync | on edit | [on success](../../zoho-export/parsed/workflows/form/Fenteng_Shipment/Fenteng_Shipment_Sync.dg) |
| Tony_Shipment | Tony_Shipment_Sync | on edit | [on success](../../zoho-export/parsed/workflows/form/Tony_Shipment/Tony_Shipment_Sync.dg) |
| Supplier_2 | Notify Tony on Inquiry added | on add | [on success](../../zoho-export/parsed/workflows/form/Supplier_2/Notify_Tony_on_Inquiry_ad.dg) |
| Tony_Fan_Purchase_Order | Notify Tony on Purchase Order added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Order/Notify_Tony_on_Purchase_O.dg) |
| Tony_Fan_Replacement_Request | Notify Tony on Replacement Request Added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/Notify_Tony_on_Replacemen.dg) |
| Tony_Shipment | Notify Tony on Shipment added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Shipment/Notify_Tony_on_Shipment_a.dg) |
| Shipments | Shipment_Populate_Receiving | on add | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Populate_Receivi.dg) |
| Shipments | Shipment_Edited_Sync_Receiving | on edit | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Edited_Sync_Rece1.dg) |
| Pick1 | Pick1 Marked to QC Sync | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pick1/Pick1_Marked_to_QC_Sync.dg) |
| Purchase_Request1 | PR1_Forecast_Stamp | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR1_Forecast_Stamp.dg) |
| Sales_Order_Readiness_Gate | GATE_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/GATE_Instant_Forecast.dg) |
| Pick1 | GATE_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Pick1/GATE_Instant_Forecast1.dg) |
| Checker_Checklist | QC_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Checker_Checklist/QC_Instant_Forecast.dg) |
| Crate_Checklist | CRATE_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Crate_Checklist/CRATE_Instant_Forecast.dg) |
| Sales_Order_Fulfillment | SOF_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Instant_Forecast.dg) |
| Supplier_2 | Action_Button_Supplier | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Supplier_2/Action_Button_Supplier.dg) |
| Supplier_1 | Action_Button_Supplier | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Supplier_1/Action_Button_Supplier1.dg) |
| Purchase_Request1 | PR_Approved | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__3.dg) |
| Inquiry_Form | Create_Estimates_Grp | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Inquiry_Form/Create_Estimates_Grp.dg) |
| Inquiry_Form | Create_Estimates_Inq | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Inquiry_Form/Create_Estimates_Inq.dg) |
| Tony_Fan_Purchase_Order | Acknowledged_PO_Supplier2 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Tony_Fan_Purchase_Order/Acknowledged_PO_Supplier2.dg) |
| Fenteng_Lighting_Purchase_Order | Acknowledged_PO_Supplier1 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Fenteng_Lighting_Purchase_Order/Acknowledged_PO_Supplier1.dg) |
| Receiving | Create_Bin_Receiving | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Receiving/Create_Bin_Receiving.dg) |
| Exceptions | Create_RR | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__3.dg) |
| Fenteng_Lighting_Replacement_Request | Approve_RR_Supplier1 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Fenteng_Lighting_Replacement_Request/Approve_RR_Supplier1.dg) |
| Tony_Fan_Replacement_Request | Approve_RR_Supplier2 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Tony_Fan_Replacement_Request/Approve_RR_Supplier2.dg) |

## Obsidian notes

[Deluge Scripts (Obsidian)/Procurement](../../vault/Deluge%20Scripts%20(Obsidian)/Procurement)
