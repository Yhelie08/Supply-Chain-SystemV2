---
title: "dms_site_confirmation"
source_file: "dms_site_confirmation.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/Field Service Site Visits/Widget/FieldServiceSiteVisits Widget|FieldServiceSiteVisits Widget]]"
lines: 308
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - procurement
  - purchase-order
  - readiness-gate
  - zoho-books
---

# dms_site_confirmation

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/Field Service Site Visits/Widget/FieldServiceSiteVisits Widget|FieldServiceSiteVisits Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `dms_site_confirmation.txt`
> - **Lines of Code:** 308
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#procurement`, `#purchase-order`, `#readiness-gate`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/Field Service Site Visits/Widget/FieldServiceSiteVisits Widget|FieldServiceSiteVisits Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== DMS Section C — Site Confirmation Workflow ==
== New 2026-07-17, per DMS_Full_Build_Plan_v1.1.pdf Section C, adapted to this app's
   real Service_Appointment_Form fields + Policy Settings table (Section F, already
   seeded) ==
== CORRECTED same day — "Action 1/2/3" in this app's own convention means multiple
   actions WITHIN ONE workflow (one trigger type), not separate workflows. First draft
   wrongly split by trigger type; fixed below. ==

PREREQUISITE: 2 new fields on Service_Appointment_Form (added via Application IDE
same session): Outreach_Sent_Date (Date), Followup_Count (Number). Needed because
Zoho Creator has no built-in "wait N days then re-trigger per record" mechanism — the
plan's C.3/C.4 "follow-up after N days" requires a daily SCHEDULED function that scans
and checks elapsed time, same pattern as this app's existing syncWarehouseBins.

