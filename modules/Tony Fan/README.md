# Tony Fan

Tabs, in app menu order. Each folder is the Zoho widget source (`app/` + `plugin-manifest.json`).

| Tab | Zoho page | Widget folder | Source zip |
|---|---|---|---|
| Inquiries | `Tony_Fan_Inquiries` | [Inquiries](Inquiries/app/index.html) | `Procurement/Supplier - Tony Fan/Widget/Tony Inq/Tony-Inquiries.zip` |
| Purchase Request | `Tony_Fan_PR` | [Purchase Request](Purchase%20Request/app/index.html) | `Procurement/Supplier - Tony Fan/Widget/Tony PR/Tony-PR.zip` |
| Purchase Order | `Tony_Fan_PO` | [Purchase Order](Purchase%20Order/app/index.html) | `Procurement/Supplier - Tony Fan/Widget/Tony PO/Tony-PO.zip` |
| Shipments | `Tony_Shipments` | [Shipments](Shipments/app/index.html) | `Procurement/Supplier - Tony Fan/Widget/Tony Shipment/Tony-Shipment.zip` |
| Replacement Request | `Replacement_Request_Tony` | [Replacement Request](Replacement%20Request/app/index.html) | `Procurement/Supplier - Tony Fan/Widget/Tony Replacement Request/Tony-RR.zip` |

## Custom APIs the tabs call

| Custom API | Deluge function | Local app |
|---|---|---|
| `acknowledge_po_tony` | [acknowledgePOTony](../../zoho-export/parsed/functions/acknowledgePOTony.dg) | Not ported yet |
| `approve_rr_tony` | [approveRRTony](../../zoho-export/parsed/functions/approveRRTony.dg) | Not ported yet |

## Forms (database tables)

| Form | Fields | Spec |
|---|---|---|
| Evidence Photos | 7 | [Evidence_Photos.json](../../zoho-export/parsed/forms/Evidence_Photos.json) |
| Exception Control | 46 | [Exception_Control1.json](../../zoho-export/parsed/forms/Exception_Control1.json) |
| Exception Control Media | 7 | [Exception_Control_Media.json](../../zoho-export/parsed/forms/Exception_Control_Media.json) |
| Exceptions | 30 | [Exceptions.json](../../zoho-export/parsed/forms/Exceptions.json) |
| Inquiry Form | 66 | [Inquiry_Form.json](../../zoho-export/parsed/forms/Inquiry_Form.json) |
| Inquiry Messages | 7 | [Inquiry_Messages.json](../../zoho-export/parsed/forms/Inquiry_Messages.json) |
| Items | 12 | [Items.json](../../zoho-export/parsed/forms/Items.json) |
| PO Messages | 7 | [PO_Messages.json](../../zoho-export/parsed/forms/PO_Messages.json) |
| PR Messages | 7 | [PR_Messages.json](../../zoho-export/parsed/forms/PR_Messages.json) |
| Purchase Request | 77 | [Purchase_Request1.json](../../zoho-export/parsed/forms/Purchase_Request1.json) |
| Receiving | 38 | [Receiving.json](../../zoho-export/parsed/forms/Receiving.json) |
| Sales Order | 42 | [Sales_Order.json](../../zoho-export/parsed/forms/Sales_Order.json) |
| Shipments | 34 | [Shipments.json](../../zoho-export/parsed/forms/Shipments.json) |
| Tony Fan | 33 | [Supplier_2.json](../../zoho-export/parsed/forms/Supplier_2.json) |
| Tony Fan Purchase Order | 20 | [Tony_Fan_Purchase_Order.json](../../zoho-export/parsed/forms/Tony_Fan_Purchase_Order.json) |
| Tony Fan Purchase Request | 48 | [Tony_Fan_Purchase_Request.json](../../zoho-export/parsed/forms/Tony_Fan_Purchase_Request.json) |
| Tony Fan Replacement  Request | 28 | [Tony_Fan_Replacement_Request.json](../../zoho-export/parsed/forms/Tony_Fan_Replacement_Request.json) |
| Tony Notifications | 10 | [Tony_Notifications.json](../../zoho-export/parsed/forms/Tony_Notifications.json) |
| Tony Shipment | 5 | [Tony_Shipment.json](../../zoho-export/parsed/forms/Tony_Shipment.json) |

## Reports

- `All_Evidence_Photos` (form `Evidence_Photos`)
- `All_Inquiries` (form `Inquiry_Form`)
- `All_Inquiry_Messages` (form `Inquiry_Messages`)
- `All_Items` (form `Items`)
- `All_PO_Messages` (form `PO_Messages`)
- `All_PR_Messages` (form `PR_Messages`)
- `All_Purchase_Request` (form `Purchase_Request1`)
- `All_Shipments` (form `Shipments`)
- `Exception_Control_Media_Report` (form `Exception_Control_Media`)
- `Exception_Control_Report` (form `Exception_Control1`)
- `Exceptions_Report` (form `Exceptions`)
- `Receiving_Report` (form `Receiving`)
- `Supplier_2_Report` (form `Supplier_2`)
- `Tony_Fan_Purchase_Order_Report` (form `Tony_Fan_Purchase_Order`)
- `Tony_Fan_Purchase_Request_Report` (form `Tony_Fan_Purchase_Request`)
- `Tony_Fan_Replacement_Request_Report` (form `Tony_Fan_Replacement_Request`)
- `Tony_Notifications_Report` (form `Tony_Notifications`)
- `Tony_Shipment_Report` (form `Tony_Shipment`)

