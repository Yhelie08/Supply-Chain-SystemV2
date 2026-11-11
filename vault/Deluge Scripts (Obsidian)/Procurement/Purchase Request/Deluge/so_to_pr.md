---
title: "so_to_pr"
source_file: "so_to_pr.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]"
lines: 1317
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - kanban
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
  - zoho-inventory
---

# so_to_pr

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `so_to_pr.txt`
> - **Lines of Code:** 1,317
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#kanban`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[_Shared/Deluge/Zoho Books & Inventory Core Sync|Zoho Books & Inventory Core Sync]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

owner = "homecartel";
app = "supply-chain-app";
orgId = organization.get("organization_id");
today = zoho.currentdate.toString("yyyy-MM-dd");
config = Map();
// FIXED 2026-08-24, same confirmed live bug class as so_fulfillment_sync.txt's own
// 2026-08-10 fix (real bug SO-16440): the injected `salesorder` trigger Map can be a
// STALE snapshot from whenever the Workflow Rule queued this run, not the SO's real
// state AT EXECUTION TIME. This function does many sequential API round-trips per
// line item (Books item lookup, Creator item/Inquiry/Supplier lookups, dedup/recheck
// GETs, possible Items import), so a real gap between queue-time and execution-time
// is plausible, same as the already-confirmed case. Every field that used to read
// straight off `salesorder` (customer_name/customer_id/salesorder_number/total/
// status/custom_fields/line_items) now reads off a FRESHLY-fetched `soRec` instead,
// so an edit made after this run was queued (e.g. a line item added right after
// Approval) is read correctly instead of off a stale pre-edit snapshot. Fails
// CLOSED (skips) if the fresh fetch itself comes back empty.
soId = salesorder.get("salesorder_id") + "";
soResp = zoho.books.getRecordsByID("salesorders",orgId,soId);
soRec = soResp.get("salesorder");
if(soRec == null)
{
	info "SO fresh Books fetch returned no record for salesorder_id " + soId + " — cannot verify current status/data, skipping (fail closed).";
	return;
}
custName = soRec.get("customer_name");
custBookId = soRec.get("customer_id");
soNumber = soRec.get("salesorder_number");
soTotal = soRec.get("total");
// ===== STATUS GATE (moved inline 2026-08-01) — replaces the removed Books-side
// "Status is Approved" Criterion (see header NOTES + WORKFLOW SETUP above: that
// criterion only fired once, on the transition INTO Approved, confirmed live —
// not on later edits where Status stays Approved). Reads the live value straight
// off the freshly-fetched soRec every single run, so an edit long after the
// original approval is checked fresh, not against whatever triggered the workflow
// rule itself. =====
// FIXED 2026-08-07, real bug: Books SO status moves PAST "approved" once an
// invoice is generated against it ("invoiced"/"partially_invoiced"), and this
// gate's exact-match check silently skipped every later edit on an invoiced
// SO — including new line items — instead of only blocking genuinely
// pre-approval/cancelled statuses. Switched to a blocklist of the statuses
// that really should skip (not yet approved, or cancelled/void) instead of a
// single required value.
notYetApprovedStatuses = List();
notYetApprovedStatuses.add("draft");
notYetApprovedStatuses.add("pending_approval");
notYetApprovedStatuses.add("void");
notYetApprovedStatuses.add("cancelled");
soStatus = (soRec.get("status") + "").toLowerCase();
if(notYetApprovedStatuses.contains(soStatus))
{
	// ===== AUTO-CANCEL (ADDED 2026-10-01, PR On Hold plan Phase 5) — when the whole
	// SO is void/cancelled in Books, every PR already created for it is marked
	// Cancelled so it cannot move on to a PO. Until now a void SO only stopped NEW
	// PRs from being created; existing ones stayed live. Cancelled (not On Hold),
	// per user 2026-10-01: a void SO means the order is off. A PR that was On Hold
	// becomes Cancelled too; one already Cancelled is left as it is. Purchasing can
	// still Restore a PR in the Purchase Request widget if the SO comes back. =====
	if(soStatus == "void" || soStatus == "cancelled")
	{
		holdListUrl = "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?field_config=all&criteria=(Sales_Order%3D%3D%22" + soNumber + "%22)";
		holdListResp = invokeurl
		[
			url :holdListUrl
			type :GET
			connection:"supply_chain_app"
		];
		if(holdListResp.get("data") != null && holdListResp.get("data").size() > 0)
		{
			for each  holdPR in holdListResp.get("data")
			{
				curHold = holdPR.get("Hold_Status") + "";
				if(curHold != "Cancelled")
				{
					holdData = Map();
					holdData.put("Hold_Status","Cancelled");
					holdData.put("Hold_Reason","Other");
					holdData.put("Hold_Notes","Auto: Sales Order " + soNumber + " is " + soStatus + " in Zoho Books.");
					holdData.put("Hold_Date",today);
					holdData.put("Held_By","system (Books SO " + soStatus + ")");
					holdCriteria = "ID==" + holdPR.get("ID");
					holdResp = zoho.creator.v2_1.updateRecords(owner,app,"All_Purchase_Request",holdCriteria,holdData,config,"supply_chain_app");
					info "Auto-cancel PR " + holdPR.get("ID") + " (SO " + soNumber + " is " + soStatus + "): " + holdResp;
				}
			}
		}
		else
		{
			info "SO " + soNumber + " is " + soStatus + " — no existing PRs to cancel.";
		}
	}
	info "SO " + soNumber + " status is '" + soStatus + "', not yet approved (or cancelled) — skipping.";
	return;
}
salesOwner = "";
targetDate = "";
orderType = "";
soInqNo = "";
// ADDED 2026-08-24, per user ("gayahin mo to kung paano niya nakukuha yung customer
// type") — found via an old legacy version of this script (root-level file "PR"):
// Customer Type is NOT sourced from the Books Contact record at all — it's a custom
// field directly on the SALES ORDER itself (same custom_fields array already looped
// over here for cf_sales_agent/cf_target_delivery_date/cf_type_of_transaction/
// cf_inq_no), matched there by label=="Customer Type". Matching on BOTH api_name
// ("cf_customer_type", following this file's own established naming convention for
// every other custom field here) AND the legacy script's own proven label match, so
// whichever one is actually correct on the live form still resolves correctly.
custTypeFromSO = "";
customFields = soRec.get("custom_fields");
for each  cf in customFields
{
	if(cf.get("api_name") == "cf_sales_agent")
	{
		salesOwner = cf.get("value");
	}
	if(cf.get("api_name") == "cf_target_delivery_date")
	{
		targetDate = cf.get("value");
	}
	if(cf.get("api_name") == "cf_type_of_transaction")
	{
		orderType = cf.get("value");
	}
	if(cf.get("api_name") == "cf_inq_no")
	{
		soInqNo = cf.get("value");
	}
	if(cf.get("api_name") == "cf_customer_type" || cf.get("label") == "Customer Type")
	{
		custTypeFromSO = cf.get("value") + "";
	}
}
info "custTypeFromSO: " + custTypeFromSO;
info "soInqNo: " + soInqNo;
info "orderType: " + orderType;
info "soTotal: " + soTotal;
// ===== GATE 1: ORDER TYPE =====
// FIXED 2026-07-22, real bug caught live: real Books cf_type_of_transaction value is
// "(Partly) Pre Order" (with parens) — NOT "Partly Pre Order" as originally coded.
// Live log proved it: SO-16280 logged orderType:"(Partly) Pre Order" and still hit
// this gate's "not pre-order" branch, meaning a real Partly-Pre-Order SO was being
// silently skipped entirely (same class of exact-string mismatch already documented
// elsewhere in this app for this same field, e.g. so_fulfillment_sync.txt's own
// double-space "(Partly)  Pre Order" note — confirms Books' real values here need
// checking against a live log, not assumed). Also normalizes accidental double
// spaces defensively (`.replaceAll("  ", " ")`) in case this field's spacing is
// inconsistent record-to-record, same defensive habit already used elsewhere in
// this codebase for messy free-text Books fields.
orderTypeNorm = (orderType + "").replaceAll("  "," ").trim();
if(orderTypeNorm != "Pre Order" && orderTypeNorm != "(Partly) Pre Order")
{
	info "Order type not pre-order — skipping SO " + soNumber;
	return;
}
// ===== CUSTOMER LOOKUP (once) =====
custCreatorId = "";
custType = "";
// ADDED 2026-08-24, diagnostic per user report ("hindi nakuha yung customer" — PR-00004
// created with blank Customer/Customer Type). Logging custBookId itself and the raw
// custResp — custBookId was never stringified at assignment (custBookId = soRec.get
// ("customer_id");), so if that field ever comes back null, this URL would literally
// search for ID1=="null" (matches this codebase's own established null-concat-to-text
// behavior) and silently find nothing. This log will show definitively whether the
// lookup value itself is bad, or whether All_Customers genuinely has no matching row.
info "custBookId (Books customer_id used for lookup): [" + custBookId + "]";
custResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Customers?criteria=ID1%3D%3D%22" + custBookId + "%22&field_config=all"
	type :GET
	connection:"supply_chain_app"
];
info "custResp raw response: " + custResp;
if(custResp.get("data") != null && custResp.get("data").size() > 0)
{
	custCreatorId = custResp.get("data").get(0).get("ID");
	custType = custResp.get("data").get(0).get("Customer_Type");
}
// PRIORITY OVERRIDE, added 2026-08-24 — the SO's own Customer Type custom field
// (custTypeFromSO, read above alongside cf_sales_agent/etc.) wins over whatever the
// Customer master record in All_Customers already has, per the proven legacy "PR"
// script's own behavior (Customer Type sourced ONLY from the SO there, no Customer
// master lookup at all). A per-transaction value on the SO itself is more likely to
// be current/correct for THIS specific PR than a general master-record classification
// that may be stale or was never set.
if(custTypeFromSO != "")
{
	custType = custTypeFromSO;
}
// ADDED 2026-08-24, per user request ("instead sa all customer mo kukunin, get mona sa
// mismong zoho books") — same auto-import pattern already proven below for Items (see
// "ADDED 2026-08-08" comment further down). Confirmed live gap: SO-16531/PR-00004's
// customer (Books ID 2680178000075199404) had no matching All_Customers row at all
// (custResp code 9280 "No records found") — the external SyncItemsCust bulk-sync job
// hadn't picked it up yet. Rather than leave Customer/Customer Type permanently blank
// on the PR until the next external sync run, fetch the customer directly from Zoho
// Books' own Contacts API and create the missing Customer record right here — mirrors
// the "Customer" form's own New Customer modal field mapping (Widget\Proc\Inquiry\app\
// index.html's createNewCustomer(), form_name:'Customer') as closely as a Books-only
// fetch allows. Customer_Type has NO Books-side equivalent (it's a manual
// classification staff pick in the New Customer modal) — left blank on import, same
// as the Items import block's ifnull("") fallback when data is genuinely unavailable;
// staff can fill it in later via the native Customer form same as an item's missing
// fields can be. ID1 is stamped with the Books contact_id so this exact record is
// found directly by the SAME criteria (ID1==custBookId) on the very next run/edit.
// CHANGED 2026-08-24, per user follow-up — this fallback now also fires when the
// Customer record ALREADY exists (found via All_Customers) but its Customer_Type is
// still blank, not just when the whole record is missing. Confirmed live: a customer
// created by an earlier run of this exact fallback had no Customer_Type at the time
// (Books' own cf_customer_type was blank for that specific contact then) — if it gets
// filled in on the Books side later, this backfills it onto the EXISTING Creator
// record instead of only ever checking at first-import time.
if((custCreatorId == "" || custType == "") && custBookId != "" && custBookId != "null")
{
	custBooksResp = zoho.books.getRecordsByID("contacts",orgId,custBookId);
	info "custBooksResp (direct Books contact fetch): " + custBooksResp;
	if(custBooksResp != null && custBooksResp.get("contact") != null)
	{
		// FIXED 2026-08-24, real live bug confirmed via Execution Result log
		// (same JSON_PARSE_ERROR class as the earlier "description" field fix):
		// this contact's own billing_address.address held a literal line break
		// ("pick up by courier" + newline + "iloilo city"), which breaks the raw
		// JSON payload built for createRecord the same way an unescaped newline
		// did for the PR description. Sanitizing EVERY free-text value pulled
		// from this Books contact here — same defensive habit already used
		// elsewhere in this codebase for messy free-text Books fields — not just
		// the one field that happened to break this time.
		custBooksContact = custBooksResp.get("contact");
		icCustName = (ifnull(custBooksContact.get("contact_name"),"") + "").replaceAll("\n"," ").replaceAll("\r"," ");
		icEmail = (ifnull(custBooksContact.get("email"),"") + "").replaceAll("\n"," ").replaceAll("\r"," ");
		icPhone = (ifnull(custBooksContact.get("phone"),"") + "").replaceAll("\n"," ").replaceAll("\r"," ");
		// ADDED 2026-08-24, per user screenshot — Books Contacts DOES carry a custom
		// field for this, "Customer Type" (API name cf_customer_type, 5 dropdown
		// options: End User/Design Partner/Business Partner/Corporate/Influencer).
		// It was blank for THIS particular contact (custom_fields:[] in the earlier
		// log), which is why it looked unavailable — the field genuinely exists for
		// customers who have it set. Mapped to this Creator app's own Customer_Type
		// options (Designer/Enduser/Corporate/Business Partner, confirmed via
		// Widget\Proc\Inquiry\app\index.html's CUSTOMER_TYPE_OPTIONS) since the
		// label text doesn't match 1:1. "Influencer" has NO Creator-side equivalent
		// (only 4 options exist there) — left blank rather than guessing wrong.
		icCustTypeRaw = "";
		icCustomFields = custBooksContact.get("custom_fields");
		if(icCustomFields != null)
		{
			for each  icCf in icCustomFields
			{
				if(icCf.get("api_name") + "" == "cf_customer_type")
				{
					icCustTypeRaw = (icCf.get("value") + "").trim();
				}
			}
		}
		icCustType = "";
		if(icCustTypeRaw == "End User")
		{
			icCustType = "Enduser";
		}
		else if(icCustTypeRaw == "Design Partner")
		{
			icCustType = "Designer";
		}
		else if(icCustTypeRaw == "Business Partner")
		{
			icCustType = "Business Partner";
		}
		else if(icCustTypeRaw == "Corporate")
		{
			icCustType = "Corporate";
		}
		else if(icCustTypeRaw != "")
		{
			info "Books cf_customer_type value [" + icCustTypeRaw + "] has no matching Creator Customer_Type option — leaving blank.";
		}
		// BRANCH, added 2026-08-24: if the Customer record already exists (found via
		// All_Customers above), only backfill Customer_Type on it — no need to touch
		// name/email/address on an already-linked record. Full create (else branch)
		// only runs when custCreatorId is genuinely still blank. Report name
		// "All_Customers" used for updateRecordById per this codebase's own confirmed
		// rule (3rd param is the REPORT link name the record was READ from, not the
		// form name) — same report this whole customer lookup already queries via
		// invokeurl GET.
		if(custCreatorId != "")
		{
			if(icCustType != "")
			{
				icTypeUpdateData = Map();
				icTypeUpdateData.put("Customer_Type",icCustType);
				icTypeUpdateResp = zoho.creator.v2_1.updateRecordById(owner,app,"All_Customers",custCreatorId,icTypeUpdateData,config,"supply_chain_app");
				info "Backfilled Customer_Type onto existing Customer " + custCreatorId + ": " + icTypeUpdateResp;
				custType = icCustType;
			}
		}
		else
		{
			icMobile = (ifnull(custBooksContact.get("mobile"),"") + "").replaceAll("\n"," ").replaceAll("\r"," ");
			icBillMap = custBooksContact.get("billing_address");
			icShipMap = custBooksContact.get("shipping_address");
			icData = Map();
			icData.put("ID1",custBookId + "");
			icData.put("customer_name",icCustName);
			if(icEmail != "")
			{
				icData.put("Email",icEmail);
			}
			if(icPhone != "")
			{
				icData.put("Phone_Number",icPhone);
			}
			if(icMobile != "")
			{
				icData.put("Mobile",icMobile);
			}
			// PRIORITY: custTypeFromSO (the SO's own Customer Type custom field) wins
			// over icCustType (guessed from the Books Contact's cf_customer_type) —
			// same priority rule as the override applied right after the All_Customers
			// lookup above.
			if(custTypeFromSO != "")
			{
				icData.put("Customer_Type",custTypeFromSO);
			}
			else if(icCustType != "")
			{
				icData.put("Customer_Type",icCustType);
			}
			if(icBillMap != null)
			{
				icBillAddr = Map();
				icBillAddr.put("address_line_1",(ifnull(icBillMap.get("address"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icBillAddr.put("address_line_2",(ifnull(icBillMap.get("street2"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icBillAddr.put("district_city",(ifnull(icBillMap.get("city"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icBillAddr.put("state_province",(ifnull(icBillMap.get("state"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icBillAddr.put("postal_Code",(ifnull(icBillMap.get("zip"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icBillAddr.put("country",(ifnull(icBillMap.get("country"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icData.put("Billing_Address",icBillAddr);
			}
			if(icShipMap != null)
			{
				icShipAddr = Map();
				icShipAddr.put("address_line_1",(ifnull(icShipMap.get("address"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icShipAddr.put("address_line_2",(ifnull(icShipMap.get("street2"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icShipAddr.put("district_city",(ifnull(icShipMap.get("city"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icShipAddr.put("state_province",(ifnull(icShipMap.get("state"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icShipAddr.put("postal_Code",(ifnull(icShipMap.get("zip"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icShipAddr.put("country",(ifnull(icShipMap.get("country"),"") + "").replaceAll("\n"," ").replaceAll("\r"," "));
				icData.put("Shipping_Address",icShipAddr);
			}
			icCreateResp = zoho.creator.v2_1.createRecord(owner,app,"Customer",icData,config,"supply_chain_app");
			info "Auto-imported missing customer (Books ID " + custBookId + ") into Customer: " + icCreateResp;
			if(icCreateResp != null && icCreateResp.get("data") != null)
			{
				custCreatorId = icCreateResp.get("data").get("ID") + "";
				// Flows the resolved Customer_Type through to the same `custType`
				// variable the PR create/edit-sync logic further down already uses —
				// without this, the newly-imported customer would carry Customer_Type
				// correctly on the Customer record itself, but the PR (created/updated
				// in this same run) would still show it blank until a later, separate
				// re-sync. custTypeFromSO still wins here too — don't let a blank/wrong
				// Books guess clobber an already-correct SO-sourced value.
				if(custTypeFromSO != "")
				{
					custType = custTypeFromSO;
				}
				else
				{
					custType = icCustType;
				}
			}
		}
	}
}
info "custCreatorId: " + custCreatorId + " | custType: " + custType;
lineItems = soRec.get("line_items");
info "lineItems count: " + lineItems.size();
for each  item in lineItems
{
	skuVal = item.get("sku");
	itemName = item.get("name");
	// FIXED 2026-08-24, real live bug confirmed via Execution Result log (SO-16531,
	// createResp "code":2945 "JSON_PARSE_ERROR" on the Purchase_Request1 createRecord
	// call): a line item's Books description had a literal line break typed into it
	// ("Additional Order for SO-16110 (PR-7102)" + blank line + "PR-8130") — Deluge's
	// own `info` log auto-escapes this as "\n" for display, but the RAW newline
	// character breaks the actual JSON payload built for the REST createRecord call.
	// Same defensive fix already used elsewhere in this codebase for free-text Books
	// fields (e.g. so_fulfillment_sync.txt's address-line sanitization) — strip
	// newlines/carriage returns to a space before this ever reaches a data Map.
	// CHANGED 2026-08-26, per user request (gusto niyang makita ang buong multi-line na
	// description sa PR widget kagaya ng pagkakalatag nito sa Books, hindi paikli/paisa-isang
	// linya lang) — dating pinapalitan ng plain space ang bawat newline (linisin lang para
	// hindi masira ang JSON payload ng creator.v2_1.createRecord/updateRecordById, tignan ang
	// 2026-08-24 comment sa itaas nito). Ngayon, sa halip na tanggalin, ang bawat totoong
	// newline ay pinapalitan ng "|||NL|||" — isang plain text token na WALANG espesyal na
	// kahulugan sa JSON (hindi kagaya ng raw newline character, kaya hindi na masisira ang
	// payload), pero na-de-decode pabalik ng widget (Widget\Proc\Purchase Request\app\
	// index.html, decodePRDesc()) tungo sa tunay na line break bago ipakita sa screen.
	itemDesc = (item.get("description") + "").replaceAll("\r\n","\n").replaceAll("\r","\n").replaceAll("\n","|||NL|||");
	itemQty = item.get("quantity");
	itemUnit = item.get("unit");
	itemBooksId = item.get("item_id");
	itemRate = item.get("rate");
	info "line " + skuVal + " | inqNo: " + soInqNo;
	// ===== DEDUP GUARD (added 2026-07-28, EXTENDED 2026-07-31) — per user
	// ("when edited, for example i've added another item in approved SO...
	// script will run again to update what's in creator", then later: "how
	// about every edit? it should also reflect new item if have, field edits
	// like qty and everything we need to update in creator's PR"). This
	// function fires on every Edit while the SO stays Approved (see WORKFLOW
	// SETUP above), not just the original one-time Approval. A line that
	// already has a Purchase_Request1 no longer just gets silently skipped —
	// its core fields (Qty/Item Name/Description/Unit/Target Date/Rate/
	// Order Value/Sales Owner) are re-synced from Books to Creator whenever
	// they've actually changed since the PR1 was created. field_config=all
	// added so the comparison below has real current field values to diff
	// against, not just whatever's on the report's default column layout.
	// Skipped entirely (no update attempted) once PR_Status=="Converted to
	// PO" — native PR_Lock_After_PO already blocks Qty/Target_Delivery/etc at
	// the Validations level once a PR becomes a real PO, so a write here
	// would just get rejected anyway — there is nowhere safe left to land a
	// Books-side edit once that has happened. Deliberately does NOT re-route
	// which supplier owns the line (inquiry_reference/Supplier_Selected) —
	// that is an INQ-routing decision made once at creation time; re-routing
	// an already-answered supplier PR on a later unrelated SO edit would be a
	// much bigger, riskier change than what was asked for here. Relies on the
	// existing native PR_Changed workflow (Purchase_Request1, Edited >
	// Successful form submission, see PR1_Created_Edited_Routing.txt) to
	// cascade these same field changes down onto the supplier PR forms — that
	// workflow already unconditionally re-syncs quantity/Description1/
	// description/unit/Target_Delivery/etc into both Fenteng_Lighting_
	// Purchase_Request/Tony_Fan_Purchase_Request on every PR1 edit, no matter
	// what triggered it, and has no Source=="SO" guard — this update call is
	// assumed to fire it the same way zoho.creator.v2_1.createRecord is
	// already confirmed to fire target-form Created workflows (unconfirmed
	// for updateRecords specifically until live-tested; flag if PR_Changed
	// does not fire from this call and the supplier PR forms stay stale). =====
	dupCheckUrl = "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?field_config=all&criteria=(Sales_Order%3D%3D%22" + soNumber + "%22%20%26%26%20sku%3D%3D%22" + skuVal + "%22)";
	dupResp = invokeurl
	[
		url :dupCheckUrl
		type :GET
		connection:"supply_chain_app"
	];
	if(dupResp.get("data") != null && dupResp.get("data").size() > 0)
	{
		existingPR = dupResp.get("data").get(0);
		existingId = existingPR.get("ID") + "";
		existingStatus = existingPR.get("PR_Status") + "";
		if(existingStatus == "Converted to PO")
		{
			info "PR " + existingId + " (SO " + soNumber + " / SKU " + skuVal + ") already Converted to PO — skipping edit-sync.";
			continue;
		}
		newRateStr = "";
		if(itemRate != null)
		{
			newRateStr = itemRate.toLong() + "";
		}
		newOrderValStr = "";
		if(soTotal != null)
		{
			newOrderValStr = soTotal.toLong() + "";
		}
		existingQty = existingPR.get("quantity") + "";
		existingDesc1 = existingPR.get("Description1") + "";
		existingDesc = existingPR.get("description") + "";
		existingUnit = existingPR.get("unit") + "";
		existingTarget = existingPR.get("Target_Delivery") + "";
		existingRate = existingPR.get("SRP_Rate_PR") + "";
		existingOrderVal = existingPR.get("Order_Value") + "";
		existingSalesOwner = existingPR.get("Sales_Owner") + "";
		// ADDED 2026-08-24, per user report ("nakuha, but di niya iupdate yung sa PR")
		// — the Customer auto-import above (Books fallback) resolves custCreatorId/
		// custType, but this Edit-sync branch never included them in its change
		// list, so an already-existing PR (like PR-00004 here) never actually got
		// the backfilled Customer written to it. Only flags a change when the
		// EXISTING PR currently has NO customer at all AND one is now resolved —
		// deliberately NOT a strict value comparison (Customer is a Lookup field;
		// its raw GET shape isn't confirmed safe to string-compare against a plain
		// Creator ID) — so this never fires a false "changed" on every subsequent
		// edit once a customer is already correctly set.
		existingCustomer = existingPR.get("Customer") + "";
		existingCustomerType = existingPR.get("Customer_Type") + "";
		hasFieldChanges = false;
		if(custCreatorId != "" && (existingCustomer == "" || existingCustomer == "null"))
		{
			hasFieldChanges = true;
		}
		if(custType != "" && (existingCustomerType == "" || existingCustomerType == "null"))
		{
			hasFieldChanges = true;
		}
		if(existingQty != itemQty + "")
		{
			hasFieldChanges = true;
		}
		if(existingDesc1 != itemName + "")
		{
			hasFieldChanges = true;
		}
		if(existingDesc != itemDesc + "")
		{
			hasFieldChanges = true;
		}
		if(existingUnit != itemUnit + "")
		{
			hasFieldChanges = true;
		}
		if(targetDate != "" && existingTarget != targetDate)
		{
			hasFieldChanges = true;
		}
		if(newRateStr != "" && existingRate != newRateStr)
		{
			hasFieldChanges = true;
		}
		if(newOrderValStr != "" && existingOrderVal != newOrderValStr)
		{
			hasFieldChanges = true;
		}
		if(salesOwner != "" && existingSalesOwner != salesOwner)
		{
			hasFieldChanges = true;
		}
		if(hasFieldChanges == true)
		{
			updateData = Map();
			updateData.put("quantity",itemQty);
			updateData.put("Description1",itemName);
			updateData.put("description",itemDesc);
			updateData.put("unit",itemUnit);
			if(targetDate != "")
			{
				updateData.put("Target_Delivery",targetDate);
			}
			if(newRateStr != "")
			{
				updateData.put("SRP_Rate_PR",itemRate.toLong());
			}
			if(newOrderValStr != "")
			{
				updateData.put("Order_Value",soTotal.toLong());
			}
			if(salesOwner != "")
			{
				updateData.put("Sales_Owner",salesOwner);
			}
			if(custCreatorId != "")
			{
				updateData.put("Customer",custCreatorId);
			}
			if(custType != "")
			{
				updateData.put("Customer_Type",custType);
			}
			updateCriteria = "ID==" + existingId;
			updateResp = zoho.creator.v2_1.updateRecords(owner,app,"All_Purchase_Request",updateCriteria,updateData,config,"supply_chain_app");
			info "Edit-sync PR " + existingId + " (SO " + soNumber + " / SKU " + skuVal + "): " + updateResp;
		}
		else
		{
			info "PR " + existingId + " (SO " + soNumber + " / SKU " + skuVal + ") — no field changes, skipping update.";
		}
		continue;
	}
	// ----- Books item detail fetch (used for BOTH category + stock — one call) -----
	itemBooks = zoho.books.getRecordsByID("items",orgId,itemBooksId);
	info "itemBooks response: " + itemBooks;
	booksCategory = "";
	availStock = 0;
	if(itemBooks != null && itemBooks.get("item") != null)
	{
		booksItem = itemBooks.get("item");
		booksCategory = booksItem.get("category_name") + "";
		// CHANGED 2026-07-28, per user request: use the SAME stock basis as
		// so_fulfillment_sync.txt — "actual_available_stock" (top-level, PHYSICAL
		// stock), with a fallback sum over locations[].location_actual_available_stock
		// if the top-level field is blank. Previously used "available_stock" (a
		// different/accounting basis) — same divergence already flagged in
		// so_kanban_sync.txt's own row (accounting stock=0 vs physical stock=3 on the
		// same item, confirmed live).
		aValPr = booksItem.get("actual_available_stock") + "";
		if(aValPr != "" && aValPr != "null")
		{
			availStock = aValPr.toDecimal();
		}
		else
		{
			locSumPr = 0;
			locListPr = booksItem.get("locations");
			if(locListPr != null)
			{
				for each  locRecPr in locListPr
				{
					locActualPr = locRecPr.get("location_actual_available_stock") + "";
					if(locActualPr != "" && locActualPr != "null")
					{
						locSumPr = locSumPr + locActualPr.toDecimal();
					}
				}
			}
			availStock = locSumPr;
		}
	}
	info "line " + skuVal + " | booksCategory: " + booksCategory;
	// ===== GATE 2: SERVICES CATEGORY (skip — no physical procurement for service
	// items) — REORDERED 2026-07-22 to run BEFORE the stock gate and to source
	// category straight from BOOKS (not the old Creator All_Items lookup). Confirmed
	// live 2026-07-22: SyncItemsCust's own sync.js already skips syncing
	// Services-category items into Creator's All_Items at all (deliberate, by
	// design) — meaning the OLD version of this gate, which read itemCategory off a
	// Creator lookup for the SKU, could NEVER see a real "Services" value (always
	// blank, itemCreatorId also always blank) and so silently never fired, letting
	// Services lines fall through and create PRs anyway. Also sidesteps a 2nd real
	// bug: a Services item's Books `available_stock` comes back null/undefined
	// (confirmed live) — the OLD stock-gate comparison (`itemQty <= availStock`)
	// would have been comparing a NUMBER against NULL for any service line that
	// reached it, an invalid Deluge comparison and a real crash risk independent of
	// the category-skip bug. Checking category first, from the SAME Books fetch
	// already needed for stock, avoids ever reaching that comparison for a service
	// line at all. =====
	if(booksCategory != null && booksCategory.trim().toLowerCase() == "services")
	{
		info "Item category is Services — skipping PR for " + skuVal;
		continue;
	}
	// ===== GATE 3: STOCK ON HAND — REWORKED 2026-08-25 per user ("if nakitang 0 ang
	// actual_available_stock on hand create PR, if may stock magpafall siya sa gate
	// 3b"): if the on-hand actual_available_stock is 0, create the PR directly — Gate
	// 3b below is skipped entirely. If there IS on-hand stock (>0), fall through to
	// Gate 3b (actual_available_for_sale_stock) to decide from there. Replaces the
	// earlier order-type-dependent Gate 3 rule (2026-07-22) and the temporary
	// Gate-3-disabled/Gate-3b-only state (2026-08-24) — both superseded by this
	// explicit on-hand-stock check. =====
	info "line " + skuVal + " | availStock: " + availStock + " | ordered: " + itemQty;
	if(availStock > 0)
	{
		// ===== GATE 3b: AVAILABLE-FOR-SALE STOCK, added 2026-08-24 per user. Only
		// reached when Gate 3 above found on-hand stock > 0. Uses
		// actual_available_for_sale_stock (physical stock minus what's already
		// committed to other confirmed Sales Orders): qty <= this figure -> no PR
		// created, qty > this figure -> create PR. Reuses the SAME itemBooks response
		// already fetched above (Gate 2/3's own Books item call) — no extra API call
		// needed.
		availForSaleStock = 0;
		if(itemBooks != null && itemBooks.get("item") != null)
		{
			booksItemForSale = itemBooks.get("item");
			aValForSale = booksItemForSale.get("actual_available_for_sale_stock") + "";
			if(aValForSale != "" && aValForSale != "null")
			{
				availForSaleStock = aValForSale.toDecimal();
			}
		}
		info "line " + skuVal + " | availForSaleStock: " + availForSaleStock + " | ordered: " + itemQty;
		if(itemQty <= availForSaleStock)
		{
			info "Enough available-for-sale stock for " + skuVal + " — no PR created.";
			continue;
		}
		info "Available-for-sale stock also insufficient for " + skuVal + " — proceeding to create PR.";
	}
	else
	{
		info "On-hand actual_available_stock is 0 for " + skuVal + " — creating PR directly (Gate 3b skipped).";
	}
	// ----- item lookup (Creator) — still needed for itemCreatorId/itemCategory on
	// real goods lines; Services lines never reach this point anymore -----
	itemCreatorId = "";
	itemCategory = "";
	itemResp = invokeurl
	[
		url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Items?criteria=SKU%3D%3D%22" + skuVal + "%22&field_config=all"
		type :GET
		connection:"supply_chain_app"
	];
	if(itemResp.get("data") != null && itemResp.get("data").size() > 0)
	{
		itemCreatorId = itemResp.get("data").get(0).get("ID");
		itemCategory = itemResp.get("data").get(0).get("category");
	}
	// ADDED 2026-08-08, per user request ("what if so_to_pr -> scenario: added item
	// in books and that SO doesnt have the item in our supply chain all_items. can
	// we import that non existent item like how add item by ID imports it?") — the
	// All_Items lookup above used to just leave itemCreatorId blank forever on a
	// miss, silently creating the PR with no Items lookup link. Mirrors
	// addItemByIdBooks's own field mapping/upsert exactly (see
	// DelugeScripts/add_item_by_id_custom_api.txt) — reuses itemBooks/booksItem
	// already fetched above (Gate 2's own stock-check call) instead of a 2nd Books
	// invokeurl for the same item. Runs BEFORE Gate 4 so THIS SAME PR-creation pass
	// already gets a populated Items lookup, not just the next edit/run.
	if(itemCreatorId == "" && itemBooks != null && itemBooks.get("item") != null)
	{
		importItem = itemBooks.get("item");
		imItemName = ifnull(importItem.get("name"),"");
		imSku = ifnull(importItem.get("sku"),"");
		imItemRef = ifnull(importItem.get("cf_oldsku"),"");
		imDescription = ifnull(importItem.get("cf_description"),"");
		imUnit = ifnull(importItem.get("unit"),"");
		imRate = ifnull(importItem.get("rate"),0);
		imCategory = ifnull(importItem.get("category_name"),"");
		imWarehouses = importItem.get("warehouses");
		imWarehouseStr = "";
		if(imWarehouses != null)
		{
			for each  imWh in imWarehouses
			{
				imAvail = imWh.get("warehouse_actual_available_stock");
				if(imAvail != null && imAvail != 0)
				{
					imWhName = imWh.get("warehouse_name") + "";
					if(imWarehouseStr == "")
					{
						imWarehouseStr = imWhName;
					}
					else
					{
						imWarehouseStr = imWarehouseStr + ", " + imWhName;
					}
				}
			}
		}
		// Bin locations — same 3 real storage warehouses addItemByIdBooks checks,
		// same unrolled-not-looped convention (Map.keys() iteration unproven here).
		imBinStr = "";
		imWhMatch1 = null;
		if(imWarehouses != null)
		{
			for each  imWh1 in imWarehouses
			{
				if(imWh1.get("warehouse_id") + "" == "2680178000042173149")
				{
					imWhMatch1 = imWh1;
				}
			}
		}
		if(imWhMatch1 != null && imWhMatch1.get("is_storage_location_enabled") == true)
		{
			// WRAPPED IN TRY/CATCH, 2026-08-25, real live bug: a transient
			// "UnAuthenticated Connection: zhbooksfullaccessall" on this invokeurl
			// used to throw a hard exception that aborted the ENTIRE function —
			// killing the PR/Customer/supplier-routing work for every other line
			// item too, not just this one bin lookup. Same fallback shape
			// (imSeg1 = "...: Map Bins") already used when locations come back
			// genuinely empty — a transient connection hiccup now degrades the
			// same way a real "no bins mapped yet" case already does, instead of
			// crashing the whole run. Same try/catch pattern already proven in
			// add_item_by_id_custom_api.txt's own image-fetch block.
			imSeg1 = "HC WH3 BAESA: Map Bins";
			try 
			{
				imBinResp1 = invokeurl
				[
					url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000042173149/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
					type :GET
					connection:"zhbooks_fullaccessall"
				];
				imLocs1 = imBinResp1.get("storage_locations");
				imRealBins1 = "";
				if(imLocs1 != null)
				{
					for each  imLoc1 in imLocs1
					{
						imLocName1 = imLoc1.get("name") + "";
						if(imLocName1 != "Receiving Area" && imLocName1 != "Package Area" && imLocName1 != "Default Area")
						{
							if(imRealBins1 == "")
							{
								imRealBins1 = imLocName1;
							}
							else
							{
								imRealBins1 = imRealBins1 + ", " + imLocName1;
							}
						}
					}
				}
				if(imRealBins1 != "")
				{
					imSeg1 = "HC WH3 BAESA: " + imRealBins1;
				}
			}
			catch (e1)
			{
				info "Bin lookup failed for HC WH3 BAESA (item " + itemBooksId + "): " + e1 + " — falling back to Map Bins, item import continues.";
			}
			imBinStr = imSeg1;
		}
		imWhMatch2 = null;
		if(imWarehouses != null)
		{
			for each  imWh2 in imWarehouses
			{
				if(imWh2.get("warehouse_id") + "" == "2680178000055220196")
				{
					imWhMatch2 = imWh2;
				}
			}
		}
		if(imWhMatch2 != null && imWhMatch2.get("is_storage_location_enabled") == true)
		{
			// WRAPPED IN TRY/CATCH, 2026-08-25 — see the WH3 BAESA block above for
			// the full reasoning (same fix, same fallback shape).
			imSeg2 = "HC WH1 BANAWE: Map Bins";
			try 
			{
				imBinResp2 = invokeurl
				[
					url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000055220196/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
					type :GET
					connection:"zhbooks_fullaccessall"
				];
				imLocs2 = imBinResp2.get("storage_locations");
				imRealBins2 = "";
				if(imLocs2 != null)
				{
					for each  imLoc2 in imLocs2
					{
						imLocName2 = imLoc2.get("name") + "";
						if(imLocName2 != "Receiving Area" && imLocName2 != "Package Area" && imLocName2 != "Default Area")
						{
							if(imRealBins2 == "")
							{
								imRealBins2 = imLocName2;
							}
							else
							{
								imRealBins2 = imRealBins2 + ", " + imLocName2;
							}
						}
					}
				}
				if(imRealBins2 != "")
				{
					imSeg2 = "HC WH1 BANAWE: " + imRealBins2;
				}
			}
			catch (e2)
			{
				info "Bin lookup failed for HC WH1 BANAWE (item " + itemBooksId + "): " + e2 + " — falling back to Map Bins, item import continues.";
			}
			if(imBinStr == "")
			{
				imBinStr = imSeg2;
			}
			else
			{
				imBinStr = imBinStr + " | " + imSeg2;
			}
		}
		imWhMatch3 = null;
		if(imWarehouses != null)
		{
			for each  imWh3 in imWarehouses
			{
				if(imWh3.get("warehouse_id") + "" == "2680178000047672049")
				{
					imWhMatch3 = imWh3;
				}
			}
		}
		if(imWhMatch3 != null && imWhMatch3.get("is_storage_location_enabled") == true)
		{
			// WRAPPED IN TRY/CATCH, 2026-08-25 — see the WH3 BAESA block above for
			// the full reasoning (same fix, same fallback shape).
			imSeg3 = "INVENTORY: Map Bins";
			try 
			{
				imBinResp3 = invokeurl
				[
					url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000047672049/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
					type :GET
					connection:"zhbooks_fullaccessall"
				];
				imLocs3 = imBinResp3.get("storage_locations");
				imRealBins3 = "";
				if(imLocs3 != null)
				{
					for each  imLoc3 in imLocs3
					{
						imLocName3 = imLoc3.get("name") + "";
						if(imLocName3 != "Receiving Area" && imLocName3 != "Package Area" && imLocName3 != "Default Area")
						{
							if(imRealBins3 == "")
							{
								imRealBins3 = imLocName3;
							}
							else
							{
								imRealBins3 = imRealBins3 + ", " + imLocName3;
							}
						}
					}
				}
				if(imRealBins3 != "")
				{
					imSeg3 = "INVENTORY: " + imRealBins3;
				}
			}
			catch (e3)
			{
				info "Bin lookup failed for INVENTORY (item " + itemBooksId + "): " + e3 + " — falling back to Map Bins, item import continues.";
			}
			if(imBinStr == "")
			{
				imBinStr = imSeg3;
			}
			else
			{
				imBinStr = imBinStr + " | " + imSeg3;
			}
		}
		imData = Map();
		imData.put("ID1",itemBooksId + "");
		imData.put("item_name",imItemName);
		imData.put("SKU",imSku);
		imData.put("Item_ref",imItemRef);
		imData.put("Description",imDescription);
		imData.put("Unit",imUnit);
		imData.put("Rate",imRate);
		imData.put("category",imCategory);
		imData.put("Warehouse",imWarehouseStr);
		imData.put("Bin_location",imBinStr);
		imCreateResp = zoho.creator.v2_1.createRecord(owner,app,"Items",imData,config,"supply_chain_app");
		info "Auto-imported missing item " + skuVal + " into Items: " + imCreateResp;
		if(imCreateResp != null && imCreateResp.get("data") != null)
		{
			itemCreatorId = imCreateResp.get("data").get("ID") + "";
			itemCategory = imCategory;
		}
	}
	info "itemCreatorId: " + itemCreatorId + " | itemCategory: " + itemCategory;
	// NOTE: Product image is NOT fetched/uploaded here. Zoho's v2.1 Upload File API only
	// allows ONE successful multipart upload per Books custom function execution — every
	// upload after the first one in the same run fails with code 3700 "Unable to upload a
	// file". Since one SO approval can create several supplier PR records, image handling
	// is instead done natively in Creator (see sideUpdateScriptPR.txt) — a "Created"
	// trigger on Fenteng_Lighting_Purchase_Request / Tony_Fan_Purchase_Request each run as
	// their own isolated execution, sidestepping the limit entirely.
	// ===== GATE 4: INQ ROUTING (before PR1 create) =====
	routeFenteng = true;
	routeTony = true;
	matchedInqNo = "";
	prSupplierRows = List();
	hasFentengQuote = false;
	hasTonyQuote = false;
	selAvail = "";
	selInitPrice = 0;
	selNego = 0;
	selFinalPrice = 0;
	selLeadTime = 0;
	if(soInqNo != "")
	{
		routeFenteng = false;
		routeTony = false;
		matchedInq = false;
		inqList = (soInqNo + "").toList(",");
		for each  singleInq in inqList
		{
			singleInq = singleInq.trim();
			if(singleInq == "")
			{
				continue;
			}
			// FIXED 2026-08-24, real bug found via code review (not yet live-tested): this
			// call was missing "&field_config=all" — Supplier_Quotes (read below) is a
			// SUBFORM, and per the same confirmed defect already fixed in
			// so_fulfillment_sync.txt, Creator's REST API omits subform data entirely
			// unless field_config=all is set. Without it, `quotes` below was always null,
			// `anySelected` always false, and every PR silently routed to BOTH suppliers
			// regardless of which one's quote was actually marked Selected on the Inquiry.
			inqResp = invokeurl
			[
				url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Inquiries?criteria=INQ_No%3D%3D%22" + singleInq + "%22&field_config=all"
				type :GET
				connection:"supply_chain_app"
			];
			inqDataSize = 0;
			if(inqResp.get("data") != null)
			{
				inqDataSize = inqResp.get("data").size();
			}
			info "INQ check: " + singleInq + " for line sku [" + skuVal + "] -> records found: " + inqDataSize;
			if(inqResp.get("data") != null && inqResp.get("data").size() > 0)
			{
				inqRec = inqResp.get("data").get(0);
				inqSkuVal = inqRec.get("sku") + "";
				info "  INQ " + singleInq + " sku: [" + inqSkuVal + "]";
				if(inqSkuVal == skuVal)
				{
					matchedInq = true;
					matchedInqNo = singleInq;
					quotes = inqRec.get("Supplier_Quotes");
					anySelected = false;
					if(quotes != null)
					{
						for each  q in quotes
						{
							if(q.get("Selected") == true || q.get("Selected") == "true")
							{
								anySelected = true;
								sid = q.get("Supplier_ID") + "";
								selAvail = q.get("Availability");
								selInitPrice = q.get("Initial_Price");
								selNego = q.get("Negotiated");
								selFinalPrice = q.get("Final_Price");
								selLeadTime = q.get("Lead_Time");
								// FIXED 2026-08-04, real bug found live in Production — sid is a
								// bracketed CREATOR RECORD ID (differs per environment, Dev's
								// hardcoded literals below never matched anything in Prod, silently
								// routing to neither supplier). Resolved via a Creator REST lookup
								// (this is a BOOKS function, no native Suppliers[ID==...] task
								// available) against the Suppliers form's own Supplier_ID field —
								// the real, environment-constant Books Contact ID. Same fix as
								// edit_counter_scripts.txt/PR1_Created_Edited_Routing.txt, adapted
								// for REST since this file calls Creator over invokeurl, not
								// natively.
								sidRawSTP = sid.removeFirstOccurence("[").removeLastOccurence("]");
								quoteBooksIdSTP = "";
								if(sidRawSTP != "")
								{
									supResp = invokeurl
									[
										url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Suppliers?criteria=ID%3D%3D%22" + sidRawSTP + "%22&field_config=all"
										type :GET
										connection:"supply_chain_app"
									];
									if(supResp.get("data") != null && supResp.get("data").size() > 0)
									{
										quoteBooksIdSTP = supResp.get("data").get(0).get("Supplier_ID") + "";
									}
								}
								if(quoteBooksIdSTP == "2680178000049168001")
								{
									routeFenteng = true;
									hasFentengQuote = true;
								}
								if(quoteBooksIdSTP == "2680178000002735078")
								{
									routeTony = true;
									hasTonyQuote = true;
								}
								prSupRow = Map();
								prSupRow.put("Supplier_ID",sid.removeFirstOccurence("[").removeLastOccurence("]"));
								prSupRow.put("Suppliers",q.get("Suppliers") + "");
								prSupRow.put("Availability",selAvail);
								prSupRow.put("Initial_Price",selInitPrice);
								prSupRow.put("Negotiated",selNego);
								prSupRow.put("Final_Price",selFinalPrice);
								prSupRow.put("Lead_Time",selLeadTime);
								prSupRow.put("Selected",true);
								prSupplierRows.add(prSupRow);
							}
						}
					}
					if(anySelected == false)
					{
						routeFenteng = true;
						routeTony = true;
					}
				}
			}
		}
		if(matchedInq == false)
		{
			routeFenteng = true;
			routeTony = true;
		}
	}
	if(prSupplierRows.size() == 0)
	{
		if(routeFenteng == true)
		{
			fRow = Map();
			fRow.put("Supplier_ID","4662244000014031308");
			fRow.put("Suppliers","Fenteng");
			prSupplierRows.add(fRow);
		}
		if(routeTony == true)
		{
			tRow = Map();
			tRow.put("Supplier_ID","4662244000014031306");
			tRow.put("Suppliers","Tony");
			prSupplierRows.add(tRow);
		}
	}
	info "routeFenteng: " + routeFenteng + " | routeTony: " + routeTony + " | matchedInqNo: " + matchedInqNo + " | hasFentengQuote: " + hasFentengQuote + " | hasTonyQuote: " + hasTonyQuote;
	// ----- create Purchase_Request1 -----
	data = Map();
	data.put("PR_Date",today);
	data.put("Source","SO");
	data.put("Sales_Order",soNumber);
	// ADDED 2026-08-25, real live bug: 2 genuinely simultaneous function executions
	// (Books' own "any field updated" double-fire quirk, same class already flagged
	// in the RECHECK GUARD comment below) can both pass the RECHECK GET before
	// either one's createRecord has committed/become searchable — that guard only
	// shrinks the race window, it was never able to close a TRUE simultaneous race
	// (Creator has no server-side unique-constraint on the Sales_Order+sku PAIR
	// without this). Dedup_Key (Single Line, "No duplicate values" enabled in Form
	// Builder — confirmed via official docs that this validation works on Single
	// Line but NOT Formula fields, hence a plain concatenated string here instead
	// of a computed field) gives Creator itself a real constraint to reject the
	// 2nd concurrent insert against. The existing code already tolerates a
	// rejected create safely (createResp.get("data") comes back null, prNo stays
	// blank, the whole supplier-PR block below is skipped — no crash, no special
	// handling needed).
	data.put("Dedup_Key",soNumber + "|" + skuVal);
	data.put("Sales_Owner",salesOwner);
	if(soTotal != null)
	{
		data.put("Order_Value",soTotal.toLong());
	}
	data.put("sku",skuVal);
	data.put("Description1",itemName);
	data.put("description",itemDesc);
	data.put("quantity",itemQty);
	data.put("unit",itemUnit);
	if(targetDate != "")
	{
		data.put("Target_Delivery",targetDate);
	}
	if(orderType != "")
	{
		data.put("Order_Type",orderType);
	}
	if(custCreatorId != "")
	{
		data.put("Customer",custCreatorId);
	}
	if(custType != "")
	{
		data.put("Customer_Type",custType);
	}
	if(itemCreatorId != "")
	{
		data.put("Items",itemCreatorId);
	}
	if(itemCategory != "")
	{
		data.put("category",itemCategory);
	}
	if(itemRate != null)
	{
		data.put("SRP_Rate_PR",itemRate.toLong());
	}
	if(matchedInqNo != "")
	{
		data.put("inquiry_reference",matchedInqNo);
	}
	data.put("Supplier_Selected",prSupplierRows);
	// ===== RECHECK GUARD, added 2026-08-17, per user report ("if i edit and save
	// the SO in the books it duplicate the sync in the PR") — real live bug, SO-16489
	// (both a catalog line and an INQ-routed CUSTOMIZED line duplicated in the same
	// edit-save, one pair landing on 2 different PR numbers, the other pair landing on
	// the SAME PR number twice). The DEDUP GUARD above (2026-07-28) already checks
	// Sales_Order+sku before doing any work, but Gates 2-4 in between (Books item
	// fetch, Creator item lookup, possible Items import/createRecord, INQ/supplier
	// quote lookups) are several sequential API round-trips — if Books' own "Any
	// field is updated" rule fires this function twice for what looks like one Save
	// (a known Books quirk when the edit also recomputes a rollup/total field — see
	// this file's own 2026-08-01 "STATUS CHECK MOVED INLINE" note for a related
	// example), both runs can pass the FIRST dedup check before either one's
	// createRecord has committed/become searchable, and both go on to create a PR.
	// Re-running the exact same SO+sku existence check immediately before THIS
	// create call shrinks that race window from "the whole Gates 2-4 duration" down
	// to one more GET's latency — doesn't fully eliminate a true simultaneous race
	// (Creator has no server-side unique-constraint/"Prevent Duplicate" available on
	// this pair without a form-level formula field change, which is a Creator admin
	// setting, not a Deluge edit — flag to user as the real belt-and-suspenders fix
	// if this recheck alone doesn't fully close it live), but costs one cheap GET
	// only on the create path (never on the far more common "already skipped by the
	// first guard" or "existing PR, field re-sync" paths above). =====
	recheckUrl = "https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request?criteria=(Sales_Order%3D%3D%22" + soNumber + "%22%20%26%26%20sku%3D%3D%22" + skuVal + "%22)";
	recheckResp = invokeurl
	[
		url :recheckUrl
		type :GET
		connection:"supply_chain_app"
	];
	if(recheckResp.get("data") != null && recheckResp.get("data").size() > 0)
	{
		info "RECHECK caught a race — PR already created for SO " + soNumber + " / SKU " + skuVal + " by a concurrent run, skipping duplicate create.";
		continue;
	}
	// ADDED 2026-08-24, per user report (live createRecord failure, "code":2945
	// "JSON_PARSE_ERROR" on SO with custCreatorId blank) — no prior diagnostic logged
	// the exact outgoing data Map for this create call (so_fulfillment_sync.txt has
	// this same log line, this file never did). Logging the full map here so the next
	// live failure shows exactly which value is malformed instead of guessing blind.
	info "data map about to be sent for item " + skuVal + ": " + data;
	createResp = zoho.creator.v2_1.createRecord("homecartel","supply-chain-app","Purchase_Request1",data,config,"supply_chain_app");
	info "createRecord response: " + createResp;
	prId = "";
	if(createResp.get("data") != null)
	{
		prId = createResp.get("data").get("ID");
	}
	prNo = "";
	if(prId != null && prId != "")
	{
		prResp = invokeurl
		[
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/All_Purchase_Request/" + prId
			type :GET
			connection:"supply_chain_app"
		];
		if(prResp.get("data") != null)
		{
			prNo = prResp.get("data").get("PR_No");
		}
	}
	info "prNo: " + prNo;
	if(prNo != null && prNo != "")
	{
		// ----- Fenteng (Supplier_1) -----
		if(routeFenteng == true)
		{
			fData = Map();
			fData.put("PR_No_Supplier1",prNo);
			fData.put("PR_Date_Supplier1",today);
			fData.put("sku_Supplier1",skuVal);
			fData.put("Description1_Supplier1",itemName);
			fData.put("description_Supplier1",itemDesc);
			fData.put("quantity_Supplier1",itemQty);
			fData.put("unit_Supplier1",itemUnit);
			fResponseStatus = "Waiting";
			if(hasFentengQuote == true)
			{
				fResponseStatus = "Selected";
			}
			fData.put("Response_Status",fResponseStatus);
			fData.put("edit_counter",1);
			if(targetDate != "")
			{
				fData.put("Target_Delivery_Supplier1",targetDate);
			}
			if(itemCreatorId != "")
			{
				fData.put("Items_Supplier1",itemCreatorId);
			}
			if(itemCategory != "")
			{
				fData.put("category_Supplier1",itemCategory);
			}
			if(matchedInqNo != "")
			{
				fData.put("inquiry_reference_Supplier1",matchedInqNo);
			}
			fSubList = List();
			fSubRow = Map();
			fSubRow.put("Suppliers_Supplier1","Fenteng");
			if(hasFentengQuote == true)
			{
				fSubRow.put("Availability_Supplier1",selAvail);
				fSubRow.put("Initial_Price_Supplier1",selInitPrice);
				fSubRow.put("Negotiated_Supplier1",selNego);
				fSubRow.put("Final_Price_Supplier1",selFinalPrice);
				fSubRow.put("Lead_Time_Supplier1",selLeadTime);
				fSubRow.put("Selected_Supplier1",true);
			}
			fSubList.add(fSubRow);
			fData.put("Supplier_Selected_Supplier1",fSubList);
			fCreateResp = zoho.creator.v2_1.createRecord("homecartel","supply-chain-app","Fenteng_Lighting_Purchase_Request",fData,config,"supply_chain_app");
			info "Fenteng createRecord: " + fCreateResp;
		}
		// ----- Tony Fan (Supplier_2) -----
		if(routeTony == true)
		{
			tData = Map();
			tData.put("PR_No_Supplier2",prNo);
			tData.put("PR_Date_Supplier2",today);
			tData.put("sku_Supplier2",skuVal);
			tData.put("Description1_Supplier2",itemName);
			tData.put("description_Supplier2",itemDesc);
			tData.put("quantity_Supplier2",itemQty);
			tData.put("unit_Supplier2",itemUnit);
			tResponseStatus = "Waiting";
			if(hasTonyQuote == true)
			{
				tResponseStatus = "Selected";
			}
			tData.put("Response_Status",tResponseStatus);
			tData.put("edit_counter",1);
			if(targetDate != "")
			{
				tData.put("Target_Delivery_Supplier2",targetDate);
			}
			if(itemCreatorId != "")
			{
				tData.put("Items_Supplier2",itemCreatorId);
			}
			if(itemCategory != "")
			{
				tData.put("category_Supplier2",itemCategory);
			}
			if(matchedInqNo != "")
			{
				tData.put("inquiry_reference_Supplier2",matchedInqNo);
			}
			tSubList = List();
			tSubRow = Map();
			tSubRow.put("Suppliers_Supplier2","Tony");
			if(hasTonyQuote == true)
			{
				tSubRow.put("Availability_Supplier2",selAvail);
				tSubRow.put("Initial_Price_Supplier2",selInitPrice);
				tSubRow.put("Negotiated_Supplier2",selNego);
				tSubRow.put("Final_Price_Supplier2",selFinalPrice);
				tSubRow.put("Lead_Time_Supplier2",selLeadTime);
				tSubRow.put("Selected_Supplier2",true);
			}
			tSubList.add(tSubRow);
			tData.put("Supplier_Selected_Supplier2",tSubList);
			tCreateResp = zoho.creator.v2_1.createRecord("homecartel","supply-chain-app","Tony_Fan_Purchase_Request",tData,config,"supply_chain_app");
			info "Tony createRecord: " + tCreateResp;
		}
	}
}

````
