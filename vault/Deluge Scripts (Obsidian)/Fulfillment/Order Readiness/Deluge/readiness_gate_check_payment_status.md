---
title: "readiness_gate_check_payment_status"
source_file: "readiness_gate_check_payment_status.txt"
category: "Fulfillment/Order Readiness/Deluge"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 208
tags:
  - custom-api
  - deluge
  - fulfillment
  - order-aggregation
  - pick
  - procurement
  - purchase-order
  - readiness-gate
  - zoho-books
---

# readiness_gate_check_payment_status

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Fulfillment/Order Readiness/Deluge`
> - **Source File:** `readiness_gate_check_payment_status.txt`
> - **Lines of Code:** 208
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#order-aggregation`, `#pick`, `#procurement`, `#purchase-order`, `#readiness-gate`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Sales_Order_Readiness_Gate — "Check Payment Status" button, new 2026-07-31 ==
== Per user request ("add a button on top right... Check Payment Status. check invoice
   with same SO number in books if paid or no. when click-> confirmation yes/no...
   if paid update Sales Order Readiness Gate record - Payment Status") ==
== Clarified via AskUserQuestion before building: ALWAYS sync the real Books status
   onto payment_status (Yes/No/Partial), not just a one-way "only write when paid" —
   keeps the field honest in both directions. ==
== REVISED same day, real correction from the user — first version read the
   invoice's own balance/total (balance==0 = paid), reasoning that's the actual
   financial truth. User pushed back with a live screenshot of the real invoice PDF
   for SO-16335 showing "Paid : Yes" printed on it, asking "what do you mean no?".
   Investigated instead of assuming the first version was right: confirmed via a
   direct API pull (SyncItemsCust/check-so16335-invoice-cf.js) that this invoice
   genuinely has balance=total=2515, payment_made=0, payments:[] — i.e. GENUINELY
   no real payment ever recorded in Books — but ALSO has a separate CUSTOM FIELD,
   `cf_paid` (label "Paid", the exact field printed on the PDF), independently set
   to "Yes" with no real payment behind it. A real, confirmed drift between the
   custom field and the actual financial data on this specific test record — not a
   script bug. Asked the user directly which one should be authoritative via
   AskUserQuestion; user picked the `cf_paid` custom field (matches what's printed
   on the invoice, what staff actually look at) over the balance-based math. This
   version reads `cf_paid` instead. Confirmed its real choice list live
   (SyncItemsCust/check-cf-paid-values.js, `settings/customfields?entity=invoice`):
   exactly "Yes"/"No"/"Partial" — same 3 values as this form's own payment_status
   field, api_name `cf_paid`, present as a plain top-level key on both the invoice
   LIST and DETAIL endpoints (no need for a per-invoice detail fetch). ==
== REVISED AGAIN same day — real bug found live, first real end-to-end test on all
   3 SO-16335 readiness-gate records: 2 landed "Paid" correctly, 1 landed "Partial"
   even though the (single, correct) invoice for that SO genuinely says cf_paid=Yes
   — user asked "why it is partial? the record says yes so it should be paid
   right?". Investigated live rather than assuming the aggregation math was wrong:
   confirmed via a direct API pull that `invoices?salesorder_id=<id>` — the filter
   this function used to narrow down to just this SO's own invoice(s) — does NOT
   actually filter at all. It silently returned 200 invoices spanning ~190 unrelated
   Sales Orders (SO-16343, SO-16342, SO-16341, ...), with only ONE of them genuinely
   belonging to SO-16335. The function was aggregating cf_paid across ALL 200 of
   those unrelated invoices — a handful happened to say "Yes" (SO-16264/SO-16329/
   SO-16215/etc), which tripped the "some Yes, not all" → Partial branch purely by
   coincidence of which OTHER orders happened to be paid, nothing to do with
   SO-16335 itself at all. Root cause: `salesorder_id` is a real Books filter
   param on other endpoints but apparently not a working filter on `invoices` list
   — confirmed by testing the alternative `reference_number=<soVal>` filter
   instead, which correctly returned exactly the 1 real invoice for SO-16335.
   Fixed: dropped the whole "resolve SO → salesorder_id" step entirely (no longer
   needed) — now queries `invoices?reference_number=<soVal>` directly, one API call
   total instead of two, and a correct one instead of a silently-broken one. ==

====================================================
1. Deluge Custom Function — checkPaymentStatus
   Creator → Setup → Custom Functions → New (paste WITH the full signature line,
   this is a Creator function, not a Books one)
====================================================

map checkPaymentStatus(String recordId)
{
	response = Map();
	organizationID = "751117756";

	// ===== LOAD THE READINESS GATE RECORD =====
	soVal = "";
	gateFound = false;
	for each  rec in Sales_Order_Readiness_Gate[ID == recordId.toLong()]
	{
		soVal = rec.sales_order_number + "";
		gateFound = true;
	}
	if(!gateFound)
	{
		response.put("status","error");
		response.put("message","Readiness Gate record not found.");
		return response;
	}
	if(soVal == "" || soVal == "null")
	{
		response.put("status","error");
		response.put("message","This record has no Sales Order Number to check.");
		return response;
	}

	// ===== PULL EVERY INVOICE LINKED TO THIS SALES ORDER =====
	// Filters by reference_number, NOT salesorder_id — confirmed live 2026-07-31
	// that `invoices?salesorder_id=X` does not actually filter at all (silently
	// returns ~200 unrelated invoices across other SOs). reference_number is a
	// plain exact-match text filter, confirmed correct via a live test (returned
	// exactly the 1 real invoice for SO-16335, nothing else). Also means no
	// separate "resolve the SO first" call is needed anymore — one API call total.
	invUrl = "https://www.zohoapis.com/books/v3/invoices?organization_id=" + organizationID + "&reference_number=" + soVal + "&per_page=200";
	invResp = invokeurl
	[
		url : invUrl
		type : GET
		connection : "zhbooks3"
	];
	invList = invResp.get("invoices");

	// ===== READ EACH INVOICE'S OWN "Paid" CUSTOM FIELD (cf_paid) — the field
	// actually printed on the invoice PDF, per user's explicit choice over the
	// balance/total math (see the REVISED note above for why). =====
	totalInvoices = 0;
	yesCount = 0;
	partialCount = 0;
	if(invList != null)
	{
		totalInvoices = invList.size();
		for each  inv in invList
		{
			cfPaidVal = inv.get("cf_paid") + "";
			if(cfPaidVal == "Yes")
			{
				yesCount = yesCount + 1;
			}
			else if(cfPaidVal == "Partial")
			{
				partialCount = partialCount + 1;
			}
		}
	}

	// ===== DETERMINE Yes/No/Partial (matches the widget's own real picklist
	// values — confirmed live 2026-07-29, NOT "Paid"/"Partially Paid"/"Pending").
	// Multi-invoice SOs: Paid only when EVERY invoice's own cf_paid says Yes,
	// Partial if some Yes/some not or any invoice itself says Partial, No if
	// none are Paid or no invoice exists yet — same aggregation spirit as the
	// original balance-based version, just applied to this field instead. =====
	paymentStatusVal = "No";
	summaryMsg = "";
	if(totalInvoices == 0)
	{
		paymentStatusVal = "No";
		summaryMsg = "No invoice found for SO " + soVal + " in Books yet.";
	}
	else if(yesCount == totalInvoices)
	{
		paymentStatusVal = "Yes";
		summaryMsg = totalInvoices + " invoice(s) found on SO " + soVal + ", all marked Paid.";
	}
	else if(yesCount > 0 || partialCount > 0)
	{
		paymentStatusVal = "Partial";
		summaryMsg = yesCount + " of " + totalInvoices + " invoice(s) marked Paid on SO " + soVal + " (" + partialCount + " marked Partial).";
	}
	else
	{
		paymentStatusVal = "No";
		summaryMsg = totalInvoices + " invoice(s) found on SO " + soVal + ", none marked Paid yet.";
	}

	// ===== WRITE BACK ONTO THIS SAME READINESS-GATE RECORD =====
	// Same explicit `update` task shape already proven working for this exact form
	// in DelugeScripts/preorder_to_readiness_gate.txt — not a direct field
	// assignment inside the loop, which is only confirmed safe elsewhere for a
	// DIFFERENT app/form (avoid inventing a new untested shape here).
	for each  rec2 in Sales_Order_Readiness_Gate[ID == recordId.toLong()]
	{
		update rec2
		[
			payment_status = paymentStatusVal
		];
	}

	response.put("status","success");
	response.put("paymentStatus",paymentStatusVal);
	response.put("message",summaryMsg);
	return response;
}

====================================================
2. Custom API
   Creator → Setup → Custom APIs → New
   Link Name: check_payment_status
   Function: checkPaymentStatus
   Request Method: POST
   Request Body: recordId (String, required)
   Response: Standard
====================================================

NOTES:
- Connection `zhbooks3` — already exists in this app (Key Connections: "Creator →
  Books, use in Creator Deluge invokeurl"), same one every other Creator-side Books
  read/write in this app already uses (create_estimates_button.txt, purchase_order_
  scripts.txt, sales_return_to_books.txt, etc) — no new connection needed.
- Org ID `751117756` hardcoded, matching the same literal value used throughout this
  codebase's other Books-calling scripts (no separate config record for it anywhere).
- `payment_status` real picklist values, per UI/FF Widget/ReadinessGate/app/index.html's
  own header comment (confirmed 2026-07-29): "Yes" / "No" / "Partial" — same 3 values
  confirmed live on the invoice's own `cf_paid` custom field
  (SyncItemsCust/check-cf-paid-values.js).
- Standard-response Custom API wraps the function's returned Map under `result`, not
  `data` — the widget's own invokeCustomApi() helper (ported from PreOrderReport,
  confirmed working there) checks both.
- REAL FINDING, worth knowing if this ever gets re-litigated: `cf_paid` can be
  genuinely out of sync with the invoice's own real balance/payment data (confirmed
  live on SO-16335/INV-16403 — cf_paid="Yes" but balance=total=2515, payment_made=0,
  zero real payments recorded). This function trusts cf_paid per explicit user
  choice; it does NOT cross-check against the real balance, so it can't catch or
  flag a case like this one — it will just report "Yes" if that's what the invoice
  says, even if no money actually moved. Flagged, not solved — revisit if this
  causes a real problem later.
- Custom Function + Custom API already created live in Creator (confirmed Enabled,
  correct POST/recordId/Standard config) and the real key already wired into the
  widget — but the FUNCTION BODY changed again after that (the reference_number
  fix above), so it **needs re-pasting live** before the fix takes effect. Real
  key: `1v0bgwBVb3bD8h4pDB8rOkqQB`.
- UNTESTED after this fix — needs a fresh Check Payment Status click on all 3 of
  SO-16335's readiness-gate records (PAC-16354/PAC-16353/PAC-16336) to confirm all
  3 now land "Yes"/"Paid" consistently (the invoice genuinely says Yes) instead of
  the 2-Paid-1-Partial split seen on the buggy version.
====================================================

````
