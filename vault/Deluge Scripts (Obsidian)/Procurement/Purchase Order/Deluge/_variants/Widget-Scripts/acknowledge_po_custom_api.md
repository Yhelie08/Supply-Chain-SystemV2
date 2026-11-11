---
title: "acknowledge_po_custom_api"
source_file: "DMS\DelugeScripts\acknowledge_po_custom_api.txt"
category: "Procurement/Purchase Order/Deluge/_variants/Widget-Scripts"
associated_widget: "[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]"
lines: 732
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# acknowledge_po_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]
> - **Category:** `Procurement/Purchase Order/Deluge/_variants/Widget-Scripts`
> - **Source File:** `DMS\DelugeScripts\acknowledge_po_custom_api.txt`
> - **Lines of Code:** 732
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Delivery Management/_Retired/DeliveryQueue Widget|DeliveryQueue Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Supplier PO "Acknowledge" button, via Creator Custom API ==
== Called from the new supplier-facing UI/SupplierPortal/Fenteng-PO/ + Tony-PO/ widgets ==
== New 2026-07-09 — mirrors purchase_order_scripts.txt's Acknowledged_PO_Supplier1/2 ==
== Report Action Items EXACTLY, same conversion pattern as pr_approve_po_custom_api.txt ==

====================================================
WHY THIS EXISTS (don't skip straight to editing purchase_order_scripts.txt instead)
====================================================
`Acknowledged_PO_Supplier1`/`Acknowledged_PO_Supplier2` in purchase_order_scripts.txt
are REPORT ACTION ITEMS ("On click of action item" trigger) on
Fenteng_Lighting_Purchase_Order / Tony_Fan_Purchase_Order. Report Action Items are a
Creator UI-only construct — there is no Creator REST/SDK call that can invoke one
externally (same established limitation as PR_Approved, see
pr_approve_po_custom_api.txt's own "WHY THIS EXISTS"). A supplier-facing widget button
therefore CANNOT "click" that native action item for you.

Same proven workaround as PR_Approved: wrap the exact same logic in a Deluge Custom
Function behind a Custom API. Native `input.field` references (Action Items get an
`input` context bound to the clicked record, same as form workflows) are converted to
`r.field` on a freshly fetched record instead, since Custom Functions have no `input`.
Everything else — variable names, Shipments/Receiving creation, Books PO sync, the
RR-replacement skip guard — is copied verbatim from the native script, unchanged. Per
user's explicit instruction: "Supplier's PO native form is our main reference for
logic and workflows" — this file is not a redesign, it is the same logic in a
callable wrapper.

Split into 2 SEPARATE custom functions/APIs (Fenteng/Tony), not 1 combined one — same
reasoning as pr_approve_po_custom_api.txt (this codebase has a confirmed live
restriction against combining two duplicate-form subform/insert constructors in one
script — see that file's own NOTES for the original finding).

Added one thing NOT in the native Report Action Item: an idempotency guard
(`PO_Status_Supplier1/2 == "Confirmed"` -> return early, no-op). The native version's
equivalent protection is the Report Action Item's own CONDITION
(`PO_Status_Supplier1 != "Confirmed"`), which hides/disables the button in the native
UI once already clicked — but that condition is a Creator UI-rendering thing, not
something a Custom API call goes through. Without a server-side guard here, a
double-tap or a stale widget screen could re-run the whole Shipments/Receiving/Books
block a second time and create duplicate Shipment/Receiving records. Only new
behavior added; the acknowledge logic itself is untouched.

SLIMMED 2026-07-16, per user request ("move the function of acknowledge - going to zoho
books, going to shipment and receiving - to PR_Approved. acknowledge only function now:
is to populate ETD and ETA in shipment after acknowledge"): the "copied verbatim from
native" claim above now only applies to what native purchase_order_scripts.txt still
does (PO_Status/Acknowledge_On bookkeeping + a replacement-PO-only Shipment/Receiving
copy). Books PO sync + normal-PO Shipment/Receiving creation moved to PR_Approved
(pr_approve_po_custom_api.txt's approvePOFenteng/approvePOTony, mirroring
pr_to_po_grouping.txt Actions 2/3). Both functions gained 2 new required String
parameters, `etd`/`eta` — the widget's own "Acknowledge PO" modal now collects both
(mandatory) and passes them straight through; this file writes them onto the Shipment
PR_Approved already created (`Shipments.ETD`/`Shipments.ETA`, real Date fields,
confirmed live 2026-07-13 — see CLAUDE.md's Shipments widget row). A blank etd/eta is
rejected server-side too, not just by the widget's own client-side validation.
====================================================

--------------------------------------------------
FUNCTION 1 of 2 — acknowledgePOFenteng
Arguments: String poNoSupplier1  (Fenteng_Lighting_Purchase_Order.PO_No_Supplier1)
           String etd            (widget-collected, mandatory — written to
                                   Shipments.ETD, real Date field)
           String eta            (widget-collected, mandatory — written to
                                   Shipments.ETA, real Date field)
SLIMMED 2026-07-16, per user ("move the function of acknowledge - going to zoho books,
going to shipment and receiving - to PR_Approved. acknowledge only function now: is to
populate ETD and ETA in shipment after acknowledge"). Shipment/Receiving creation +
Books PO sync for NORMAL POs moved OUT to PR_Approved's Fenteng action
(pr_approve_po_custom_api.txt's approvePOFenteng, mirroring pr_to_po_grouping.txt
Action 2 — see that file's own header note for the full writeup). This function now:
(1) idempotency guard (unchanged), (2) PO_Status/Acknowledge_On bookkeeping (unchanged),
(3) mandatory ETD/ETA — rejects with an error status if either is blank, enforced here
server-side in addition to the widget's own client-side modal validation, then writes
both onto the Shipment PR_Approved already created, (4) keeps a Shipment+Receiving-only
copy (no Books) gated to RR_Reference_No, for replacement POs specifically — those never
flow through PR_Approved at all (created directly by approve_rr_supplier.txt, bypassing
PR1/Link_PO_No).
--------------------------------------------------

map acknowledgePOFenteng(String poNoSupplier1, String etd, String eta)
{
	response = Map();
	if(etd == null || etd == "" || eta == null || eta == "")
	{
		response.put("status","error");
		response.put("message","ETD and ETA are both required to acknowledge this PO.");
		return response;
	}
	recsF = Fenteng_Lighting_Purchase_Order[PO_No_Supplier1 == poNoSupplier1];
	found = false;
	for each  r in recsF
	{
		found = true;
		if(r.PO_Status_Supplier1 == "Confirmed")
		{
			response.put("status","already");
			response.put("message","Already acknowledged");
			return response;
		}
		r.Acknowledge_On_Supplier1 = zoho.currenttime;
		r.PO_Status_Supplier1 = "Confirmed";
		aggPORecsF = Purchase_Order[PO_No == r.PO_No_Supplier1];
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
			if(matchingShipNoF != "")
			{
				targetShipF.ETD = etd;
				targetShipF.ETA = eta;
			}
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
						ETD=etd
						ETA=eta
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
				/* ADDED 2026-07-16, mirrored from purchase_order_scripts.txt — Receiving's
				   own Validations workflows never fire on this cross-form insert. */
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
	}
	if(found == false)
	{
		response.put("status","error");
		response.put("message","PO not found: " + poNoSupplier1);
		return response;
	}
	response.put("status","success");
	response.put("message","Acknowledged " + poNoSupplier1);
	return response;
}

--------------------------------------------------
FUNCTION 2 of 2 — acknowledgePOTony
Arguments: String poNoSupplier2, String etd, String eta — same shape as
           acknowledgePOFenteng above, Tony mirror. SLIMMED 2026-07-16, same reasoning.
--------------------------------------------------

map acknowledgePOTony(String poNoSupplier2, String etd, String eta)
{
	response = Map();
	if(etd == null || etd == "" || eta == null || eta == "")
	{
		response.put("status","error");
		response.put("message","ETD and ETA are both required to acknowledge this PO.");
		return response;
	}
	recsT = Tony_Fan_Purchase_Order[PO_No_Supplier2 == poNoSupplier2];
	found = false;
	for each  r in recsT
	{
		found = true;
		if(r.PO_Status_Supplier2 == "Confirmed")
		{
			response.put("status","already");
			response.put("message","Already acknowledged");
			return response;
		}
		r.Acknowledge_On_Supplier2 = zoho.currenttime;
		r.PO_Status_Supplier2 = "Confirmed";
		aggPORecsT = Purchase_Order[PO_No == r.PO_No_Supplier2];
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
			if(matchingShipNoT != "")
			{
				targetShipT.ETD = etd;
				targetShipT.ETA = eta;
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
						ETD=etd
						ETA=eta
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
	}
	if(found == false)
	{
		response.put("status","error");
		response.put("message","PO not found: " + poNoSupplier2);
		return response;
	}
	response.put("status","success");
	response.put("message","Acknowledged " + poNoSupplier2);
	return response;
}

====================================================
STEP 2 — CREATE 2 CUSTOM APIs
  Creator: Microservices -> Custom API -> + Create Custom API
  Same convention as approve_po_main/fenteng/tony (pr_approve_po_custom_api.txt):
====================================================
For EACH of the 2 functions above, create one Custom API:

  1. Name: AcknowledgePOFenteng  (link name e.g. acknowledge_po_fenteng)  -> Function: acknowledgePOFenteng
  2. Name: AcknowledgePOTony     (link name e.g. acknowledge_po_tony)     -> Function: acknowledgePOTony

Request (both, identical shape):
  HTTP Method: POST
  Content-Type: application/json, "Key and Value"
  Authentication: PublicKey
  Parameters (3, CHANGED 2026-07-16 — was just 1): poNoSupplier1/poNoSupplier2 (String,
    unchanged) PLUS 2 new required ones, etd (String) and eta (String) — matches each
    function's own updated argument list. Widget sends these as plain "YYYY-MM-DD"
    date strings from its new Acknowledge modal.
Response:
  Pass the function's returned Map through as the response body (same as
  approve_po_main/fenteng/tony and create_estimate).

After saving each one, IMMEDIATELY check it's not left in Draft/disabled state (Custom
APIs default to Draft on creation — confirmed live gotcha, see
pr_approve_po_custom_api.txt NOTES for the exact 9360 error this produces if skipped),
then copy its PUBLIC KEY into the two new widgets
(UI/SupplierPortal/Fenteng-PO/app/index.html, Tony-PO/app/index.html — search for
"REPLACE_WITH_" in each file's CONFIG block).

====================================================
NOTES:
- This does NOT touch or replace `Acknowledged_PO_Supplier1/2` in
  purchase_order_scripts.txt — that Report Action Item still exists and still works
  from inside native Creator. This file adds a SEPARATE, parallel path for the
  supplier-facing widget only. Keep both in sync if the acknowledge logic changes
  again — same "manually-maintained mirror" caveat already documented for
  pr_approve_po_custom_api.txt (found drifting out of sync once already, see that
  file's own 2026-07-09 NOTES entry).
- Idempotency guard (`PO_Status_Supplier1/2 == "Confirmed"` -> return "already") is the
  ONE piece of logic not present in the native Report Action Item body itself — added
  because the native version's real guard is the Report Action Item's CONDITION
  (hides the button in Creator's own UI), which a Custom API call bypasses entirely.
  Without this, a double-tap in the widget would create duplicate Shipment/Receiving
  records. See "WHY THIS EXISTS" above for the full reasoning.
- Argument is the supplier PO's own PO_No_Supplier1/2 (business key, matches the
  convention pr_approve_po_custom_api.txt already used for soNo) rather than the
  record's internal ID.
- Untested — same status as the buyer-side pr_approve_po_custom_api.txt was before its
  own first live test: check the Custom API isn't left in Draft (see STEP 2 above)
  before assuming a silent failure is a code bug.
====================================================

````
