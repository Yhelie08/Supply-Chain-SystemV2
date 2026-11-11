---
title: "Create_Bin_Receiving"
source_file: "Create_Bin_Receiving"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]"
lines: 1847
tags:
  - crate
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - kanban
  - order-aggregation
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-books
---

# Create_Bin_Receiving

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `Create_Bin_Receiving`
> - **Lines of Code:** 1,847
> - **Tags:** `#crate`, `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#kanban`, `#order-aggregation`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
orgId = "751117756";
if(input.Supplier == "HC System" || input.Supplier.contains("HC System"))
{
	input.Books_Receive_ID = "";
	input.Books_Receive_No = "N/A (HC System - internal only)";
	info "HC System (Local) receiving - skipped Books, internal only.";
	return;
}
/* ADDED 2026-07-27, per user ("dont put it in books") — a Fulfillment-EXC
   replacement Receiving record (created fresh by clone_shipment_for_replacement.txt,
   see that file's own NOTES) never sends to Books at all — it's internal-only
   rework/replace tracking, the real unit was already fully/correctly received and
   fulfilled once already. SIMPLIFIED 2026-07-27, same day — the original version
   detected this by matching the linked Shipment's Shipment_No against an
   Acknowledged RR's Cloned_Shipment_No (a real but indirect proxy). Now that
   Receiving has its own real Source_Module/Exception_Number fields (per user
   request, "indicate in shp and rcv that this record is from Fulfillment's
   Exception" — stamped directly by clone_shipment_for_replacement.txt at
   creation), this reads them straight off `input` — no Shipments/Replacement_
   Request lookup needed at all for detection. Completes the moment Accepted_Qty
   == Expected_Qty on this record's own line(s), per direct user instruction —
   closes the RR + Exception_Control1 directly, no Books call, no delta
   computation. */
