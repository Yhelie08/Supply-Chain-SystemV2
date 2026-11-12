# Delivery Management

Tabs, in app menu order. Each folder is the Zoho widget source (`app/` + `plugin-manifest.json`).

| Tab | Zoho page | Widget folder | Source zip |
|---|---|---|---|
| Delivery Analytics | `Delivery_Analytics1` | [Delivery Analytics](Delivery%20Analytics/app/index.html) | — |
| Daily Team Availability | `Daily_Team_Availability1` | [Daily Team Availability](Daily%20Team%20Availability/app/index.html) | — |
| Initial Scheduling | `Initial_Scheduling1` | [Initial Scheduling](Initial%20Scheduling/app/index.html) | — |
| Service Request | `Service_Request2` | [Service Request](Service%20Request/app/index.html) | — |
| Service Appointment | `Service_Appointment1` | [Service Appointment](Service%20Appointment/app/index.html) | — |
| Ongoing Service | `Ongoing_Service1` | [Ongoing Service](Ongoing%20Service/app/index.html) | — |
| Archived | `Archived` | [Archived](Archived/app/index.html) | — |
| Field Service Site Visits | `Field_Service_Site_Visits1` | [Field Service Site Visits](Field%20Service%20Site%20Visits/app/index.html) | — |
| Sales Returns | `Sales_Returns1` | [Sales Returns](Sales%20Returns/app/index.html) | — |
| DMS Exception Queue | `DMS_Exception_Queue1` | [DMS Exception Queue](DMS%20Exception%20Queue/app/index.html) | — |
| Truck Maintenance | `Truck_Maintenance` | [Truck Maintenance](Truck%20Maintenance/app/index.html) | — |
| Schedule Requests | `Schedule_Requests` | [Schedule Requests](Schedule%20Requests/app/dms-schedule-request.html) | — |
| Policy Settings (opened from other tabs) | `Policy_Setting` | [Policy Settings](Policy%20Settings/app/index.html) | — |

## Custom APIs the tabs call

| Custom API | Deluge function | Local app |
|---|---|---|
| `confirm_dms_schedule_request` | [confirmDmsScheduleRequest](../../zoho-export/parsed/functions/confirmDmsScheduleRequest.dg) | Ported |
| `create_sales_return_books` | [createSalesReturnBooks](../../zoho-export/parsed/functions/createSalesReturnBooks.dg) | Ported |
| `create_shipment_order` | [createShipmentOrder](../../zoho-export/parsed/functions/createShipmentOrder.dg) | Ported |
| `decline_dms_schedule_request` | [declineDmsScheduleRequest](../../zoho-export/parsed/functions/declineDmsScheduleRequest.dg) | Ported |
| `dms_reschedule` | [dmsScheduleSlot](../../zoho-export/parsed/functions/dmsScheduleSlot.dg) | Ported |
| `push_dms_message_to_cms` | [pushDmsMessageToCms](../../zoho-export/parsed/functions/pushDmsMessageToCms.dg) | Ported |

## Forms (database tables)

