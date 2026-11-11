---
title: "ff_notifications_inline_patches"
source_file: "production\ff_notifications_inline_patches.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]"
lines: 243
tags:
  - crate
  - deluge
  - fulfillment
  - kanban
  - notification
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - qc
  - readiness-gate
  - zoho-books
  - zoho-creator
---

# ff_notifications_inline_patches

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `production\ff_notifications_inline_patches.txt`
> - **Lines of Code:** 243
> - **Tags:** `#crate`, `#deluge`, `#fulfillment`, `#kanban`, `#notification`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#qc`, `#readiness-gate`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/QC Checklist/Widget/QC Checklist Widget|QC Checklist Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PRODUCTION COPY — ff_notifications_inline_patches.txt ==
== Twinned from DelugeScripts/ff_notifications_inline_patches.txt on 2026-08-04 ==
== Per docs/DevToProd/2026-08-04-deluge-dev-to-prod-cutover.md ==
== Key rule: environment header OMITTED = defaults to Production (confirmed live 2026-08-04) ==
== Do NOT write environment:"production" as a literal — that throws code 2930. ==
Inline notification patches — Pick/Pack/QC/Order Aggregation, 2026-08-03
==========================================================================
Per user ("no new notification in Pick, Pack and QC. only in order
readiness"). Confirmed via a live paste of the actual 4 chained workflows
(Temp.txt, 2026-08-03) — every one of Pick1/Pack/Checker_Checklist/
Order_Aggregation1 gets created via `insert into X[...]` fired from
ANOTHER form's own workflow, not a widget addRecords call and not
Sales_Order_Fulfillment/Pre_Order_FF's Books-side createRecord path (those
2 stay reliable — see ff_notifications_all_modules.txt). This is the exact
confirmed-unreliable case documented all over this app's Deluge Gotchas —
a target form's own Created trigger does not reliably fire off a
cross-form Deluge insert.

REAL FIX: the notification insert has to live INSIDE these 4 existing
workflows, right at the point each new record is actually created — not
as a separate Created-trigger workflow on the target form. Below are 4
small snippets, each to be ADDED (not replacing anything) into the
corresponding LIVE workflow, immediately after the line noted.

