---
title: "purchase_order_scripts"
source_file: "purchase_order_scripts.txt"
category: "Procurement/Purchase Order/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 894
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - procurement
  - purchase-order
  - purchase-request
  - qc
  - supplier-portal
  - zoho-books
---

# purchase_order_scripts

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Procurement/Purchase Order/Deluge`
> - **Source File:** `purchase_order_scripts.txt`
> - **Lines of Code:** 894
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#procurement`, `#purchase-order`, `#purchase-request`, `#qc`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
﻿== Purchase Order forms (new, 2026-07-01) ==
== Supplier_2: Tony_Fan_Purchase_Order — all fields read-only ==
== Supplier_1: Fenteng_Lighting_Purchase_Order — all fields read-only ==
== ADDED 2026-07-03, then MOVED OUT 2026-07-16: Acknowledged_PO_Supplier1/2 briefly also
   created/updated a real Zoho Books Purchase Order + Shipments/Receiving here (moved in
   from pr_to_po_grouping.txt's PR_Approved per user request at the time). Per user
   request 2026-07-16 ("move the function of acknowledge - going to zoho books, going to
   shipment and receiving - to PR_Approved. acknowledge only function now: is to
   populate ETD and ETA in shipment after acknowledge"), Books PO sync + normal-PO
   Shipment/Receiving creation moved BACK to PR_Approved (pr_to_po_grouping.txt Actions
   2/3) — see that file's own header note. Acknowledged_PO_Supplier1/2 now only stamps
   PO_Status/Acknowledge_On bookkeeping, writes ETD/ETA onto the already-existing
   Shipment (mandatory in the widget path — see acknowledge_po_custom_api.txt — not
   enforceable in this native Report Action Item path, no input-collection mechanism
   exists for Action Items), and keeps a SLIM Shipment+Receiving-only copy gated to
   `RR_Reference_No`, for replacement POs (approve_rr_supplier.txt) specifically — those
   never flow through PR_Approved at all. Books_PO_ID/Books_PO_No fields stay on
   Purchase_Order (still written by PR_Approved now, not here).

====================================================
WORKFLOW SETUP — Disable_All_Fields_PO_Supplier2
  Form: Tony_Fan_Purchase_Order
  Trigger: Created or Edited > Load of form
  Action: Execute script (paste below)
====================================================

disable PO_No_Supplier2;
disable Total_PO_Value_Supplier2;
disable Total_Lines_Supplier2;
disable Mixed_Shipping_Supplier2;
disable Followed_Recommendation_Supplier2;
disable Supplier_Load_At_PO_Supplier2;
disable PO_Date_Supplier2;
disable Is_Locked_Supplier2;
disable Notes_Supplier2;
disable Override_Reason_Supplier2;
disable PO_Status_Supplier2;
disable Sent_On_Supplier2;
disable Acknowledge_On_Supplier2;
disable Completed_On_Supplier2;
disable PO_Line_Items_Supplier2.Supplier_Supplier2;
disable PO_Line_Items_Supplier2.PR_No_Supplier2;
disable PO_Line_Items_Supplier2.Single_Line_Supplier2;
disable PO_Line_Items_Supplier2.Item_Supplier2;
disable PO_Line_Items_Supplier2.SKU_Supplier2;
disable PO_Line_Items_Supplier2.QTY_Supplier2;
disable PO_Line_Items_Supplier2.Unit_Supplier2;
disable PO_Line_Items_Supplier2.Final_Price_Supplier2;
disable PO_Line_Items_Supplier2.Item_Price_Supplier2;
disable PO_Line_Items_Supplier2.Line_Total_Supplier2;
disable PO_Line_Items_Supplier2.Target_Delivery_Supplier2;
disable PO_Line_Items_Supplier2.supplier_target_date_Supplier2;
disable PO_Line_Items_Supplier2.Shipping_Mode_Supplier2;
disable PO_Line_Items_Supplier2.Delay_Status_Supplier2;
disable PO_Line_Items_Supplier2.Followed_Recommendation_Supplier2;
disable PO_Line_Items_Supplier2.Override_Reason_Supplier2;

====================================================
WORKFLOW SETUP — Disable_All_Fields_PO_Supplier1
  Form: Fenteng_Lighting_Purchase_Order
  Trigger: Created or Edited > Load of form
  Action: Execute script (paste below)
====================================================

disable PO_No_Supplier1;
disable Total_PO_Value_Supplier1;
disable Total_Lines_Supplier1;
disable Mixed_Shipping_Supplier1;
disable Followed_Recommendation_Supplier1;
disable Supplier_Load_At_PO_Supplier1;
disable PO_Date_Supplier1;
disable Is_Locked_Supplier1;
disable Notes_Supplier1;
disable Override_Reason_Supplier1;
disable PO_Status_Supplier1;
disable Sent_On_Supplier1;
disable Acknowledge_On_Supplier1;
disable Completed_On_Supplier1;
disable PO_Line_Items_Supplier1.Supplier_Supplier1;
disable PO_Line_Items_Supplier1.PR_No_Supplier1;
disable PO_Line_Items_Supplier1.Single_Line_Supplier1;
disable PO_Line_Items_Supplier1.Item_Supplier1;
disable PO_Line_Items_Supplier1.SKU_Supplier1;
disable PO_Line_Items_Supplier1.QTY_Supplier1;
disable PO_Line_Items_Supplier1.Unit_Supplier1;
disable PO_Line_Items_Supplier1.Final_Price_Supplier1;
disable PO_Line_Items_Supplier1.Item_Price_Supplier1;
disable PO_Line_Items_Supplier1.Line_Total_Supplier1;
disable PO_Line_Items_Supplier1.Target_Delivery_Supplier1;
disable PO_Line_Items_Supplier1.supplier_target_date_Supplier1;
disable PO_Line_Items_Supplier1.Shipping_Mode_Supplier1;
disable PO_Line_Items_Supplier1.Delay_Status_Supplier1;
disable PO_Line_Items_Supplier1.Followed_Recommendation_Supplier1;
disable PO_Line_Items_Supplier1.Override_Reason_Supplier1;

====================================================
NOTES:
- ADDED 2026-07-08, per user request: when the PO being acknowledged is a REPLACEMENT
  PO (created by approve_rr_supplier.txt's Damage/QC/Complaint branch — always has
  `RR_Reference_No`/`RR_Reference_No_Supplier1/2` set), Acknowledge now skips the
  Books-PO-create/sync section entirely for that PO — wrapped the whole Books block
  (shipModeBooksF/T computation through the create-or-update-PO invokeurl calls) in
  `if(apoF/T.RR_Reference_No == null || apoF/T.RR_Reference_No == "") { ... }`. The
  Creator-side half (PO_Status->Confirmed, Sent_On/Acknowledge_On stamps, Shipments +
  Receiving creation) still runs unconditionally for every PO, replacement or not —
  only the actual Books API calls are skipped. Per user: "purely creator only" for
  replacement POs at Acknowledge time, "but still process like normal" otherwise —
  this is that exact split. UNTESTED.
- ADDED 2026-07-08: `Acknowledged_PO_Supplier1/2`'s per-line Shipment/Receiving
  `Sales_Owner` (and Shipment's `Shipment_Days`) lookup via `Purchase_Request1[PR_No ==
  poLnF/T.PR_No]` returned blank for a REPLACEMENT PO created by `approve_rr_supplier.txt`
  (Damage/QC/Complaint branch) — those PO_Line_Items rows have no PR_No at all, since
  that path deliberately skips PR1. FIXED: each of the 4 spots (Shipment + Receiving,
  x2 for Fenteng/Tony) now guards on `poLnF/T.PR_No` being non-blank before doing the
  PR1 lookup; when blank, falls back to `apoF/T.Sales_Owner` (the aggregate PO's own
  Sales_Owner field — now populated at creation time for replacement POs too, see
  approve_rr_supplier.txt). `Shipment_Days` has NO fallback source for a PR-less line
  (nothing else in this app tracks lead-time for a bare replacement item) — stays
  blank/0 for these lines rather than fabricating a value; flag if this needs a real
  source later. UNTESTED.
- Trigger set to "Created or Edited > Load of form" so the form is read-only in every
  context (view, edit, right after create) — not just on Edited. Change to
  "Edited > Load of form" only if the form should still be fully editable at create time.
- Sections (PO_Summary_Supplier1/2, Status_Audit_Supplier1/2) are layout containers, not
  fields — nothing to disable there.
- ADDED 2026-07-03: `disable PO_Line_Items_Supplier1/2.Followed_Recommendation_Supplier1/2;`
  and `disable PO_Line_Items_Supplier1/2.Override_Reason_Supplier1/2;` — these two moved
  from header fields into the PO_Line_Items_Supplier1/2 subform (see pr_to_po_grouping.txt
  NOTES), so they need the subform-column disable pattern like every other grid column
  here, not the plain `disable FieldName;` pattern used for header fields.
  TODO once user deletes the old header-level `Followed_Recommendation_Supplier1/2`/
  `Override_Reason_Supplier1/2` fields (as planned): remove the now-stale
  `disable Followed_Recommendation_Supplier1/2;`/`disable Override_Reason_Supplier1/2;`
  lines above (still present, referencing header fields) — leaving them in after the
  fields are actually deleted will error "does not exist".
- Grid columns use `disable GridName.ColumnName;` — same pattern already proven in this
  codebase for subform/grid columns (Disable_Item_Field_Edit_Supplier in
  finalization_scripts.txt: `disable Supplier_quotes.SupplierName;` etc.)
- Field list taken directly from both PO form definitions — 18 top level fields + 13
  grid columns each, all covered. Fenteng (Supplier1) form is identical structure to
  Tony (Supplier2), just the suffix swapped.
- FIXED 2026-07-15 — same class of drift already flagged above for
  Followed_Recommendation/Override_Reason header fields, now confirmed for a second set:
  `SO_No_Supplier1/2`, `Customer_Supplier1/2`, `Customer_Type_Supplier1/2`,
  `Sales_Owner_Supplier1/2` were removed from BOTH supplier PO forms back on 2026-07-03
  (see this file's own later NOTES + CLAUDE.md's Purchase Request System section — "suppliers
  shouldn't see internal sales/customer/SO info") but this Disable block never got updated
  to match at the time. Surfaced live 2026-07-15 when Supplier1's block was re-pasted for
  the Item_Price_Supplier1 addition — errored "does not exist in 'input'" — user confirmed
  live and removed the Supplier1 lines; Supplier2's identical stale lines removed here too
  pre-emptively (never independently re-confirmed live, but same field-removal decision
  covered both forms per CLAUDE.md, and leaving them in would almost certainly error the
  same way on next paste). Both Disable_All_Fields_PO_Supplier1/2 blocks above now match
  what's actually live on each form.
====================================================

====================================================
WORKFLOW SETUP — Acknowledged_PO_Supplier1 (added 2026-07-02)
  Form: Fenteng_Lighting_Purchase_Order
  Location: On "Fenteng Lighting Purchase Order" report
  Trigger: On click of action item
  Action name: Acknowledged_PO_Supplier1
  Report Action Item condition (added 2026-07-02, so the button disappears/disables
  once already acknowledged, matching the Submit Response button pattern elsewhere in
  this project):
    PO_Status_Supplier1 != "Confirmed"
====================================================

/* SLIMMED 2026-07-16, per user ("acknowledge only function now: is to populate ETD
   and ETA in shipment after acknowledge") — Shipments/Receiving creation and the Books
   PO sync moved OUT of here and INTO PR_Approved (pr_to_po_grouping.txt Actions 2/3),
   so they fire at PR-approval time instead of waiting on the supplier. This action now
   only: (1) stamps Acknowledge_On/PO_Status bookkeeping (both here and on the
   aggregate PO), (2) writes ETD/ETA onto the already-existing linked Shipment — see
   NOTES for why this native Report Action Item path can't actually enforce "mandatory"
   the way the widget's Acknowledge modal does, (3) keeps a SLIM Shipment+Receiving-only
   copy gated to RR_Reference_No, for replacement POs specifically — those never flow
   through PR_Approved at all (created directly by approve_rr_supplier.txt, bypassing
   PR1/Link_PO_No), so nothing else would ever build their Shipment/Receiving. Books
   stays skipped for replacement POs, same as before this change. */
input.Acknowledge_On_Supplier1 = zoho.currenttime;
input.PO_Status_Supplier1 = "Confirmed";
aggPORecsF = Purchase_Order[PO_No == input.PO_No_Supplier1];
for each  apoF in aggPORecsF
{
	apoF.Acknowledge_On = zoho.currenttime;
	apoF.PO_Status = "Confirmed";
	soNoTextF = apoF.SO_No.Sales_Order_Number;
	matchingShipNoF = "";
	candidateShipmentsF = Shipments[PO_No == apoF.ID && Shipment_Status == "Pending"];
	for each  shF in candidateShipmentsF
	{
		matchingShipNoF = shF.Shipment_No;
	}
	if(matchingShipNoF != "")
	{
		targetShipsF = Shipments[Shipment_No == matchingShipNoF];
		for each  tshF in targetShipsF
		{
			targetShipF = tshF;
		}
	}
	/* Normal (non-replacement) POs: Shipment was already created by PR_Approved, so
	   this native path has nothing to write ETD/ETA onto without its own input source —
	   see the file-level NOTES above. Replacement POs still find-or-create below. */
	if(apoF.RR_Reference_No != null && apoF.RR_Reference_No != "")
	{
		if(matchingShipNoF == "")
		{
			maxShipNumF = 0;
			existingShipmentsF = Shipments[ID != 0];
			for each  shF in existingShipmentsF
			{
				shipNoStrF = shF.Shipment_No;
				if(shipNoStrF != null && shipNoStrF != "")
				{
					shipNumPartF = shipNoStrF.removeFirstOccurence("SHP-");
					shipNumF = shipNumPartF.toLong();
					if(shipNumF > maxShipNumF)
					{
						maxShipNumF = shipNumF;
					}
				}
			}
			newShipNumF = maxShipNumF + 1;
			if(newShipNumF < 10)
			{
				newShipNoF = "SHP-0000" + newShipNumF;
			}
			else if(newShipNumF < 100)
			{
				newShipNoF = "SHP-000" + newShipNumF;
			}
			else if(newShipNumF < 1000)
			{
				newShipNoF = "SHP-00" + newShipNumF;
			}
			else if(newShipNumF < 10000)
			{
				newShipNoF = "SHP-0" + newShipNumF;
			}
			else
			{
				newShipNoF = "SHP-" + newShipNumF;
			}
			newShipIDF = insert into Shipments
			[
				Shipment_No=newShipNoF
				PO_No=apoF.ID
				Sales_Order=soNoTextF
				Customer=apoF.Customer
				Supplier="Fenteng"
				Shipment_Status="Pending"
			];
			targetShipF = Shipments[ID == newShipIDF];
		}
		for each  poLnF in apoF.PO_Line_Items
		{
			targetShipF.Required_Days_Lead=poLnF.Required_Days_Lead;
			targetShipF.Remaining_Days=poLnF.Remaining_Days;
			targetShipF.Target_Date=poLnF.Target_Delivery;
			targetShipF.Supplier_Target_Date=poLnF.supplier_target_date;
			targetShipF.Production_Date=poLnF.Production_Date;
			if(poLnF.PR_No != null && poLnF.PR_No != "")
			{
				prLineF = Purchase_Request1[PR_No == poLnF.PR_No];
				targetShipF.Shipment_Days=prLineF.Shipment_Days;
				targetShipF.Sales_Owner=prLineF.Sales_Owner;
			}
			else
			{
				targetShipF.Sales_Owner=apoF.Sales_Owner;
			}
			shipLineExistsF = false;
			for each  existingShipLnF in targetShipF.PO_Shipments
			{
				if(existingShipLnF.PR_No == poLnF.PR_No)
				{
					shipLineExistsF = true;
				}
			}
			if(shipLineExistsF == false)
			{
				newShipLineF = Shipments.PO_Shipments();
				newShipLineF.PR_No=poLnF.PR_No;
				newShipLineF.SKU=poLnF.SKU;
				newShipLineF.Item_Name=poLnF.Item;
				newShipLineF.Ordered_QTY=poLnF.QTY;
				newShipLineF.Shipment_QTY=poLnF.QTY;
				newShipLineF.Remaining_QTY=poLnF.QTY;
				newShipLineF.Shipping_Mode=poLnF.Shipping_Mode;
				targetShipF.PO_Shipments.insert(newShipLineF);
			}
		}
		recvFoundF = false;
		matchingRecvIDF = 0;
		existingRecvF = Receiving[Shipments == targetShipF.ID];
		for each  rcF in existingRecvF
		{
			matchingRecvIDF = rcF.ID;
			recvFoundF = true;
		}
		if(recvFoundF == true)
		{
			targetRecvsF = Receiving[ID == matchingRecvIDF];
			for each  trcF in targetRecvsF
			{
				targetRecvF = trcF;
			}
		}
		else
		{
			maxRecvNumF = 0;
			existingRecvsF = Receiving[ID != 0];
			for each  rcF in existingRecvsF
			{
				recvNoStrF = rcF.Receive_No1;
				if(recvNoStrF != null && recvNoStrF != "")
				{
					recvNumPartF = recvNoStrF.removeFirstOccurence("RCV-");
					recvNumF = recvNumPartF.toLong();
					if(recvNumF > maxRecvNumF)
					{
						maxRecvNumF = recvNumF;
					}
				}
			}
			newRecvNumF = maxRecvNumF + 1;
			if(newRecvNumF < 10)
			{
				newRecvNoF = "RCV-0000" + newRecvNumF;
			}
			else if(newRecvNumF < 100)
			{
				newRecvNoF = "RCV-000" + newRecvNumF;
			}
			else if(newRecvNumF < 1000)
			{
				newRecvNoF = "RCV-00" + newRecvNumF;
			}
			else if(newRecvNumF < 10000)
			{
				newRecvNoF = "RCV-0" + newRecvNumF;
			}
			else
			{
				newRecvNoF = "RCV-" + newRecvNumF;
			}
			newRecvIDF = insert into Receiving
			[
				Receive_No1=newRecvNoF
				Shipments=targetShipF.ID
				SO_No=soNoTextF
				PO_No=apoF.PO_No
				Customer_Name=apoF.Customer
				Supplier="Fenteng"
			];
			targetRecvF = Receiving[ID == newRecvIDF];
		}
		for each  poLnF in apoF.PO_Line_Items
		{
			if(poLnF.PR_No != null && poLnF.PR_No != "")
			{
				prLineRecvF = Purchase_Request1[PR_No == poLnF.PR_No];
				targetRecvF.Sales_Owner=prLineRecvF.Sales_Owner;
			}
			else
			{
				targetRecvF.Sales_Owner=apoF.Sales_Owner;
			}
			recvLineExistsF = false;
			for each  existingRecvLnF in targetRecvF.Receiving_Line_Items
			{
				if(existingRecvLnF.PR_No == poLnF.PR_No)
				{
					recvLineExistsF = true;
				}
			}
			if(recvLineExistsF == false)
			{
				newRecvLineF = Receiving.Receiving_Line_Items();
				newRecvLineF.PR_No=poLnF.PR_No;
				newRecvLineF.SKU=poLnF.SKU;
				newRecvLineF.Item_Name=poLnF.Item;
				newRecvLineF.Expected_Qty=poLnF.QTY;
				targetRecvF.Receiving_Line_Items.insert(newRecvLineF);
			}
		}
		/* ADDED 2026-07-16, mirrored from pr_to_po_grouping.txt Action 2 — Receiving's
		   own Validations workflows never fire on this cross-form insert either. */
		totalExpectedF = 0;
		totalAcceptedF = 0;
		totalDamageF = 0;
		totalMissingF = 0;
		totalLinesRF = 0;
		incompleteLinesF = 0;
		readyForFulfillF = 0;
		for each  rln in targetRecvF.Receiving_Line_Items
		{
			totalLinesRF = totalLinesRF + 1;
			expRF = ifnull(rln.Expected_Qty,0);
			accRF = ifnull(rln.Accepted_Qty,0);
			dmgRF = ifnull(rln.Damage_Qty,0);
			misRF = ifnull(rln.Missing_Qty,0);
			totalExpectedF = totalExpectedF + expRF;
			totalAcceptedF = totalAcceptedF + accRF;
			totalDamageF = totalDamageF + dmgRF;
			totalMissingF = totalMissingF + misRF;
			totalRecRF = accRF + dmgRF + misRF;
			if(totalRecRF == expRF && accRF == expRF)
			{
				rln.Line_Result="Complete";
				rln.Ready_for_Fulfillment=true;
				readyForFulfillF = readyForFulfillF + 1;
			}
			else
			{
				rln.Line_Result="Incomplete";
				rln.Ready_for_Fulfillment=false;
				incompleteLinesF = incompleteLinesF + 1;
			}
		}
		targetRecvF.Total_Expected_Qty=totalExpectedF;
		targetRecvF.Total_Accepted_Qty=totalAcceptedF;
		targetRecvF.Total_Damage_Qty=totalDamageF;
		targetRecvF.Total_Missing_Qty=totalMissingF;
		targetRecvF.Total_Lines=totalLinesRF;
		targetRecvF.Incomplete_Lines=incompleteLinesF;
		targetRecvF.Ready_for_Fulfillment1=readyForFulfillF;
		if(totalLinesRF == 0 || (totalAcceptedF == 0 && totalDamageF == 0 && totalMissingF == 0))
		{
			targetRecvF.Receive_Status="Pending";
		}
		else if(incompleteLinesF == 0)
		{
			targetRecvF.Receive_Status="Received";
		}
		else
		{
			targetRecvF.Receive_Status="Partial Received";
		}
	}
}

====================================================
WORKFLOW SETUP — Acknowledged_PO_Supplier2 (added 2026-07-02)
  Form: Tony_Fan_Purchase_Order
  Location: On "Tony Fan Purchase Order" report
  Trigger: On click of action item
  Action name: Acknowledged_PO_Supplier2
  Report Action Item condition (added 2026-07-02):
    PO_Status_Supplier2 != "Confirmed"
====================================================

/* SLIMMED 2026-07-16 — Tony mirror of the Fenteng block above. Same reasoning, same
   replacement-PO-only Shipment/Receiving scope, no Books call. */
input.Acknowledge_On_Supplier2 = zoho.currenttime;
input.PO_Status_Supplier2 = "Confirmed";
aggPORecsT = Purchase_Order[PO_No == input.PO_No_Supplier2];
for each  apoT in aggPORecsT
{
	apoT.Acknowledge_On = zoho.currenttime;
	apoT.PO_Status = "Confirmed";
	soNoTextT = apoT.SO_No.Sales_Order_Number;
	matchingShipNoT = "";
	candidateShipmentsT = Shipments[PO_No == apoT.ID && Shipment_Status == "Pending"];
	for each  shT in candidateShipmentsT
	{
		matchingShipNoT = shT.Shipment_No;
	}
	if(matchingShipNoT != "")
	{
		targetShipsT = Shipments[Shipment_No == matchingShipNoT];
		for each  tshT in targetShipsT
		{
			targetShipT = tshT;
		}
	}
	if(apoT.RR_Reference_No != null && apoT.RR_Reference_No != "")
	{
		if(matchingShipNoT == "")
		{
			maxShipNumT = 0;
			existingShipmentsT = Shipments[ID != 0];
			for each  shT in existingShipmentsT
			{
				shipNoStrT = shT.Shipment_No;
				if(shipNoStrT != null && shipNoStrT != "")
				{
					shipNumPartT = shipNoStrT.removeFirstOccurence("SHP-");
					shipNumT = shipNumPartT.toLong();
					if(shipNumT > maxShipNumT)
					{
						maxShipNumT = shipNumT;
					}
				}
			}
			newShipNumT = maxShipNumT + 1;
			if(newShipNumT < 10)
			{
				newShipNoT = "SHP-0000" + newShipNumT;
			}
			else if(newShipNumT < 100)
			{
				newShipNoT = "SHP-000" + newShipNumT;
			}
			else if(newShipNumT < 1000)
			{
				newShipNoT = "SHP-00" + newShipNumT;
			}
			else if(newShipNumT < 10000)
			{
				newShipNoT = "SHP-0" + newShipNumT;
			}
			else
			{
				newShipNoT = "SHP-" + newShipNumT;
			}
			newShipIDT = insert into Shipments
			[
				Shipment_No=newShipNoT
				PO_No=apoT.ID
				Sales_Order=soNoTextT
				Customer=apoT.Customer
				Supplier="Tony"
				Shipment_Status="Pending"
			];
			targetShipT = Shipments[ID == newShipIDT];
		}
		for each  poLnT in apoT.PO_Line_Items
		{
			targetShipT.Required_Days_Lead=poLnT.Required_Days_Lead;
			targetShipT.Remaining_Days=poLnT.Remaining_Days;
			targetShipT.Target_Date=poLnT.Target_Delivery;
			targetShipT.Supplier_Target_Date=poLnT.supplier_target_date;
			targetShipT.Production_Date=poLnT.Production_Date;
			if(poLnT.PR_No != null && poLnT.PR_No != "")
			{
				prLineT = Purchase_Request1[PR_No == poLnT.PR_No];
				targetShipT.Shipment_Days=prLineT.Shipment_Days;
				targetShipT.Sales_Owner=prLineT.Sales_Owner;
			}
			else
			{
				targetShipT.Sales_Owner=apoT.Sales_Owner;
			}
			shipLineExistsT = false;
			for each  existingShipLnT in targetShipT.PO_Shipments
			{
				if(existingShipLnT.PR_No == poLnT.PR_No)
				{
					shipLineExistsT = true;
				}
			}
			if(shipLineExistsT == false)
			{
				newShipLineT = Shipments.PO_Shipments();
				newShipLineT.PR_No=poLnT.PR_No;
				newShipLineT.SKU=poLnT.SKU;
				newShipLineT.Item_Name=poLnT.Item;
				newShipLineT.Ordered_QTY=poLnT.QTY;
				newShipLineT.Shipment_QTY=poLnT.QTY;
				newShipLineT.Remaining_QTY=poLnT.QTY;
				newShipLineT.Shipping_Mode=poLnT.Shipping_Mode;
				targetShipT.PO_Shipments.insert(newShipLineT);
			}
		}
		recvFoundT = false;
		matchingRecvIDT = 0;
		existingRecvT = Receiving[Shipments == targetShipT.ID];
		for each  rcT in existingRecvT
		{
			matchingRecvIDT = rcT.ID;
			recvFoundT = true;
		}
		if(recvFoundT == true)
		{
			targetRecvsT = Receiving[ID == matchingRecvIDT];
			for each  trcT in targetRecvsT
			{
				targetRecvT = trcT;
			}
		}
		else
		{
			maxRecvNumT = 0;
			existingRecvsT = Receiving[ID != 0];
			for each  rcT in existingRecvsT
			{
				recvNoStrT = rcT.Receive_No1;
				if(recvNoStrT != null && recvNoStrT != "")
				{
					recvNumPartT = recvNoStrT.removeFirstOccurence("RCV-");
					recvNumT = recvNumPartT.toLong();
					if(recvNumT > maxRecvNumT)
					{
						maxRecvNumT = recvNumT;
					}
				}
			}
			newRecvNumT = maxRecvNumT + 1;
			if(newRecvNumT < 10)
			{
				newRecvNoT = "RCV-0000" + newRecvNumT;
			}
			else if(newRecvNumT < 100)
			{
				newRecvNoT = "RCV-000" + newRecvNumT;
			}
			else if(newRecvNumT < 1000)
			{
				newRecvNoT = "RCV-00" + newRecvNumT;
			}
			else if(newRecvNumT < 10000)
			{
				newRecvNoT = "RCV-0" + newRecvNumT;
			}
			else
			{
				newRecvNoT = "RCV-" + newRecvNumT;
			}
			newRecvIDT = insert into Receiving
			[
				Receive_No1=newRecvNoT
				Shipments=targetShipT.ID
				SO_No=soNoTextT
				PO_No=apoT.PO_No
				Customer_Name=apoT.Customer
				Supplier="Tony"
			];
			targetRecvT = Receiving[ID == newRecvIDT];
		}
		for each  poLnT in apoT.PO_Line_Items
		{
			if(poLnT.PR_No != null && poLnT.PR_No != "")
			{
				prLineRecvT = Purchase_Request1[PR_No == poLnT.PR_No];
				targetRecvT.Sales_Owner=prLineRecvT.Sales_Owner;
			}
			else
			{
				targetRecvT.Sales_Owner=apoT.Sales_Owner;
			}
			recvLineExistsT = false;
			for each  existingRecvLnT in targetRecvT.Receiving_Line_Items
			{
				if(existingRecvLnT.PR_No == poLnT.PR_No)
				{
					recvLineExistsT = true;
				}
			}
			if(recvLineExistsT == false)
			{
				newRecvLineT = Receiving.Receiving_Line_Items();
				newRecvLineT.PR_No=poLnT.PR_No;
				newRecvLineT.SKU=poLnT.SKU;
				newRecvLineT.Item_Name=poLnT.Item;
				newRecvLineT.Expected_Qty=poLnT.QTY;
				targetRecvT.Receiving_Line_Items.insert(newRecvLineT);
			}
		}
		/* ADDED 2026-07-16 — Tony mirror of the Fenteng block above. */
		totalExpectedT = 0;
		totalAcceptedT = 0;
		totalDamageT = 0;
		totalMissingT = 0;
		totalLinesRT = 0;
		incompleteLinesT = 0;
		readyForFulfillT = 0;
		for each  rln2 in targetRecvT.Receiving_Line_Items
		{
			totalLinesRT = totalLinesRT + 1;
			expRT = ifnull(rln2.Expected_Qty,0);
			accRT = ifnull(rln2.Accepted_Qty,0);
			dmgRT = ifnull(rln2.Damage_Qty,0);
			misRT = ifnull(rln2.Missing_Qty,0);
			totalExpectedT = totalExpectedT + expRT;
			totalAcceptedT = totalAcceptedT + accRT;
			totalDamageT = totalDamageT + dmgRT;
			totalMissingT = totalMissingT + misRT;
			totalRecRT = accRT + dmgRT + misRT;
			if(totalRecRT == expRT && accRT == expRT)
			{
				rln2.Line_Result="Complete";
				rln2.Ready_for_Fulfillment=true;
				readyForFulfillT = readyForFulfillT + 1;
			}
			else
			{
				rln2.Line_Result="Incomplete";
				rln2.Ready_for_Fulfillment=false;
				incompleteLinesT = incompleteLinesT + 1;
			}
		}
		targetRecvT.Total_Expected_Qty=totalExpectedT;
		targetRecvT.Total_Accepted_Qty=totalAcceptedT;
		targetRecvT.Total_Damage_Qty=totalDamageT;
		targetRecvT.Total_Missing_Qty=totalMissingT;
		targetRecvT.Total_Lines=totalLinesRT;
		targetRecvT.Incomplete_Lines=incompleteLinesT;
		targetRecvT.Ready_for_Fulfillment1=readyForFulfillT;
		if(totalLinesRT == 0 || (totalAcceptedT == 0 && totalDamageT == 0 && totalMissingT == 0))
		{
			targetRecvT.Receive_Status="Pending";
		}
		else if(incompleteLinesT == 0)
		{
			targetRecvT.Receive_Status="Received";
		}
		else
		{
			targetRecvT.Receive_Status="Partial Received";
		}
	}
}

====================================================
NOTES (Acknowledged_PO_Supplier1/2):
- CHANGED 2026-07-16, per user request — see the top-of-file header note for the full
  writeup. Books PO sync + normal-PO Shipment/Receiving creation moved OUT to
  PR_Approved (pr_to_po_grouping.txt). This action now: stamps PO_Status/Acknowledge_On
  (unchanged, see below), writes ETD/ETA onto the linked Shipment (mandatory ONLY via
  the widget path, acknowledge_po_custom_api.txt — this native Action Item body can't
  collect ad-hoc input so it can't itself enforce "mandatory"), and keeps a Shipment
  +Receiving-only copy gated to `RR_Reference_No` for replacement POs (never reach
  PR_Approved). Every NOTES entry below this point describes the PRE-2026-07-16
  (Books-PO-at-Acknowledge) architecture — kept for the field-mapping/vendor-ID/gotcha
  research trail, not as a description of current behavior. The Books
  create/update/approve/open logic itself is UNCHANGED, just relocated — see
  pr_to_po_grouping.txt's Actions 2/3 for where it lives now.
- Sets Acknowledge_On_Supplier1/2 to today's date and PO_Status_Supplier1/2 to
  "Confirmed" when the supplier clicks the Acknowledge action button on their PO report.
- CHANGED then REVERTED 2026-07-07 (part of the Replacement RR flow): briefly guarded
  the "set to Confirmed" lines to skip overwriting when status was already
  "Replacement - Missing" (so the flag would survive re-acknowledgment for Create
  Receive to detect). User then asked for PO_Status to go back to "Confirmed"
  immediately on Acknowledge, same as normal — REVERTED to always setting
  "Confirmed" unconditionally again, exactly as it was originally. The
  Missing/replacement signal moved to a PER-LINE field instead (`Item_Status`/
  `Item_Status_Supplier1/2` on the PO_Line_Items subforms, set by
  approve_rr_supplier.txt, read by receiving_create_bin_receiving.txt) — see those
  files' NOTES. Header PO_Status no longer carries this signal at all, so it's safe
  for Acknowledge to always reset it to "Confirmed" the way it always did.
- BUG caught by user (2026-07-07, same Replacement-Missing context): the Shipment/
  Receiving line-item inserts (`targetShipF/T.PO_Shipments.insert(...)` and
  `targetRecvF/T.Receiving_Line_Items.insert(...)`) ran UNCONDITIONALLY inside
  `for each poLnF/T in apoF/T.PO_Line_Items` every single time this action fires — fine
  the first time (Shipment/Receiving are freshly created, subforms empty), but
  re-clicking Acknowledge on an ALREADY-acknowledged PO (which the Replacement-Missing
  flow now requires) would find the SAME existing Shipment/Receiving via the
  find-or-create logic and then insert a SECOND duplicate row for the same PR_No/SKU
  into both subforms — the find-or-create only prevented duplicate Shipment/Receiving
  HEADER records, not duplicate LINE rows within them. FIXED: both inserts now check
  `for each existingLn in target.Subform { if(existingLn.PR_No == poLn.PR_No) {
  found=true; } }` first, only inserting if no row for that PR_No already exists —
  same idempotent "already has this line?" pattern already used in
  pr_to_po_grouping.txt's Fenteng/Tony sync and in create_rr_button.txt's duplicate
  guards. Applies to both Supplier1/Fenteng and Supplier2/Tony blocks.
- `input.field = value` assignment for the current record on a custom Action Item button
  is the same pattern already confirmed working for PR_Approved (pr_to_po_grouping.txt)
  — no separate `update r [...]` or record refetch needed.
- Confirm PO_Status_Supplier1/2's dropdown actually has a "Confirmed" choice before
  pasting — not independently re-verified this session, taken from the user's request
  text directly.
- Uses `zoho.currenttime` (date+time), not `zoho.currentdate` (date only) — the
  aggregate Purchase_Order's own Acknowledge_On field is confirmed DATE-TIME type (form
  screenshot showed placeholder "yyyy-MM-dd hh:mm:ss A"), and Acknowledge_On_Supplier1/2
  almost certainly mirror that same type since both PO forms were built together.
  `zoho.currentdate` silently fails to populate a DATE-TIME field (confirmed live via
  the same bug on Sent_On in pr_to_po_grouping.txt).
- Report Action Item condition `PO_Status_Supplier1/2 != "Confirmed"` (set in the report
  builder, not in this Deluge script) hides/disables the Acknowledge button once already
  clicked — same mechanism as the Submit Response button condition in
  purchase_request_scripts1.txt (`Response_Status != "Not Selected" && ...`).
- SYNC-BACK (added 2026-07-02): after acknowledging, also finds the matching aggregate
  Purchase_Order via `PO_No == input.PO_No_Supplier1/2` (safe since these are confirmed
  to mirror each other exactly — see pr_to_po_grouping.txt's PO numbering design
  decision) and sets its own Acknowledge_On/PO_Status too. Uses `apo.field = value` on a
  fetched record — backend update, does NOT trigger Purchase_Order's own workflows
  (established gotcha), which is fine here since nothing needs to react to it.
- SHIPMENT + RECEIVING PUSH (moved here 2026-07-03, was previously in
  pr_to_po_grouping.txt's Action 1 and ran on every PR approval instead): per user
  request, Shipments/Receiving should only get created once the supplier acknowledges
  the PO, not at approval time. Logic is IDENTICAL to the old pr_to_po_grouping.txt
  version (find-or-create Shipment matching `PO_No == apoF/T.ID && Shipment_Status ==
  "Pending"`, manual `SHP-XXXXX`/`RCV-XXXXX` max+1 generation since both Shipment_No and
  Receive_No1 are plain Single Line, not Auto Number; Receiving populated inline for the
  same cross-form-insert-doesn't-fire-workflows reason as before) EXCEPT it now runs
  inside the `for each apoF/apoT in aggPORecsF/T` loop and pulls line data from the
  aggregate Purchase_Order's own `PO_Line_Items` subform (`poLnF/T.PR_No/SKU/Item/QTY/
  Required_Days_Lead/Remaining_Days`) instead of a single `input.*` PR record — one
  acknowledgment click can cover several already-approved PR lines at once, so all of
  them get pushed to the same Shipment/Receiving in one pass.
  - `soNoTextF/T = apoF/T.SO_No.Sales_Order_Number` — same NUMBER-lookup-to-TEXT
    dot-chain gotcha as pr_to_po_grouping.txt, needed here again since Shipments.
    Sales_Order and Receiving.SO_No are both plain TEXT fields.
  - `Shipment_Days` is NOT a PO_Line_Items column (only Required_Days_Lead/
    Remaining_Days were added there) — fetched per-line via
    `Purchase_Request1[PR_No == poLnF/T.PR_No].Shipment_Days` instead. Same
    "last write wins" characteristic as before if multiple lines disagree.
  - Supplier string hardcoded as "Fenteng"/"Tony" in the new-Shipment/new-Receiving
    insert brackets (matches `selectedSupplierName` values used everywhere else in this
    project) rather than reading it from anywhere else, since this action only ever
    fires for its own supplier's PO form.
  - EDGE CASE (not fixed): if a PR gets approved into this same PO AFTER it's already
    been acknowledged (possible — Action 1's PO-matching query only excludes
    "Completed"/locked POs, not "Confirmed" ones), that new line never gets its own
    Shipment/Receiving push, since the Acknowledge button is hidden once
    PO_Status_Supplier1/2 == "Confirmed" and nothing else re-triggers this logic. Flag
    to user if this happens in practice — would need either a re-acknowledge path or a
    separate sync trigger on the PO_Line_Items subform itself.
- ADDED 2026-07-03 (user request, then corrected same day): `Sales_Owner` copied onto
  Shipments/Receiving. FIRST attempt sourced it from `apoF/T.Sales_Owner` (the aggregate
  Purchase_Order) — user then removed `Sales_Owner_Supplier1/2` (and SO_No/Customer/
  Customer_Type) from the supplier PO forms entirely (suppliers shouldn't see that), and
  clarified Shipments/Receiving should instead pull Sales_Owner directly from PR1
  ("just get sales owner from the PR1"), not from any PO-level field. CORRECTED: moved
  the assignment INSIDE each `for each poLnF/T in apoF/T.PO_Line_Items` loop (the same
  loops already used for Shipment/Receiving line items and Shipment_Days), fetching
  `Purchase_Request1[PR_No == poLnF/T.PR_No]` per line and setting
  `targetShipF/T.Sales_Owner`/`targetRecvF/T.Sales_Owner` from that record's own
  Sales_Owner — same "last write wins" characteristic as Shipment_Days if multiple PR
  lines on the same PO/Shipment disagree. `Purchase_Request1` IS confirmed to have
  Sales_Owner (used throughout this codebase already, e.g. in pr_to_po_grouping.txt's
  `input.Sales_Owner`) — this sidesteps the earlier unconfirmed-field risk on Shipments/
  Receiving's own Sales_Owner column (still not independently verified to exist via
  field builder, but user confirmed live it's there).
- BOOKS PURCHASE ORDER SYNC (moved here 2026-07-03, was briefly in
  pr_to_po_grouping.txt's PR_Approved Action 1 — see that file's NOTES for the original
  research: Books v3 contacts/items/purchaseorders/settings-customfields endpoints,
  using PR-00016/PR-00017 as test data and existing PO PO-04531 as schema reference).
  Per user request, this now fires on SUPPLIER ACKNOWLEDGMENT instead of at PR-approval
  time, same reasoning as the Shipment/Receiving move above. Runs inside the same
  `for each apoF/apoT` loop, right after the Receiving line-item loop:
  - Vendor IDs hardcoded per action (no if/else needed — each action only ever fires for
    its own supplier): Fenteng -> `2680178000049168001` ("Fenteng Lighting"), Tony ->
    `2680178000002735078` ("Tony Fan"). Same IDs confirmed working live during the
    original CREATE/UPDATE tests (PO-04532).
  - Mode of Shipment: unlike the original version (which read a single input.Shipment_Mode
    from the one PR being approved), acknowledgment covers potentially several PR lines
    at once with no single "current" PR — so this loops `apoF/T.PO_Line_Items` own
    `Shipping_Mode` column and takes the LAST non-blank value seen (same "last write
    wins" convention as Required_Days_Lead/Remaining_Days/Shipment_Days elsewhere in this
    project), mapping "LCL"/"FCL" straight through and defaulting anything else
    (including "Airfreight") to "Air Freight" — same mapping logic as before, just
    sourced from the line subform's `Shipping_Mode` column instead of a live PR1 input.
  - Type of Order hardcoded "Pre Order", Created by hardcoded "Procurement" — both same
    user-confirmed defaults as the original version.
  - PR References: rebuilt from ALL of `apoF/T.PO_Line_Items`' PR_No values (not just
    newly-added ones) — same as before, just now the natural behavior since this whole
    block already loops the full subform each time it runs.
  - Line items: `item_id` via `Items[SKU == poLnBooksF/T2.SKU].ID1` (Creator's own
    Books item_id, no extra API lookup), `warehouse_id` hardcoded HC WH3 BAESA
    `2680178000042173149`, `rate`/`quantity` from the PO_Line_Items row — all unchanged
    from the original version.
  - Create-then-update: `apoF/T.Books_PO_ID` checked first (GET-validate, same staleness
    check as the Books estimate sync), PUT rebuild if valid, else POST create + auto-
    approve (CREATE branch only). Stores the returned ID/number back onto
    `apoF/T.Books_PO_ID`/`Books_PO_No`.
  - CONFIRMED WORKING LIVE 2026-07-03 in this new location: Acknowledge click on Fenteng
    PO with both PR-00016 and PR-00017 grouped into it -> Books PO-04534 created with
    BOTH line items in one shot (ADARN.../ACANT-DWL-1, rate 100 each) and all 5 custom
    fields correct, including `PR References` = `["PR-00017","PR-00016"]` — confirms the
    aggregate-PO-at-once design works as intended (previously only proven one-PR-at-a-
    time when this lived in pr_to_po_grouping.txt).
  - BUG confirmed live 2026-07-03: auto-approve call used
    `POST /purchaseorders/{id}/status/approved` (guessed convention, never independently
    verified) — failed with `{"code":5,"message":"Invalid URL Passed"}`, so the new PO
    correctly created but stayed in Draft. FIXED via official Zoho Books API docs
    (zoho.com/books/api/v3/purchase-order/): the real endpoint is
    `POST /purchaseorders/{id}/approve` — no `/status/` segment, no request body. Both
    Fenteng and Tony blocks corrected. Retest needed to confirm the fix actually flips
    status to Approved (the CREATE+line-items+custom-fields part is already confirmed
    working — only the approve call itself needs re-verification).
- ADDED 2026-07-15, per user (screenshot of Tony's supplier PO showing Acantha's "Final
  Price" as the catalog rate ₱4,685 instead of his own quote — wanted the catalog rate
  kept off the supplier-facing display while Books still gets the correct amount): the
  Books line-item loop in both `Acknowledged_PO_Supplier1`/`Acknowledged_PO_Supplier2`
  now reads `input.PO_Line_Items_Supplier1`/`input.PO_Line_Items_Supplier2` (this
  record's own subform) instead of the aggregate `apoF/T.PO_Line_Items`, and prefers a
  NEW `Item_Price_Supplier1/2` field (Single Line/TEXT — user added `Item_Price_Supplier2`
  live; `Item_Price_Supplier1` on Fenteng's form still needs to be added the same way)
  over `Final_Price_Supplier1/2` whenever it's set. `Item_Price_Supplier1/2` is written by
  `pr_to_po_grouping.txt` Actions 2/3 (see that file's NOTES) — carries the catalog
  reference rate, deliberately kept off `Final_Price_Supplier1/2` (which reverted to
  showing ONLY the supplier's real quote, no fallback). Also added
  `disable PO_Line_Items_Supplier1/2.Item_Price_Supplier1/2;` to both
  Disable_All_Fields_PO_Supplier1/2 blocks above, same as every other grid column — even
  though the field is never rendered in either `Fenteng-PO`/`Tony-PO` widget, the NATIVE
  form would otherwise show it editable if a supplier ever opened the record directly in
  Creator instead of through the widget. UNTESTED — needs `Item_Price_Supplier1` created,
  then a live PR-approve + Acknowledge to confirm Books receives the catalog rate while
  the supplier PO widgets keep showing only the real (possibly blank) Final Price.
====================================================

````