## Deluge functions

- [acknowledgePOTony](../../zoho-export/parsed/functions/acknowledgePOTony.dg)(String poNoSupplier2, String etd, String eta)
- [approveRRTony](../../zoho-export/parsed/functions/approveRRTony.dg)(String rrRecordId, String expectedShipDate, String eta)
- [fcPrToPreOrder](../../zoho-export/parsed/functions/fcPrToPreOrder.dg)(int prId)
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
| Inquiry_Form | INQ_AutoFill_Project_Name | on add or edit | [on user input of Projects](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_AutoFill_Project_Name.dg) |
| Inquiry_Form | Disable_Supplier_Quotes_LastEdited | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Inquiry_Form/Disable_Supplier_Quotes_L.dg) |
| Purchase_Request1 | PR_Sync_Supplier_Load_Balancing | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Sync_Supplier_Load_Bal.dg) |
| Purchase_Request1 | PR_Sync_Supplier_Selected | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Sync_Supplier_Selected.dg) |
| Purchase_Request1 | PR_Check_Readiness | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Check_Readiness.dg) |
| Purchase_Request1 | Select_Unselect_Supplier | on add or edit | [on user input of Supplier_Selected.Selected](../../zoho-export/parsed/workflows/form/Purchase_Request1/Select_Unselect_Supplier.dg) |
| Purchase_Request1 | PR_Set_Default_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Set_Default_Status.dg) |
| Purchase_Request1 | PR_Lock_After_PO | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Lock_After_PO1.dg) |
| Purchase_Request1 | PR_Lock_UI_Fields | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Lock_UI_Fields.dg) |
| Supplier_2 | Disable_Item_Field_Edit_Supplier1 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Supplier_2/Disable_Item_Field_Edit_S2.dg) |
| Inquiry_Form | Delete_Item_On_Supplier | on delete | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Delete_Item_On_Supplier.dg) |
| Purchase_Request1 | PR_Populate_From_PR | on add | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Populate_From_PR__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Populate_From_PR__2.dg) |
| Tony_Fan_Purchase_Request | Disable_PR_Details_Supplier2 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Request/Disable_PR_Details_Suppli1.dg) |
| Tony_Fan_Purchase_Request | PR_Stage_Supplier_Changed_Supplier2 | on edit | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Request/PR_Stage_Supplier_Changed1.dg) |
| Purchase_Request1 | PR_Changed | on edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Changed__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Changed__2.dg) |
| Tony_Fan_Purchase_Request | Mandatory_PR_Fields_Supplier2 | on edit | [on validate](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Request/Mandatory_PR_Fields_Suppl1.dg) |
| Purchase_Request1 | PR_Deleted | on delete | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Deleted.dg) |
| Shipments | Shipment_Autofill_From_PO | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Autofill_From_PO1.dg) |
| Shipments | Shipment_Autofill_From_PO_Live | on add or edit | [on user input of PO_No](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Autofill_From_PO2.dg) |
| Shipments | Shipment_Refresh_PR_Details_OnLoad | on add or edit | [on user input of PO_No](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Refresh_PR_Detai.dg) |
| Shipments | Shipment_Lock_PO_Fields | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Lock_PO_Fields.dg) |
| Purchase_Request1 | PR_Export_Selected_Supplier | on edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Export_Selected_Suppli.dg) |
| Purchase_Request1 | PR_Compute_Shipment_Timeline | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Compute_Shipment_Timel.dg) |
| Inquiry_Form | Item_Image_Create_Update | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Item_Image_Create_Update.dg) |
| Purchase_Request1 | PR_Set_Shipment_Mode | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Set_Shipment_Mode.dg) |
| Tony_Fan_Purchase_Order | Disable_All_Fields_PO_Supplier2 | on add or edit | [on load](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Order/Disable_All_Fields_PO_Sup.dg) |
| Tony_Fan_Purchase_Request | Tony_Sync_Image_PR | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Request/Tony_Sync_Image_PR.dg) |
| Receiving | Receiving_Populate_From_Shipment | on add or edit | [on user input of Shipments](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Populate_From_S.dg) |
| Shipments | Shipment_Edited_Sync_Receiving | on edit | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Edited_Sync_Rece.dg) |
| Purchase_Request1 | PR_Compute_Priority | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR_Compute_Priority.dg) |
| Purchase_Request1 | PR1_Sync_Own_Image | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR1_Sync_Own_Image.dg) |
| Exceptions | EXC_Generate_Number | on add | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Generate_Number.dg) |
| Exceptions | EXC_Set_Defaults | on add | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Set_Defaults.dg) |
| Exceptions | EXC_Status_Timestamps | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Status_Timestamps.dg) |
| Exceptions | EXC_Validate_Status | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Exceptions/EXC_Validate_Status.dg) |
| Receiving | Receiving_Compute_Totals | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Compute_Totals.dg) |
| Receiving | Receiving_Set_Line_Result | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Set_Line_Result.dg) |
| Receiving | Receiving_Validate_Qty | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Validate_Qty.dg) |
| Receiving | Receiving_Auto_Exception | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Auto_Exception.dg) |
| Inquiry_Form | INQ_Check_Readiness | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_Check_Readiness.dg) |
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
| Shipments | Shipment_Status_Back_Sync | on edit | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Status_Back_Sync.dg) |
| Receiving | Receiving_Sync_Shipment_Arrived | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Receiving_Sync_Shipment_A.dg) |
| Shipments | Shipment_Generate_Number | on add | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Generate_Number.dg) |
| Inquiry_Form | Log Updated Itemm | on edit |  |
| Purchase_Request1 | Notify on Purchase Request - Add | on add | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/Notify_on_Purchase_Reques1.dg) |
| PR_Messages | Notify on PR supplier reply | on add | [on success](../../zoho-export/parsed/workflows/form/PR_Messages/Notify_on_PR_supplier_rep.dg) |
| Receiving | Notify on Receiving Completed | on edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Notify_on_Receiving_Compl.dg) |
| Receiving | Notify on Receiving Quantity Mismatch | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Receiving/Notify_on_Receiving_Quant.dg) |
| Exceptions | Notify on Created Exception | on add | [on success](../../zoho-export/parsed/workflows/form/Exceptions/Notify_on_Created_Excepti.dg) |
| Inquiry_Form | INQ_Generate_Number | on add | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/INQ_Generate_Number.dg) |
| Inquiry_Messages | Notify on supplier Inquiry response | on add | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Messages/Notify_on_supplier_Inquir.dg) |
| Inquiry_Form | Notify Suppliers on Inquiry Added | on add | [on success](../../zoho-export/parsed/workflows/form/Inquiry_Form/Notify_Suppliers_on_Inqui.dg) |
| Tony_Shipment | Tony_Shipment_Sync | on edit | [on success](../../zoho-export/parsed/workflows/form/Tony_Shipment/Tony_Shipment_Sync.dg) |
| Supplier_2 | Notify Tony on Inquiry added | on add | [on success](../../zoho-export/parsed/workflows/form/Supplier_2/Notify_Tony_on_Inquiry_ad.dg) |
| Tony_Fan_Purchase_Request | Notify Tony on Purchase Request added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Request/Notify_Tony_on_Purchase_R.dg) |
| Tony_Fan_Purchase_Order | Notify Tony on Purchase Order added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Purchase_Order/Notify_Tony_on_Purchase_O.dg) |
| Tony_Fan_Replacement_Request | Notify Tony on Replacement Request Added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Fan_Replacement_Request/Notify_Tony_on_Replacemen.dg) |
| Tony_Shipment | Notify Tony on Shipment added | on add | [on success](../../zoho-export/parsed/workflows/form/Tony_Shipment/Notify_Tony_on_Shipment_a.dg) |
| Shipments | Shipment_Populate_Receiving | on add | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Populate_Receivi.dg) |
| Shipments | Shipment_Edited_Sync_Receiving | on edit | [on success](../../zoho-export/parsed/workflows/form/Shipments/Shipment_Edited_Sync_Rece1.dg) |
| Purchase_Request1 | PR1_Forecast_Stamp | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Purchase_Request1/PR1_Forecast_Stamp.dg) |
| Supplier_2 | Action_Button_Supplier | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Supplier_2/Action_Button_Supplier.dg) |
| Purchase_Request1 | PR_Approved | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Purchase_Request1/PR_Approved__3.dg) |
| Inquiry_Form | Create_Estimates_Grp | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Inquiry_Form/Create_Estimates_Grp.dg) |
| Inquiry_Form | Create_Estimates_Inq | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Inquiry_Form/Create_Estimates_Inq.dg) |
| Tony_Fan_Purchase_Request | Submit_Response_PRbtn | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Tony_Fan_Purchase_Request/Submit_Response_PRbtn.dg) |
| Tony_Fan_Purchase_Order | Acknowledged_PO_Supplier2 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Tony_Fan_Purchase_Order/Acknowledged_PO_Supplier2.dg) |
| Receiving | Create_Bin_Receiving | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Receiving/Create_Bin_Receiving.dg) |
| Exceptions | Create_RR | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__1.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__2.dg)<br>[on start > on click](../../zoho-export/parsed/workflows/functions/Exceptions/Create_RR__3.dg) |
| Tony_Fan_Replacement_Request | Approve_RR_Supplier2 | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Tony_Fan_Replacement_Request/Approve_RR_Supplier2.dg) |
