---
title: "ff_notifications_all_modules"
source_file: "production\ff_notifications_all_modules.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 255
tags:
  - deluge
  - fulfillment
  - kanban
  - notification
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - readiness-gate
  - zoho-creator
---

# ff_notifications_all_modules

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `production\ff_notifications_all_modules.txt`
> - **Lines of Code:** 255
> - **Tags:** `#deluge`, `#fulfillment`, `#kanban`, `#notification`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#readiness-gate`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PRODUCTION COPY — ff_notifications_all_modules.txt ==
== Twinned from DelugeScripts/ff_notifications_all_modules.txt on 2026-08-04 ==
== Per docs/DevToProd/2026-08-04-deluge-dev-to-prod-cutover.md ==
== Key rule: environment header OMITTED = defaults to Production (confirmed live 2026-08-04) ==
== Do NOT write environment:"production" as a literal — that throws code 2930. ==
FF Widget Notifications — "new record" workflows, all 7 modules
==================================================================
New 2026-08-03, per user request ("actually in every FF we've done. any
new data/record should also have notifications"). Each block below is a
SEPARATE native Deluge workflow, pasted on the SOURCE form itself (not a
Custom Function) — Created > Successful form submission, no condition
(fires every time a record is added, regardless of who/what created it —
manual widget addRecords, native form UI, or a coworker's own cross-form
sync). Inserts exactly ONE row into that module's own *_Notifications form.

Recipient_Email is always "homecartelff@gmail.com" (HC Pack & Fulfill) —
HC Systems (hcinvanalyst@gmail.com) doesn't need a separate row: it's in
every one of these 7 widgets' own fullAccessRoles list, so the bell shows
it every row regardless of whose Recipient_Email is on it (see
notification_component/README.md's own "fullAccessRoles" note).

Target_URL environment segment is hardcoded "development" — same
convention already used everywhere else in this app that builds a
Target_URL/navigate URL from Deluge (e.g. FulfillmentKanban's own
navigateToQualityCheck). ALREADY SWITCHED TO "production" — this IS the production twin, same
caveat that already applies to every other hardcoded-dev-URL spot in this
codebase — nothing here is special, just flagging it once for all 7.

REAL, UNAVOIDABLE CAVEAT — read before assuming this fully closes the
gap the user asked about: a Deluge cross-form `insert into X[...]` fired
from INSIDE ANOTHER script (a coworker's own sync workflow, e.g. whatever
creates Sales_Order_Fulfillment/Pre_Order_FF/Checker_Checklist/Pack rows
downstream of an upstream module) does NOT reliably fire the TARGET
form's own Created-trigger workflows — this is a repeatedly-confirmed,
well-documented limitation across this whole codebase (see CLAUDE.md's
own Deluge Gotchas — Shipments/Receiving/clone_shipment_for_replacement
all hit this). These 7 workflows ARE reliable for: (1) a record created
directly through the widget's own `ZOHO.CREATOR.DATA.addRecords()` call
(confirmed reliable — REST/SDK creates fire Created workflows, unlike a
backend Deluge `insert into`), (2) a record created via the native form
UI. If a specific module's records are ALWAYS created by an upstream
coworker script's own cross-form insert (e.g. Pack's records apparently
coming from a `pack_to_checker_checklist_sync.txt`-style flow, referenced
by name elsewhere in this codebase but never captured/seen) — the Created
trigger on THAT target form may simply never fire, and the real fix would
be inlining the notification insert directly into the SOURCE script
instead (once its actual content is captured). Test each of these 7
against how records for that specific module are ACTUALLY created in
practice before assuming it's reliably firing.

FIXED 2026-08-03, real bug found on first live paste (block 1): every
block below originally used `FormName.insert({...})` — a JS-object-literal
shape lifted verbatim from notification_component/README.md's own
illustrative example, which is NOT valid Deluge for a plain top-level form
insert (errored "Error at line number: 1 Variable 'SO_Notifications' is
not defined" — Deluge read `SO_Notifications` as an undeclared variable,
not a form reference). Real Deluge form-insert syntax, matching every
other working script in this codebase (e.g. create_rr_button.txt's
`insert into Fenteng_Lighting_Replacement_Request [...]`):
  insert into FormName
  [
    Field1 = value1
    Field2 = value2
  ];
All 7 blocks below corrected to this shape.

FIXED 2026-08-03, 2nd real bug found on the SAME first live paste attempt
(SOF_Notify_New_Record) — after the .insert({...}) fix above, still got
"Error at line number: 1 Improper Statement / missing ';'". Root cause:
every field assignment line still had a TRAILING COMMA (`Field = value,`),
copying JS object-literal habits again. Confirmed via create_rr_button.txt's
own proven `insert into Replacement_Request [...]` block — real multi-
column insert syntax is NEWLINE-separated `Field = value` with NO commas
at all between assignments, not a comma-separated list. All 7 blocks below
had every trailing comma stripped.


------------------------------------------------------------------
1. Sales_Order_Fulfillment  (SO widget, UI/FF Widget/SO)
------------------------------------------------------------------
WORKFLOW SETUP: Form Sales_Order_Fulfillment, Created > Successful form
submission. Workflow name: SOF_Notify_New_Record

This module has its own dedicated report/form, SO_Notifications
(report SO_Notifications_Report) — not the shared App_Notifications.

insert into SO_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "SO Record Created"
  Message = "New Sales Order Fulfillment record — " + input.SO_No + " (" + input.PR_No + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:SOR?soRecordId=" + input.ID
  Source_Record_No = input.SO_No
  Source_Record_ID = input.ID
]


