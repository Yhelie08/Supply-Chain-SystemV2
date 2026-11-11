---
title: "sales_return_to_books"
source_file: "sales_return_to_books.txt"
category: "Delivery Management/_Deluge/Deluge"
associated_widget: "[[Delivery Management/Sales Returns/Widget/SalesReturns Widget|SalesReturns Widget]]"
lines: 341
tags:
  - custom-api
  - deluge
  - fulfillment
  - procurement
  - purchase-order
  - qc
  - zoho-books
  - zoho-inventory
---

# sales_return_to_books

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/Sales Returns/Widget/SalesReturns Widget|SalesReturns Widget]]
> - **Category:** `Delivery Management/_Deluge/Deluge`
> - **Source File:** `sales_return_to_books.txt`
> - **Lines of Code:** 341
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#procurement`, `#purchase-order`, `#qc`, `#zoho-books`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/Sales Returns/Widget/SalesReturns Widget|SalesReturns Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
/* ============================================================
   REVISED 2026-07-28, per real reference script found in Temp.txt — the OLD
   `logistics-management` app's own native "SR Books" Report Action Item on
   its Sales Returns Report. That script is REAL, proven, and targets the
   SAME org (organizationID = "751117756", same org this app's zhbooks3/
   zhbooksfullaccessall connections already use) — corrected this whole
   function to match its confirmed-working shape instead of a first-draft
   guess. See git history / this file's own prior version for what changed.

   CORRECTIONS made from the old script, in order of importance:
   1. Uses native `zoho.inventory.getRecords`/`getRecordsByID` Deluge tasks
      (a real task family, same as `zoho.books.*` elsewhere in this app) for
      the SO lookup/fetch, instead of raw invokeurl GETs.
   2. `salesorder_id` is a URL QUERY PARAM on the salesreturns POST, not a
      body field. `customer_id` is NOT sent at all — Inventory derives it
      from the linked Sales Order.
   3. `custom_fields` are keyed by real `customfield_id` (confirmed live on
      this exact org via the old script): Sub Reason = 2680178000022219065,
      Returned By = 2680178000022245013. Not label-keyed guesses anymore.
   4. Dedup guard on matching SO line items (won't double-match the same
      line_item_id twice), ported from the old script's `used_line_items`.
   5. `salesreturn_number` is explicitly SET to this app's own RMA value
      (officer fills it before Create, per this app's gate requirement) —
      the old script instead let Books auto-assign the number then wrote it
      BACK onto its own RMA field. This app's widget requires RMA up front
      (user's explicit gate list), so send it through instead of letting
      Books auto-number.
   6. DROPPED entirely (old-app-specific, not applicable here — no CMS
      module, no Complaint_Record_ID field on Sales_Returns_Form in this
      app): the old script's whole second half — creating a brand-new
      `salesorders` record tagged with Reason/Sub-Reason/RMA custom fields,
      and the Complaint_Phases/Complaint_Timeline CMS writes. None of that
      exists in this app's data model.
   7. DROPPED the old script's hardcoded `Authorization: Zoho-oauthtoken ...`
      header — a stale legacy hack layered on top of an already-present
      `connection` param. Connection-based auth only, matching every other
      Books/Inventory call in this codebase.

   ARCHITECTURE NOTE: this whole function runs in CREATOR's Deluge engine
   (this app is widget-only deployment, so it's a Custom Function + Custom
   API wrapper rather than a native Report Action Item — but the old script
   proves the underlying `zoho.inventory.*`/invokeurl calls work fine
   directly from Creator's own Deluge, same as this file already assumed).
   That means the Inventory connection needed is a CREATOR-side Connection
   (Settings -> Connections in CREATOR, same list `zcreator`/`zhbooks3` live
   in) — NOT a Books-side "Settings -> Automation -> Connections" one as an
   earlier draft of this file wrongly said. Suggested link name: `zhinventory3`
   (parallels `zhbooks3`'s own naming), scoped to Zoho Inventory, self-
   authorized to org 751117756. Rename below if a different name is used.

   PREREQUISITE — user must do before this can be pasted/tested:
   1. New CREATOR-side Connection (Setup -> Connections in Creator, NOT
      Books' own Automation Connections), service = Zoho Inventory, scope
      covering salesreturns create + salesorders read, self-authorized to
      org 751117756, link name `zhinventory3`.
   2. 2 new fields on Sales_Returns_Form (Single Line Text each):
      Books_SalesReturn_ID, Books_SalesReturn_No.
   3. Custom Function `createSalesReturnBooks` + Custom API
      `create_sales_return_books` created live, key wired into the widget's
      `CUSTOM_API_KEY_CREATE_SR` const.

   Still deliberately does NOT read the Items subform off a criteria-queried
   record (documented-unreliable in a Custom Function) — widget passes item
   rows as a JSON string arg instead.
   ============================================================ */