ACTION REQUIRED ON THE 4 STANDALONE WORKFLOWS BUILT EARLIER TODAY:
`Pick1_Notify_New_Record`, `Pack_Notify_New_Record`, `QC_Notify_New_Record`,
`OrderAgg_Notify_New_Record` (all 4 from ff_notifications_all_modules.txt)
will never fire for how these 4 forms are actually populated in practice —
leave them in place (harmless, matches this app's "don't delete, leave
unused" convention — they'd still fire correctly for a genuinely direct
widget-created or native-form-UI-created record on that same form, which
just isn't how these particular 4 get populated today) but don't expect
them to be the real notification source for these 4 modules anymore.
`SOF_Notify_New_Record` and `PreOrderFF_Notify_New_Record` are UNCHANGED
and should keep working — Sales_Order_Fulfillment/Pre_Order_FF are created
via so_kanban_sync.txt's Books-side `zoho.creator.v2_1.createRecord`,
already confirmed reliable elsewhere in this codebase.


------------------------------------------------------------------
1. "Release Records to Pick1"  (Sales_Order_Readiness_Gate, Created or
   Edited > Successful form submission)
------------------------------------------------------------------
Find this exact line (inside the `if(alreadyExists == false)` block, right
after the `insert into Pick1[...]` block and its own `info` line):

	info "Created Pick1 record " + newPickID + " for SO " + soVal + " / SKU " + skuVal + " / Item " + itemNameVal;

Add immediately after it:

	newPickNotifId = insert into Pick_Notifications
	[
		Recipient_Email="homecartelff@gmail.com"
		Notification_Type="Pick Record Created"
		Message="New item ready for picking — " + soVal + " (" + itemNameVal + ")."
		Created_On=zoho.currenttime
		Read=false
		Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Pick2?pickRecordId=" + newPickID
		Source_Record_No=soVal
		Source_Record_ID=newPickID
	];


------------------------------------------------------------------
2. "Pick1 Marked to Pack Sync"  (Pick1, Created or Edited > Successful
   form submission)
------------------------------------------------------------------
Find this exact line (inside the `if(alreadyExists == false)` block, right
after the `insert into Pack[...]` block and its own `info` line):

	info "Pack record created from Pick1 (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newId;

Add immediately after it:

	newPackNotifId = insert into Pack_Notifications
	[
		Recipient_Email="homecartelff@gmail.com"
		Notification_Type="Pack Record Created"
		Message="New item ready for packing — " + soVal + " (" + input.Item_Name + ")."
		Created_On=zoho.currenttime
		Read=false
		Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Pack1?packRecordId=" + newId
		Source_Record_No=soVal
		Source_Record_ID=newId
	];


------------------------------------------------------------------
3. "PACK SEND TO QC"  (Pack, Created or Edited > Successful form
   submission)
------------------------------------------------------------------
Find this exact line (inside the `if(alreadyExists == false)` block, right
after the `insert into Checker_Checklist[...]` block and its own `info`
line):

	info "Checker_Checklist record created from Pack (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newId;

Add immediately after it:

	newQcNotifId = insert into QC_Notifications
	[
		Recipient_Email="homecartelff@gmail.com"
		Notification_Type="QC Record Created"
		Message="New QC record for review — " + soVal + " (" + input.Item_Name + ")."
		Created_On=zoho.currenttime
		Read=false
		Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Quality_Check?qcRecordId=" + newId
		Source_Record_No=soVal
		Source_Record_ID=newId
	];


------------------------------------------------------------------
4. "QC Approved sync to Crate or Order Aggregation"  (Quality Check /
   Checker_Checklist, Created or Edited > Successful form submission)
------------------------------------------------------------------
TWO separate insertion points in this one workflow — a brand-new
Order_Aggregation1 record, and a genuinely new item added to an already-
existing one. Deliberately NOT added for the "rowUpdated == true" case
(that's just an already-tracked item's row being refreshed — not new
data, would spam a notification on every unrelated Checker_Checklist
resync of the same item).

4a. Find this exact line (inside `if(foundAgg == false)`, right after the
`insert into Order_Aggregation1[...]` block and its own `info` line):

	info "Order_Aggregation1 record created for SO " + soVal + ", new ID: " + newAggId + ", item " + skuVal + " added.";

Add immediately after it:

	newOrderAggNotifId = insert into OrderAgg_Notifications
	[
		Recipient_Email="homecartelff@gmail.com"
		Notification_Type="Order Aggregation Record Created"
		Message="New Order Aggregation record — " + soVal + " (" + input.Customer_Name + ")."
		Created_On=zoho.currenttime
		Read=false
		Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Order_Aggregation2?orderAggRecordId=" + newAggId
		Source_Record_No=soVal
		Source_Record_ID=newAggId
	];

4b. Find this exact line (inside the `else` branch — existing
Order_Aggregation1 record — specifically the `else` half of
`if(rowUpdated == true){...} else {...}`, right after the "item added"
`info` line):

	info "Item " + skuVal + " added — Order_Aggregation1 record for SO " + soVal + " recreated (old ID " + aggId + " deleted, new ID " + newAggId + ").";

Add immediately after it:

	newOrderAggNotifId2 = insert into OrderAgg_Notifications
	[
		Recipient_Email="homecartelff@gmail.com"
		Notification_Type="Order Aggregation Item Added"
		Message="New item added to Order Aggregation — " + soVal + " (" + input.Item_Name + ")."
		Created_On=zoho.currenttime
		Read=false
		Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Order_Aggregation2?orderAggRecordId=" + newAggId
		Source_Record_No=soVal
		Source_Record_ID=newAggId
	];

------------------------------------------------------------------
5. "QC Approved sync to Crate or Order Aggregation"  (Quality Check /
   Checker_Checklist, Created or Edited > Successful form submission) —
   THE REJECTED BRANCH (same workflow as section 4, but the OTHER branch,
   further up the script)
------------------------------------------------------------------
ADDED 2026-08-03, per user ("notification created same as
ff_notifications_all_modules.txt -> exception populated through QC's
Rejected right. let's add that too"). This is the branch that creates
Exception_Control1 records — flagged-but-not-built when section 4 above
was written. ExceptionControl now has its own notification bell +
`ExceptionControl_Notifications` report (see that widget's own CLAUDE.md
row) — this closes the gap.

Deluge has no counted for-loop (see this script's own existing comments),
so the Rejected branch inserts up to 5 NEW Exception_Control1 records via
5 UNROLLED, near-identical blocks (`if(unitsNeeded >= 1){...}` through
`if(unitsNeeded >= 5){...}`) — each ends with its own `info` line that
differs ONLY by the literal count ("record 1 of ", "record 2 of ", etc).
ALL 5 need the same snippet added, right after their OWN `info` line —
don't just do the first one, a Reject with more than 1 unit needs every
block that actually fires to also raise its own notification.

5a. Find (inside `if(unitsNeeded >= 1){...}`):

	info "Exception_Control1 record 1 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;

5b. Find (inside `if(unitsNeeded >= 2){...}`):

	info "Exception_Control1 record 2 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;

5c. Find (inside `if(unitsNeeded >= 3){...}`):

	info "Exception_Control1 record 3 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;

5d. Find (inside `if(unitsNeeded >= 4){...}`):

	info "Exception_Control1 record 4 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;

5e. Find (inside `if(unitsNeeded >= 5){...}`):

	info "Exception_Control1 record 5 of " + unitsNeeded + " created from Checker_Checklist (SO " + soVal + " / SKU " + skuVal + " / PAC " + pacVal + "), new ID: " + newExceptionId + ", " + nextExcNo;

Add the SAME snippet immediately after EACH of the 5 lines above (all 5
blocks share the same variable names — `newExceptionId`/`soVal`/`skuVal`/
`input.Item_Name`/`pacVal`/`nextExcNo` — so one snippet works verbatim in
all 5 spots):

	newExcNotifId = insert into ExceptionControl_Notifications
	[
		Recipient_Email="homecartelff@gmail.com"
		Notification_Type="Exception Record Created"
		Message="New Exception Control record — " + soVal + " (" + input.Item_Name + ") — " + nextExcNo + "."
		Created_On=zoho.currenttime
		Read=false
		Target_URL="https://creatorapp.zoho.com/homecartel/environment/production/supply-chain-app/#Page:Exception_Control2?excRecordId=" + newExceptionId
		Source_Record_No=soVal
		Source_Record_ID=newExceptionId
	];

NOTE: `input.Item_Name` is this script's own existing variable holding
`input.Item_Name` (set once near the top of the Rejected branch, well
before any of the 5 unrolled blocks) — confirmed already in scope at every
one of these 5 insertion points, no new variable needed.

REVISED 2026-08-03, real bug found on first live test: a 2-unit Reject
(SO-16600/PAC-EXCNOTIF-01) correctly created 2 real Exception_Control1
records (EXC-FF-00001/00002) AND 2 real ExceptionControl_Notifications
rows (confirmed via direct API pull) — but the bell only ever SHOWED 1.
Not a bug in the bell/component itself — `notification_component/
notification.js` has a deliberate `dedupeByMessage()` that collapses rows
sharing identical `Notification_Type + Message` text (built for a
different, real case: one event that legitimately inserts 2+ rows for 2+
recipients). Its own code comment already flags this exact tradeoff
("would also incorrectly hide a genuine second event that happens to
render identical message text") — that's exactly what happened, since
both units' Message text was byte-identical. Fixed by including the
per-record `nextExcNo` (Exception_Number) in the Message text above, so 2
genuinely distinct Exceptions never render identical text. Applies to all
5 sub-sections (5a-5e) — re-paste all 5 with this updated Message line.

````