fulfillmentExcCheck = input.Source_Module == "Fulfillment EXC";
fulfillmentExcClosedNo = input.Exception_Number;
fulfillmentExcClosedRRNo = "";
if(fulfillmentExcCheck == true)
{
	if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
	{
		rrLookupCloseF = Fenteng_Lighting_Replacement_Request[Source_Exception_No == fulfillmentExcClosedNo && RR_Status == "Acknowledged"];
		for each  rlcF in rrLookupCloseF
		{
			fulfillmentExcClosedRRNo = rlcF.RR_No;
		}
	}
	else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
	{
		rrLookupCloseT = Tony_Fan_Replacement_Request[Source_Exception_No == fulfillmentExcClosedNo && RR_Status == "Acknowledged"];
		for each  rlcT in rrLookupCloseT
		{
			fulfillmentExcClosedRRNo = rlcT.RR_No;
		}
	}
	fulfillmentExcExpected = 0;
	fulfillmentExcAccepted = 0;
	for each  rliCheck in input.Receiving_Line_Items
	{
		fulfillmentExcExpected = fulfillmentExcExpected + ifnull(rliCheck.Expected_Qty,0);
		fulfillmentExcAccepted = fulfillmentExcAccepted + ifnull(rliCheck.Accepted_Qty,0);
	}
	if(fulfillmentExcExpected == 0)
	{
		info "No Expected Qty on this replacement receive yet.";
		return;
	}
	if(fulfillmentExcAccepted != fulfillmentExcExpected)
	{
		info "Accepted Qty must equal Expected Qty (" + fulfillmentExcExpected + ") to complete this Fulfillment EXC replacement receive.";
		return;
	}
	// ADDED 2026-08-17, per user report (RR-00001/RR-00002, SO-16489, screenshot
	// of Pre Order Report showing Target Delivery blank) — "target delivery date
	// is based dito", pointing at this exact RR record's own ETA field (the
	// supplier's promised arrival for THIS replacement shipment). Captured here,
	// in the same loop that's already reading this RR record for RR_Status, so
	// no extra fetch is needed — used below to override the Sales_Order_
	// Fulfillment/Pre_Order_FF fallback chain when building poDirectTargetDate,
	// since a replacement's real expected arrival is this shipment's ETA, not
	// the original order's (possibly stale/already-passed) target date.
	ecDirectRR_ETA = "";
	if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
	{
		rrDirectCloseF = Fenteng_Lighting_Replacement_Request[RR_No == fulfillmentExcClosedRRNo];
		for each  rdcF in rrDirectCloseF
		{
			rdcF.RR_Status="Completed";
			rdcFEta = rdcF.ETA + "";
			if(rdcFEta != "" && rdcFEta != "null")
			{
				ecDirectRR_ETA = rdcFEta;
			}
		}
	}
	else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
	{
		rrDirectCloseT = Tony_Fan_Replacement_Request[RR_No == fulfillmentExcClosedRRNo];
		for each  rdcT in rrDirectCloseT
		{
			rdcT.RR_Status="Completed";
			rdcTEta = rdcT.ETA + "";
			if(rdcTEta != "" && rdcTEta != "null")
			{
				ecDirectRR_ETA = rdcTEta;
			}
		}
	}
	ecDirectComplete = Exception_Control1[Exception_Number == fulfillmentExcClosedNo];
	ecDirectSO = "";
	ecDirectPAC = "";
	ecDirectItemName = "";
	ecDirectSKU = "";
	ecDirectQty = 1;
	ecDirectPR = "";
	ecDirectRR = "";
	for each  ecdc in ecDirectComplete
	{
		ecDirectSO = ecdc.Sales_Order;
		ecDirectPAC = ecdc.PAC;
		ecDirectItemName = ecdc.Item_Name;
		ecDirectSKU = ecdc.SKU;
		ecDirectQty = ecdc.Qty;
		ecDirectPR = ecdc.PR;
		ecDirectRR = ecdc.RR_No;
		if(ecdc.Status != "Completed")
		{
			ecdc.Status="Completed";
		}
	}
	/* CHANGED 2026-07-27, per user ("change the flow... every completed ->
	   quality check... approved -> aggregate") — this branch used to push
	   straight into Order_Aggregation1 on completion (added 2026-07-27 earlier
	   the same day, see the prior NOTES this replaces). Per the new flow, both
	   the manual Exception Control path AND this Deluge-driven Fulfillment-EXC
	   auto-close now create a Checker_Checklist record (report All_Qc_Reports1)
	   instead — Order Aggregation only ever gets updated once a QC officer sets
	   QC_Status=Approved on that record (UI/FF Widget/QCChecklist's own
	   syncQcApprovedToOrderAggregation()). Same Pre_Order_FF enrichment
	   fallback as before (Exception_Control1 itself doesn't reliably carry
	   Order_Type/Delivery_Type/Target_Delivery/For_Crate/Customer_* — confirmed
	   via the widget's own code, only Sales_Order/PAC/Item_Name/SKU/Qty/PR/
	   RR_No are real there) — richer than the old Order_Aggregation1 push since
	   it also carries RR#, not previously included. New field needed on
	   Checker_Checklist (user creates manually): Exception_Number (Single Line
	   Text) — the only link QCChecklist's own Rejected handler has back to this
	   exception. */
	if(ecDirectSO != "")
	{
		poDirectOrderType = "";
		poDirectDeliveryType = "";
		poDirectTargetDate = "";
		poDirectForCrate = false;
		poDirectCustName = "";
		poDirectCustType = "";
		poDirectCustAddr = "";
		// ADDED 2026-08-06, per user request ("why other fields is not auto
		// populated? like the city email contact") — Pre_Order_FF now carries
		// City/Email/Contact (see so_kanban_sync.txt), relayed onward here so
		// checker_checklist_qc_sync.txt can relay them again into
		// Order_Aggregation1 -> Service_Appointment_Form.
		poDirectCity = "";
		poDirectEmail = "";
		poDirectContact = "";
		// ADDED 2026-08-13, real gap found live — user checked the native Pre_Order_FF
		// record and found Bin Location blank too (same report as the Target Delivery
		// Date gap fixed just above). Bin_Location was never resolved anywhere in this
		// branch at all (not even for the OLD Checker_Checklist insert this branch used
		// to do) — per-SKU, lives on Sales_Order_Fulfillment's own Item_Details1
		// subform (same field/shape so_kanban_sync.txt itself writes), not a header
		// field like the others seeded just below.
		poDirectBinLoc = "";
		// ADDED 2026-08-17 — Payment Status ("Status" field) was never resolved
		// anywhere in this branch at all, same class of gap as Bin_Location above
		// (per user screenshot: Pre Order Report showed this row's Payment Status
		// genuinely blank while sibling rows for the same SO showed "Paid"). No
		// Books/payment lookup needed here — so_kanban_sync.txt's own
		// preOrderData.put("Status", preOrderStatus) is the ONLY place this field
		// is ever computed from Books in the first place; every OTHER Pre_Order_FF
		// row for this same SO already carries that computed value, so it's copied
		// across in the existing Pre_Order_FF fallback loop just below, same
		// pattern as every other field already copied there.
		poDirectStatus = "";
		/* FIXED 2026-08-12, real bug found live (RR-00006 completion, Checker_
		   Checklist row landed with Customer Name/Customer Type/Order Type all
		   blank) — seed from Sales_Order_Fulfillment FIRST, same root cause and
		   fix pattern as clone_shipment_for_replacement.txt's own same-day
		   Customer fix: stock items live in Sales_Order_Fulfillment, not Pre_
		   Order_FF (see that file's writeup). Confirmed field link names via
		   Sales_Order_Fulfillment_Report.txt: order_type/target_delivery_date
		   are genuinely lowercase Field Link Names on this form (not just a
		   REST-API map key), Customer is a lookup (dot-chain .customer_name for
		   display text, same as the Shipment fix), Delivery_Type/For_Crate/
		   Customer_Type match casing elsewhere. City/Email/Contact/Customer_
		   Address are NOT on this form at all — stay Pre_Order_FF-only below.
		   The Pre_Order_FF loop right after is UNCHANGED — for a genuine stock
		   item it still finds nothing so these seeded values survive; for a
		   zero-stock/Pre-Order-type item it still finds its row and overwrites
		   as before, since Pre_Order_FF stays authoritative for that case. */
		sofDirectMatch = Sales_Order_Fulfillment[SO_No == ecDirectSO];
		for each  sofDirect in sofDirectMatch
		{
			sofOrderTypeDirect = sofDirect.order_type + "";
			poDirectOrderType = if(sofOrderTypeDirect == "null","",sofOrderTypeDirect);
			sofDeliveryTypeDirect = sofDirect.Delivery_Type + "";
			poDirectDeliveryType = if(sofDeliveryTypeDirect == "null","",sofDeliveryTypeDirect);
			sofTargetDateDirect = sofDirect.target_delivery_date + "";
			poDirectTargetDate = if(sofTargetDateDirect == "null","",sofTargetDateDirect);
			poDirectForCrate = sofDirect.For_Crate;
			sofCustNameDirect = sofDirect.Customer.customer_name + "";
			poDirectCustName = if(sofCustNameDirect == "null","",sofCustNameDirect);
			sofCustTypeDirect = sofDirect.Customer_Type + "";
			poDirectCustType = if(sofCustTypeDirect == "null","",sofCustTypeDirect);
			for each  sofDirectRow in sofDirect.Item_Details1
			{
				if(sofDirectRow.SKU + "" == ecDirectSKU)
				{
					sofBinDirect = sofDirectRow.Bin_Location + "";
					if(sofBinDirect != "" && sofBinDirect != "null")
					{
						poDirectBinLoc = sofBinDirect;
					}
				}
			}
		}
		poDirectMatch = Pre_Order_FF[SO == ecDirectSO];
		for each  podm in poDirectMatch
		{
			poDirectOrderType = podm.Order_Type;
			poDirectDeliveryType = podm.Delivery_Type;
			poDirectTargetDate = podm.Target_Delivery;
			poDirectForCrate = podm.For_Crate;
			poDirectBinLoc = podm.Bin_Location;
			poDirectCustName = podm.Customer_Name;
			poDirectCustType = podm.Customer_Type;
			poDirectCustAddr = podm.Customer_Address;
			poDirectCity = podm.City;
			poDirectEmail = podm.Email;
			poDirectContact = podm.Contact;
			poDirectStatus = podm.Status;
		}
		// ADDED 2026-08-17, per user — RR's own ETA (captured above, same loop
		// that already reads this RR for RR_Status) takes priority over the
		// Sales_Order_Fulfillment/Pre_Order_FF chain just resolved above, when
		// present — a replacement's real expected arrival is THIS shipment's
		// ETA, not the original order's target date.
		if(ecDirectRR_ETA != "" && ecDirectRR_ETA != "null")
		{
			poDirectTargetDate = ecDirectRR_ETA;
		}
		/* FIXED 2026-08-12, real bug found live (RCV-00006, stock-item Fulfillment
		   EXC receive) — "UnParsable date Line:(141)" / "insert statement is
		   terminated". Same root cause as clone_shipment_for_replacement.txt's own
		   2026-08-12 Customer fix: Pre_Order_FF has no row for an item that already
		   had stock (so_kanban_sync.txt only routes zero-stock/Pre-Order-type items
		   there), so poDirectTargetDate stays "" (its init value) when podm's loop
		   never runs — assigning that blank STRING to a DATE field inside `insert
		   into` crashes the whole statement. Guarded with the same if(cond,a,b)
		   pattern already used elsewhere in this codebase (e.g. this app's own
		   Customer_Name fallback in clone_shipment_for_replacement.txt) — null,
		   not "", so the field is genuinely left unset rather than another blank-
		   string date attempt. */
		// CHANGED 2026-08-13, per user decision ("di na siya babalik sa QC para i-
		// approve, diretso na siya sa Pre Order. wag na siya mag create ng QC. pag
		// ka create ng Receive rekta sa Pre Order") — this branch used to create a
		// Checker_Checklist record here (the "first" QC check, right when the
		// replacement stock is received) and rely on a QC officer manually
		// Approving it to route the item onward (see checker_checklist_qc_sync.txt's
		// own RR-redirect branch history for the full saga this caused: that first
		// QC record kept colliding with the SECOND, genuine physical QC check done
		// later after Pick->Pack, since both shared the same SO+SKU+PAC+RR and the
		// second one kept re-matching/reopening the first one instead of creating
		// its own record). Per user's simplified design, Fulfillment EXC replacement
		// stock skips this first QC check entirely — Create Receive now creates a
		// fresh Pre_Order_FF record directly, same shape checker_checklist_qc_sync.txt
		// itself already creates for a normal RR-driven Pre_Order_FF entry, so the
		// item re-enters the fulfillment pipeline via the Pre Order Report queue
		// exactly the same way. This also fully removes the collision risk at its
		// root — there's no longer a "first" Checker_Checklist record for the later
		// Pack->QC step to ever accidentally re-match against.
		// ADDED 2026-08-13, real gap found live — user checked the native Pre_Order_FF
		// record and found Target Delivery Date blank. poDirectTargetDate was already
		// resolved above (Sales_Order_Fulfillment first, Pre_Order_FF fallback) for the
		// old Checker_Checklist insert this branch used to do, but never actually
		// written onto THIS insert. Same null-vs-blank-string guard already used
		// elsewhere in this file — a blank STRING crashes a DATE field. NOTE: this
		// comment (and the Bin_Location fallback comment above, near poDirectBinLoc)
		// must stay OUTSIDE the insert-into bracket below — a comment placed INSIDE it
		// breaks with a misleading "Improper Statement" reported at an unrelated line
		// (this file's own documented 2026-08-06/2026-08-12 gotcha, re-confirmed live
		// here — first attempt at this exact fix put the comment inside the bracket).
		newPreOrderIdDirect = insert into Pre_Order_FF
		[
			SO=ecDirectSO
			SKU=ecDirectSKU
			Item_Name=ecDirectItemName
			Qty=ecDirectQty + ""
			Pre_Order_Status="Received"
			Customer_Name=poDirectCustName
			Customer_Address=poDirectCustAddr
			Customer_Type=poDirectCustType
			City=poDirectCity
			Email=poDirectEmail
			Contact=poDirectContact
			Order_Type=poDirectOrderType
			PR=ecDirectPR
			RR=ecDirectRR
			Target_Delivery=if(poDirectTargetDate != "" && poDirectTargetDate != null,poDirectTargetDate,null)
			Bin_Location=poDirectBinLoc
			Status=poDirectStatus
			Added_User=zoho.loginuser
		];
		info "Fulfillment EXC replacement received — Pre_Order_FF created directly (no QC), new ID: " + newPreOrderIdDirect + ", SO " + ecDirectSO + " / SKU " + ecDirectSKU + " / RR " + ecDirectRR;
	}
	freshRecvDirect = Receiving[ID == input.ID];
	for each  frd in freshRecvDirect
	{
		frd.Books_Receive_No="N/A (Fulfillment EXC - internal only)";
	}
	success message "Fulfillment EXC replacement received — closed internally, RR and Exception marked Completed. Not sent to Books.";
	return;
}
aggPORecsCheck = Purchase_Order[PO_No == input.PO_No];
isReplacementPO = false;
rrRefNoCheck = "";
for each  apoCheck in aggPORecsCheck
{
	rrValCheck = apoCheck.RR_Reference_No + "";
	if(rrValCheck != "null" && rrValCheck != "")
	{
		isReplacementPO = true;
		rrRefNoCheck = rrValCheck;
	}
}
if(isReplacementPO == true)
{
	rrRecF = List();
	rrRecT = List();
	origPONoRep = "";
	/* FIXED FOR REAL 2026-07-20, mirrored from receiving_widget_custom_api.txt's
	   live-confirmed fix (3-round diagnostic there) — reading `Replacement_Summary`
	   off a queried Fenteng_Lighting_Replacement_Request/Tony_Fan_Replacement_Request
	   record is a genuine, reproducible platform limitation in this context, confirmed
	   via official Zoho Deluge docs: subform access via the `row` keyword is
	   documented as NOT supported in Custom Functions at all, and reading a subform
	   off a criteria-queried (non-`input`) record is undocumented territory entirely —
	   not just an edge case we got unlucky with. WORKAROUND: don't depend on
	   Replacement_Summary for this trace at all — every RR already carries
	   `Source_Exception_No` (a plain HEADER field) pointing at the Exceptions record
	   that raised it, and Exceptions already carries its own `PO_No` (also a plain
	   header field, read constantly elsewhere in this app) — both ordinary field
	   reads, sidestepping the broken path entirely. */
	sourceExcNoRep = "";
	sourceModuleRep = "";
	if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
	{
		rrRecF = Fenteng_Lighting_Replacement_Request[RR_No == rrRefNoCheck];
		for each  rrF in rrRecF
		{
			sourceExcNoRep = rrF.Source_Exception_No;
			sourceModuleRep = rrF.Source_Module;
		}
	}
	else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
	{
		rrRecT = Tony_Fan_Replacement_Request[RR_No == rrRefNoCheck];
		for each  rrT in rrRecT
		{
			sourceExcNoRep = rrT.Source_Exception_No;
			sourceModuleRep = rrT.Source_Module;
		}
	}
	if(sourceExcNoRep != "")
	{
		origExcRep = Exceptions[Exception_No == sourceExcNoRep];
		for each  oeRep in origExcRep
		{
			origPONoRep = oeRep.PO_No;
		}
	}
	/* ADDED 2026-07-27, per user — same Exception_Control1 ("Fulfillment EXC")
	   fallback as clone_shipment_for_replacement.txt's own trace-back, see that
	   file's NOTES for the full reasoning. Gated on sourceModuleRep so a normal
	   Damage/Missing/QC RR never even attempts this branch. */
	if(origPONoRep == "" && sourceModuleRep == "Fulfillment EXC")
	{
		ecMatchRep = Exception_Control1[Exception_Number == sourceExcNoRep];
		ecPrNoRep = "";
		for each  ecmRep in ecMatchRep
		{
			ecPrNoRep = ecmRep.PR;
		}
		if(ecPrNoRep != "")
		{
			pr1MatchRep = Purchase_Request1[PR_No == ecPrNoRep];
			for each  pr1mRep in pr1MatchRep
			{
				origPONoRep = pr1mRep.Link_PO_No;
			}
		}
	}
	if(origPONoRep == "")
	{
		info "Could not trace back to the original PO for this replacement — check Source_Exception_No on the RR and PO_No on the linked Exception (or PR on the linked Exception_Control1 item).";
		return;
	}
	origPOsRep = Purchase_Order[PO_No == origPONoRep];
	origBooksPOId = "";
	for each  opoRep in origPOsRep
	{
		origBooksPOId = opoRep.Books_PO_ID + "";
	}
	/* CHANGED 2026-07-20 — sources Mode of Shipment from THIS Receiving
	   record's own actual Shipment_Mode_When_Received, not the PO's planned
	   Shipping_Mode (was silently falling back to "Air Freight" whenever the
	   PO's planned value was blank). See main CREATE branch's own NOTES. */
	shipModeValRep = "Air Freight";
	for each  rliModeRep in input.Receiving_Line_Items
	{
		shipLineValRep = rliModeRep.Shipment_Mode_When_Received + "";
		if(shipLineValRep == "LCL")
		{
			shipModeValRep = "LCL";
		}
		else if(shipLineValRep == "FCL")
		{
			shipModeValRep = "FCL";
		}
		else if(shipLineValRep != "" && shipLineValRep != "null")
		{
			shipModeValRep = "Air Freight";
		}
	}
	if(origBooksPOId == "" || origBooksPOId == "null")
	{
		info "Original PO " + origPONoRep + " has no Books_PO_ID yet — cannot resolve line_item_ids.";
		return;
	}
	/* CHANGED 2026-07-20, mirrored from receiving_widget_custom_api.txt — since the
	   Books side now creates a brand-new receive instead of updating the
	   original's, the original Receiving record's own Books_Receive_ID is no
	   longer a hard requirement — only origRecvIdRep (for the line reconcile) is.
	   Decoupled: always capture the first matching original Receiving record's own
	   ID regardless of Books send status, only error if none exists at all. */
	origRecvsRep = Receiving[PO_No == origPONoRep];
	origReceiveId = "";
	origReceiveNo = "";
	origRecvIdRep = 0;
	for each  origRecvRep in origRecvsRep
	{
		if(origRecvIdRep == 0)
		{
			origRecvIdRep = origRecvRep.ID;
		}
		candIdRep = origRecvRep.Books_Receive_ID + "";
		if(origReceiveId == "" && candIdRep != "" && candIdRep != "null")
		{
			origReceiveId = candIdRep;
			origReceiveNo = origRecvRep.Books_Receive_No + "";
		}
	}
	if(origRecvIdRep == 0)
	{
		info "No original Receiving record found for PO " + origPONoRep + ".";
		return;
	}
	/* ADDED 2026-07-20, mirrored from receiving_widget_custom_api.txt, per user
	   request ("make it retriggerable") — see that file's own NOTES for the full
	   reasoning. The Books PUT-merge itself must not re-run once this exact
	   replacement record has already been sent once (our "add, don't overwrite"
	   fix means a 2nd PUT would double-add). Everything AFTER the merge (RR
	   completion, Exception resolution, original-line reconcile) is naturally
	   idempotent and safe to re-run — so a retrigger skips the Books call but
	   still falls through to that shared tail using the already-known
	   origReceiveId/origReceiveNo. */
	alreadySentThisRecordRep = false;
	thisRecvBooksIdRep = input.Books_Receive_ID + "";
	if(thisRecvBooksIdRep != "" && thisRecvBooksIdRep != "null")
	{
		alreadySentThisRecordRep = true;
	}
	booksMergeOkRep = false;
	if(alreadySentThisRecordRep == false)
	{
		/* ARCHITECTURE CHANGE 2026-07-20, mirrored from receiving_widget_custom_api.txt
		   — see that file's own NOTES for the full writeup. Real Books rejection
		   hit live: `36510 "bill(s) without receive(s)"` when PUT-updating a
		   receive that already had a Bill against it. Switched to POSTing a
		   brand-new Purchase Receive against the SAME PO instead of editing the
		   old one — Books natively supports multiple receives per PO. Simplified
		   vs. the main CREATE branch further below: no bin/storage assignment. */
		poRespRep = invokeurl
		[
			url :"https://www.zohoapis.com/books/v3/purchaseorders/" + origBooksPOId + "?organization_id=" + orgId
			type :GET
			connection:"zoho_books"
		];
		if(poRespRep.get("purchaseorder") == null)
		{
			info "Could not fetch original Purchase Order — raw resp: " + poRespRep;
			return;
		}
		poLineItemsRep = poRespRep.get("purchaseorder").get("line_items");
		vendorIdRep = "";
		if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
		{
			vendorIdRep = "2680178000049168001";
		}
		else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
		{
			vendorIdRep = "2680178000002735078";
		}
		if(vendorIdRep == "")
		{
			info "Unrecognized Supplier — cannot determine Zoho Books vendor.";
			return;
		}
		newReceiveLineItemsRep = List();
		for each  rliRep in input.Receiving_Line_Items
		{
			if(rliRep.Accepted_Qty == null || rliRep.Accepted_Qty <= 0)
			{
				continue;
			}
			matchedLineItemIdRep = "";
			for each  poliRep in poLineItemsRep
			{
				if(poliRep.get("sku") + "" == rliRep.SKU + "")
				{
					matchedLineItemIdRep = poliRep.get("line_item_id") + "";
				}
			}
			if(matchedLineItemIdRep == "")
			{
				continue;
			}
			newLineMapRep = Map();
			newLineMapRep.put("line_item_id",matchedLineItemIdRep);
			newLineMapRep.put("quantity",rliRep.Accepted_Qty);
			newReceiveLineItemsRep.add(newLineMapRep);
		}
		if(newReceiveLineItemsRep.size() == 0)
		{
			info "No lines with Accepted Qty > 0 matched the original Purchase Order.";
			return;
		}
		shipNoValRep = "";
		if(input.Shipments != null)
		{
			shipRecRep = Shipments[ID == input.Shipments];
			if(shipRecRep != null)
			{
				shipNoValRep = shipRecRep.Shipment_No + "";
			}
		}
		cfListRep = List();
		cfRep1 = Map();
		cfRep1.put("label","PO #");
		cfRep1.put("value",origPONoRep);
		cfListRep.add(cfRep1);
		cfRep2 = Map();
		cfRep2.put("label","Mode of Shipment");
		cfRep2.put("value",shipModeValRep);
		cfListRep.add(cfRep2);
		cfRep3 = Map();
		cfRep3.put("label","Shipment #");
		cfRep3.put("value",shipNoValRep);
		cfListRep.add(cfRep3);
		/* TODO 2026-07-27 — deliberately NOT implemented yet, per user's own explicit
		   scoping ("i'll just add the needed fields"): once Shipments and Receiving
		   each get their own Source_Module (+ Exception_Number) fields (the user is
		   adding these separately), a Fulfillment-EXC-sourced replacement receive
		   should SKIP this whole Books Purchase Receive POST entirely — a Fulfillment
		   EXC item's replacement was never a real Books-costed purchase, it's an
		   internal rework/replace loop. Until those fields exist there is no reliable
		   signal to gate on here (sourceModuleRep is known further up this same
		   function, but Shipments/Receiving themselves don't carry it yet, and this
		   branch can be reached without a Replacement_Request in scope at all on a
		   plain resave) — so this still unconditionally sends to Books for now. When
		   the fields land: gate this whole invokeurl block on
		   `Shipments[ID==input.Shipments].Source_Module != "Fulfillment EXC"`. */
		newReceiveBodyRep = Map();
		newReceiveBodyRep.put("vendor_id",vendorIdRep);
		newReceiveBodyRep.put("date",zoho.currentdate.toString("yyyy-MM-dd"));
		newReceiveBodyRep.put("line_items",newReceiveLineItemsRep);
		newReceiveBodyRep.put("custom_fields",cfListRep);
		createNewRespRep = invokeurl
		[
			url :"https://www.zohoapis.com/books/v3/purchasereceives?organization_id=" + orgId + "&purchaseorder_id=" + origBooksPOId
			type :POST
			parameters:newReceiveBodyRep.toString()
			headers:{"Content-Type":"application/json"}
			connection:"zoho_books"
		];
		info "Replacement new receive create resp: " + createNewRespRep;
		if(createNewRespRep.get("purchasereceive") != null)
		{
			newRepReceiveIdRep = createNewRespRep.get("purchasereceive").get("receive_id") + "";
			newRepReceiveNoRep = createNewRespRep.get("purchasereceive").get("receive_number") + "";
			if(newRepReceiveIdRep == "" || newRepReceiveIdRep == "null" || newRepReceiveNoRep == "" || newRepReceiveNoRep == "null")
			{
				info "Books returned a purchasereceive object but id/number came back blank.";
				return;
			}
			origReceiveId = newRepReceiveIdRep;
			origReceiveNo = newRepReceiveNoRep;
			booksMergeOkRep = true;
		}
		else
		{
			info "Failed to create new Books receive for replacement — check logs.";
			return;
		}
	}
	else
	{
		booksMergeOkRep = true;
	}
	if(booksMergeOkRep == true)
	{
		for each  opoClearRep in origPOsRep
		{
			opoClearRep.Missing_SKUs="";
			opoClearRep.Completed_On=zoho.currenttime;
		}
		for each  apoRepClear in aggPORecsCheck
		{
			apoRepClear.Completed_On=zoho.currenttime;
		}
		closedSourceExcNoRep = "";
		closedRRNoRep = "";
		closedSourceModuleRep = "";
		if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
		{
			supOrigPOsRep = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == origPONoRep];
			for each  supOrigRep in supOrigPOsRep
			{
				supOrigRep.Missing_SKUs_Supplier1="";
			}
			for each  rrFClose in rrRecF
			{
				rrFClose.RR_Status="Completed";
				closedSourceExcNoRep = rrFClose.Source_Exception_No;
				closedRRNoRep = rrFClose.RR_No;
				closedSourceModuleRep = rrFClose.Source_Module;
			}
		}
		else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
		{
			supOrigPOsRepT = Tony_Fan_Purchase_Order[PO_No_Supplier2 == origPONoRep];
			for each  supOrigRepT in supOrigPOsRepT
			{
				supOrigRepT.Missing_SKUs_Supplier2="";
			}
			for each  rrTClose in rrRecT
			{
				rrTClose.RR_Status="Completed";
				closedSourceExcNoRep = rrTClose.Source_Exception_No;
				closedRRNoRep = rrTClose.RR_No;
				closedSourceModuleRep = rrTClose.Source_Module;
			}
		}
		/* ADDED 2026-07-20, per user request ("resolve the original Exception too") —
		   only resolves once EVERY RR tied to this Exception (across both supplier
		   forms — an Exception can carry multiple items, e.g. one Damage + one
		   Missing) has reached "Completed". Never clobbers a manually
		   Resolved/Closed Exception. FIXED same day: the fresh re-query below may
		   not see the write just made above in the same execution (same read-lag
		   class hit repeatedly this session) — trust our own write for the RR we
		   JUST closed (closedRRNoRep) instead of re-verifying it via query. */
		if(closedSourceExcNoRep != "")
		{
			allItemsDoneRep = true;
			rrsCheckFRep = Fenteng_Lighting_Replacement_Request[Source_Exception_No == closedSourceExcNoRep];
			for each  rcFRep in rrsCheckFRep
			{
				if(rcFRep.RR_Status != "Completed" && rcFRep.RR_No != closedRRNoRep)
				{
					allItemsDoneRep = false;
				}
			}
			rrsCheckTRep = Tony_Fan_Replacement_Request[Source_Exception_No == closedSourceExcNoRep];
			for each  rcTRep in rrsCheckTRep
			{
				if(rcTRep.RR_Status != "Completed" && rcTRep.RR_No != closedRRNoRep)
				{
					allItemsDoneRep = false;
				}
			}
			if(allItemsDoneRep == true)
			{
				/* BRANCHED 2026-07-27, per user — a Fulfillment-EXC-sourced RR has no
				   native Exceptions record behind it at all (Exception_Control1 is a
				   separate form), so resolving Exceptions here would silently no-op
				   (0 matches) and never actually close the loop for these items.
				   closedSourceModuleRep is read straight off the RR we just closed,
				   same safe-header-field pattern as everything else in this block. */
				if(closedSourceModuleRep == "Fulfillment EXC")
				{
					ecToCompleteRep = Exception_Control1[Exception_Number == closedSourceExcNoRep];
					for each  ecCompleteRep in ecToCompleteRep
					{
						if(ecCompleteRep.Status != "Completed")
						{
							ecCompleteRep.Status="Completed";
						}
					}
				}
				else
				{
					excToResolveRep = Exceptions[Exception_No == closedSourceExcNoRep];
					for each  exResolveRep in excToResolveRep
					{
						if(exResolveRep.Exception_Status != "Resolved" && exResolveRep.Exception_Status != "Closed")
						{
							exResolveRep.Exception_Status="Resolved";
						}
					}
				}
			}
		}
		freshRecvRep = Receiving[ID == input.ID];
		for each  frRep in freshRecvRep
		{
			frRep.Books_Receive_ID=origReceiveId;
			frRep.Books_Receive_No=origReceiveNo;
			// ADDED 2026-07-30 — see the main CREATE branch's own NOTES for the
			// full reasoning (SKU_Receive_History, append-only per-SKU Books
			// receive-event log).
			skuHistCountMapRep = Map();
			for each  existSKURowRep in frRep.SKU_Receive_History
			{
				skuHistKeyRep = existSKURowRep.SKU + "";
				if(skuHistCountMapRep.containKey(skuHistKeyRep))
				{
					skuHistCountMapRep.put(skuHistKeyRep,skuHistCountMapRep.get(skuHistKeyRep) + 1);
				}
				else
				{
					skuHistCountMapRep.put(skuHistKeyRep,1);
				}
			}
			for each  rliRepTL in input.Receiving_Line_Items
			{
				if(rliRepTL.Accepted_Qty != null && rliRepTL.Accepted_Qty > 0)
				{
					newPRTRep = Receiving.Partial_Receive_Timeline();
					newPRTRep.RR_No=frRep.Receive_No1;
					newPRTRep.Supplier=input.Supplier;
					newPRTRep.SKU=rliRepTL.SKU;
					newPRTRep.Item=rliRepTL.Item_Name;
					newPRTRep.Quantity=rliRepTL.Accepted_Qty + "";
					newPRTRep.Shipment_Mode=rliRepTL.Shipment_Mode_When_Received;
					newPRTRep.Date_Time=zoho.currenttime;
					frRep.Partial_Receive_Timeline.insert(newPRTRep);
					skuHistKeyInsRep = rliRepTL.SKU + "";
					if(skuHistCountMapRep.containKey(skuHistKeyInsRep))
					{
						nextSkuHistCountRep = skuHistCountMapRep.get(skuHistKeyInsRep) + 1;
					}
					else
					{
						nextSkuHistCountRep = 1;
					}
					skuHistCountMapRep.put(skuHistKeyInsRep,nextSkuHistCountRep);
					newSRHRep = Receiving.SKU_Receive_History();
					newSRHRep.Item=rliRepTL.Item_Name;
					newSRHRep.SKU=rliRepTL.SKU;
					newSRHRep.Item_QTY=rliRepTL.Accepted_Qty;
					newSRHRep.Receive_Count=nextSkuHistCountRep;
					newSRHRep.Books_Receive_No=origReceiveNo;
					newSRHRep.Books_Receive_ID=origReceiveId;
					frRep.SKU_Receive_History.insert(newSRHRep);
				}
			}
		}
		/* ADDED 2026-07-20, mirrored from receiving_widget_custom_api.txt — see that
		   file's own NOTES for the full reasoning (reconciles the ORIGINAL Receiving
		   record's line: moves qty from Damage into Accepted once the replacement is
		   merged, via the proven clear+rebuild subform pattern, never in-place
		   mutation). FIXED live 2026-07-20: first version held the raw subform-row
		   object in a List (`existingRowsRep.add(olRep)`) then read `.field` off it
		   later outside its own loop — errored "Invalid collection object found", a
		   documented Deluge Gotcha in this codebase. Fixed by extracting plain field
		   VALUES into a Map the moment each row is visited, never holding the row
		   object itself past its own loop iteration. */
		if(origRecvIdRep > 0)
		{
			origRecvFullRep = Receiving[ID == origRecvIdRep];
			for each  origFullRep in origRecvFullRep
			{
				existingRowsRep = List();
				for each  olRep in origFullRep.Receiving_Line_Items
				{
					rowMapRep = Map();
					rowMapRep.put("PR_No",olRep.PR_No);
					rowMapRep.put("RR_No",olRep.RR_No);
					rowMapRep.put("SKU",olRep.SKU);
					rowMapRep.put("Single_Line",olRep.Single_Line);
					rowMapRep.put("Item_Name",olRep.Item_Name);
					rowMapRep.put("Expected_Qty",olRep.Expected_Qty);
					rowMapRep.put("Accepted_Qty",olRep.Accepted_Qty);
					rowMapRep.put("Damage_Qty",olRep.Damage_Qty);
					rowMapRep.put("Missing_Qty",olRep.Missing_Qty);
					rowMapRep.put("Bin_location",olRep.Bin_location);
					rowMapRep.put("Shipment_Mode_When_Received",olRep.Shipment_Mode_When_Received);
					rowMapRep.put("Line_Result",olRep.Line_Result);
					rowMapRep.put("Has_Exceptions",olRep.Has_Exceptions);
					rowMapRep.put("Ready_for_Fulfillment",olRep.Ready_for_Fulfillment);
					rowMapRep.put("Label_Ready",olRep.Label_Ready);
					rowMapRep.put("Label_Printed",olRep.Label_Printed);
					existingRowsRep.add(rowMapRep);
				}
				origFullRep.Receiving_Line_Items.clear();
				deltaAcceptedRep = 0;
				deltaDamageRep = 0;
				for each  oldRowMapRep in existingRowsRep
				{
					oldSkuRep = oldRowMapRep.get("SKU") + "";
					replQtyForSkuRep = 0;
					for each  rliRep2 in input.Receiving_Line_Items
					{
						if(rliRep2.SKU + "" == oldSkuRep && rliRep2.Accepted_Qty != null && rliRep2.Accepted_Qty > 0)
						{
							replQtyForSkuRep = replQtyForSkuRep + rliRep2.Accepted_Qty;
						}
					}
					newRowRep = Receiving.Receiving_Line_Items();
					newRowRep.PR_No=oldRowMapRep.get("PR_No");
					newRowRep.RR_No=oldRowMapRep.get("RR_No");
					newRowRep.SKU=oldRowMapRep.get("SKU");
					newRowRep.Single_Line=oldRowMapRep.get("Single_Line");
					newRowRep.Item_Name=oldRowMapRep.get("Item_Name");
					newRowRep.Expected_Qty=oldRowMapRep.get("Expected_Qty");
					newRowRep.Bin_location=oldRowMapRep.get("Bin_location");
					newRowRep.Shipment_Mode_When_Received=oldRowMapRep.get("Shipment_Mode_When_Received");
					newRowRep.Line_Result=oldRowMapRep.get("Line_Result");
					newRowRep.Has_Exceptions=oldRowMapRep.get("Has_Exceptions");
					newRowRep.Ready_for_Fulfillment=oldRowMapRep.get("Ready_for_Fulfillment");
					newRowRep.Label_Ready=oldRowMapRep.get("Label_Ready");
					newRowRep.Label_Printed=oldRowMapRep.get("Label_Printed");
					if(replQtyForSkuRep > 0)
					{
						oldAcceptedRep = ifnull(oldRowMapRep.get("Accepted_Qty"),0);
						oldDamageRep = ifnull(oldRowMapRep.get("Damage_Qty"),0);
						appliedRep = replQtyForSkuRep;
						if(appliedRep > oldDamageRep)
						{
							appliedRep = oldDamageRep;
						}
						newRowRep.Accepted_Qty=oldAcceptedRep + appliedRep;
						newRowRep.Damage_Qty=oldDamageRep - appliedRep;
						newRowRep.Missing_Qty=ifnull(oldRowMapRep.get("Missing_Qty"),0);
						deltaAcceptedRep = deltaAcceptedRep + appliedRep;
						deltaDamageRep = deltaDamageRep + appliedRep;
					}
					else
					{
						newRowRep.Accepted_Qty=oldRowMapRep.get("Accepted_Qty");
						newRowRep.Damage_Qty=oldRowMapRep.get("Damage_Qty");
						newRowRep.Missing_Qty=oldRowMapRep.get("Missing_Qty");
					}
					origFullRep.Receiving_Line_Items.insert(newRowRep);
				}
				if(deltaAcceptedRep > 0)
				{
					origFullRep.Total_Accepted_Qty=ifnull(origFullRep.Total_Accepted_Qty,0) + deltaAcceptedRep;
					origFullRep.Total_Damage_Qty=ifnull(origFullRep.Total_Damage_Qty,0) - deltaDamageRep;
				}
			}
		}
		successSuffixRep = "";
		if(alreadySentThisRecordRep == true)
		{
			successSuffixRep = " (re-synced RR/Exception/reconcile only — Books already had this qty.)";
		}
		success message "Replacement received — new Books receive " + origReceiveNo + " created against the original PO, RR marked Completed." + successSuffixRep;
	}
	return;
}
if(input.Books_Receive_ID != null && input.Books_Receive_ID != "")
{
	/* CHANGED 2026-07-20, per user — real architecture simplification. This branch
	   used to be Missing-only. Generalized to ALSO cover Damage (Missing_SKUs OR
	   Damage_SKUs on the linked PO), since Damage/QC/Complaint replacements no
	   longer spin up a separate Creator-only PO (see create_rr_button.txt's own
	   NOTES) — they recycle through this SAME record/SAME PO exactly like Missing
	   always has. */
	/* GATE REMOVED 2026-07-30, per user request ("i just wanna create receive
	   for example item 1. then next day item 2 is in warehouse and accepted
	   -> create receive btn will create new PR for that item too") — this
	   used to hard-stop here ("Already sent to Zoho Books") unless
	   Missing_SKUs/Damage_SKUs happened to be set on the linked PO, meaning a
	   perfectly ordinary "a different line just became ready" 2nd click did
	   NOTHING at all. The per-line DELTA computation a few lines below
	   (sentDeltaMapUpd/newLineItemsUpd, added 2026-07-20) already generically
	   handles "any line whose Accepted_Qty exceeds what's already logged in
	   Partial_Receive_Timeline for it" — completely independent of Missing/
	   Damage flags, which only ever existed to gate ENTRY into this branch,
	   not to select which lines get sent. Removing the gate lets that already
	   generic delta logic run on every click; `missingSKU`/`damageSKU` are no
	   longer used for anything (grepped — only ever fed this one gate), the
	   real no-op guard is now purely `newLineItemsUpd.size() == 0` below
	   ("No lines with Accepted Qty > 0 to send"), which already existed. */
	linkedPOsCheck = Purchase_Order[PO_No == input.PO_No];
	booksPOIdUpd = "";
	for each  lpoId in linkedPOsCheck
	{
		booksPOIdUpd = lpoId.Books_PO_ID + "";
	}
	/* CHANGED 2026-07-20 — same fix as the replacement branch: sources Mode of
	   Shipment from THIS Receiving record's own actual
	   Shipment_Mode_When_Received, not the PO's planned Shipping_Mode. */
	shipModeValUpd = "Air Freight";
	for each  rliModeUpd in input.Receiving_Line_Items
	{
		shipLineValUpd = rliModeUpd.Shipment_Mode_When_Received + "";
		if(shipLineValUpd == "LCL")
		{
			shipModeValUpd = "LCL";
		}
		else if(shipLineValUpd == "FCL")
		{
			shipModeValUpd = "FCL";
		}
		else if(shipLineValUpd != "" && shipLineValUpd != "null")
		{
			shipModeValUpd = "Air Freight";
		}
	}
	if(booksPOIdUpd == "" || booksPOIdUpd == "null")
	{
		info "Linked Purchase_Order has no Books_PO_ID — cannot resolve PO line_item_ids.";
		return;
	}
	/* ARCHITECTURE CHANGE 2026-07-20, mirrored from receiving_widget_custom_api.txt —
	   same real 36510 "bill(s) without receive(s)" rejection risk as the replacement
	   branch above applies here too (this record's own Books_Receive_ID may already
	   be billed). Switched from PUT-updating the existing receive to POSTing a
	   brand-new Purchase Receive against the same PO — deliberately does NOT
	   overwrite input.Books_Receive_ID/No, those keep pointing at the original
	   receive; the new receive exists independently in Books tied to the same PO. */
	poRespUpd = invokeurl
	[
		url :"https://www.zohoapis.com/books/v3/purchaseorders/" + booksPOIdUpd + "?organization_id=" + orgId
		type :GET
		connection:"zoho_books"
	];
	if(poRespUpd.get("purchaseorder") == null)
	{
		info "Could not fetch linked Purchase Order — raw resp: " + poRespUpd;
		return;
	}
	poLineItemsUpd = poRespUpd.get("purchaseorder").get("line_items");
	vendorIdUpd = "";
	if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
	{
		vendorIdUpd = "2680178000049168001";
	}
	else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
	{
		vendorIdUpd = "2680178000002735078";
	}
	if(vendorIdUpd == "")
	{
		info "Unrecognized Supplier — cannot determine Zoho Books vendor.";
		return;
	}
	/* ADDED 2026-07-27, per user ("real fix" — option 2 of 2 offered) — a
	   Fulfillment-EXC replacement (UI/FF Widget/ExceptionControl) is a genuinely
	   different case than Damage/Missing: the original Receiving line was already
	   FULLY and CORRECTLY accepted at fulfillment time (Accepted_Qty already
	   matches Expected_Qty, Damage/Missing both 0) — the defect surfaced LATER,
	   post-delivery, via Exception Control. There is no "under-received" line to
	   top up, so the delta-against-Accepted_Qty math below (built for Damage/
	   Missing, where Accepted_Qty genuinely needs to climb toward Expected_Qty as
	   replacement stock arrives) always computes 0 for these — confirmed live,
	   real bug found on RR-00004/EXC-FF-00004: Accepted_Qty stayed "2" (unchanged
	   since 2026-07-24), Partial_Receive_Timeline already showed 2 sent, delta=0,
	   the whole POST got skipped ("No lines with Accepted Qty > 0 to send"),
	   Damage_SKUs/RR/Exception_Control1 never advanced. Fixed: any Acknowledged
	   "QC Failure"/"Fulfillment EXC" RR tied to this PO sends its OWN
	   `RR_Qty_Value` directly, bypassing the Accepted_Qty/delta computation for
	   that SKU entirely — same Exception_Control1 trace-back chain used
	   everywhere else this session. */
	fulfillmentExcQtyMap = Map();
	rrCandF = Fenteng_Lighting_Replacement_Request[Source_Type == "QC Failure" && Source_Module == "Fulfillment EXC" && RR_Status == "Acknowledged"];
	for each  fecF in rrCandF
	{
		fecOrigPOF = "";
		fecExcMatchF = Exception_Control1[Exception_Number == fecF.Source_Exception_No];
		fecPrNoF = "";
		for each  fecmF in fecExcMatchF
		{
			fecPrNoF = fecmF.PR;
		}
		if(fecPrNoF != "")
		{
			fecPr1MatchF = Purchase_Request1[PR_No == fecPrNoF];
			for each  fecpr1F in fecPr1MatchF
			{
				fecOrigPOF = fecpr1F.Link_PO_No;
			}
		}
		if(fecOrigPOF == input.PO_No)
		{
			/* FIXED 2026-07-27, real bug found live — RR_SKU/RR_Qty_Value are
			   mirror fields that only ever get set on the AGGREGATE
			   Replacement_Request (same convention create_rr_button.txt's own
			   native supplier-form inserts already follow — they never set these on
			   the supplier form either), confirmed live blank on the Tony supplier
			   record. Look up the aggregate by RR_No to get the real values. */
			fecAggMatchF = Replacement_Request[RR_No == fecF.RR_No];
			for each  fecAggF in fecAggMatchF
			{
				fulfillmentExcQtyMap.put(fecAggF.RR_SKU + "",fecAggF.RR_Qty_Value);
			}
		}
	}
	rrCandT = Tony_Fan_Replacement_Request[Source_Type == "QC Failure" && Source_Module == "Fulfillment EXC" && RR_Status == "Acknowledged"];
	for each  fecT in rrCandT
	{
		fecOrigPOT = "";
		fecExcMatchT = Exception_Control1[Exception_Number == fecT.Source_Exception_No];
		fecPrNoT = "";
		for each  fecmT in fecExcMatchT
		{
			fecPrNoT = fecmT.PR;
		}
		if(fecPrNoT != "")
		{
			fecPr1MatchT = Purchase_Request1[PR_No == fecPrNoT];
			for each  fecpr1T in fecPr1MatchT
			{
				fecOrigPOT = fecpr1T.Link_PO_No;
			}
		}
		if(fecOrigPOT == input.PO_No)
		{
			fecAggMatchT = Replacement_Request[RR_No == fecT.RR_No];
			for each  fecAggT in fecAggMatchT
			{
				fulfillmentExcQtyMap.put(fecAggT.RR_SKU + "",fecAggT.RR_Qty_Value);
			}
		}
	}
	/* ADDED 2026-07-20 — DELTA computation, needed now that this branch also covers
	   Damage (which, unlike Missing, already had SOME qty sent on the original
	   Create Receive click). Sending the full current Accepted_Qty again would
	   double-count what Books already has for that SKU — exactly the real 36012
	   "Quantity recorded cannot be more than quantity ordered" error hit earlier
	   this session. Fixed by subtracting whatever this SKU already logged in
	   Partial_Receive_Timeline (this record's own subform, safe to read off
	   `input` directly — unlike a subform on a different, criteria-queried
	   record) and only sending the remainder. For Missing, prior-sent is always 0
	   (that line was skipped entirely on the first click), so this reduces to the
	   same full-qty behavior as before — no change for that case. Fulfillment-EXC
	   SKUs (fulfillmentExcQtyMap) skip this whole delta computation, see above. */
	sentDeltaMapUpd = Map();
	newLineItemsUpd = List();
	for each  poli in poLineItemsUpd
	{
		matchedNewQty = 0;
		hasQty = false;
		poliSkuUpd = poli.get("sku") + "";
		if(fulfillmentExcQtyMap.containKey(poliSkuUpd))
		{
			matchedNewQty = fulfillmentExcQtyMap.get(poliSkuUpd);
			hasQty = true;
		}
		else
		{
			for each  rli in input.Receiving_Line_Items
			{
				if(rli.SKU + "" == poli.get("sku") + "" && rli.Accepted_Qty != null && rli.Accepted_Qty > 0)
				{
					priorSentQtyUpd = 0;
					for each  ptRowUpd in input.Partial_Receive_Timeline
					{
						if(ptRowUpd.SKU + "" == rli.SKU + "")
						{
							priorSentQtyUpd = priorSentQtyUpd + ifnull((ptRowUpd.Quantity + "").toLong(),0);
						}
					}
					deltaQtyUpd = rli.Accepted_Qty - priorSentQtyUpd;
					if(deltaQtyUpd > 0)
					{
						matchedNewQty = deltaQtyUpd;
						hasQty = true;
					}
				}
			}
		}
		if(hasQty == false)
		{
			continue;
		}
		sentDeltaMapUpd.put(poli.get("sku") + "",matchedNewQty);
		newLineMapUpd = Map();
		newLineMapUpd.put("line_item_id",poli.get("line_item_id") + "");
		newLineMapUpd.put("quantity",matchedNewQty);
		newLineItemsUpd.add(newLineMapUpd);
	}
	if(newLineItemsUpd.size() == 0)
	{
		info "No lines with Accepted Qty > 0 to send.";
		return;
	}
	shipNoValUpd = "";
	if(input.Shipments != null)
	{
		shipRecUpd = Shipments[ID == input.Shipments];
		if(shipRecUpd != null)
		{
			shipNoValUpd = shipRecUpd.Shipment_No + "";
		}
	}
	cfListUpd = List();
	cfUpd1 = Map();
	cfUpd1.put("label","PO #");
	cfUpd1.put("value",input.PO_No);
	cfListUpd.add(cfUpd1);
	cfUpd2 = Map();
	cfUpd2.put("label","Mode of Shipment");
	cfUpd2.put("value",shipModeValUpd);
	cfListUpd.add(cfUpd2);
	cfUpd3 = Map();
	cfUpd3.put("label","Shipment #");
	cfUpd3.put("value",shipNoValUpd);
	cfListUpd.add(cfUpd3);
	newReceiveBodyUpd = Map();
	newReceiveBodyUpd.put("vendor_id",vendorIdUpd);
	newReceiveBodyUpd.put("date",zoho.currentdate.toString("yyyy-MM-dd"));
	newReceiveBodyUpd.put("line_items",newLineItemsUpd);
	newReceiveBodyUpd.put("custom_fields",cfListUpd);
	/* TODO 2026-07-27 — same deliberate non-implementation as the "Rep" branch's own
	   marker above: once Shipments/Receiving get their own Source_Module field, gate
	   this whole Books POST on it being != "Fulfillment EXC". Not gated yet. */
	updateResp = invokeurl
	[
		url :"https://www.zohoapis.com/books/v3/purchasereceives?organization_id=" + orgId + "&purchaseorder_id=" + booksPOIdUpd
		type :POST
		parameters:newReceiveBodyUpd.toString()
		headers:{"Content-Type":"application/json"}
		connection:"zoho_books"
	];
	info "New Books receive create resp (missing-item branch): " + updateResp;
	if(updateResp.get("purchasereceive") != null)
	{
		// ADDED 2026-07-30 — captured for SKU_Receive_History below, since this
		// branch deliberately never overwrites the record's own header
		// Books_Receive_ID/No (those still point at the ORIGINAL receive).
		newUpdReceiveId = updateResp.get("purchasereceive").get("receive_id") + "";
		newUpdReceiveNo = updateResp.get("purchasereceive").get("receive_number") + "";
		for each  lpoClear in linkedPOsCheck
		{
			/* CHANGED 2026-07-20 — clears whichever flag(s) were actually set
			   (Missing_SKUs and/or Damage_SKUs), not just Missing_SKUs. */
			lpoClear.Missing_SKUs="";
			lpoClear.Damage_SKUs="";
			lpoClear.Completed_On=zoho.currenttime;
			/* ADDED 2026-07-20 — same PO Completion Check as the main CREATE branch,
			   see that block's own NOTES. This is the branch that actually closes
			   the loop for a real recycle — the whole point of this redesign. */
			if(lpoClear.PO_Status != "Completed")
			{
				allLinesFullUpd = true;
				for each  poLnCompUpd in lpoClear.PO_Line_Items
				{
					skuAcceptedSumUpd = 0;
					for each  rliCompUpd in input.Receiving_Line_Items
					{
						if(rliCompUpd.SKU == poLnCompUpd.SKU)
						{
							skuAcceptedSumUpd = skuAcceptedSumUpd + ifnull(rliCompUpd.Accepted_Qty,0);
						}
					}
					if(skuAcceptedSumUpd < poLnCompUpd.QTY)
					{
						allLinesFullUpd = false;
					}
				}
				if(allLinesFullUpd == true)
				{
					openExcCompCheckUpd = Exceptions[PO_No == lpoClear.PO_No && Exception_Status == "Open"];
					if(openExcCompCheckUpd.count() == 0)
					{
						lpoClear.PO_Status="Completed";
					}
				}
			}
		}
		// ADDED 2026-07-30, per user request — mirrors the main CREATE branch's own
		// per-line Pre_Order_FF completeness flip (see that block's own comment for
		// the full reasoning). Real gap found live: this Upd/delta branch never had
		// it, so a line that only reaches Accepted==Expected via THIS branch (not
		// the original CREATE click — e.g. "item 2 became ready the next day" now
		// routes through here since the isReplacementUpdate gate was removed the
		// same day) stayed stuck on Pre_Order_Status="Pending" forever, even though
		// its Books receive genuinely succeeded. Confirmed live on SO-16335/
		// Aelornyrae — needed a manual patch before this fix existed.
		for each  rliPoStatUpd in input.Receiving_Line_Items
		{
			rliPoStatCompleteUpd = ifnull(rliPoStatUpd.Accepted_Qty,0) == ifnull(rliPoStatUpd.Expected_Qty,0) && ifnull(rliPoStatUpd.Damage_Qty,0) == 0 && ifnull(rliPoStatUpd.Missing_Qty,0) == 0 && ifnull(rliPoStatUpd.Expected_Qty,0) > 0;
			if(rliPoStatCompleteUpd == true)
			{
				for each  pofRecStatUpd in Pre_Order_FF[SO == input.SO_No && SKU == rliPoStatUpd.SKU && Pre_Order_Status != "Received"]
				{
					pofRecStatUpd.Pre_Order_Status="Received";
				}
			}
		}
		closedSourceExcNoUpd = "";
		closedRRNoUpd = "";
		closedSourceModuleUpd = "";
		/* FIXED 2026-07-20 — matchOrigPOUpdF/T used to read
		   rrcUpdF/T.Replacement_Summary, a subform off a criteria-queried record —
		   the same confirmed-unreliable platform limitation already fixed in the
		   trace-back block above (see that block's own NOTES). Replaced with the
		   same header-field workaround: RR's own Source_Exception_No ->
		   Exceptions.PO_No, both plain field reads. */
		if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
		{
			supPOsClearF = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == input.PO_No];
			for each  spClearF in supPOsClearF
			{
				spClearF.Missing_SKUs_Supplier1="";
				spClearF.Damage_SKUs_Supplier1="";
			}
			/* CHANGED 2026-07-20 — now closes both Missing AND Damage RRs (this
			   branch handles both now, see the generalized gate above). CHANGED
			   2026-07-27, per user's Fulfillment EXC ask — also closes "QC Failure"
			   RRs (the Source_Type ExceptionControl's Create RR uses, see that
			   widget's own row) — this filter had silently excluded them entirely,
			   real bug found live on RR-00004/EXC-FF-00004 (Books receive succeeded
			   but RR_Status/Exception_Control1.Status never advanced, traced to this
			   exact query never matching). */
			rrToCloseUpdF = Fenteng_Lighting_Replacement_Request[Source_Type == "Receiving Missing" || Source_Type == "Receiving Damage" || Source_Type == "QC Failure" && RR_Status == "Acknowledged"];
			for each  rrcUpdF in rrToCloseUpdF
			{
				matchOrigPOUpdF = "";
				matchModuleUpdF = rrcUpdF.Source_Module;
				excCheckUpdF = Exceptions[Exception_No == rrcUpdF.Source_Exception_No];
				for each  ecUpdF in excCheckUpdF
				{
					matchOrigPOUpdF = ecUpdF.PO_No;
				}
				/* ADDED 2026-07-27 — same Exception_Control1 fallback as the "Rep"
				   branch and clone_shipment_for_replacement.txt, see those files'
				   own NOTES for the full reasoning. */
				if(matchOrigPOUpdF == "" && matchModuleUpdF == "Fulfillment EXC")
				{
					ecMatchUpdF = Exception_Control1[Exception_Number == rrcUpdF.Source_Exception_No];
					ecPrNoUpdF = "";
					for each  ecmUpdF in ecMatchUpdF
					{
						ecPrNoUpdF = ecmUpdF.PR;
					}
					if(ecPrNoUpdF != "")
					{
						pr1MatchUpdF = Purchase_Request1[PR_No == ecPrNoUpdF];
						for each  pr1mUpdF in pr1MatchUpdF
						{
							matchOrigPOUpdF = pr1mUpdF.Link_PO_No;
						}
					}
				}
				if(matchOrigPOUpdF == input.PO_No)
				{
					rrcUpdF.RR_Status="Completed";
					closedSourceExcNoUpd = rrcUpdF.Source_Exception_No;
					closedRRNoUpd = rrcUpdF.RR_No;
					closedSourceModuleUpd = matchModuleUpdF;
				}
			}
		}
		else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
		{
			supPOsClearT = Tony_Fan_Purchase_Order[PO_No_Supplier2 == input.PO_No];
			for each  spClearT in supPOsClearT
			{
				spClearT.Missing_SKUs_Supplier2="";
				spClearT.Damage_SKUs_Supplier2="";
			}
			rrToCloseUpdT = Tony_Fan_Replacement_Request[Source_Type == "Receiving Missing" || Source_Type == "Receiving Damage" || Source_Type == "QC Failure" && RR_Status == "Acknowledged"];
			for each  rrcUpdT in rrToCloseUpdT
			{
				matchOrigPOUpdT = "";
				matchModuleUpdT = rrcUpdT.Source_Module;
				excCheckUpdT = Exceptions[Exception_No == rrcUpdT.Source_Exception_No];
				for each  ecUpdT in excCheckUpdT
				{
					matchOrigPOUpdT = ecUpdT.PO_No;
				}
				if(matchOrigPOUpdT == "" && matchModuleUpdT == "Fulfillment EXC")
				{
					ecMatchUpdT = Exception_Control1[Exception_Number == rrcUpdT.Source_Exception_No];
					ecPrNoUpdT = "";
					for each  ecmUpdT in ecMatchUpdT
					{
						ecPrNoUpdT = ecmUpdT.PR;
					}
					if(ecPrNoUpdT != "")
					{
						pr1MatchUpdT = Purchase_Request1[PR_No == ecPrNoUpdT];
						for each  pr1mUpdT in pr1MatchUpdT
						{
							matchOrigPOUpdT = pr1mUpdT.Link_PO_No;
						}
					}
				}
				if(matchOrigPOUpdT == input.PO_No)
				{
					rrcUpdT.RR_Status="Completed";
					closedSourceExcNoUpd = rrcUpdT.Source_Exception_No;
					closedRRNoUpd = rrcUpdT.RR_No;
					closedSourceModuleUpd = matchModuleUpdT;
				}
			}
		}
		/* ADDED 2026-07-20, per user request ("resolve the original Exception too") —
		   the Missing-path branch never advanced its own RR's status before (unlike
		   the Damage/replacement branch, which already did) — real gap, fixed here.
		   Same "only resolve once every item on this Exception is Completed" guard as
		   the replacement branch, see that one's own comment — including the same
		   read-lag fix (trust our own write for closedRRNoUpd, don't require the
		   fresh re-query to already reflect it). */
		if(closedSourceExcNoUpd != "")
		{
			allItemsDoneUpd = true;
			rrsCheckFUpd = Fenteng_Lighting_Replacement_Request[Source_Exception_No == closedSourceExcNoUpd];
			for each  rcFUpd in rrsCheckFUpd
			{
				if(rcFUpd.RR_Status != "Completed" && rcFUpd.RR_No != closedRRNoUpd)
				{
					allItemsDoneUpd = false;
				}
			}
			rrsCheckTUpd = Tony_Fan_Replacement_Request[Source_Exception_No == closedSourceExcNoUpd];
			for each  rcTUpd in rrsCheckTUpd
			{
				if(rcTUpd.RR_Status != "Completed" && rcTUpd.RR_No != closedRRNoUpd)
				{
					allItemsDoneUpd = false;
				}
			}
			if(allItemsDoneUpd == true)
			{
				/* BRANCHED 2026-07-27, per user — mirrors the "Rep" branch's own
				   same-day branch, see that one's comment for the full reasoning. */
				if(closedSourceModuleUpd == "Fulfillment EXC")
				{
					ecToCompleteUpd = Exception_Control1[Exception_Number == closedSourceExcNoUpd];
					for each  ecCompleteUpd in ecToCompleteUpd
					{
						if(ecCompleteUpd.Status != "Completed")
						{
							ecCompleteUpd.Status="Completed";
						}
					}
				}
				else
				{
					excToResolveUpd = Exceptions[Exception_No == closedSourceExcNoUpd];
					for each  exResolveUpd in excToResolveUpd
					{
						if(exResolveUpd.Exception_Status != "Resolved" && exResolveUpd.Exception_Status != "Closed")
						{
							exResolveUpd.Exception_Status="Resolved";
						}
					}
				}
			}
		}
		freshRecvUpd = Receiving[ID == input.ID];
		for each  fruUpd in freshRecvUpd
		{
			// ADDED 2026-07-30 — see the main CREATE branch's own NOTES for the
			// full reasoning (SKU_Receive_History, append-only per-SKU Books
			// receive-event log). Item_QTY here = deltaSentTL (the same delta
			// already computed/logged into Partial_Receive_Timeline below), not
			// the line's full current Accepted_Qty.
			skuHistCountMapUpd = Map();
			for each  existSKURowUpd in fruUpd.SKU_Receive_History
			{
				skuHistKeyUpd = existSKURowUpd.SKU + "";
				if(skuHistCountMapUpd.containKey(skuHistKeyUpd))
				{
					skuHistCountMapUpd.put(skuHistKeyUpd,skuHistCountMapUpd.get(skuHistKeyUpd) + 1);
				}
				else
				{
					skuHistCountMapUpd.put(skuHistKeyUpd,1);
				}
			}
			for each  rliUpdTL in input.Receiving_Line_Items
			{
				/* CHANGED 2026-07-20 — logs the DELTA actually sent to Books this
				   click (sentDeltaMapUpd, computed above), not the line's full
				   current Accepted_Qty. This subform IS the ledger the delta
				   computation reads from on the NEXT recycle click — logging the
				   full qty here would make a 3rd click under-count/over-subtract. */
				deltaSentTL = sentDeltaMapUpd.get(rliUpdTL.SKU + "");
				if(deltaSentTL != null && deltaSentTL > 0)
				{
					newPRTUpd = Receiving.Partial_Receive_Timeline();
					newPRTUpd.RR_No=fruUpd.Receive_No1;
					newPRTUpd.Supplier=input.Supplier;
					newPRTUpd.SKU=rliUpdTL.SKU;
					newPRTUpd.Item=rliUpdTL.Item_Name;
					newPRTUpd.Quantity=deltaSentTL + "";
					newPRTUpd.Shipment_Mode=rliUpdTL.Shipment_Mode_When_Received;
					newPRTUpd.Date_Time=zoho.currenttime;
					fruUpd.Partial_Receive_Timeline.insert(newPRTUpd);
					skuHistKeyInsUpd = rliUpdTL.SKU + "";
					if(skuHistCountMapUpd.containKey(skuHistKeyInsUpd))
					{
						nextSkuHistCountUpd = skuHistCountMapUpd.get(skuHistKeyInsUpd) + 1;
					}
					else
					{
						nextSkuHistCountUpd = 1;
					}
					skuHistCountMapUpd.put(skuHistKeyInsUpd,nextSkuHistCountUpd);
					newSRHUpd = Receiving.SKU_Receive_History();
					newSRHUpd.Item=rliUpdTL.Item_Name;
					newSRHUpd.SKU=rliUpdTL.SKU;
					newSRHUpd.Item_QTY=deltaSentTL;
					newSRHUpd.Receive_Count=nextSkuHistCountUpd;
					newSRHUpd.Books_Receive_No=newUpdReceiveNo;
					newSRHUpd.Books_Receive_ID=newUpdReceiveId;
					fruUpd.SKU_Receive_History.insert(newSRHUpd);
				}
			}
		}
		success message "New Books receive created for the replacement item(s) against PO " + input.PO_No + " — resolved.";
	}
	else
	{
		info "Failed to create new Books receive for the replacement item(s). Raw: " + updateResp;
	}
	return;
}
if(input.Receiving_Line_Items == null || input.Receiving_Line_Items.count() == 0)
{
	info "No line items to receive.";
	return;
}
vendorId = "";
if(input.Supplier == "Fenteng" || input.Supplier.contains("Fenteng"))
{
	vendorId = "2680178000049168001";
}
else if(input.Supplier == "Tony" || input.Supplier.contains("Tony"))
{
	vendorId = "2680178000002735078";
}
if(vendorId == "")
{
	info "Unrecognized Supplier — cannot determine Zoho Books vendor.";
	return;
}
aggPORecs = Purchase_Order[PO_No == input.PO_No];
booksPOId = "";
for each  apo in aggPORecs
{
	booksPOId = apo.Books_PO_ID + "";
	break;
}
/* CHANGED 2026-07-20, per user — was sourcing Mode of Shipment from the PO's
   own PLANNED Shipping_Mode (often blank, silently fell back to the "Air
   Freight" default regardless of what was actually received). Now sources
   from THIS Receiving record's own ACTUAL Shipment_Mode_When_Received per
   line — the field this whole feature exists for, distinct from the PO's
   planned value by design. Mirrored into the replacement/missing branches
   above/below and into receiving_widget_custom_api.txt. */
