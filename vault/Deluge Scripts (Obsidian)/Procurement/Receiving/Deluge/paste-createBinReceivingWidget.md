---
title: "paste-createBinReceivingWidget"
source_file: "paste-createBinReceivingWidget.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]"
lines: 1854
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - kanban
  - order-aggregation
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-books
---

# paste-createBinReceivingWidget

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `paste-createBinReceivingWidget.txt`
> - **Lines of Code:** 1,854
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#kanban`, `#order-aggregation`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
map createBinReceivingWidget(String receivingId)
{
	response = Map();
	orgId = "751117756";
	recs = Receiving[ID == receivingId.toLong()];
	found = false;
	for each  r in recs
	{
		found = true;
		if(r.Supplier == "HC System" || r.Supplier.contains("HC System"))
		{
			r.Books_Receive_ID="";
			r.Books_Receive_No="N/A (HC System - internal only)";
			response.put("status","success");
			response.put("message","HC System (Local) receiving - skipped Books, internal only.");
			return response;
		}
		/* ADDED 2026-07-27, mirrored from receiving_create_bin_receiving.txt — see
		   that file's own NOTES for the full writeup. A Fulfillment-EXC replacement
		   Receiving record never sends to Books at all; completes the moment
		   Accepted_Qty==Expected_Qty on its own line(s), closing the RR +
		   Exception_Control1 directly. Checked before the generic Total_Accepted_Qty
		   gate below so its own more specific message wins when applicable.
		   SIMPLIFIED 2026-07-27, same day, per user ("indicate in shp and rcv that
		   this record is from Fulfillment's Exception") — reads the new real
		   Source_Module/Exception_Number fields straight off `r` instead of
		   matching via Shipments.Shipment_No/Cloned_Shipment_No. */
		fulfillmentExcCheck = (r.Source_Module == "Fulfillment EXC");
		fulfillmentExcClosedNo = r.Exception_Number;
		fulfillmentExcClosedRRNo = "";
		// ADDED 2026-09-11, mirrored from receiving_create_bin_receiving.txt's own
		// same-day fix — see that file's comment for the full reasoning. Same
		// re-entry guard, response-Map shape (this is a Custom Function, not a
		// Report Action Item) so the widget can show a real message instead of a
		// generic error if this button is clicked again on an already-closed record.
		if(fulfillmentExcCheck == true && r.Books_Receive_No == "N/A (Fulfillment EXC - internal only)")
		{
			response.put("status","success");
			response.put("message","This Fulfillment EXC replacement receive was already closed internally — skipped to avoid creating a duplicate Pre_Order_FF record.");
			return response;
		}
		if(fulfillmentExcCheck == true)
		{
			if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
			{
				rrLookupCloseF = Fenteng_Lighting_Replacement_Request[Source_Exception_No == fulfillmentExcClosedNo && RR_Status == "Acknowledged"];
				for each  rlcF in rrLookupCloseF
				{
					fulfillmentExcClosedRRNo = rlcF.RR_No;
				}
			}
			else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
			{
				rrLookupCloseT = Tony_Fan_Replacement_Request[Source_Exception_No == fulfillmentExcClosedNo && RR_Status == "Acknowledged"];
				for each  rlcT in rrLookupCloseT
				{
					fulfillmentExcClosedRRNo = rlcT.RR_No;
				}
			}
			fulfillmentExcExpected = 0;
			fulfillmentExcAccepted = 0;
			for each  rliCheck in r.Receiving_Line_Items
			{
				fulfillmentExcExpected = fulfillmentExcExpected + ifnull(rliCheck.Expected_Qty,0);
				fulfillmentExcAccepted = fulfillmentExcAccepted + ifnull(rliCheck.Accepted_Qty,0);
			}
			if(fulfillmentExcExpected == 0)
			{
				response.put("status","error");
				response.put("message","No Expected Qty on this replacement receive yet.");
				return response;
			}
			if(fulfillmentExcAccepted != fulfillmentExcExpected)
			{
				response.put("status","error");
				response.put("message","Accepted Qty must equal Expected Qty (" + fulfillmentExcExpected + ") to complete this Fulfillment EXC replacement receive.");
				return response;
			}
			// ADDED 2026-08-17, per user report (RR-00001/RR-00002, SO-16489) — see
			// receiving_create_bin_receiving.txt's own 2026-08-17 comment for the
			// full writeup. Same fix mirrored here.
			ecDirectRR_ETA = "";
			if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
			{
				rrDirectCloseF = Fenteng_Lighting_Replacement_Request[RR_No == fulfillmentExcClosedRRNo];
				for each  rdcF in rrDirectCloseF
				{
					rdcF.RR_Status = "Completed";
					rdcFEta = rdcF.ETA + "";
					if(rdcFEta != "" && rdcFEta != "null")
					{
						ecDirectRR_ETA = rdcFEta;
					}
				}
			}
			else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
			{
				rrDirectCloseT = Tony_Fan_Replacement_Request[RR_No == fulfillmentExcClosedRRNo];
				for each  rdcT in rrDirectCloseT
				{
					rdcT.RR_Status = "Completed";
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
				// FIXED 2026-08-17, mirrored from receiving_create_bin_receiving.txt's own
					// same-day fix — Qty now comes from fulfillmentExcAccepted (this
					// Receiving record's own actually-accepted qty), not ecdc.Qty
					// (Exception_Control1's original flagged qty, which overstated it).
					ecDirectQty = fulfillmentExcAccepted;
				ecDirectPR = ecdc.PR;
				ecDirectRR = ecdc.RR_No;
				if(ecdc.Status != "Completed")
				{
					ecdc.Status = "Completed";
				}
			}
			/* CHANGED 2026-07-27, mirrored from receiving_create_bin_receiving.txt —
			   see that file's own NOTES for the full writeup ("change the flow...
			   every completed -> quality check... approved -> aggregate"). Creates
			   a Checker_Checklist record instead of pushing straight to
			   Order_Aggregation1 — Order Aggregation only updates once a QC officer
			   sets QC_Status=Approved (UI/FF Widget/QCChecklist). */
			if(ecDirectSO != "")
			{
				poDirectOrderType = "";
				poDirectDeliveryType = "";
				poDirectTargetDate = "";
				poDirectForCrate = false;
				poDirectCustName = "";
				poDirectCustType = "";
				poDirectCustAddr = "";
				// ADDED 2026-08-06, per user request ("why other fields is not
				// auto populated? like the city email contact") — Pre_Order_FF
				// now carries City/Email/Contact (see so_kanban_sync.txt),
				// relayed onward here so checker_checklist_qc_sync.txt can
				// relay them again into Order_Aggregation1 ->
				// Service_Appointment_Form. Mirrors
				// receiving_create_bin_receiving.txt's identical block.
				poDirectCity = "";
				poDirectEmail = "";
				poDirectContact = "";
				// ADDED 2026-08-13, mirrored from receiving_create_bin_receiving.txt's
				// own same-day fix — Bin Location was never resolved anywhere in this
				// branch at all. Per-SKU, lives on Sales_Order_Fulfillment's own
				// Item_Details1 subform, not a header field.
				poDirectBinLoc = "";
				// ADDED 2026-08-17, mirrored from receiving_create_bin_receiving.txt's
				// own same-day fix — Payment Status ("Status" field) copied from a
				// sibling Pre_Order_FF row for the same SO, same pattern as every
				// other field copied in the podm loop below.
				poDirectStatus = "";
				/* FIXED 2026-08-12, mirrored from receiving_create_bin_receiving.txt's
				   own same-day fix — seed from Sales_Order_Fulfillment FIRST (stock
				   items live there, not Pre_Order_FF). Confirmed field link names via
				   Sales_Order_Fulfillment_Report.txt: order_type/target_delivery_date
				   are genuinely lowercase, Customer is a lookup (dot-chain
				   .customer_name for display text). City/Email/Contact/Customer_
				   Address aren't on this form, stay Pre_Order_FF-only below. The
				   Pre_Order_FF loop right after is UNCHANGED — still wins when it has
				   a match (zero-stock/Pre-Order-type items). */
				sofDirectMatch = Sales_Order_Fulfillment[SO_No == ecDirectSO];
				for each  sofDirect in sofDirectMatch
				{
					sofOrderTypeDirect = sofDirect.order_type + "";
					poDirectOrderType = if(sofOrderTypeDirect == "null", "", sofOrderTypeDirect);
					sofDeliveryTypeDirect = sofDirect.Delivery_Type + "";
					poDirectDeliveryType = if(sofDeliveryTypeDirect == "null", "", sofDeliveryTypeDirect);
					sofTargetDateDirect = sofDirect.target_delivery_date + "";
					poDirectTargetDate = if(sofTargetDateDirect == "null", "", sofTargetDateDirect);
					poDirectForCrate = sofDirect.For_Crate;
					sofCustNameDirect = sofDirect.Customer.customer_name + "";
					poDirectCustName = if(sofCustNameDirect == "null", "", sofCustNameDirect);
					sofCustTypeDirect = sofDirect.Customer_Type + "";
					poDirectCustType = if(sofCustTypeDirect == "null", "", sofCustTypeDirect);
					for each  sofDirectRow in sofDirect.Item_Details1
					{
						if((sofDirectRow.SKU + "") == ecDirectSKU)
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
				// ADDED 2026-08-17, mirrored from receiving_create_bin_receiving.txt's
				// own same-day fix — RR's own ETA takes priority over the Sales_Order_
				// Fulfillment/Pre_Order_FF chain just resolved above, when present.
				if(ecDirectRR_ETA != "" && ecDirectRR_ETA != "null")
				{
					poDirectTargetDate = ecDirectRR_ETA;
				}
				/* FIXED 2026-08-12, mirrored from receiving_create_bin_receiving.txt's
				   own same-day fix — real bug found live (RCV-00006, stock-item
				   Fulfillment EXC receive via THIS widget-facing copy specifically):
				   "UnParsable date" — Pre_Order_FF has no row for an item that
				   already had stock, so poDirectTargetDate stays "" and crashes the
				   insert when assigned to a DATE field. Same if(cond,a,b) guard. */
				// CHANGED 2026-08-13, mirrored from receiving_create_bin_receiving.txt's
				// own same-day change — per user decision ("di na siya babalik sa QC
				// para i-approve, diretso na siya sa Pre Order. wag na siya mag create
				// ng QC. pag ka create ng Receive rekta sa Pre Order") — skips the
				// first QC check entirely (see that file's own comment for the full
				// collision-saga writeup). Create Receive now creates a fresh
				// Pre_Order_FF record directly instead of a Checker_Checklist one.
				// ADDED 2026-08-13, mirrored from receiving_create_bin_receiving.txt's
				// own same-day fix — Target Delivery Date/Bin Location were never
				// actually written onto this insert even though poDirectTargetDate/
				// poDirectBinLoc were already resolved above. Same null-vs-blank-string
				// guard. NOTE: this comment must stay OUTSIDE the insert-into bracket
				// below — a comment placed inside it breaks with a misleading "Improper
				// Statement" at an unrelated line (this file's own documented gotcha,
				// re-confirmed live here).
				newPreOrderIdDirect = insert into Pre_Order_FF
				[
					SO = ecDirectSO
					SKU = ecDirectSKU
					Item_Name = ecDirectItemName
					Qty = ecDirectQty + ""
					Pre_Order_Status = "Received"
					Customer_Name = poDirectCustName
					Customer_Address = poDirectCustAddr
					Customer_Type = poDirectCustType
					City = poDirectCity
					Email = poDirectEmail
					Contact = poDirectContact
					Order_Type = poDirectOrderType
					Delivery_Type = poDirectDeliveryType
					PR = ecDirectPR
					RR = ecDirectRR
					Target_Delivery = if(poDirectTargetDate != "" && poDirectTargetDate != null, poDirectTargetDate, null)
					Bin_Location = poDirectBinLoc
					Status = poDirectStatus
				];
				info "Fulfillment EXC replacement received — Pre_Order_FF created directly (no QC), new ID: " + newPreOrderIdDirect + ", SO " + ecDirectSO + " / SKU " + ecDirectSKU + " / RR " + ecDirectRR;
			}
			freshRecvDirect = Receiving[ID == receivingId.toLong()];
			for each  frd in freshRecvDirect
			{
				frd.Books_Receive_No = "N/A (Fulfillment EXC - internal only)";
			}
			response.put("status","success");
			response.put("message","Fulfillment EXC replacement received — closed internally, RR and Exception marked Completed. Not sent to Books.");
			return response;
		}
		if(ifnull(r.Total_Accepted_Qty,0) <= 0)
		{
			response.put("status","error");
			response.put("message","No lines with Accepted Qty > 0 yet — enter Accepted Qty before creating the receive.");
			return response;
		}

		aggPORecsCheck = Purchase_Order[PO_No == r.PO_No];
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
			/* FIXED FOR REAL 2026-07-20, confirmed via a 3-round live diagnostic:
			   reading the `Replacement_Summary` subform off a queried
			   Fenteng_Lighting_Replacement_Request/Tony_Fan_Replacement_Request
			   record is a genuine, reproducible platform limitation in this Custom
			   Function context — confirmed the RR_No match itself works perfectly
			   (diagMatch=1, exact RR_No echoed back correctly) and the underlying
			   data is genuinely present (confirmed live on the native form), yet the
			   subform read itself came back with 0 rows 3 times in a row, including
			   with the exact shape that read 1 row in an earlier isolated test — not
			   a timing fluke, not a shape issue, just this specific subform read
			   being unreliable here. WORKAROUND: don't depend on Replacement_Summary
			   at all for this trace — every RR already carries `Source_Exception_No`
			   (a plain HEADER field, reliable) pointing at the Exceptions record that
			   raised it, and Exceptions already carries its own `PO_No` (also a plain
			   header field, read constantly elsewhere in this app without issue) —
			   both are ordinary field reads, not subform reads, sidestepping the
			   broken path entirely. */
			sourceExcNoRep = "";
			sourceModuleRep = "";
			if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
			{
				rrRecF = Fenteng_Lighting_Replacement_Request[RR_No == rrRefNoCheck];
				for each  rrF in rrRecF
				{
					sourceExcNoRep = rrF.Source_Exception_No;
					sourceModuleRep = rrF.Source_Module;
				}
			}
			else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
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
			   fallback as clone_shipment_for_replacement.txt / receiving_create_bin_
			   receiving.txt's own trace-back, mirrored here. Gated on sourceModuleRep
			   so a normal Damage/Missing/QC RR never even attempts this branch. */
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
				response.put("status","error");
				response.put("message","Could not trace back to the original PO for this replacement — check Source_Exception_No on the RR and PO_No on the linked Exception (or PR on the linked Exception_Control1 item).");
				return response;
			}
			origPOsRep = Purchase_Order[PO_No == origPONoRep];
			origBooksPOId = "";
			for each  opoRep in origPOsRep
			{
				origBooksPOId = opoRep.Books_PO_ID + "";
			}
			/* CHANGED 2026-07-20, mirrored from receiving_create_bin_receiving.txt —
			   sources Mode of Shipment from THIS Receiving record's own actual
			   Shipment_Mode_When_Received, not the PO's planned Shipping_Mode. */
			shipModeValRep = "Air Freight";
			for each  rliModeRep in r.Receiving_Line_Items
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
				response.put("status","error");
				response.put("message","Original PO " + origPONoRep + " has no Books_PO_ID yet.");
				return response;
			}
			/* CHANGED 2026-07-20 — since the Books side now creates a brand-new
			   receive instead of updating the original's, the original Receiving
			   record's own Books_Receive_ID is no longer a hard requirement — it's
			   only needed further down for the line-item reconcile step
			   (origRecvIdRep). Decoupled from the Books-ID-blank guard: always
			   capture the first matching original Receiving record's own ID
			   regardless of its Books send status, only error if no original
			   Receiving record exists for this PO at all. */
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
				response.put("status","error");
				response.put("message","No original Receiving record found for PO " + origPONoRep + ".");
				return response;
			}
			/* ADDED 2026-07-20, per user request ("make it retriggerable") — the
			   Books PUT-merge itself must NOT re-run once this exact replacement
			   record has already been sent once (r.Books_Receive_ID already set) —
			   our own "add, don't overwrite" fix means a 2nd PUT would double-add
			   the same qty again. But everything AFTER the merge (RR completion,
			   Exception resolution, the original-line reconcile) IS safe to re-run
			   any number of times — each is naturally idempotent (already-Completed/
			   already-Resolved guards, and the reconcile floors at whatever Damage
			   is actually left, so re-running it once Damage is already 0 is a
			   no-op). So: skip the Books call entirely on a retrigger, but still
			   fall through to the shared tail logic below using the already-known
			   origReceiveId/origReceiveNo. This is what makes "click Create Receive
			   again on an already-sent replacement" a safe way to re-apply a fix
			   like the reconcile logic without needing a brand-new test record. */
			alreadySentThisRecordRep = false;
			thisRecvBooksIdRep = r.Books_Receive_ID + "";
			if(thisRecvBooksIdRep != "" && thisRecvBooksIdRep != "null")
			{
				alreadySentThisRecordRep = true;
			}
			booksMergeOkRep = false;
			if(alreadySentThisRecordRep == false)
			{
				/* ARCHITECTURE CHANGE 2026-07-20, per user request ("you cant update
				   same purchase receive... create new PR with that same PO and then
				   disable the button so we cant duplicate it") — real Books rejection
				   hit live: `36510 "The purchase order(s) have bill(s) without
				   receive(s). Hence, you cannot add receive(s)."` when trying to PUT
				   an update onto the original receive after it had a Bill against it.
				   This was the EXACT risk this app's own original design decision
				   (2026-07-07) had already flagged and accepted — confirmed for real
				   today. Switched from "GET existing receive, merge quantities, PUT"
				   to "POST a brand-new Purchase Receive against the SAME PO" — Books
				   natively supports multiple receives per PO (that's what a partial
				   receive means to Books itself), so this sidesteps the
				   billed-receive-can't-be-edited wall entirely instead of fighting
				   it. The "disable the button" half is the existing
				   alreadySentThisRecordRep guard this whole if/else already provides
				   — once THIS record's own Books_Receive_ID is set, a retrigger
				   skips straight to the tail (RR/Exception/reconcile only), never
				   creating a 2nd receive for the same click-worthy event. Simplified
				   vs. the main CREATE branch further below: no bin/storage
				   assignment (defaults to no `storages` key, same as an
				   unrecognized/non-bin-tracked item there) — a reasonable
				   simplification for a replacement receive, flagged not hidden. */
				poRespRep = invokeurl
				[
					url: "https://www.zohoapis.com/books/v3/purchaseorders/" + origBooksPOId + "?organization_id=" + orgId
					type: GET
					connection: "zoho_books"
				];
				if(poRespRep.get("purchaseorder") == null)
				{
					response.put("status","error");
					response.put("message","Could not fetch original Purchase Order.");
					return response;
				}
				poLineItemsRep = poRespRep.get("purchaseorder").get("line_items");
				vendorIdRep = "";
				if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
				{
					vendorIdRep = "2680178000049168001";
				}
				else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
				{
					vendorIdRep = "2680178000002735078";
				}
				if(vendorIdRep == "")
				{
					response.put("status","error");
					response.put("message","Unrecognized Supplier — cannot determine Zoho Books vendor.");
					return response;
				}
				newReceiveLineItemsRep = List();
				for each  rliRep in r.Receiving_Line_Items
				{
					if(rliRep.Accepted_Qty == null || rliRep.Accepted_Qty <= 0)
					{
						continue;
					}
					matchedLineItemIdRep = "";
					for each  poliRep in poLineItemsRep
					{
						if((poliRep.get("sku") + "") == (rliRep.SKU + ""))
						{
							matchedLineItemIdRep = poliRep.get("line_item_id") + "";
						}
					}
					if(matchedLineItemIdRep == "")
					{
						continue;
					}
					newLineMapRep = Map();
					newLineMapRep.put("line_item_id", matchedLineItemIdRep);
					newLineMapRep.put("quantity", rliRep.Accepted_Qty);
					newReceiveLineItemsRep.add(newLineMapRep);
				}
				if(newReceiveLineItemsRep.size() == 0)
				{
					response.put("status","error");
					response.put("message","No lines with Accepted Qty > 0 matched the original Purchase Order.");
					return response;
				}
				shipNoValRep = "";
				if(r.Shipments != null)
				{
					shipRecRep = Shipments[ID == r.Shipments];
					if(shipRecRep != null)
					{
						shipNoValRep = shipRecRep.Shipment_No + "";
					}
				}
				cfListRep = List();
				cfRep1 = Map();
				cfRep1.put("label", "PO #");
				cfRep1.put("value", origPONoRep);
				cfListRep.add(cfRep1);
				cfRep2 = Map();
				cfRep2.put("label", "Mode of Shipment");
				cfRep2.put("value", shipModeValRep);
				cfListRep.add(cfRep2);
				cfRep3 = Map();
				cfRep3.put("label", "Shipment #");
				cfRep3.put("value", shipNoValRep);
				cfListRep.add(cfRep3);
				/* TODO 2026-07-27 — same deliberate non-implementation as receiving_
				   create_bin_receiving.txt's mirrored note: once Shipments/Receiving
				   get their own Source_Module field, gate this whole Books POST on it
				   being != "Fulfillment EXC". Not gated yet — fields don't exist. */
				newReceiveBodyRep = Map();
				newReceiveBodyRep.put("vendor_id", vendorIdRep);
				newReceiveBodyRep.put("date", zoho.currentdate.toString("yyyy-MM-dd"));
				newReceiveBodyRep.put("line_items", newReceiveLineItemsRep);
				newReceiveBodyRep.put("custom_fields", cfListRep);
				createNewRespRep = invokeurl
				[
					url: "https://www.zohoapis.com/books/v3/purchasereceives?organization_id=" + orgId + "&purchaseorder_id=" + origBooksPOId
					type: POST
					parameters: newReceiveBodyRep.toString()
					connection: "zoho_books"
					headers: {"Content-Type":"application/json"}
				];
				if(createNewRespRep.get("purchasereceive") != null)
				{
					newRepReceiveIdRep = createNewRespRep.get("purchasereceive").get("receive_id") + "";
					newRepReceiveNoRep = createNewRespRep.get("purchasereceive").get("receive_number") + "";
					if(newRepReceiveIdRep == "" || newRepReceiveIdRep == "null" || newRepReceiveNoRep == "" || newRepReceiveNoRep == "null")
					{
						response.put("status","error");
						response.put("message","Books returned a purchasereceive object but id/number came back blank. Raw: " + createNewRespRep);
						return response;
					}
					/* Repurpose origReceiveId/origReceiveNo for the shared tail below —
					   they now mean "the receive tied to THIS event" (the newly
					   created one), not "the original RCV-00001's receive" anymore. */
					origReceiveId = newRepReceiveIdRep;
					origReceiveNo = newRepReceiveNoRep;
					booksMergeOkRep = true;
				}
				else
				{
					response.put("status","error");
					response.put("message","Failed to create new Books receive for replacement. Raw: " + createNewRespRep);
					return response;
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
					opoClearRep.Missing_SKUs = "";
					opoClearRep.Completed_On = zoho.currenttime;
				}
				for each  apoRepClear in aggPORecsCheck
				{
					apoRepClear.Completed_On = zoho.currenttime;
				}
				closedSourceExcNoRep = "";
				closedRRNoRep = "";
				closedSourceModuleRep = "";
				if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
				{
					supOrigPOsRep = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == origPONoRep];
					for each  supOrigRep in supOrigPOsRep
					{
						supOrigRep.Missing_SKUs_Supplier1 = "";
					}
					for each  rrFClose in rrRecF
					{
						rrFClose.RR_Status = "Completed";
						closedSourceExcNoRep = rrFClose.Source_Exception_No;
						closedRRNoRep = rrFClose.RR_No;
						closedSourceModuleRep = rrFClose.Source_Module;
					}
				}
				else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
				{
					supOrigPOsRepT = Tony_Fan_Purchase_Order[PO_No_Supplier2 == origPONoRep];
					for each  supOrigRepT in supOrigPOsRepT
					{
						supOrigRepT.Missing_SKUs_Supplier2 = "";
					}
					for each  rrTClose in rrRecT
					{
						rrTClose.RR_Status = "Completed";
						closedSourceExcNoRep = rrTClose.Source_Exception_No;
						closedRRNoRep = rrTClose.RR_No;
						closedSourceModuleRep = rrTClose.Source_Module;
					}
				}
				if(closedSourceExcNoRep != "")
				{
					/* FIXED 2026-07-20 — the fresh re-query right after the write above
					   may not see that same-execution write yet (same read-lag class
					   hit repeatedly this session). Trust our own write for the RR we
					   JUST closed (closedRRNoRep) instead of re-verifying it via query —
					   only OTHER RRs on this Exception need to show real Completed
					   status from the fresh fetch. */
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
						/* BRANCHED 2026-07-27, per user — mirrors receiving_create_bin_
						   receiving.txt's own same-day branch. A Fulfillment-EXC RR has
						   no native Exceptions record, resolving it here would silently
						   no-op and never close the loop for these items. */
						if(closedSourceModuleRep == "Fulfillment EXC")
						{
							ecToCompleteRep = Exception_Control1[Exception_Number == closedSourceExcNoRep];
							for each  ecCompleteRep in ecToCompleteRep
							{
								if(ecCompleteRep.Status != "Completed")
								{
									ecCompleteRep.Status = "Completed";
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
									exResolveRep.Exception_Status = "Resolved";
								}
							}
						}
					}
				}
				freshRecvRep = Receiving[ID == receivingId.toLong()];
				for each  frRep in freshRecvRep
				{
					frRep.Books_Receive_ID = origReceiveId;
					frRep.Books_Receive_No = origReceiveNo;
					// ADDED 2026-07-30 — see receiving_create_bin_receiving.txt's own
					// NOTES for the full reasoning (SKU_Receive_History, append-only
					// per-SKU Books receive-event log, mirrored into this Custom
					// Function verbatim).
					skuHistCountMapRep = Map();
					for each  existSKURowRep in frRep.SKU_Receive_History
					{
						skuHistKeyRep = existSKURowRep.SKU + "";
						if(skuHistCountMapRep.containKey(skuHistKeyRep))
						{
							skuHistCountMapRep.put(skuHistKeyRep, skuHistCountMapRep.get(skuHistKeyRep) + 1);
						}
						else
						{
							skuHistCountMapRep.put(skuHistKeyRep, 1);
						}
					}
					for each  rliRepTL in r.Receiving_Line_Items
					{
						if(rliRepTL.Accepted_Qty != null && rliRepTL.Accepted_Qty > 0)
						{
							newPRTRep = Receiving.Partial_Receive_Timeline();
							newPRTRep.RR_No = frRep.Receive_No1;
							newPRTRep.Supplier = r.Supplier;
							newPRTRep.SKU = rliRepTL.SKU;
							newPRTRep.Item = rliRepTL.Item_Name;
							newPRTRep.Quantity = rliRepTL.Accepted_Qty + "";
							newPRTRep.Shipment_Mode = rliRepTL.Shipment_Mode_When_Received;
							newPRTRep.Date_Time = zoho.currenttime;
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
							skuHistCountMapRep.put(skuHistKeyInsRep, nextSkuHistCountRep);
							newSRHRep = Receiving.SKU_Receive_History();
							newSRHRep.Item = rliRepTL.Item_Name;
							newSRHRep.SKU = rliRepTL.SKU;
							newSRHRep.Item_QTY = rliRepTL.Accepted_Qty;
							newSRHRep.Receive_Count = nextSkuHistCountRep;
							newSRHRep.Books_Receive_No = origReceiveNo;
							newSRHRep.Books_Receive_ID = origReceiveId;
							frRep.SKU_Receive_History.insert(newSRHRep);
						}
					}
				}
				/* ADDED 2026-07-20, per user request ("rcv 1 damage item should show
				   2 accepted 0 damage since rcv 2 is resolved") — once the replacement
				   receive is merged into Books, also reconcile the ORIGINAL Receiving
				   record's own line: move qty from Damage into Accepted (floored at
				   whatever Damage actually had, defensive). Subform in-place row
				   mutation is confirmed unreliable in this codebase — full clear+
				   rebuild instead (proven pattern), carrying every other field
				   verbatim except Receive_Photo (a file field, can't be carried
				   through a workflow rebuild — same established limitation as
				   elsewhere in this app; harmless here since this widget never writes
				   that field to begin with).
				   FIXED live 2026-07-20: first version held the raw subform-row
				   object itself in a List (`existingRowsRep.add(olRep)`) then read
				   `.field` off it later, outside the loop that produced it — errored
				   "Invalid collection object found", a documented Deluge Gotcha in
				   this codebase (holding a subform-row object across a loop boundary
				   + reassignment). Fixed by extracting plain field VALUES into a Map
				   the moment each row is visited, never holding the row object
				   itself past its own loop iteration. */
				if(origRecvIdRep > 0)
				{
					origRecvFullRep = Receiving[ID == origRecvIdRep];
					for each  origFullRep in origRecvFullRep
					{
						existingRowsRep = List();
						for each  olRep in origFullRep.Receiving_Line_Items
						{
							rowMapRep = Map();
							rowMapRep.put("PR_No", olRep.PR_No);
							rowMapRep.put("RR_No", olRep.RR_No);
							rowMapRep.put("SKU", olRep.SKU);
							rowMapRep.put("Single_Line", olRep.Single_Line);
							rowMapRep.put("Item_Name", olRep.Item_Name);
							rowMapRep.put("Expected_Qty", olRep.Expected_Qty);
							rowMapRep.put("Accepted_Qty", olRep.Accepted_Qty);
							rowMapRep.put("Damage_Qty", olRep.Damage_Qty);
							rowMapRep.put("Missing_Qty", olRep.Missing_Qty);
							rowMapRep.put("Bin_location", olRep.Bin_location);
							rowMapRep.put("Shipment_Mode_When_Received", olRep.Shipment_Mode_When_Received);
							rowMapRep.put("Line_Result", olRep.Line_Result);
							rowMapRep.put("Has_Exceptions", olRep.Has_Exceptions);
							rowMapRep.put("Ready_for_Fulfillment", olRep.Ready_for_Fulfillment);
							rowMapRep.put("Label_Ready", olRep.Label_Ready);
							rowMapRep.put("Label_Printed", olRep.Label_Printed);
							existingRowsRep.add(rowMapRep);
						}
						origFullRep.Receiving_Line_Items.clear();
						deltaAcceptedRep = 0;
						deltaDamageRep = 0;
						for each  oldRowMapRep in existingRowsRep
						{
							oldSkuRep = oldRowMapRep.get("SKU") + "";
							replQtyForSkuRep = 0;
							for each  rliRep2 in r.Receiving_Line_Items
							{
								if((rliRep2.SKU + "") == oldSkuRep && rliRep2.Accepted_Qty != null && rliRep2.Accepted_Qty > 0)
								{
									replQtyForSkuRep = replQtyForSkuRep + rliRep2.Accepted_Qty;
								}
							}
							newRowRep = Receiving.Receiving_Line_Items();
							newRowRep.PR_No = oldRowMapRep.get("PR_No");
							newRowRep.RR_No = oldRowMapRep.get("RR_No");
							newRowRep.SKU = oldRowMapRep.get("SKU");
							newRowRep.Single_Line = oldRowMapRep.get("Single_Line");
							newRowRep.Item_Name = oldRowMapRep.get("Item_Name");
							newRowRep.Expected_Qty = oldRowMapRep.get("Expected_Qty");
							newRowRep.Bin_location = oldRowMapRep.get("Bin_location");
							newRowRep.Shipment_Mode_When_Received = oldRowMapRep.get("Shipment_Mode_When_Received");
							newRowRep.Line_Result = oldRowMapRep.get("Line_Result");
							newRowRep.Has_Exceptions = oldRowMapRep.get("Has_Exceptions");
							newRowRep.Ready_for_Fulfillment = oldRowMapRep.get("Ready_for_Fulfillment");
							newRowRep.Label_Ready = oldRowMapRep.get("Label_Ready");
							newRowRep.Label_Printed = oldRowMapRep.get("Label_Printed");
							if(replQtyForSkuRep > 0)
							{
								oldAcceptedRep = ifnull(oldRowMapRep.get("Accepted_Qty"), 0);
								oldDamageRep = ifnull(oldRowMapRep.get("Damage_Qty"), 0);
								appliedRep = replQtyForSkuRep;
								if(appliedRep > oldDamageRep)
								{
									appliedRep = oldDamageRep;
								}
								newRowRep.Accepted_Qty = oldAcceptedRep + appliedRep;
								newRowRep.Damage_Qty = oldDamageRep - appliedRep;
								newRowRep.Missing_Qty = ifnull(oldRowMapRep.get("Missing_Qty"), 0);
								deltaAcceptedRep = deltaAcceptedRep + appliedRep;
								deltaDamageRep = deltaDamageRep + appliedRep;
							}
							else
							{
								newRowRep.Accepted_Qty = oldRowMapRep.get("Accepted_Qty");
								newRowRep.Damage_Qty = oldRowMapRep.get("Damage_Qty");
								newRowRep.Missing_Qty = oldRowMapRep.get("Missing_Qty");
							}
							origFullRep.Receiving_Line_Items.insert(newRowRep);
						}
						if(deltaAcceptedRep > 0)
						{
							origFullRep.Total_Accepted_Qty = ifnull(origFullRep.Total_Accepted_Qty,0) + deltaAcceptedRep;
							origFullRep.Total_Damage_Qty = ifnull(origFullRep.Total_Damage_Qty,0) - deltaDamageRep;
						}
					}
				}
				successSuffixRep = "";
				if(alreadySentThisRecordRep == true)
				{
					successSuffixRep = " (re-synced RR/Exception/reconcile only — Books already had this qty.)";
				}
				response.put("status","success");
				response.put("message","Replacement received — new Books receive " + origReceiveNo + " created against the original PO, RR marked Completed." + successSuffixRep);
			}
			/* booksMergeOkRep is always true by this point — either set true after a
			   successful PUT above, or the PUT branch already returned early on
			   failure. No else needed. */
			return response;
		}

		if(r.Books_Receive_ID != null && r.Books_Receive_ID != "")
		{
			/* CHANGED 2026-07-20, mirrored from receiving_create_bin_receiving.txt —
			   generalized to also cover Damage (Missing_SKUs OR Damage_SKUs), since
			   Damage/QC/Complaint replacements no longer spin up a separate
			   Creator-only PO — they recycle through this SAME record/SAME PO. */
			/* GATE REMOVED 2026-07-30, mirrored from receiving_create_bin_receiving.txt
			   — see that file's own NOTES for the full reasoning. Was hard-stopping
			   here ("Already sent to Zoho Books") unless Missing_SKUs/Damage_SKUs
			   happened to be set, meaning an ordinary "a different line just became
			   ready" 2nd click did nothing. The per-line delta computation below
			   already generically sends whatever's newly accepted-but-not-yet-sent,
			   independent of Missing/Damage flags — the real no-op guard is
			   `newLineItemsUpd.size() == 0` below. */
			linkedPOsCheck = Purchase_Order[PO_No == r.PO_No];
			booksPOIdUpd = "";
			for each  lpoId in linkedPOsCheck
			{
				booksPOIdUpd = lpoId.Books_PO_ID + "";
			}
			/* CHANGED 2026-07-20, mirrored from receiving_create_bin_receiving.txt —
			   same fix as the replacement branch: sources Mode of Shipment from
			   THIS Receiving record's own actual Shipment_Mode_When_Received. */
			shipModeValUpd = "Air Freight";
			for each  rliModeUpd in r.Receiving_Line_Items
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
				response.put("status","error");
				response.put("message","Linked Purchase_Order has no Books_PO_ID — cannot resolve PO line_item_ids.");
				return response;
			}
			/* ARCHITECTURE CHANGE 2026-07-20, per user request — same reasoning as
			   the replacement branch above (see its own NOTES for the full
			   writeup): switched from "GET the existing receive, merge quantities,
			   PUT" to "POST a brand-new Purchase Receive against the SAME PO", to
			   sidestep the real, confirmed-live `36510 "bill(s) without
			   receive(s)"` rejection Books gives when trying to edit a receive
			   that's already been billed. This branch is already naturally
			   one-shot per missing item — a successful create clears
			   `Missing_SKUs` below, so a 2nd click can't reach this branch again
			   for the same item (falls through to the plain "already sent"
			   short-circuit instead). Deliberately does NOT overwrite this
			   record's own `Books_Receive_ID`/`No` — those keep pointing at its
			   original receive; the new receive created here exists in Books on
			   its own, tied to the same PO, not referenced back onto this record. */
			poRespUpd = invokeurl
			[
				url: "https://www.zohoapis.com/books/v3/purchaseorders/" + booksPOIdUpd + "?organization_id=" + orgId
				type: GET
				connection: "zoho_books"
			];
			if(poRespUpd.get("purchaseorder") == null)
			{
				response.put("status","error");
				response.put("message","Could not fetch linked Purchase Order.");
				return response;
			}
			poLineItemsUpd = poRespUpd.get("purchaseorder").get("line_items");
			vendorIdUpd = "";
			if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
			{
				vendorIdUpd = "2680178000049168001";
			}
			else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
			{
				vendorIdUpd = "2680178000002735078";
			}
			if(vendorIdUpd == "")
			{
				response.put("status","error");
				response.put("message","Unrecognized Supplier — cannot determine Zoho Books vendor.");
				return response;
			}
			/* ADDED 2026-07-27, mirrored from receiving_create_bin_receiving.txt — real
			   fix, see that file's own NOTES for the full writeup. A Fulfillment-EXC
			   replacement's Receiving line was already fully/correctly accepted at
			   fulfillment time, so the delta-against-Accepted_Qty math below always
			   computes 0 for it — any Acknowledged "QC Failure"/"Fulfillment EXC" RR
			   tied to this PO sends its own RR_Qty_Value directly instead. */
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
				if(fecOrigPOF == r.PO_No)
				{
					/* FIXED 2026-07-27, real bug found live — RR_SKU/RR_Qty_Value are
					   mirror fields that only ever get set on the AGGREGATE
					   Replacement_Request, confirmed blank on the supplier form.
					   Look up the aggregate by RR_No for the real values. */
					fecAggMatchF = Replacement_Request[RR_No == fecF.RR_No];
					for each  fecAggF in fecAggMatchF
					{
						fulfillmentExcQtyMap.put(fecAggF.RR_SKU + "", fecAggF.RR_Qty_Value);
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
				if(fecOrigPOT == r.PO_No)
				{
					fecAggMatchT = Replacement_Request[RR_No == fecT.RR_No];
					for each  fecAggT in fecAggMatchT
					{
						fulfillmentExcQtyMap.put(fecAggT.RR_SKU + "", fecAggT.RR_Qty_Value);
					}
				}
			}
			/* ADDED 2026-07-20, mirrored from receiving_create_bin_receiving.txt — DELTA
			   computation, needed now this branch also covers Damage (which already
			   had some qty sent on the original Create Receive click). Sending the
			   full current Accepted_Qty again would double-count against Books'
			   ordered qty (the real 36012 error hit earlier this session). Subtracts
			   whatever this SKU already logged in Partial_Receive_Timeline (r's own
			   subform, safe to read directly). Fulfillment-EXC SKUs skip this whole
			   computation, see fulfillmentExcQtyMap above. */
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
				for each  rli in r.Receiving_Line_Items
				{
					if((rli.SKU + "") == (poli.get("sku") + "") && rli.Accepted_Qty != null && rli.Accepted_Qty > 0)
					{
						priorSentQtyUpd = 0;
						for each  ptRowUpd in r.Partial_Receive_Timeline
						{
							if((ptRowUpd.SKU + "") == (rli.SKU + ""))
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
				sentDeltaMapUpd.put(poli.get("sku") + "", matchedNewQty);
				newEliMapUpd = Map();
				newEliMapUpd.put("line_item_id", poli.get("line_item_id") + "");
				newEliMapUpd.put("quantity", matchedNewQty);
				newLineItemsUpd.add(newEliMapUpd);
			}
			if(newLineItemsUpd.size() == 0)
			{
				response.put("status","error");
				response.put("message","No lines with Accepted Qty > 0 to send in the update.");
				return response;
			}
			shipNoValUpd = "";
			if(r.Shipments != null)
			{
				shipRecUpd = Shipments[ID == r.Shipments];
				if(shipRecUpd != null)
				{
					shipNoValUpd = shipRecUpd.Shipment_No + "";
				}
			}
			cfListUpd = List();
			cfUpd1 = Map();
			cfUpd1.put("label", "PO #");
			cfUpd1.put("value", r.PO_No);
			cfListUpd.add(cfUpd1);
			cfUpd2 = Map();
			cfUpd2.put("label", "Mode of Shipment");
			cfUpd2.put("value", shipModeValUpd);
			cfListUpd.add(cfUpd2);
			cfUpd3 = Map();
			cfUpd3.put("label", "Shipment #");
			cfUpd3.put("value", shipNoValUpd);
			cfListUpd.add(cfUpd3);
			newReceiveBodyUpd = Map();
			newReceiveBodyUpd.put("vendor_id", vendorIdUpd);
			newReceiveBodyUpd.put("date", zoho.currentdate.toString("yyyy-MM-dd"));
			newReceiveBodyUpd.put("line_items", newLineItemsUpd);
			newReceiveBodyUpd.put("custom_fields", cfListUpd);
			/* TODO 2026-07-27 — same deliberate non-implementation as the "Rep"
			   branch's own marker: once Shipments/Receiving get their own
			   Source_Module field, gate this whole Books POST on it being !=
			   "Fulfillment EXC". Not gated yet. */
			updateResp = invokeurl
			[
				url: "https://www.zohoapis.com/books/v3/purchasereceives?organization_id=" + orgId + "&purchaseorder_id=" + booksPOIdUpd
				type: POST
				parameters: newReceiveBodyUpd.toString()
				connection: "zoho_books"
				headers: {"Content-Type":"application/json"}
			];
			if(updateResp.get("purchasereceive") != null)
			{
				// ADDED 2026-07-30 — captured for SKU_Receive_History below, since
				// this branch deliberately never overwrites the record's own header
				// Books_Receive_ID/No (those still point at the ORIGINAL receive).
				newUpdReceiveId = updateResp.get("purchasereceive").get("receive_id") + "";
				newUpdReceiveNo = updateResp.get("purchasereceive").get("receive_number") + "";
				for each  lpoClear in linkedPOsCheck
				{
					/* CHANGED 2026-07-20 — clears whichever flag(s) were set. */
					lpoClear.Missing_SKUs = "";
					lpoClear.Damage_SKUs = "";
					lpoClear.Completed_On = zoho.currenttime;
					/* ADDED 2026-07-20 — same PO Completion Check as the main CREATE
					   branch, see that block's own NOTES. This is the branch that
					   actually closes the loop for a real recycle. */
					if(lpoClear.PO_Status != "Completed")
					{
						allLinesFullUpd = true;
						for each  poLnCompUpd in lpoClear.PO_Line_Items
						{
							skuAcceptedSumUpd = 0;
							for each  rliCompUpd in r.Receiving_Line_Items
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
								lpoClear.PO_Status = "Completed";
							}
						}
					}
				}
				// ADDED 2026-07-30, per user request — mirrors the main CREATE branch's
				// own per-line Pre_Order_FF completeness flip (see that block's own
				// comment for the full reasoning). Real gap found live: this Upd/delta
				// branch never had it, so a line that only reaches Accepted==Expected
				// via THIS branch (not the original CREATE click — e.g. "item 2 became
				// ready the next day" now routes through here since the isReplacementUpdate
				// gate was removed the same day) stayed stuck on Pre_Order_Status=
				// "Pending" forever, even though its Books receive genuinely succeeded.
				// Confirmed live on SO-16335/Aelornyrae — needed a manual patch before
				// this fix existed.
				for each  rliPoStatUpd in r.Receiving_Line_Items
				{
					rliPoStatCompleteUpd = (ifnull(rliPoStatUpd.Accepted_Qty,0) == ifnull(rliPoStatUpd.Expected_Qty,0)) && ifnull(rliPoStatUpd.Damage_Qty,0) == 0 && ifnull(rliPoStatUpd.Missing_Qty,0) == 0 && ifnull(rliPoStatUpd.Expected_Qty,0) > 0;
					if(rliPoStatCompleteUpd == true)
					{
						for each  pofRecStatUpd in Pre_Order_FF[SO == r.SO_No && SKU == rliPoStatUpd.SKU && Pre_Order_Status != "Received"]
						{
							pofRecStatUpd.Pre_Order_Status = "Received";
						}
					}
				}
				closedSourceExcNoUpd = "";
				closedRRNoUpd = "";
				closedSourceModuleUpd = "";
				/* FIXED 2026-07-20 — matchOrigPOUpdF/T used to read
				   rrcUpdF/T.Replacement_Summary, a subform off a criteria-queried
				   record — the same confirmed-unreliable platform limitation already
				   fixed in the trace-back block above (see that block's own NOTES).
				   Replaced with the same header-field workaround: RR's own
				   Source_Exception_No -> Exceptions.PO_No, both plain field reads. */
				if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
				{
					supPOsClearF = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == r.PO_No];
					for each  spClearF in supPOsClearF
					{
						spClearF.Missing_SKUs_Supplier1 = "";
						spClearF.Damage_SKUs_Supplier1 = "";
					}
					/* CHANGED 2026-07-20 — now closes both Missing AND Damage RRs.
					   CHANGED 2026-07-27, per user's Fulfillment EXC ask — also closes
					   "QC Failure" RRs, see receiving_create_bin_receiving.txt's own
					   row for the full real-bug writeup (this exact filter silently
					   excluded them, RR_Status/Exception_Control1.Status never
					   advanced on RR-00004/EXC-FF-00004 despite Books succeeding). */
					rrToCloseUpdF = Fenteng_Lighting_Replacement_Request[(Source_Type == "Receiving Missing" || Source_Type == "Receiving Damage" || Source_Type == "QC Failure") && RR_Status == "Acknowledged"];
					for each  rrcUpdF in rrToCloseUpdF
					{
						matchOrigPOUpdF = "";
						matchModuleUpdF = rrcUpdF.Source_Module;
						excCheckUpdF = Exceptions[Exception_No == rrcUpdF.Source_Exception_No];
						for each  ecUpdF in excCheckUpdF
						{
							matchOrigPOUpdF = ecUpdF.PO_No;
						}
						/* ADDED 2026-07-27 — same Exception_Control1 fallback as every
						   other trace-back this session, see clone_shipment_for_
						   replacement.txt's own NOTES for the full reasoning. */
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
						if(matchOrigPOUpdF == r.PO_No)
						{
							rrcUpdF.RR_Status = "Completed";
							closedSourceExcNoUpd = rrcUpdF.Source_Exception_No;
							closedRRNoUpd = rrcUpdF.RR_No;
							closedSourceModuleUpd = matchModuleUpdF;
						}
					}
				}
				else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
				{
					supPOsClearT = Tony_Fan_Purchase_Order[PO_No_Supplier2 == r.PO_No];
					for each  spClearT in supPOsClearT
					{
						spClearT.Missing_SKUs_Supplier2 = "";
						spClearT.Damage_SKUs_Supplier2 = "";
					}
					rrToCloseUpdT = Tony_Fan_Replacement_Request[(Source_Type == "Receiving Missing" || Source_Type == "Receiving Damage" || Source_Type == "QC Failure") && RR_Status == "Acknowledged"];
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
						if(matchOrigPOUpdT == r.PO_No)
						{
							rrcUpdT.RR_Status = "Completed";
							closedSourceExcNoUpd = rrcUpdT.Source_Exception_No;
							closedRRNoUpd = rrcUpdT.RR_No;
							closedSourceModuleUpd = matchModuleUpdT;
						}
					}
				}
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
						/* BRANCHED 2026-07-27, mirrors receiving_create_bin_receiving.txt's
						   own same-day branch. */
						if(closedSourceModuleUpd == "Fulfillment EXC")
						{
							ecToCompleteUpd = Exception_Control1[Exception_Number == closedSourceExcNoUpd];
							for each  ecCompleteUpd in ecToCompleteUpd
							{
								if(ecCompleteUpd.Status != "Completed")
								{
									ecCompleteUpd.Status = "Completed";
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
									exResolveUpd.Exception_Status = "Resolved";
								}
							}
						}
					}
				}
				freshRecvUpd = Receiving[ID == receivingId.toLong()];
				for each  fruUpd in freshRecvUpd
				{
					// ADDED 2026-07-30 — see receiving_create_bin_receiving.txt's own
					// NOTES for the full reasoning (SKU_Receive_History, append-only
					// per-SKU Books receive-event log). Item_QTY here = deltaSentTL,
					// same delta already logged into Partial_Receive_Timeline below.
					skuHistCountMapUpd = Map();
					for each  existSKURowUpd in fruUpd.SKU_Receive_History
					{
						skuHistKeyUpd = existSKURowUpd.SKU + "";
						if(skuHistCountMapUpd.containKey(skuHistKeyUpd))
						{
							skuHistCountMapUpd.put(skuHistKeyUpd, skuHistCountMapUpd.get(skuHistKeyUpd) + 1);
						}
						else
						{
							skuHistCountMapUpd.put(skuHistKeyUpd, 1);
						}
					}
					for each  rliUpdTL in r.Receiving_Line_Items
					{
						/* CHANGED 2026-07-20, mirrored from receiving_create_bin_receiving.txt
						   — logs the DELTA actually sent (sentDeltaMapUpd), not the
						   line's full current Accepted_Qty, since this subform is
						   the ledger the delta computation itself reads on the NEXT
						   recycle click. */
						deltaSentTL = sentDeltaMapUpd.get(rliUpdTL.SKU + "");
						if(deltaSentTL != null && deltaSentTL > 0)
						{
							newPRTUpd = Receiving.Partial_Receive_Timeline();
							newPRTUpd.RR_No = fruUpd.Receive_No1;
							newPRTUpd.Supplier = r.Supplier;
							newPRTUpd.SKU = rliUpdTL.SKU;
							newPRTUpd.Item = rliUpdTL.Item_Name;
							newPRTUpd.Quantity = deltaSentTL + "";
							newPRTUpd.Shipment_Mode = rliUpdTL.Shipment_Mode_When_Received;
							newPRTUpd.Date_Time = zoho.currenttime;
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
							skuHistCountMapUpd.put(skuHistKeyInsUpd, nextSkuHistCountUpd);
							newSRHUpd = Receiving.SKU_Receive_History();
							newSRHUpd.Item = rliUpdTL.Item_Name;
							newSRHUpd.SKU = rliUpdTL.SKU;
							newSRHUpd.Item_QTY = deltaSentTL;
							newSRHUpd.Receive_Count = nextSkuHistCountUpd;
							newSRHUpd.Books_Receive_No = newUpdReceiveNo;
							newSRHUpd.Books_Receive_ID = newUpdReceiveId;
							fruUpd.SKU_Receive_History.insert(newSRHUpd);
						}
					}
				}
				response.put("status","success");
				response.put("message","New Books receive created for the replacement item(s) against PO " + r.PO_No + " — resolved.");
			}
			else
			{
				response.put("status","error");
				response.put("message","Failed to create new Books receive for the replacement item(s). Raw: " + updateResp);
			}
			return response;
		}

		lineCountCheck = 0;
		for each  chkLn in r.Receiving_Line_Items
		{
			lineCountCheck = lineCountCheck + 1;
		}
		if(lineCountCheck == 0)
		{
			response.put("status","error");
			response.put("message","No line items to receive.");
			return response;
		}

		vendorId = "";
		if(r.Supplier == "Fenteng" || r.Supplier.contains("Fenteng"))
		{
			vendorId = "2680178000049168001";
		}
		else if(r.Supplier == "Tony" || r.Supplier.contains("Tony"))
		{
			vendorId = "2680178000002735078";
		}
		if(vendorId == "")
		{
			response.put("status","error");
			response.put("message","Unrecognized Supplier — cannot determine Zoho Books vendor.");
			return response;
		}

		aggPORecs = Purchase_Order[PO_No == r.PO_No];
		booksPOId = "";
		for each  apo in aggPORecs
		{
			booksPOId = apo.Books_PO_ID + "";
			break;
		}
		shipModeVal = "Air Freight";
		for each  rliMode in r.Receiving_Line_Items
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
			response.put("status","error");
			response.put("message","Linked Purchase_Order has no Books_PO_ID yet — acknowledge the supplier PO first.");
			return response;
		}

		shipNoVal = "";
		if(r.Shipments != null)
		{
			shipRec = Shipments[ID == r.Shipments];
			if(shipRec != null)
			{
				shipNoVal = shipRec.Shipment_No + "";
			}
		}

		booksPOResp = invokeurl
		[
			url: "https://www.zohoapis.com/books/v3/purchaseorders/" + booksPOId + "?organization_id=" + orgId
			type: GET
			connection: "zoho_books"
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
				url: binUrlRecv
				type: GET
				connection: "zoho_books"
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
		for each  rli in r.Receiving_Line_Items
		{
			if(rli.Accepted_Qty == null || rli.Accepted_Qty == 0)
			{
				continue;
			}
			matchedLineItemId = "";
			matchedItemId = "";
			for each  bpoLi in booksPOLineItems
			{
				if((bpoLi.get("sku") + "") == (rli.SKU + ""))
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
			lineMap.put("line_item_id", matchedLineItemId);
			lineMap.put("quantity", rli.Accepted_Qty);
			lineMap.put("warehouse_id", "2680178000042173149");
			itemIsBinTracked = false;
			if(matchedItemId != "")
			{
				itemDetailResp = invokeurl
				[
					url: "https://www.zohoapis.com/books/v3/items/" + matchedItemId + "?organization_id=" + orgId
					type: GET
					connection: "zoho_books"
				];
				if(itemDetailResp.get("item") != null)
				{
					itemWarehouses = itemDetailResp.get("item").get("warehouses");
					if(itemWarehouses != null)
					{
						for each  iwh in itemWarehouses
						{
							if((iwh.get("warehouse_id") + "") == "2680178000042173149" && (iwh.get("is_storage_location_enabled") == true || (iwh.get("is_storage_location_enabled") + "") == "true"))
							{
								itemIsBinTracked = true;
							}
						}
					}
				}
			}
			if(itemIsBinTracked == true && rli.Bin_location != null && rli.Bin_location != "")
			{
				matchedStorageId = "";
				for each  bl in binLocsRecv
				{
					if((bl.get("name") + "") == (rli.Bin_location + ""))
					{
						matchedStorageId = bl.get("storage_id") + "";
					}
				}
				if(matchedStorageId != "")
				{
					storageRow = Map();
					storageRow.put("storage_id", matchedStorageId);
					storageRow.put("in_quantity", rli.Accepted_Qty);
					storageList = List();
					storageList.add(storageRow);
					lineMap.put("storages", storageList);
				}
			}
			receiveLineItems.add(lineMap);
		}

		if(receiveLineItems.size() == 0)
		{
			response.put("status","error");
			response.put("message","No lines with Accepted Qty > 0 matched the linked Books Purchase Order.");
			return response;
		}

		cfList = List();
		cf1 = Map();
		cf1.put("label", "Shipment #");
		cf1.put("value", shipNoVal);
		cfList.add(cf1);
		cf2 = Map();
		cf2.put("label", "PO #");
		cf2.put("value", r.PO_No);
		cfList.add(cf2);
		cf3 = Map();
		cf3.put("label", "Mode of Shipment");
		cf3.put("value", shipModeVal);
		cfList.add(cf3);

		receiveBody = Map();
		receiveBody.put("vendor_id", vendorId);
		receiveBody.put("date", zoho.currentdate.toString("yyyy-MM-dd"));
		receiveBody.put("line_items", receiveLineItems);
		receiveBody.put("custom_fields", cfList);

		createRespRecv = invokeurl
		[
			url: "https://www.zohoapis.com/books/v3/purchasereceives?organization_id=" + orgId + "&purchaseorder_id=" + booksPOId
			type: POST
			parameters: receiveBody.toString()
			connection: "zoho_books"
			headers: {"Content-Type":"application/json"}
		];

		if(createRespRecv.get("purchasereceive") != null)
		{
			/* FIXED FOR REAL 2026-07-20 — ROOT CAUSE of the whole "null" saga this
			   session: these key names were simply wrong. Confirmed via a real raw
			   Books response the user captured (a genuinely successful create,
			   PR-06372) — Books' actual keys are `receive_id`/`receive_number`, NOT
			   `purchasereceive_id`/`purchasereceive_number`. The old keys silently
			   returned null on every single call (Deluge Map.get() on a missing key
			   returns null, `null + ""` = the literal string "null"), which is
			   exactly what kept getting written into Books_Receive_ID/No — no
			   timing lag, no platform quirk, just a wrong key name that never once
			   threw an error because the "purchasereceive" object itself genuinely
			   was non-null every time. */
			newReceiveId = createRespRecv.get("purchasereceive").get("receive_id") + "";
			newReceiveNo = createRespRecv.get("purchasereceive").get("receive_number") + "";
			/* DIAGNOSTIC GUARD 2026-07-20 — RCV-00001 got literal string "null"
			   written into Books_Receive_ID/No despite this top-level "purchasereceive
			   != null" check passing, meaning Books returned SOMETHING under that key
			   but not the expected id/number fields. Refuse to write garbage into the
			   record this time — surface the raw response instead so the real shape
			   is visible, rather than corrupting the field again. */
			if(newReceiveId == "" || newReceiveId == "null" || newReceiveNo == "" || newReceiveNo == "null")
			{
				response.put("status","error");
				response.put("message","Books returned a purchasereceive object but id/number came back blank. Raw: " + createRespRecv);
				return response;
			}
			freshRecv = Receiving[ID == receivingId.toLong()];
			for each  fr in freshRecv
			{
				fr.Books_Receive_ID = newReceiveId;
				fr.Books_Receive_No = newReceiveNo;
				// ADDED 2026-07-30 — SKU_Receive_History, append-only per-SKU Books
				// receive-event log (see receiving_create_bin_receiving.txt's own
				// NOTES for the full reasoning). Item_QTY = qty sent this event.
				skuHistCountMap = Map();
				for each  existSKURow in fr.SKU_Receive_History
				{
					skuHistKey = existSKURow.SKU + "";
					if(skuHistCountMap.containKey(skuHistKey))
					{
						skuHistCountMap.put(skuHistKey, skuHistCountMap.get(skuHistKey) + 1);
					}
					else
					{
						skuHistCountMap.put(skuHistKey, 1);
					}
				}
				for each  rliTL in r.Receiving_Line_Items
				{
					if(rliTL.Accepted_Qty != null && rliTL.Accepted_Qty > 0)
					{
						newPRT = Receiving.Partial_Receive_Timeline();
						newPRT.RR_No = fr.Receive_No1;
						newPRT.Supplier = r.Supplier;
						newPRT.SKU = rliTL.SKU;
						newPRT.Item = rliTL.Item_Name;
						newPRT.Quantity = rliTL.Accepted_Qty + "";
						newPRT.Shipment_Mode = rliTL.Shipment_Mode_When_Received;
						newPRT.Date_Time = zoho.currenttime;
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
						skuHistCountMap.put(skuHistKeyIns, nextSkuHistCount);
						newSRH = Receiving.SKU_Receive_History();
						newSRH.Item = rliTL.Item_Name;
						newSRH.SKU = rliTL.SKU;
						newSRH.Item_QTY = rliTL.Accepted_Qty;
						newSRH.Receive_Count = nextSkuHistCount;
						newSRH.Books_Receive_No = newReceiveNo;
						newSRH.Books_Receive_ID = newReceiveId;
						fr.SKU_Receive_History.insert(newSRH);
					}
				}
			}

			// ADDED 2026-07-29, mirrored from receiving_create_bin_receiving.txt —
			// pushes the real bin location used at receiving time into
			// Sales_Order_Fulfillment (Item_Details1 subform) + Pre_Order_FF
			// (header field), see that file's own NOTES for the full reasoning.
			// Uses `r.` instead of `input.`, same convention as the rest of this
			// widget mirror. FIXED 2026-07-29 — see that file's matching NOTES:
			// PR_No/PR match criteria never fires (both forms genuinely have it
			// blank on real records) — switched to SO_No/SO + SKU.
			for each  rliBin in r.Receiving_Line_Items
			{
				if(rliBin.Bin_location == null || rliBin.Bin_location == "")
				{
					continue;
				}
				for each  sofRec in Sales_Order_Fulfillment[SO_No == r.SO_No]
				{
					sofRowMapsBin = List();
					sofRowMatchedBin = false;
					for each  sofRowBin in sofRec.Item_Details1
					{
						sofRm = Map();
						sofRm.put("Item", sofRowBin.Item);
						sofRm.put("SKU", sofRowBin.SKU);
						sofRm.put("Quantity", sofRowBin.Quantity);
						if((sofRowBin.SKU + "") == (rliBin.SKU + ""))
						{
							sofRm.put("Bin_Location", rliBin.Bin_location + "");
							sofRowMatchedBin = true;
						}
						else
						{
							sofRm.put("Bin_Location", sofRowBin.Bin_Location);
						}
						sofRowMapsBin.add(sofRm);
					}
					if(sofRowMatchedBin == true)
					{
						sofRec.Item_Details1.clear();
						for each  sofRmRow in sofRowMapsBin
						{
							newSofBinRow = Sales_Order_Fulfillment.Item_Details1();
							newSofBinRow.Item = sofRmRow.get("Item");
							newSofBinRow.SKU = sofRmRow.get("SKU");
							newSofBinRow.Quantity = sofRmRow.get("Quantity");
							newSofBinRow.Bin_Location = sofRmRow.get("Bin_Location");
							sofRec.Item_Details1.insert(newSofBinRow);
						}
					}
				}
				for each  pofRecBin in Pre_Order_FF[SO == r.SO_No && SKU == rliBin.SKU]
				{
					pofRecBin.Bin_Location = rliBin.Bin_location + "";
				}
			}

			// ADDED 2026-07-30, mirrored from receiving_create_bin_receiving.txt —
			// per-line completeness flip on Pre_Order_FF, see that file's own NOTES
			// for the full reasoning. Uses `r.` instead of `input.`, same convention
			// as the rest of this widget mirror.
			for each  rliPoStat in r.Receiving_Line_Items
			{
				rliPoStatComplete = (ifnull(rliPoStat.Accepted_Qty,0) == ifnull(rliPoStat.Expected_Qty,0)) && ifnull(rliPoStat.Damage_Qty,0) == 0 && ifnull(rliPoStat.Missing_Qty,0) == 0 && ifnull(rliPoStat.Expected_Qty,0) > 0;
				if(rliPoStatComplete == true)
				{
					for each  pofRecStat in Pre_Order_FF[SO == r.SO_No && SKU == rliPoStat.SKU && Pre_Order_Status != "Received"]
					{
						pofRecStat.Pre_Order_Status = "Received";
					}
				}
			}

			for each  apoComplete in aggPORecs
			{
				apoComplete.Completed_On = zoho.currenttime;
				/* ADDED 2026-07-20, mirrored from receiving_create_bin_receiving.txt —
				   real PO-completion gate, see that file's own NOTES for the full
				   reasoning (PO_Status="Completed" was checked everywhere, set
				   nowhere). */
				if(apoComplete.PO_Status != "Completed")
				{
					allLinesFullComp = true;
					for each  poLnComp in apoComplete.PO_Line_Items
					{
						skuAcceptedSumComp = 0;
						for each  rliComp in r.Receiving_Line_Items
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
							apoComplete.PO_Status = "Completed";
						}
					}
				}
			}
			if(shipRec != null)
			{
				shipRec.Arrival_Date = zoho.currentdate;
				shipRec.Receiving_Record_Created = true;
			}
			response.put("status","success");
			response.put("message","Sent to Zoho Books — " + newReceiveNo);
			response.put("receiveNo", newReceiveNo);
		}
		else
		{
			/* DIAGNOSTIC 2026-07-20 — need the actual Books rejection reason, not
			   just "failed". Surfacing the raw response directly in the alert. */
			response.put("status","error");
			response.put("message","Failed to create Books Purchase Receive. Raw: " + createRespRecv);
		}
	}
	if(found == false)
	{
		response.put("status","error");
		response.put("message","Receiving record not found: " + receivingId);
	}
	return response;
}

````