| Form | Fields | Spec |
|---|---|---|
| Customer | 10 | [Customer.json](../../zoho-export/parsed/forms/Customer.json) |
| DMS Exception Queue | 15 | [DMS_Exception_Queue.json](../../zoho-export/parsed/forms/DMS_Exception_Queue.json) |
| DMS Schedule Request | 12 | [DMS_Schedule_Request.json](../../zoho-export/parsed/forms/DMS_Schedule_Request.json) |
| DMS Schedule Request Messages | 7 | [DMS_Schedule_Request_Messages.json](../../zoho-export/parsed/forms/DMS_Schedule_Request_Messages.json) |
| Daily Checklist for Vehicle | 13 | [Daily_Checklist_for_Vehicle.json](../../zoho-export/parsed/forms/Daily_Checklist_for_Vehicle.json) |
| Daily Team Availability | 11 | [Daily_Team_Availability.json](../../zoho-export/parsed/forms/Daily_Team_Availability.json) |
| Delivery Scheduling Form | 34 | [Delivery_Scheduling.json](../../zoho-export/parsed/forms/Delivery_Scheduling.json) |
| Dispatch Checklist | 18 | [Dispatch_Checklist.json](../../zoho-export/parsed/forms/Dispatch_Checklist.json) |
| Evidence Photos | 7 | [Evidence_Photos.json](../../zoho-export/parsed/forms/Evidence_Photos.json) |
| Exception Control | 46 | [Exception_Control1.json](../../zoho-export/parsed/forms/Exception_Control1.json) |
| Field Service Site Visit Form | 34 | [Field_Service_Site_Visit_Form.json](../../zoho-export/parsed/forms/Field_Service_Site_Visit_Form.json) |
| Field Work Form | 53 | [Field_Work.json](../../zoho-export/parsed/forms/Field_Work.json) |
| Fuel Entries | 10 | [Fuel_Entries.json](../../zoho-export/parsed/forms/Fuel_Entries.json) |
| Items | 12 | [Items.json](../../zoho-export/parsed/forms/Items.json) |
| Package Shipments | 8 | [Package_Shipments.json](../../zoho-export/parsed/forms/Package_Shipments.json) |
| Policy Settings | 7 | [Policy_Settings.json](../../zoho-export/parsed/forms/Policy_Settings.json) |
| Sales Order Fulfillment | 28 | [Sales_Order_Fulfillment.json](../../zoho-export/parsed/forms/Sales_Order_Fulfillment.json) |
| Sales Order Readiness Gate | 38 | [Sales_Order_Readiness_Gate.json](../../zoho-export/parsed/forms/Sales_Order_Readiness_Gate.json) |
| Sales Returns Form | 27 | [Sales_Returns_Form.json](../../zoho-export/parsed/forms/Sales_Returns_Form.json) |
| Service Appointment Form | 99 | [Service_Appointment_Form.json](../../zoho-export/parsed/forms/Service_Appointment_Form.json) |
| Service Entries | 12 | [Service_Entries.json](../../zoho-export/parsed/forms/Service_Entries.json) |
| Service Request Form | 37 | [Service_Request1.json](../../zoho-export/parsed/forms/Service_Request1.json) |
| Site Visit Photos | 6 | [Site_Visit_Photos.json](../../zoho-export/parsed/forms/Site_Visit_Photos.json) |

## Reports

- `All_DMS_Exception_Queue` (form `DMS_Exception_Queue`)
- `All_Daily_Team_Availability` (form `Daily_Team_Availability`)
- `All_Dispatch_Checklists` (form `Dispatch_Checklist`)
- `All_Evidence_Photos` (form `Evidence_Photos`)
- `All_Fuel_Entries` (form `Fuel_Entries`)
- `All_Policy_Settings` (form `Policy_Settings`)
- `All_Service_Entries` (form `Service_Entries`)
- `All_Site_Visit_Photos` (form `Site_Visit_Photos`)
- `DMS_Schedule_Request_Messages_Report` (form `DMS_Schedule_Request_Messages`)
- `DMS_Schedule_Request_Report` (form `DMS_Schedule_Request`)
- `Daily_Checklist_for_Vehicle_Report` (form `Daily_Checklist_for_Vehicle`)
- `Delivery_Scheduling_Report` (form `Delivery_Scheduling`)
- `Exception_Control_Report` (form `Exception_Control1`)
- `Field_Service_Site_Visit_Form_Report` (form `Field_Service_Site_Visit_Form`)
- `Field_Work_Report` (form `Field_Work`)
- `Package_Shipments_Report` (form `Package_Shipments`)
- `Sales_Order_Fulfillment_Report` (form `Sales_Order_Fulfillment`)
- `Sales_Order_Readiness_Gate_Report` (form `Sales_Order_Readiness_Gate`)
- `Sales_Returns_Form_Report` (form `Sales_Returns_Form`)
- `Service_Appointment` (form `Service_Appointment_Form`)
- `Service_Request` (form `Service_Request1`)

## Deluge functions

- [confirmDmsScheduleRequest](../../zoho-export/parsed/functions/confirmDmsScheduleRequest.dg)(String dmsRecordId)
- [createSalesReturnBooks](../../zoho-export/parsed/functions/createSalesReturnBooks.dg)(String recordId, String salesOrderNo, String rmaVal, String dateVal, String reasonVal, String subReasonVal, String returnedByVal, String itemsJson)
- [createShipmentOrder](../../zoho-export/parsed/functions/createShipmentOrder.dg)(String recordId, String packageShipmentId, String typeOfDelivery, String shipDate, String deliveryDate, String carrier, String shippingCharge, String ceilingMaterial, String ceilingHeight, String siteWiringReady, String preparedBy, String deliveryTeam)
- [declineDmsScheduleRequest](../../zoho-export/parsed/functions/declineDmsScheduleRequest.dg)(String dmsRecordId)
- [dmsScheduleSlot](../../zoho-export/parsed/functions/dmsScheduleSlot.dg)(String recordId, bool isRerun)
- [fcStampBySoNo](../../zoho-export/parsed/functions/fcStampBySoNo.dg)(string soNo)
- [fcStampDelivery](../../zoho-export/parsed/functions/fcStampDelivery.dg)(string soText)
- [pushDmsMessageToCms](../../zoho-export/parsed/functions/pushDmsMessageToCms.dg)(String cmsRecordId, String senderEmail, String senderName, String message, String sentOn)
- [pushDmsStatusToCms](../../zoho-export/parsed/functions/pushDmsStatusToCms.dg)(String cmsRecordId, String newStatus)