LIVE OUTREACH, wired 2026-07-17 — per user request ("treat this as a live real
scenario... i'll use my personal sms number and email on one of our test datas").
FIRST ATTEMPT used the legacy `https://www.itexmo.com/php_api/api.php` endpoint
(numbered form fields, confirmed from 2 open-source client libraries) — failed live
with a raw HTTP 500 from iTexMo's own server (generic Laravel error page, not a Deluge
syntax error). Root cause: that's an OLD endpoint; this account's credentials include
an Email field, which only the NEWER gateway API actually uses — confirmed via a 3rd,
more current open-source client library's actual source code. SWITCHED to the real
current endpoint: `POST https://api.itexmo.com/api/broadcast`, JSON body
(`Email`/`Password`/`ApiCode`/`Recipients` as a list/`Message`), `Content-Type:
application/json` — same JSON-invokeurl shape this app already uses for Books calls
elsewhere. Email sends for real via Deluge's own native `sendmail` task — no external
API/connection needed for that half. Test/mock data (SO#, item names, etc.) is still
fake/sandbox — only the actual message DELIVERY is real, straight to whatever
phone/email is typed into a given test record's Contact/Email fields.
iTexMo Email/Password/ApiCode are embedded directly in this script (server-side Deluge
only, never exposed to any widget/browser — same trust boundary as every other API key
already embedded directly in this app's Custom Functions).

SMS SENDING PAUSED same day, per user ("let's skip that sms sending for now") — after
the endpoint fix above, live testing still got `{"Error":true,"Message":"Authorization
error."}` even with a provably well-formed request: live debug logging (added
temporarily) confirmed valid JSON body, correct local-PH phone format (09XXXXXXXXX,
matching a reference implementation exactly — see below), correct Basic Auth header.
Credentials were cross-checked against a separate proven-adjacent project's real
config.yaml (`HRRS & ZOHO IA/zoho-invite-automation`) and matched exactly — ruled out a
retyping error. Root cause narrowed to something account-level (API access toggle /
credentials actually stale / balance / suspension) that can't be diagnosed further from
the script side — needs the user to check the iTexMo dashboard directly. The Action 1
SMS block currently just logs a mock message again (`[MOCK SMS]`) — the fully-debugged
real code is preserved verbatim in NOTES at the bottom of this file, ready to paste back
in once the account issue is resolved. Email (native `sendmail`) was left as real/live —
untested but has no external dependency to go wrong the same way.

NO INBOUND SMS REPLY CAPTURE: the plan's C.3 "Customer Response: Replies YES/NO"
assumes two-way SMS, which needs iTexMo's own inbound-webhook feature wired to a new
Creator Custom API — not built, out of scope for now. Until that exists, the ONLY way
Site_Confirmation_Status ever becomes "Confirmed" is the officer manually setting it
(plan's own C.5 Manual Override path) — the Validations workflow below enforces that
path's own requirements (Confirmation Method + Notes mandatory), matching the plan.

====================================================
WORKFLOW SETUP — Service_Appointment_Form
  Trigger: Created or Edited > Successful form submission
  Workflow name: SA_Site_Confirmation_Initiate (the workflow itself is named ONCE —
  the 2 actions inside it are just ordered, UNNAMED script blocks, added via
  "Add New Action". Don't try to name Action 2 separately, there's no field for it.)
====================================================

--- Action 1 (script block 1 of 2) ---

statusIsPendingOrBlank = (input.Site_Confirmation_Status == "Pending" || input.Site_Confirmation_Status == null || input.Site_Confirmation_Status == "");
if(input.Fulfillment_Completed_Date != null && statusIsPendingOrBlank && input.Outreach_Sent_Date == null)
{
	rec = Service_Appointment_Form[ID == input.ID];
	if(input.Site_Confirmation_Status == null || input.Site_Confirmation_Status == "")
	{
		rec.Site_Confirmation_Status = "Pending"; // normalize once, so downstream checks (e.g. the daily follow-up scan) can rely on a real value
	}
	custName = "";
	if(input.Customer_Name != null)
	{
		custName = input.Customer_Name.first_name + " " + input.Customer_Name.last_name;
	}
	soRef = input.Sales_Order;
	hasSMS = (input.Contact != null && input.Contact != "");
	hasEmail = (input.Email != null && input.Email != "");
	msgBody = "Hi " + custName + ", your order " + soRef + " is ready for delivery. Can you confirm that your delivery site is ready to receive the products? Please reply YES or NO.";
	if(hasSMS)
	{
		// SMS sending PAUSED 2026-07-17, per user ("let's skip that sms sending for
		// now") — real iTexMo integration kept getting "Authorization error" despite a
		// provably well-formed request (valid JSON body confirmed via live debug log,
		// correct local-PH phone format, correct Basic Auth header) — narrowed down to
		// a likely account-level issue (API access toggle / credentials / balance),
		// not something fixable from the script side. The fully-debugged, ready-to-use
		// invokeurl code is preserved in this file's own NOTES section at the bottom —
		// drop it back in here once the iTexMo account issue is confirmed resolved.
		info "[MOCK SMS] To: " + input.Contact + " | " + msgBody;
	}
	else if(hasEmail)
	{
		sendmail
		[
			from : zoho.adminuserid
			to : input.Email
			subject : "Delivery Confirmation Needed — " + soRef
			message : msgBody
		];
		info "[Email] Sent to: " + input.Email;
	}
	else
	{
		// Per the plan (C.2 Step 1): "No Contact Info" is its own immediate escalation,
		// distinct from "Unreachable" (which only applies after a real send attempt
		// gets no reply, see C.3). Status stays Pending — we don't yet know whether the
		// customer is reachable, just that we have no channel to try.
		rec.Site_Confirmation_Notes = "No contact info (no phone or email) on file — escalated to Exception Queue.";
		rec.Exception_Status = "Flagged";
		// Outreach_Sent_Date never gets set on this branch (it's set below, outside
		// this if/else, only reached by the SMS/Email branches) — so this whole
		// action re-fires on every subsequent edit while status stays Pending/no
		// contact info. Dedup guard: only insert once, first time Exception_Status
		// isn't already Flagged (checks the PRE-save input value, still valid here).
		if(input.Exception_Status != "Flagged")
		{
			insert into DMS_Exception_Queue
			[
				Sales_Order_Reference = rec.ID
				Customer_Name = custName
				Exception_Stage = "Site Confirmation"
				Exception_Reason = "No Contact Info"
				Severity = "High"
				Raised_By = "System"
				Date_Raised = zoho.currenttime
				Status = "Open"
			];
		}
		info "[SITE CONFIRMATION] No contact info for record " + input.ID + " (" + soRef + ")";
		return;
	}
	rec.Outreach_Sent_Date = zoho.currentdate;
	rec.Followup_Count = 0;
}

--- Action 2 (script block 2 of 2) ---

if(input.Site_Confirmation_Status == "Confirmed" && input.Date_Confirmed == null)
{
	rec = Service_Appointment_Form[ID == input.ID];
	rec.Date_Confirmed = zoho.currentdate;
}

====================================================
WORKFLOW SETUP — Service_Appointment_Form
  Trigger: Created or Edited > Validations
  Workflow name: SA_Site_Confirmation_Validate — 1 action block:
====================================================

--- Action 1 ---

if(input.Site_Confirmation_Status == "Confirmed")
{
	if(input.Confirmation_Method == null || input.Confirmation_Method == "")
	{
		alert "Confirmation Method is required when confirming site readiness.";
		cancel submit;
	}
	if(input.Site_Confirmation_Notes == null || input.Site_Confirmation_Notes == "")
	{
		alert "Site Confirmation Notes is required when confirming site readiness.";
		cancel submit;
	}
}

====================================================
SEPARATE CONSTRUCT — NOT a form workflow at all, a SCHEDULE
  Name: DMS_Site_Confirmation_FollowUp
  Frequency: Daily
  Same category as this app's existing syncWarehouseBins — found under
  Setup → Schedules, not under Service_Appointment_Form's own Workflow tab.
====================================================

followupWaitDays = 3;
maxAttempts = 2;
p1 = Policy_Settings[Policy_Key == "followup_wait_days"];
if(p1 != null && p1.Value != null && p1.Value != "")
{
	followupWaitDays = p1.Value.toLong();
}
p2 = Policy_Settings[Policy_Key == "max_followup_attempts"];
if(p2 != null && p2.Value != null && p2.Value != "")
{
	maxAttempts = p2.Value.toLong();
}

pendingRecs = Service_Appointment_Form[(Site_Confirmation_Status == "Pending" || Site_Confirmation_Status == "Not Ready") && Outreach_Sent_Date != null];
for each  r in pendingRecs
{
	daysSince = zoho.currentdate.daysBetween(r.Outreach_Sent_Date);
	if(daysSince >= followupWaitDays)
	{
		if(r.Followup_Count >= maxAttempts)
		{
			r.Site_Confirmation_Status = "Unreachable";
			r.Exception_Status = "Flagged";
			custNameU = "";
			if(r.Customer_Name != null)
			{
				custNameU = r.Customer_Name.first_name + " " + r.Customer_Name.last_name;
			}
			// No dedup guard needed — this branch is self-terminating: once status
			// flips to Unreachable, the record falls out of pendingRecs' own filter
			// (Pending/Not Ready only) on every future daily run.
			insert into DMS_Exception_Queue
			[
				Sales_Order_Reference = r.ID
				Customer_Name = custNameU
				Exception_Stage = "Site Confirmation"
				Exception_Reason = "Customer unreachable after max attempts"
				Severity = "High"
				Raised_By = "System"
				Date_Raised = zoho.currenttime
				Status = "Open"
			];
		}
		else
		{
			custName = "";
			if(r.Customer_Name != null)
			{
				custName = r.Customer_Name.first_name + " " + r.Customer_Name.last_name;
			}
			followupMsg = "Hi " + custName + ", just checking if your delivery site is now ready for " + r.Sales_Order + ". Please let us know.";
			if(r.Contact != null && r.Contact != "")
			{
				// SMS sending PAUSED — see the matching note in the other action's SMS
				// block above for why. Ready-to-use real code preserved in NOTES below.
				info "[MOCK SMS FOLLOWUP] To: " + r.Contact + " | " + followupMsg;
			}
			else if(r.Email != null && r.Email != "")
			{
				sendmail
				[
					from : zoho.adminuserid
					to : r.Email
					subject : "Delivery Confirmation Follow-Up — " + r.Sales_Order
					message : followupMsg
				];
				info "[Email FOLLOWUP] Sent to: " + r.Email;
			}
			r.Outreach_Sent_Date = zoho.currentdate;
			r.Followup_Count = r.Followup_Count + 1;
		}
	}
}

====================================================
PRESERVED — real iTexMo SMS code, paused not deleted. Drop back into either SMS block
(replacing the `[MOCK SMS]` info line) once the iTexMo account issue is resolved. This
exact shape was confirmed to produce a well-formed request (valid JSON, correct phone
format, correct auth header) via live debug logging — only the account-level
Authorization error remained unexplained.
====================================================

	phoneDigits = input.Contact.replaceAll("[^0-9]", "");
	if(phoneDigits.startsWith("63") && phoneDigits.length() == 12)
	{
		phoneDigits = "0" + phoneDigits.subString(2);
	}
	recipients = List();
	recipients.add(phoneDigits);
	smsBody = Map();
	smsBody.put("Email", "hcinvanalyst@gmail.com");
	smsBody.put("Password", "H0m3cartel2025");
	smsBody.put("ApiCode", "PR-HOMEC780536_KFVIL");
	smsBody.put("SenderId", "HomeCartel");
	smsBody.put("Recipients", recipients);
	smsBody.put("Message", msgBody);
	smsAuthB64 = zoho.encryption.base64Encode("hcinvanalyst@gmail.com:H0m3cartel2025");
	smsHeaders = Map();
	smsHeaders.put("Content-Type", "application/json");
	smsHeaders.put("Accept", "application/json");
	smsHeaders.put("Authorization", "Basic " + smsAuthB64);
	smsResp = invokeurl
	[
		url : "https://api.itexmo.com/api/broadcast"
		type : POST
		body : smsBody.toString()
		headers : smsHeaders
	];
	info "[iTexMo SMS] To: " + input.Contact + " | Response: " + smsResp;

====================================================
NOTES:
- Once Section B (Scheduling Engine) is built, it triggers off Site_Confirmation_Status
  changing to "Confirmed" directly (per the plan's own B.1 Engine Trigger table) — no
  explicit hand-off needed from this file, the two are decoupled via that one field.
- Action 1's idempotency guard is Outreach_Sent_Date == null — fires exactly once per
  record, the first time Fulfillment_Completed_Date gets set while still Pending.
- Successful-form-submission Action 1 (Initiate) and Action 2 (Stamp Date) both live
  under the SAME trigger, run in that order — Action 2 needs Site_Confirmation_Status
  to already be "Confirmed" to do anything, which only happens on a LATER save (the
  manual-override path), not the same save Action 1 runs on. Both coexisting in one
  workflow trigger is correct and intentional, not redundant — they just fire on
  different saves in practice.
- UNTESTED — needs: (1) the 2 new fields (Outreach_Sent_Date/Followup_Count) added
  live, (2) both actions pasted into the Successful-form-submission workflow + the
  Validations action, (3) the daily Schedule created separately, (4) a test on a
  sandbox "(TEST ORDER)" record — set Fulfillment_Completed_Date, confirm Action 1's
  mock log fires and Outreach_Sent_Date/Followup_Count populate; then manually set
  Site_Confirmation_Status=Confirmed without Method/Notes to confirm the Validations
  action blocks it; then with both filled to confirm Action 2 stamps Date_Confirmed.
====================================================

````