------------------------------------------------------------------
2. Pre_Order_FF  (PreOrderReport widget, UI/FF Widget/PreOrderReport)
------------------------------------------------------------------
WORKFLOW SETUP: Form Pre_Order_FF, Created > Successful form submission.
Workflow name: PreOrderFF_Notify_New_Record

insert into PreOrder_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "Pre-Order Record Created"
  Message = "New Pre-Order record — " + input.SO + " (" + input.Item_Name + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Pre_Order2?preOrderRecordId=" + input.ID
  Source_Record_No = input.SO
  Source_Record_ID = input.ID
]


------------------------------------------------------------------
3. Sales_Order_Readiness_Gate  (ReadinessGate widget, UI/FF Widget/ReadinessGate)
------------------------------------------------------------------
WORKFLOW SETUP: Form Sales_Order_Readiness_Gate, Created > Successful form
submission. Workflow name: ReadinessGate_Notify_New_Record

insert into ReadinessGate_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "Readiness Gate Record Created"
  Message = "New Sales Order Readiness Gate record — " + input.sales_order_number + " (" + input.Item_Name + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Order_Readiness1?readinessGateRecordId=" + input.ID
  Source_Record_No = input.sales_order_number
  Source_Record_ID = input.ID
]


------------------------------------------------------------------
4. Checker_Checklist  (QCChecklist widget, UI/FF Widget/QCChecklist)
------------------------------------------------------------------
WORKFLOW SETUP: Form Checker_Checklist, Created > Successful form
submission. Workflow name: QC_Notify_New_Record

This is the one the user explicitly flagged ("i have assigned in pack
right? sent to qc -> and in qc there is no new notification"). If Pack's
own "Send to QC" action is what creates this Checker_Checklist record (via
a coworker's own cross-form sync, not a widget addRecords call), see the
CAVEAT block at the top of this file — this trigger may not fire for that
specific path even after being pasted live. Test it directly: send a Pack
item to QC, then check whether a fresh QC_Notifications row actually
appears. If it doesn't, the insert needs to move into whatever script
actually creates the Checker_Checklist record instead.

insert into QC_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "QC Record Created"
  Message = "New QC record for review — " + input.SO + " (" + input.Item_Name + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Quality_Check?qcRecordId=" + input.ID
  Source_Record_No = input.SO
  Source_Record_ID = input.ID
]


------------------------------------------------------------------
5. Order_Aggregation1  (OrderAggregation widget, UI/FF Widget/OrderAggregation)
------------------------------------------------------------------
WORKFLOW SETUP: Form Order_Aggregation1, Created > Successful form
submission. Workflow name: OrderAgg_Notify_New_Record

insert into OrderAgg_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "Order Aggregation Record Created"
  Message = "New Order Aggregation record — " + input.SO + " (" + input.Customer_Name + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Order_Aggregation2?orderAggRecordId=" + input.ID
  Source_Record_No = input.SO
  Source_Record_ID = input.ID
]


------------------------------------------------------------------
6. Pick1  (Pick widget, UI/FF Widget/Pick)
------------------------------------------------------------------
WORKFLOW SETUP: Form Pick1, Created > Successful form submission.
Workflow name: Pick1_Notify_New_Record

insert into Pick_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "Pick Record Created"
  Message = "New item ready for picking — " + input.SO + " (" + input.Item_Name + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Pick2?pickRecordId=" + input.ID
  Source_Record_No = input.SO
  Source_Record_ID = input.ID
]


------------------------------------------------------------------
7. Pack  (Pack widget, UI/FF Widget/Pack)
------------------------------------------------------------------
WORKFLOW SETUP: Form Pack, Created > Successful form submission.
Workflow name: Pack_Notify_New_Record

insert into Pack_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "Pack Record Created"
  Message = "New item ready for packing — " + input.SO + " (" + input.Item_Name + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Pack1?packRecordId=" + input.ID
  Source_Record_No = input.SO
  Source_Record_ID = input.ID
]


------------------------------------------------------------------
8. Exception_Control1  (ExceptionControl widget, UI/FF Widget/ExceptionControl)
------------------------------------------------------------------
WORKFLOW SETUP: Form Exception_Control1, Created > Successful form
submission. Workflow name: ExceptionControl_Notify_New_Record

ADDED 2026-08-03, per user request ("notification created same as
ff_notifications_all_modules.txt -> exception populated through QC's
Rejected right. let's add that too"). SAME CAVEAT as the other 7 blocks
(see the top of this file) applies here too, and is MORE likely to bite:
every Exception_Control1 record this app currently creates comes from
`checker_checklist_qc_sync.txt`'s own Rejected branch — a cross-form
`insert into Exception_Control1[...]` fired from Checker_Checklist's own
workflow, the confirmed-unreliable case. This standalone Created trigger
WILL fire correctly for a record created directly via the widget's own
`ZOHO.CREATOR.DATA.addRecords()` (if that's ever added) or the native form
UI — but for the QC-Rejected path specifically, see the matching INLINE
patch added to `DelugeScripts/ff_notifications_inline_patches.txt` instead
(section 5) — that's the one actually reliable for how these records get
created today.

insert into ExceptionControl_Notifications
[
  Recipient_Email = "homecartelff@gmail.com"
  Notification_Type = "Exception Record Created"
  Message = "New Exception Control record — " + input.Sales_Order + " (" + input.Item_Name + "). Click to open it."
  Created_On = zoho.currenttime
  Read = false
  Target_URL = "https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Exception_Control2?excRecordId=" + input.ID
  Source_Record_No = input.Sales_Order
  Source_Record_ID = input.ID
]

````