shipModeVal = "Air Freight";
for each  rliMode in input.Receiving_Line_Items
{
	shipLineVal = rliMode.Shipment_Mode_When_Received + "";
	if(shipLineVal == "LCL")
	{
		shipModeVal = "LCL";
	}
	else if(shipLineVal == "FCL")
	{
		shipModeVal = "FCL";
	}
	else if(shipLineVal != "" && shipLineVal != "null")
	{
		shipModeVal = "Air Freight";
	}
}
if(booksPOId == "" || booksPOId == "null")
{
	info "Linked Purchase_Order has no Books_PO_ID yet — acknowledge the supplier PO first.";
	return;
}
shipNoVal = "";
if(input.Shipments != null)
{
	shipRec = Shipments[ID == input.Shipments];
	if(shipRec != null)
	{
		shipNoVal = shipRec.Shipment_No + "";
	}
}
booksPOResp = invokeurl
[
	url :"https://www.zohoapis.com/books/v3/purchaseorders/" + booksPOId + "?organization_id=" + orgId
	type :GET
	connection:"zoho_books"
];
booksPOLineItems = List();
if(booksPOResp.get("purchaseorder") != null)
{
	booksPOLineItems = booksPOResp.get("purchaseorder").get("line_items");
}
binLocsRecv = List();
for each  page in {1,2,3,4,5,6}
{
	binUrlRecv = "https://www.zohoapis.com/books/v3/settings/warehouses/2680178000042173149/storagelocations?organization_id=" + orgId + "&page=" + page + "&per_page=200";
	binRespRecv = invokeurl
	[
		url :binUrlRecv
		type :GET
		connection:"zoho_books"
	];
	locsRecv = binRespRecv.get("storage_locations");
	if(locsRecv == null || locsRecv.size() == 0)
	{
		break;
	}
	for each  locRecv in locsRecv
	{
		binLocsRecv.add(locRecv);
	}
	hasMoreRecv = binRespRecv.get("page_context").get("has_more_page");
	if(hasMoreRecv == false)
	{
		break;
	}
}
receiveLineItems = List();
for each  rli in input.Receiving_Line_Items
{
	if(rli.Accepted_Qty == null || rli.Accepted_Qty == 0)
	{
		continue;
	}
	matchedLineItemId = "";
	matchedItemId = "";
	for each  bpoLi in booksPOLineItems
	{
		if(bpoLi.get("sku") + "" == rli.SKU + "")
		{
			matchedLineItemId = bpoLi.get("line_item_id") + "";
			matchedItemId = bpoLi.get("item_id") + "";
		}
	}
	if(matchedLineItemId == "")
	{
		continue;
	}
	lineMap = Map();
	lineMap.put("line_item_id",matchedLineItemId);
	lineMap.put("quantity",rli.Accepted_Qty);
	lineMap.put("warehouse_id","2680178000042173149");
	itemIsBinTracked = false;
	if(matchedItemId != "")
	{
		itemDetailResp = invokeurl
		[
			url :"https://www.zohoapis.com/books/v3/items/" + matchedItemId + "?organization_id=" + orgId
			type :GET
			connection:"zoho_books"
		];
		if(itemDetailResp.get("item") != null)
		{
			itemWarehouses = itemDetailResp.get("item").get("warehouses");
			if(itemWarehouses != null)
			{
				for each  iwh in itemWarehouses
				{
					info "SKU " + rli.SKU + " warehouse check: whId=" + iwh.get("warehouse_id") + " | is_storage_location_enabled=" + iwh.get("is_storage_location_enabled");
					if(iwh.get("warehouse_id") + "" == "2680178000042173149" && iwh.get("is_storage_location_enabled") == true || iwh.get("is_storage_location_enabled") + "" == "true")
					{
						itemIsBinTracked = true;
					}
				}
			}
		}
	}
	info "SKU " + rli.SKU + " itemIsBinTracked: " + itemIsBinTracked;
	if(itemIsBinTracked == true && rli.Bin_location != null && rli.Bin_location != "")
	{
		matchedStorageId = "";
		matchedStorageName = "";
		for each  bl in binLocsRecv
		{
			if(bl.get("name") + "" == rli.Bin_location + "")
			{
				matchedStorageId = bl.get("storage_id") + "";
				matchedStorageName = bl.get("name") + "";
			}
		}
		info "SKU " + rli.SKU + " bin match: Bin_location=" + rli.Bin_location + " -> matchedStorageId=" + matchedStorageId;
		if(matchedStorageId != "")
		{
			storageRow = Map();
			storageRow.put("storage_id",matchedStorageId);
			storageRow.put("in_quantity",rli.Accepted_Qty);
			storageList = List();
			storageList.add(storageRow);
			lineMap.put("storages",storageList);
		}
	}
	receiveLineItems.add(lineMap);
}
if(receiveLineItems.size() == 0)
{
	info "No lines with Accepted Qty > 0 matched the linked Books Purchase Order.";
	return;
}
cfList = List();
cf1 = Map();
cf1.put("label","Shipment #");
cf1.put("value",shipNoVal);
cfList.add(cf1);
cf2 = Map();
cf2.put("label","PO #");
cf2.put("value",input.PO_No);
cfList.add(cf2);
cf3 = Map();
cf3.put("label","Mode of Shipment");
cf3.put("value",shipModeVal);
cfList.add(cf3);
receiveBody = Map();
receiveBody.put("vendor_id",vendorId);
receiveBody.put("date",zoho.currentdate.toString("yyyy-MM-dd"));
receiveBody.put("line_items",receiveLineItems);
receiveBody.put("custom_fields",cfList);
createRespRecv = invokeurl
[
	url :"https://www.zohoapis.com/books/v3/purchasereceives?organization_id=" + orgId + "&purchaseorder_id=" + booksPOId
	type :POST
	parameters:receiveBody.toString()
	headers:{"Content-Type":"application/json"}
	connection:"zoho_books"
];
info "createRespRecv: " + createRespRecv;
if(createRespRecv.get("purchasereceive") != null)
{
	/* FIXED FOR REAL 2026-07-20, mirrored from receiving_widget_custom_api.txt —
	   ROOT CAUSE of the whole "null" saga: these key names were simply wrong.
	   Books' real keys are `receive_id`/`receive_number`, confirmed via a real
	   captured raw response (a genuinely successful create, PR-06372). The old
	   keys silently returned null every time (no error, since "purchasereceive"
	   itself was always non-null), producing the literal string "null" that kept
	   getting written into Books_Receive_ID/No. */
	newReceiveId = createRespRecv.get("purchasereceive").get("receive_id") + "";
	newReceiveNo = createRespRecv.get("purchasereceive").get("receive_number") + "";
	freshRecv = Receiving[ID == input.ID];
	for each  fr in freshRecv
	{
		fr.Books_Receive_ID=newReceiveId;
		fr.Books_Receive_No=newReceiveNo;
		// ADDED 2026-07-30, per user request — SKU_Receive_History is a new
		// append-only per-SKU log of every real Books receive-event created
		// against this Receiving record (a single RCV can now legitimately
		// get multiple real Books Purchase Receives over time — partial
		// delta/replacement recycle/missing-SKU updates all POST a brand-new
		// receive each time, see this file's own 2026-07-20 redesign notes).
		// Item_QTY = qty actually sent to Books THIS event (not cumulative).
		// Receive_Count = per-SKU sequence number within this record, seeded
		// from whatever's already logged before this event's own inserts.
		skuHistCountMap = Map();
		for each  existSKURow in fr.SKU_Receive_History
		{
			skuHistKey = existSKURow.SKU + "";
			if(skuHistCountMap.containKey(skuHistKey))
			{
				skuHistCountMap.put(skuHistKey,skuHistCountMap.get(skuHistKey) + 1);
			}
			else
			{
				skuHistCountMap.put(skuHistKey,1);
			}
		}
		for each  rliTL in input.Receiving_Line_Items
		{
			if(rliTL.Accepted_Qty != null && rliTL.Accepted_Qty > 0)
			{
				newPRT = Receiving.Partial_Receive_Timeline();
				newPRT.RR_No=fr.Receive_No1;
				newPRT.Supplier=input.Supplier;
				newPRT.SKU=rliTL.SKU;
				newPRT.Item=rliTL.Item_Name;
				newPRT.Quantity=rliTL.Accepted_Qty + "";
				newPRT.Shipment_Mode=rliTL.Shipment_Mode_When_Received;
				newPRT.Date_Time=zoho.currenttime;
				fr.Partial_Receive_Timeline.insert(newPRT);
				skuHistKeyIns = rliTL.SKU + "";
				if(skuHistCountMap.containKey(skuHistKeyIns))
				{
					nextSkuHistCount = skuHistCountMap.get(skuHistKeyIns) + 1;
				}
				else
				{
					nextSkuHistCount = 1;
				}
				skuHistCountMap.put(skuHistKeyIns,nextSkuHistCount);
				newSRH = Receiving.SKU_Receive_History();
				newSRH.Item=rliTL.Item_Name;
				newSRH.SKU=rliTL.SKU;
				newSRH.Item_QTY=rliTL.Accepted_Qty;
				newSRH.Receive_Count=nextSkuHistCount;
				newSRH.Books_Receive_No=newReceiveNo;
				newSRH.Books_Receive_ID=newReceiveId;
				fr.SKU_Receive_History.insert(newSRH);
			}
		}
	}
	// ADDED 2026-07-29, per user request ("create receive success will send
	// bin location into -> these two forms too") — pushes the REAL bin
	// location actually used at receiving time into Sales_Order_Fulfillment
	// (Item_Details1 subform, per-row SKU) and Pre_Order_FF (plain header
	// Bin_Location field, one record per item). Best-effort — a miss on
	// either form is a silent no-op, never blocks/fails the receive itself
	// (matches this app's own established "secondary sync, don't roll back
	// the primary success" convention). Sales_Order_Fulfillment write uses
	// the proven full-subform-rebuild pattern (no-ID clear+insert) since a
	// plain in-place row mutation is documented-unreliable in this codebase.
	// FIXED 2026-07-29, real bug found live (RCV-00007, both forms' own
	// Bin_Location stayed blank despite the receive succeeding): the original
	// match criteria (PR_No/PR == rliBin.PR_No) never matches anything — a
	// live pull confirmed BOTH forms genuinely have PR_No/PR blank on every
	// real record (Sales_Order_Fulfillment is populated by so_kanban_sync.txt,
	// which never sets PR_No at all; same for Pre_Order_FF's own PR field).
	// Switched to matching by SO_No/SO instead (input.SO_No, a real reliably-
	// populated header field on Receiving, confirmed via live schema pull)
	// combined with the existing per-row/per-record SKU match.
	for each  rliBin in input.Receiving_Line_Items
	{
		if(rliBin.Bin_location == null || rliBin.Bin_location == "")
		{
			continue;
		}
		for each  sofRec in Sales_Order_Fulfillment[SO_No == input.SO_No]
		{
			sofRowMapsBin = List();
			sofRowMatchedBin = false;
			for each  sofRowBin in sofRec.Item_Details1
			{
				sofRm = Map();
				sofRm.put("Item",sofRowBin.Item);
				sofRm.put("SKU",sofRowBin.SKU);
				sofRm.put("Quantity",sofRowBin.Quantity);
				if(sofRowBin.SKU + "" == rliBin.SKU + "")
				{
					sofRm.put("Bin_Location",rliBin.Bin_location + "");
					sofRowMatchedBin = true;
				}
				else
				{
					sofRm.put("Bin_Location",sofRowBin.Bin_Location);
				}
				sofRowMapsBin.add(sofRm);
			}
			if(sofRowMatchedBin == true)
			{
				sofRec.Item_Details1.clear();
				for each  sofRmRow in sofRowMapsBin
				{
					newSofBinRow = Sales_Order_Fulfillment.Item_Details1();
					newSofBinRow.Item=sofRmRow.get("Item");
					newSofBinRow.SKU=sofRmRow.get("SKU");
					newSofBinRow.Quantity=sofRmRow.get("Quantity");
					newSofBinRow.Bin_Location=sofRmRow.get("Bin_Location");
					sofRec.Item_Details1.insert(newSofBinRow);
				}
			}
		}
		for each  pofRecBin in Pre_Order_FF[SO == input.SO_No && SKU == rliBin.SKU]
		{
			pofRecBin.Bin_Location=rliBin.Bin_location + "";
		}
	}
	// ADDED 2026-07-30, per user request ("if create receive in receiving and
	// the item is complete. flip the status on pre order report's same item
	// only") — per-LINE completeness flip, distinct from the widget's own
	// client-side loadDeliveredSOsAndHeal() heuristic (which heals off the
	// WHOLE PO's aggregate Receiving fulfillment, not per line). "Complete"
	// mirrors native Receiving_Set_Line_Result's own formula exactly
	// (Accepted==Expected, zero Damage, zero Missing). Matches by SO+SKU, same
	// key pair already proven for the bin-location push right above — only
	// ever advances Pending -> Received, never reverts an already-Received row.
	for each  rliPoStat in input.Receiving_Line_Items
	{
		rliPoStatComplete = ifnull(rliPoStat.Accepted_Qty,0) == ifnull(rliPoStat.Expected_Qty,0) && ifnull(rliPoStat.Damage_Qty,0) == 0 && ifnull(rliPoStat.Missing_Qty,0) == 0 && ifnull(rliPoStat.Expected_Qty,0) > 0;
		if(rliPoStatComplete == true)
		{
			for each  pofRecStat in Pre_Order_FF[SO == input.SO_No && SKU == rliPoStat.SKU && Pre_Order_Status != "Received"]
			{
				pofRecStat.Pre_Order_Status="Received";
			}
		}
	}
	for each  apoComplete in aggPORecs
	{
		apoComplete.Completed_On=zoho.currenttime;
		/* ADDED 2026-07-20, per user — real PO-completion gate. PO_Status="Completed"
		   is checked in 6+ other places across this codebase (pr_to_po_grouping.txt,
		   pr_sync_supplier_load_balancing.txt, pr_approve_po_custom_api.txt) but was
		   never actually SET anywhere (confirmed via grep before building this) —
		   this closes that real gap. Sums Accepted_Qty across THIS Receiving
		   record's own lines (safe read off `input`) per SKU, compares to each
		   PO_Line_Items row's ordered QTY, requires zero Open Exceptions tied to
		   this PO before flipping PO_Status. */
		if(apoComplete.PO_Status != "Completed")
		{
			allLinesFullComp = true;
			for each  poLnComp in apoComplete.PO_Line_Items
			{
				skuAcceptedSumComp = 0;
				for each  rliComp in input.Receiving_Line_Items
				{
					if(rliComp.SKU == poLnComp.SKU)
					{
						skuAcceptedSumComp = skuAcceptedSumComp + ifnull(rliComp.Accepted_Qty,0);
					}
				}
				if(skuAcceptedSumComp < poLnComp.QTY)
				{
					allLinesFullComp = false;
				}
			}
			if(allLinesFullComp == true)
			{
				openExcCompCheck = Exceptions[PO_No == apoComplete.PO_No && Exception_Status == "Open"];
				if(openExcCompCheck.count() == 0)
				{
					apoComplete.PO_Status="Completed";
				}
			}
		}
	}
	if(shipRec != null)
	{
		shipRec.Arrival_Date=zoho.currentdate;
		shipRec.Receiving_Record_Created=true;
	}
	success message "Sent to Zoho Books — " + newReceiveNo;
}
else
{
	info "Failed to create Books Purchase Receive — check logs.";
}

````