## Workflows on these forms

| Form | Workflow | Trigger | Script |
|---|---|---|---|
| Service_Appointment_Form | SA_Site_Confirmation_Initiate | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Init__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Init__2.dg) |
| Service_Appointment_Form | SA_Site_Confirmation_Validate | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Site_Confirmation_Vali.dg) |
| Service_Appointment_Form | SA_Scheduling_Engine | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__1.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__2.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__3.dg)<br>[on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Engine__4.dg) |
| Service_Appointment_Form | SA_Scheduling_Override_Validate | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Scheduling_Override_Va.dg) |
| Service_Appointment_Form | SA_Sync_Sales_Order_Display | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Sync_Sales_Order_Displ.dg) |
| DMS_Exception_Queue | EXC_Resolve_Sync | on add or edit | [on success](../../zoho-export/parsed/workflows/form/DMS_Exception_Queue/EXC_Resolve_Sync.dg) |
| Sales_Order_Fulfillment | SO to Readiness | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SO_to_Readiness.dg) |
| Service_Appointment_Form | SA_Geocode_Address | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Geocode_Address.dg) |
| Sales_Order_Readiness_Gate | Show Release on Picker Assigned | on add or edit | [on user input of Assign_Picker](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Show_Release_on_Picker_As.dg) |
| Sales_Order_Readiness_Gate | Set Release Visibility on Load | on edit | [on load](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Set_Release_Visibility_on.dg) |
| Sales_Order_Readiness_Gate | Release Records to Pick1 | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/Release_Records_to_Pick1.dg) |
| Sales_Order_Fulfillment | SOF_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Notify_New_Record.dg) |
| Sales_Order_Readiness_Gate | ReadinessGate_Notify_New_Record | on add | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/ReadinessGate_Notify_New_.dg) |
| Field_Work | FW_Validate_Reschedule_Reason | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Field_Work/FW_Validate_Reschedule_Re.dg) |
| Field_Work | FW_Reschedule_To_Exception_And_Requeue | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Field_Work/FW_Reschedule_To_Exceptio.dg) |
| Service_Appointment_Form | SA_Sync_Sales_Order_Display | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Sync_Sales_Order_Displ1.dg) |
| Field_Work | FW_Completion_Schedule_Sync | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Field_Work/FW_Completion_Schedule_Sy.dg) |
| Delivery_Scheduling | DS_Validate_Team_Capacity | on add or edit | [on validate](../../zoho-export/parsed/workflows/form/Delivery_Scheduling/DS_Validate_Team_Capacity1.dg) |
| Service_Request1 | SR_Created_Make_Appointment | on add | [on success](../../zoho-export/parsed/workflows/form/Service_Request1/SR_Created_Make_Appointme.dg) |
| Sales_Order_Readiness_Gate | GATE_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Readiness_Gate/GATE_Instant_Forecast.dg) |
| Delivery_Scheduling | ISCHED_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Delivery_Scheduling/ISCHED_Instant_Forecast.dg) |
| Service_Request1 | SR_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Request1/SR_Instant_Forecast.dg) |
| Service_Appointment_Form | SA_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Service_Appointment_Form/SA_Instant_Forecast.dg) |
| Field_Work | FW_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Field_Work/FW_Instant_Forecast.dg) |
| Sales_Order_Fulfillment | SOF_Instant_Forecast | on add or edit | [on success](../../zoho-export/parsed/workflows/form/Sales_Order_Fulfillment/SOF_Instant_Forecast.dg) |
| Service_Appointment_Form | Re_Schedule | for each record | [on start > on click](../../zoho-export/parsed/workflows/functions/Service_Appointment_Form/Re_Schedule.dg) |

## Obsidian notes

[Deluge Scripts (Obsidian)/Delivery Management](../../vault/Deluge%20Scripts%20(Obsidian)/Delivery%20Management)
