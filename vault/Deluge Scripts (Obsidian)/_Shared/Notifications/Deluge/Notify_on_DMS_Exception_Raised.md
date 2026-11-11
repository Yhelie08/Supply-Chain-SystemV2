---
title: "Notify_on_DMS_Exception_Raised"
source_file: "Deluge Script/Notification\Notify_on_DMS_Exception_Raised.txt"
category: "_Shared/Notifications/Deluge"
associated_widget: "[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]"
lines: 89
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - notification
  - pack
  - procurement
  - purchase-order
  - zoho-creator
---

# Notify_on_DMS_Exception_Raised

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]
> - **Category:** `_Shared/Notifications/Deluge`
> - **Source File:** `Deluge Script/Notification\Notify_on_DMS_Exception_Raised.txt`
> - **Lines of Code:** 89
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#notification`, `#pack`, `#procurement`, `#purchase-order`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/DMS Exception Queue/Widget/DMSExceptionQueue Widget|DMSExceptionQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== ADDED 2026-09-11, per user ("act as a Process Engineer and Software Engineer...
   give me your honest review", then "ayusin natin lahat ng dapat ifix") ==
== Real gap found during that audit: a Calendar Conflict, an ASAP-override tag, a
   Field Work ID Mismatch, or a Schedule Drift exception (raised by
   dms_scheduling_engine.txt / dms_field_work_completion_sync.txt / dms_exception_
   queue.txt / dms_field_work_reschedule.txt — 4+ different scripts, all inserting
   into the SAME DMS_Exception_Queue form) could sit invisible until someone
   happened to open the DMSExceptionQueue widget. Grepped every DMS Deluge script
   for sendmail/notify_url/push — only dms_site_confirmation.txt sends anything
   (client-facing site-confirmation emails), and of the 9 DMS widgets only
   DeliveryQueue has a notification_component wired in at all. This is the fix:
   ONE new workflow, triggered "on add" of DMS_Exception_Queue itself, so it
   covers every existing AND future insertion point automatically — no need to
   touch dms_scheduling_engine.txt/dms_field_work_completion_sync.txt/etc.
   individually, and nothing there needs to change. Same App_Notifications shape
   and same confirmed-working Recipient_Email as Notify_on_Created_Exception.txt
   (this app's own Fulfillment-side equivalent) — reused for consistency, not
   invented fresh. ==

== FLAG, not assumed: Target_URL below is a best-guess page slug
   ("DMS_Exception_Queue1", matching the "Page name gets a trailing 1 when the
   form name is already taken" pattern seen on Exceptions1 elsewhere in this
   project) — NOT confirmed live. Check the real native page URL for the
   DMS_Exception_Queue form/report in Zoho Creator before pasting, and correct
   this line if it's wrong; everything else in this file is safe to paste as-is. ==

====================================================
WORKFLOW SETUP — DMS_Exception_Queue
  Trigger: Created (on add) > Successful form submission
  Workflow name: Notify_on_DMS_Exceptio (Zoho truncates workflow names to 25
  characters, same as every other Notify_on_* file in this folder — this is the
  literal name to type into the workflow name field, not a typo)
====================================================

Notify_on_DMS_Exceptio as "Notify on DMS Exception Raised"
{
	type =  form
	form = DMS_Exception_Queue

	record event = on add

	on success
	{
		actions
		{
			custom deluge script
			(
				notifId = insert into App_Notifications
				[
					Recipient_Email="homecartelpacker@gmail.com"
					Notification_Type="DMS Exception"
					Message="DMS Exception #" + input.Exception_ID + " raised (" + input.Exception_Stage + " — " + input.Exception_Reason + ", " + input.Severity + " severity)."
					Created_On=zoho.currenttime
					Target_URL="https://creator.zoho.com/homecartel/supply-chain-app/#Page:DMS_Exception_Queue1"
					Source_Record_No=input.Exception_ID + ""
					Source_Record_ID=input.ID
					Added_User=zoho.loginuser
				];
			)
		}
	}

}

====================================================
NOTES:
- Fires on EVERY new DMS_Exception_Queue row, regardless of which script created
  it or what Exception_Stage/Exception_Reason it carries (Scheduling/"Requires
  Manual Planning", Scheduling/"Calendar Full", Scheduling/"Slot Pushed —
  Overtime Declined", Calendar/"Calendar Conflict", Dispatch/(reschedule-to-
  exception), the new "Field Work ID Mismatch"/"Schedule Drift" from
  dms_field_work_completion_sync.txt) — deliberately NOT filtered by Severity or
  Stage, since the point of this fix is that NOTHING currently pings anyone; a
  future refinement could route High-severity ones to a different recipient list
  if that turns out to matter in practice, not done this round.
- Recipient is the single shared "homecartelpacker@gmail.com" address, same as
  this app's other general-purpose Notify_on_* files (Notify_on_Created_
  Exception.txt, Notify_on_Receiving_*.txt) — not the DailyTeamAvailability
  "Added By" Jhi/Flor pair specifically, since neither of those maps to a real
  known email address in this codebase. Revisit if a more targeted recipient is
  wanted once this is confirmed live.
- This does NOT cover dms_site_confirmation.txt's own existing client-facing
  emails (those are a different, already-working notification path, untouched).
- UNTESTED — needs: (1) confirm/correct the Target_URL page slug above against
  the real Zoho page; (2) paste this workflow on the DMS_Exception_Queue form;
  (3) trigger any one of the exception-raising paths above (e.g. force a
  Calendar Conflict) and confirm a new App_Notifications row appears and the
  notification bell (wherever it's watched from) surfaces it.
====================================================

````