map createSalesReturnBooks(String recordId, String salesOrderNo, String rmaVal, String dateVal, String reasonVal, String subReasonVal, String returnedByVal, String itemsJson)
{
	response = Map();

	// FIXED 2026-07-28 — real bug found live via diagnostic logging: the original
	// `rec = Sales_Returns_Form[ID==X]; rec.get("ID")` shape always returned null
	// even for a confirmed, single-matching record (`for each` over the SAME
	// criteria found exactly 1 row) — `Form[criteria]` is a collection, not a
	// directly-.get()-able Map, so `.get("ID")`/`.get("Books_SalesReturn_ID")`
	// never actually read anything. Rewritten using `for each` + dot-notation,
	// the same proven-safe single-record-read pattern used everywhere else in
	// this app.
	recFound = false;
	existingBooksId = "";
	existingBooksNo = "";
	for each rec in Sales_Returns_Form[ID == recordId.toLong()]
	{
		recFound = true;
		existingBooksId = rec.Books_SalesReturn_ID + "";
		existingBooksNo = rec.Books_SalesReturn_No + "";
	}
	if(!recFound)
	{
		response.put("status","error");
		response.put("message","Sales Return record not found.");
		return response;
	}
	if(existingBooksId != null && existingBooksId != "")
	{
		response.put("status","error");
		response.put("message","Already sent to Books (Sales Return " + existingBooksNo + ").");
		return response;
	}

	orgId = "751117756";

	// 1. Resolve the Sales Order in Inventory by its number
	// NOTE: zoho.inventory.getRecords/getRecordsByID's `connection` arg is
	// documented as "not applicable to Zoho Creator" — errored live with a
	// STRING type mismatch when passed from this Creator Custom Function.
	// Using plain invokeurl instead (same connection param, proven working
	// everywhere else in this app for Books/Inventory REST calls).
	salesorder_id = null;
	soSearchUrl = "https://www.zohoapis.com/inventory/v1/salesorders?organization_id=" + orgId + "&salesorder_number=" + salesOrderNo;
	try
	{
		soSearch = invokeurl
		[
			url :soSearchUrl
			type :GET
			connection:"zhinventory3"
		];
	}
	catch (e)
	{
		response.put("status","error");
		response.put("message","Error fetching Sales Order: " + e);
		return response;
	}
	if(soSearch.get("salesorders") != null && soSearch.get("salesorders").size() > 0)
	{
		salesorder_id = soSearch.get("salesorders").get(0).get("salesorder_id") + "";
	}
	else
	{
		response.put("status","error");
		response.put("message","Sales Order '" + salesOrderNo + "' not found in Inventory — cannot resolve item references.");
		return response;
	}

	// 2. Fetch the full Sales Order to get real line_item_id / item_id per SKU
	soFullUrl = "https://www.zohoapis.com/inventory/v1/salesorders/" + salesorder_id + "?organization_id=" + orgId;
	soFull = invokeurl
	[
		url :soFullUrl
		type :GET
		connection:"zhinventory3"
	];
	if(soFull.get("salesorder") == null)
	{
		response.put("status","error");
		response.put("message","Could not fetch full Sales Order details.");
		return response;
	}
	soLines = soFull.get("salesorder").get("line_items");

	// 3. Match the widget-supplied return rows (SKU + qty) to the SO's real line items
	// FIXED 2026-07-28 — `toJSONList()` on a raw top-level JSON array string (of
	// objects) silently returned nothing, confirmed live (widget sent a real
	// non-empty payload, but Deluge's own unmatched-SKUs list came back empty
	// too, meaning the for-each over returnRows never actually ran). Per
	// official Zoho Deluge docs, toJSONList() is documented to work reliably
	// via getJSON(key) extracting a sub-array's raw text first, not directly on
	// a bare array string — same shape the docs' own example uses
	// (`json_text.getJSON("OrderNo").toJSONList()`). Widget now wraps the array
	// in an object ({"items":[...]}) to match.
	returnRows = itemsJson.getJSON("items").toJSONList();
	lineItems = List();
	unmatchedSkus = List();
	usedLineItemIds = List();

	for each row in returnRows
	{
		skuVal = row.get("SKU");
		qtyVal = row.get("Return_Quantity");
		if(skuVal == null || skuVal == "" || qtyVal == null){ continue; }
		if(qtyVal.toString().toDecimal() <= 0){ continue; }

		matched = false;
		for each ln in soLines
		{
			lnId = ln.get("line_item_id");
			if(ln.get("sku") == skuVal && !usedLineItemIds.contains(lnId))
			{
				li = Map();
				li.put("item_id", ln.get("item_id"));
				li.put("salesorder_item_id", lnId);
				li.put("quantity", qtyVal.toString().toDecimal());
				lineItems.add(li);
				usedLineItemIds.add(lnId);
				matched = true;
				break;
			}
		}
		if(matched == false)
		{
			unmatchedSkus.add(skuVal);
		}
	}

	if(lineItems.size() == 0)
	{
		response.put("status","error");
		response.put("message","No returned item matched a real line on Sales Order " + salesOrderNo + ". Unmatched SKUs: " + unmatchedSkus.toString());
		return response;
	}

	// 4. Build the Sales Return payload — matches the confirmed-working old-app shape
	reasonText = reasonVal;
	if(reasonText == null){ reasonText = ""; }

	custom_fields = List();
	custom_fields.add({"customfield_id":"2680178000022219065","value":subReasonVal});
	custom_fields.add({"customfield_id":"2680178000022245013","value":returnedByVal});

	// NOTE 2026-07-28, per user: RMA is now a provisional Creator-only number
	// (client-computed RMA-##### at New Sales Return time, see the widget's
	// computeNextRMANo()) — matches the old app's own original behavior
	// (this function no longer forces it into Books as salesreturn_number).
	// Books auto-assigns its own real number; that real number overwrites
	// Creator's own RMA field on success below.
	srData = Map();
	srData.put("date", dateVal);
	srData.put("reason", reasonText);
	srData.put("line_items", lineItems);
	srData.put("custom_fields", custom_fields);

	headers_data = Map();
	headers_data.put("content-type","application/json");

	createUrl = "https://www.zohoapis.com/inventory/v1/salesreturns?organization_id=" + orgId + "&salesorder_id=" + salesorder_id;
	createResp = invokeurl
	[
		url :createUrl
		type :POST
		parameters:srData.toString()
		headers:headers_data
		connection:"zhinventory3"
	];

	srObj = createResp.get("salesreturn");
	if(srObj == null)
	{
		response.put("status","error");
		response.put("message","Inventory rejected the create — " + createResp.get("message"));
		response.put("raw", createResp.toString());
		return response;
	}

	srId = srObj.get("salesreturn_id");
	srNo = srObj.get("salesreturn_number");

	update Sales_Returns_Form[ID == recordId.toLong()]
	[
		Books_SalesReturn_ID = srId
		Books_SalesReturn_No = srNo
		RMA = srNo
		SR_CREATION_STATUS = "CREATED"
	];

	// ADDED 2026-07-29, per user ("if we sales return the stock will create a
	// receive again right?... does our sales return to books does that
	// already?"). Confirmed via official Zoho Inventory docs — a Sales Return
	// is a 3-stage object (Return -> Receive -> Refund), and physical stock
	// only comes back into inventory at the RECEIVE stage — creating the
	// return alone (everything above this point) does NOT restore stock.
	// Real endpoint: POST /salesreturnreceives, needs each line's own
	// line_item_id (returned FROM the just-created salesreturn's own
	// response, srObj — not the original salesorder's line_item_id, a
	// DIFFERENT ID space, same "a create response mints its own line IDs"
	// pattern already documented elsewhere in this app for Books receives).
	// Best-effort — a Receive failure does NOT undo/fail the already-
	// succeeded Return above (matches this app's own established "secondary
	// step, don't roll back the primary success" convention, e.g. Exception
	// Control Media uploads after a QC save). salesreturn_id passed as a
	// query param, mirroring the same convention already proven for
	// salesorder_id on the /salesreturns create call above and
	// purchaseorder_id on /purchasereceives elsewhere in this app —
	// UNCONFIRMED for this specific endpoint (docs fetch didn't show it
	// explicitly), flag if it errors.
	receiveLineItems = List();
	srLineItems = srObj.get("line_items");
	if(srLineItems != null)
	{
		for each srLi in srLineItems
		{
			rLi = Map();
			rLi.put("line_item_id", srLi.get("line_item_id"));
			rLi.put("quantity", srLi.get("quantity"));
			receiveLineItems.add(rLi);
		}
	}

	receiveStatus = "not_attempted";
	receiveMessage = "";
	if(receiveLineItems.size() > 0)
	{
		receiveData = Map();
		receiveData.put("line_items", receiveLineItems);
		receiveUrl = "https://www.zohoapis.com/inventory/v1/salesreturnreceives?organization_id=" + orgId + "&salesreturn_id=" + srId;
		try
		{
			receiveResp = invokeurl
			[
				url :receiveUrl
				type :POST
				parameters:receiveData.toString()
				headers:headers_data
				connection:"zhinventory3"
			];
			if(receiveResp.get("salesreturnreceive") != null)
			{
				receiveStatus = "success";
			}
			else
			{
				receiveStatus = "failed";
				receiveMessage = receiveResp.get("message") + "";
			}
		}
		catch (eReceive)
		{
			receiveStatus = "failed";
			receiveMessage = "" + eReceive;
		}
	}

	response.put("status","success");
	if(receiveStatus == "success")
	{
		response.put("message","Sales Return " + srNo + " created and stock received back into Inventory.");
	}
	else
	{
		response.put("message","Sales Return " + srNo + " created in Books — but the stock Receive step failed (" + receiveMessage + "). Return is still valid; receive stock manually in Books.");
	}
	response.put("salesreturn_id", srId);
	response.put("salesreturn_no", srNo);
	response.put("receive_status", receiveStatus);
	if(unmatchedSkus.size() > 0)
	{
		response.put("unmatched_skus", unmatchedSkus.toString());
	}
	return response;
}

````
