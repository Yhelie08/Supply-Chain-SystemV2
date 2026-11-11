---
title: "hc_system_local_sourcing_setup"
source_file: "hc_system_local_sourcing_setup.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 472
tags:
  - custom-api
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
  - zoho-books
---

# hc_system_local_sourcing_setup

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `hc_system_local_sourcing_setup.txt`
> - **Lines of Code:** 472
> - **Tags:** `#custom-api`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== "Local" sourcing (HC System) — SIMPLIFIED, current/authoritative version, 2026-09-04 ==
== Supersedes hc_system_purchase_request_setup.txt / hc_system_po_shipment_receiving_
   rr_setup.txt / hc_system_pr_sync_supplier_selected_guard.txt (all 3 now just point
   here). Per user, simplified from the original full-parity plan
   (C:\Users\Enduser\.claude\plans\binary-plotting-jellyfish.md): NO separate HC portal,
   NO separate quote/negotiation cycle — "HC System" is just the supplier NAME stamped
   for record-keeping, price comes from the PR's own existing rate (SRP_Rate_PR/catalog
   Rate/SRP_Approved_PR — already-existing fields, nothing new needed), and the whole
   thing is meant to be as direct/straight-through as possible: mark a PR "Local" ->
   Approve to PO -> Shipment -> Receiving, none of it touching Zoho Books. ==

====================================================
STEP 0 — CREATE ONE NEW FIELD
====================================================
On Purchase_Request1 (existing form):
  Label: Sourcing Type
  Link name: Sourcing_Type
  Field type: Dropdown
  Values: Import, Local
  Default value: Import
  (Default "Import" so every existing PR keeps today's behavior unchanged.)

That is the ONLY new field/form needed. No HC_System_Purchase_Request, no
HC_System_Purchase_Order, no HC_System_Shipment, no HC_System_Replacement_Request.

====================================================
STEP 1 — EDIT DelugeScripts/PR1_Created_Edited_Routing.txt (the LIVE file — NOT the
superseded purchase_request_scripts1.txt, see that file's own header note)
  Workflow: PR_Populate_From_PR, Form: Purchase_Request1, Trigger: Created > Successful
  form submission
====================================================

Add this as the SECOND line of ACTION 1 (Fenteng), right after the existing
`if(input.Source == "SO") { return; }` line — do not touch anything else in Action 1:

if(input.Sourcing_Type == "Local") { return; }

Add the exact same line as the SECOND line of ACTION 2 (Tony Fan), right after its own
`if(input.Source == "SO") { return; }` line:

if(input.Sourcing_Type == "Local") { return; }

(These two one-line additions are the ONLY change here — stops Fenteng/Tony records
from being created for a Local PR. No Action 3/HC-specific insert needed — there is no
HC-specific supplier PR form to insert into.)

====================================================
STEP 2 — EDIT DelugeScripts/pr_sync_supplier_selected.txt (existing workflow — do NOT
create a new one)
  Form: Purchase_Request1, Trigger: Created or Edited > Validations
====================================================

Add this as the very FIRST thing the script does, before its existing "// === Step 1:
Build list of category-matched suppliers... ===" line:

if(input.Sourcing_Type == "Local")
{
	input.Selected_Supplier = "HC System";
	return;
}

Everything else in this file (the Supplier_Load_Balancing-matching / winner-computation
logic) stays completely unchanged — this just short-circuits before any of it runs, for
Local PRs only. Every Import PR is unaffected.

== Why this is needed: pr_check_readiness.txt's PR_READY_FOR_PO gate (required before
   approvePOMain will pick up a PR) reads Selected_Supplier (a plain text field — not to
   be confused with Selected_Supplier1, a separate computed boolean readiness flag with
   a confusingly similar name). Normally that's set by the rest of this same script,
   reading PR1's own Supplier_Selected subform (itself fed by the Fenteng/Tony
   multi-bidder Supplier_Load_Balancing matching) — deliberately not used for Local,
   since HC System isn't a competing bidder, it's a fixed single choice. This guard
   sets it directly instead. Runs on every Validations pass (Created AND Edited), so
   it's set correctly from the moment a Local PR is first created. ==

== Price — CONFIRMED with user 2026-09-04: for a Local PR, the buyer types the price
   directly into the PR itself at creation time (Selcted_Final_Cost field on
   Purchase_Request1) — deliberately NOT sourced from SRP_Rate_PR/SRP_Approved_PR/any
   Inquiry or Sales Order data, so it never has even an indirect Books connection.
   NO CODE CHANGE NEEDED for this — confirmed by reading pr_approve_po_custom_api.txt's
   approvePOMain directly: the native PO line price is built with
   `rateToUse = prLoop.Selcted_Final_Cost;` (line 186), i.e. whatever the buyer typed
   in is exactly what flows onto the PO line, unchanged, for every supplier including
   HC System. pr_check_readiness.txt's "Final price confirmed" condition already checks
   Selcted_Final_Cost as its own fallback tier too — a manually-created Local PR
   naturally has no inquiry_reference/SRP_Rate_PR/SRP_Approved_PR set, so it falls
   straight through to that check with nothing extra to add. Buyer enters it on the
   native Purchase_Request1 form for now; Phase 3 below can surface this as a normal
   price input in the PRs widget once Sourcing Type is "Local", same field. ==

====================================================
STEP 3 — approvePOHC (NEW Custom Function, 4th sibling of approvePOMain/
approvePOFenteng/approvePOTony in DelugeScripts/pr_approve_po_custom_api.txt)
  Creator: Workflows (or Functions area) -> New Custom Function
  Paste the FULL block including the "map approvePOHC(...)" signature + outer {},
  return type "map", don't explicitly type local variables (no "Map response=Map()").
====================================================

	map approvePOHC(String soNo)
	{
		response = Map();
		processedCount = 0;
		processedPOsH = List();
		siblingPRsH = Purchase_Request1[Sales_Order == soNo && PR_Approved == true && Link_PO_No != null && Sourcing_Type == "Local"];
		for each  prLoopH in siblingPRsH
		{
			if(prLoopH.Link_PO_No == "")
			{
				continue;
			}
			alreadyTrackedH0 = false;
			for each  doneNoH0 in processedPOsH
			{
				if(doneNoH0 == prLoopH.Link_PO_No)
				{
					alreadyTrackedH0 = true;
				}
			}
			if(alreadyTrackedH0 == false)
			{
				processedPOsH.add(prLoopH.Link_PO_No);
			}
		}
		for each  poNoTouchedH in processedPOsH
		{
			aggPOsSyncH = Purchase_Order[PO_No == poNoTouchedH];
			for each  apoH2 in aggPOsSyncH
			{
				apoH = apoH2;
			}
			soNoTextH = apoH.SO_No.Sales_Order_Number;
			matchingShipNoH = "";
			candidateShipmentsH = Shipments[PO_No == apoH.ID && Shipment_Status == "Pending"];
			for each  shH in candidateShipmentsH
			{
				matchingShipNoH = shH.Shipment_No;
			}
			isNewShipmentH = false;
			if(matchingShipNoH != "")
			{
				targetShipsH = Shipments[Shipment_No == matchingShipNoH];
				for each  tshH in targetShipsH
				{
					targetShipH = tshH;
				}
			}
			else
			{
				maxShipNumH = 0;
				existingShipmentsH = Shipments[ID != 0];
				for each  shH2 in existingShipmentsH
				{
					shipNoStrH = shH2.Shipment_No;
					if(shipNoStrH != null && shipNoStrH != "")
					{
						shipNumPartH = shipNoStrH.removeFirstOccurence("SHP-");
						shipNumH = shipNumPartH.toLong();
						if(shipNumH > maxShipNumH)
						{
							maxShipNumH = shipNumH;
						}
					}
				}
				newShipNumH = maxShipNumH + 1;
				if(newShipNumH < 10)
				{
					newShipNoH = "SHP-0000" + newShipNumH;
				}
				else if(newShipNumH < 100)
				{
					newShipNoH = "SHP-000" + newShipNumH;
				}
				else if(newShipNumH < 1000)
				{
					newShipNoH = "SHP-00" + newShipNumH;
				}
				else if(newShipNumH < 10000)
				{
					newShipNoH = "SHP-0" + newShipNumH;
				}
				else
				{
					newShipNoH = "SHP-" + newShipNumH;
				}
				newShipIDH = insert into Shipments
				[
					Shipment_No=newShipNoH
					PO_No=apoH.ID
					Sales_Order=soNoTextH
					Customer=apoH.Customer
					Supplier="HC System"
					Shipment_Status="Pending"
				];
				targetShipH = Shipments[ID == newShipIDH];
				isNewShipmentH = true;
			}
			for each  poLnAggH in apoH.PO_Line_Items
			{
				targetShipH.Required_Days_Lead=poLnAggH.Required_Days_Lead;
				targetShipH.Remaining_Days=poLnAggH.Remaining_Days;
				targetShipH.Target_Date=poLnAggH.Target_Delivery;
				targetShipH.Supplier_Target_Date=poLnAggH.supplier_target_date;
				targetShipH.Production_Date=poLnAggH.Production_Date;
				if(poLnAggH.PR_No != null && poLnAggH.PR_No != "")
				{
					prLineH = Purchase_Request1[PR_No == poLnAggH.PR_No];
					targetShipH.Shipment_Days=prLineH.Shipment_Days;
					targetShipH.Sales_Owner=prLineH.Sales_Owner;
				}
				else
				{
					targetShipH.Sales_Owner=apoH.Sales_Owner;
				}
				shipLineExistsH = false;
				for each  existingShipLnH in targetShipH.PO_Shipments
				{
					if(existingShipLnH.PR_No == poLnAggH.PR_No)
					{
						shipLineExistsH = true;
					}
				}
				if(shipLineExistsH == false)
				{
					newShipLineH = Shipments.PO_Shipments();
					newShipLineH.PR_No=poLnAggH.PR_No;
					newShipLineH.SKU=poLnAggH.SKU;
					newShipLineH.Item_Name=poLnAggH.Item;
					newShipLineH.Ordered_QTY=poLnAggH.QTY;
					newShipLineH.Shipment_QTY=poLnAggH.QTY;
					newShipLineH.Remaining_QTY=poLnAggH.QTY;
					newShipLineH.Shipping_Mode=poLnAggH.Shipping_Mode;
					targetShipH.PO_Shipments.insert(newShipLineH);
				}
			}
			recvFoundH = false;
			matchingRecvIDH = 0;
			existingRecvH = Receiving[Shipments == targetShipH.ID];
			for each  rcH in existingRecvH
			{
				matchingRecvIDH = rcH.ID;
				recvFoundH = true;
			}
			if(recvFoundH == true)
			{
				targetRecvsH = Receiving[ID == matchingRecvIDH];
				for each  trcH in targetRecvsH
				{
					targetRecvH = trcH;
				}
			}
			else
			{
				maxRecvNumH = 0;
				existingRecvsH = Receiving[ID != 0];
				for each  rcH2 in existingRecvsH
				{
					recvNoStrH = rcH2.Receive_No1;
					if(recvNoStrH != null && recvNoStrH != "")
					{
						recvNumPartH = recvNoStrH.removeFirstOccurence("RCV-");
						recvNumH = recvNumPartH.toLong();
						if(recvNumH > maxRecvNumH)
						{
							maxRecvNumH = recvNumH;
						}
					}
				}
				newRecvNumH = maxRecvNumH + 1;
				if(newRecvNumH < 10)
				{
					newRecvNoH = "RCV-0000" + newRecvNumH;
				}
				else if(newRecvNumH < 100)
				{
					newRecvNoH = "RCV-000" + newRecvNumH;
				}
				else if(newRecvNumH < 1000)
				{
					newRecvNoH = "RCV-00" + newRecvNumH;
				}
				else if(newRecvNumH < 10000)
				{
					newRecvNoH = "RCV-0" + newRecvNumH;
				}
				else
				{
					newRecvNoH = "RCV-" + newRecvNumH;
				}
				newRecvIDH = insert into Receiving
				[
					Receive_No1=newRecvNoH
					Shipments=targetShipH.ID
					SO_No=soNoTextH
					PO_No=apoH.PO_No
					Customer_Name=apoH.Customer
					Supplier="HC System"
				];
				targetRecvH = Receiving[ID == newRecvIDH];
			}
			for each  poLnAggH2 in apoH.PO_Line_Items
			{
				if(poLnAggH2.PR_No != null && poLnAggH2.PR_No != "")
				{
					prLineRecvH = Purchase_Request1[PR_No == poLnAggH2.PR_No];
					targetRecvH.Sales_Owner=prLineRecvH.Sales_Owner;
				}
				else
				{
					targetRecvH.Sales_Owner=apoH.Sales_Owner;
				}
				recvLineExistsH = false;
				for each  existingRecvLnH in targetRecvH.Receiving_Line_Items
				{
					if(existingRecvLnH.PR_No == poLnAggH2.PR_No)
					{
						recvLineExistsH = true;
					}
				}
				if(recvLineExistsH == false)
				{
					newRecvLineH = Receiving.Receiving_Line_Items();
					newRecvLineH.PR_No=poLnAggH2.PR_No;
					newRecvLineH.SKU=poLnAggH2.SKU;
					newRecvLineH.Item_Name=poLnAggH2.Item;
					newRecvLineH.Expected_Qty=poLnAggH2.QTY;
					targetRecvH.Receiving_Line_Items.insert(newRecvLineH);
				}
			}
			totalExpectedH = 0;
			totalAcceptedH = 0;
			totalDamageH = 0;
			totalMissingH = 0;
			totalLinesRH = 0;
			incompleteLinesH = 0;
			readyForFulfillH = 0;
			for each  rln in targetRecvH.Receiving_Line_Items
			{
				totalLinesRH = totalLinesRH + 1;
				expRH = ifnull(rln.Expected_Qty,0);
				accRH = ifnull(rln.Accepted_Qty,0);
				dmgRH = ifnull(rln.Damage_Qty,0);
				misRH = ifnull(rln.Missing_Qty,0);
				totalExpectedH = totalExpectedH + expRH;
				totalAcceptedH = totalAcceptedH + accRH;
				totalDamageH = totalDamageH + dmgRH;
				totalMissingH = totalMissingH + misRH;
				totalRecRH = accRH + dmgRH + misRH;
				if(totalRecRH == expRH && accRH == expRH)
				{
					rln.Line_Result="Complete";
					rln.Ready_for_Fulfillment=true;
					readyForFulfillH = readyForFulfillH + 1;
				}
				else
				{
					rln.Line_Result="Incomplete";
					rln.Ready_for_Fulfillment=false;
					incompleteLinesH = incompleteLinesH + 1;
				}
			}
			targetRecvH.Total_Expected_Qty=totalExpectedH;
			targetRecvH.Total_Accepted_Qty=totalAcceptedH;
			targetRecvH.Total_Damage_Qty=totalDamageH;
			targetRecvH.Total_Missing_Qty=totalMissingH;
			targetRecvH.Total_Lines=totalLinesRH;
			targetRecvH.Incomplete_Lines=incompleteLinesH;
			targetRecvH.Ready_for_Fulfillment1=readyForFulfillH;
			if(totalLinesRH == 0 || (totalAcceptedH == 0 && totalDamageH == 0 && totalMissingH == 0))
			{
				targetRecvH.Receive_Status="Pending";
			}
			else if(incompleteLinesH == 0)
			{
				targetRecvH.Receive_Status="Received";
			}
			else
			{
				targetRecvH.Receive_Status="Partial Received";
			}
			apoH.PO_Status="Confirmed";
			processedCount = processedCount + 1;
		}
		response.put("status","success");
		response.put("processed",processedCount);
		response.put("message",processedCount + " HC System PO(s) synced");
		return response;
	}

== What this does, in plain terms: finds every Local PR already approved onto a native
   PO (Purchase_Order), then for each distinct PO number, creates (or reuses) the SAME
   kind of Shipment + Receiving record Fenteng/Tony's own approve functions create —
   using the native Purchase_Order's OWN line items directly (apoH.PO_Line_Items,
   already built generically by approvePOMain — no separate HC line-item building
   needed, since there's no supplier-specific PO form to build lines onto). Stamps
   Supplier="HC System" on both. Marks the PO "Confirmed" immediately, since there is no
   separate portal/Acknowledge step for HC to click — Approve IS the whole action.
   NEVER calls Books at any point — there simply is no Books-related code in this
   function at all, unlike approvePOFenteng/approvePOTony which build+call it near the
   end. This is the entire reason Local PRs never reach Books at the PO step. ==

====================================================
STEP 4 — CUSTOM API to add
====================================================
Name: ApprovePOHC (link name e.g. approve_po_hc) -> Function: approvePOHC
Request: POST, Content-Type application/json, Authentication PublicKey,
Parameter: soNo (String) — same shape as the existing approve_po_fenteng/approve_po_tony.
Response: pass the function's returned Map through as the response body.
Copy the public key into the PRs widget once Phase 3 wires it in (see NOTES below).

====================================================
STEP 5 — Receiving Books-skip guard (THE CRITICAL ONE — unchanged from the earlier
draft, still correct)
  EDIT BOTH: DelugeScripts/receiving_create_bin_receiving.txt AND
             DelugeScripts/receiving_widget_custom_api.txt
  (confirmed byte-identical live — both need the exact same edit)
====================================================

Add this as the SECOND statement, right after the existing `orgId = "751117756";` line
and BEFORE the existing `fulfillmentExcCheck = ...` line:

if(input.Supplier == "HC System" || input.Supplier.contains("HC System"))
{
	input.Books_Receive_ID = "";
	input.Books_Receive_No = "N/A (HC System - internal only)";
	info "HC System (Local) receiving — skipped Books, internal only.";
	return;
}

== Confirmed by reading the file directly: this is the very first statement to run
   (after orgId), before every one of the 3 real Books invokeurl call sites downstream
   — an early `return;` here unconditionally skips all of them for an HC System
   receiving record, no matter which branch would otherwise apply. ==

====================================================
NOTES:
- SIMPLIFIED 2026-09-04, per user ("gagawin lang natin is yung name lang ng HC for
  record lang siya... isang diretso lang siya... wala naman papasok sa zoho books. pag
  naka local"). An earlier same-day draft built a full parallel twin-form set
  (HC_System_Purchase_Request/Purchase_Order/Shipment/Replacement_Request, a full
  pricing/negotiation cycle, a planned supplier portal) mirroring Fenteng/Tony's own
  design exactly — that is NOT what the user wants. This file replaces all of that.
  "HC System" now only ever appears as a plain text value in the existing Supplier
  fields (PR1.Selected_Supplier, Shipments.Supplier, Receiving.Supplier) — a record
  label, nothing else.
- Because there's no HC-specific twin form, there's also no supplier-side "Acknowledge"
  step, no self-report shipment tracking, and no HC-specific Replacement Request form.
  If a Local-sourced item later needs a Replacement Request, it just goes through the
  EXISTING native Replacement_Request mechanism (unsuffixed, shared) — nothing new
  needed there either, AS LONG AS the resulting Receiving record still carries
  Supplier=="HC System" (inherited the same way Fenteng/Tony's replacement receives
  already inherit their Supplier value today) so STEP 5's guard still catches it.
  Not independently verified this session — flag if a Local replacement receive ever
  shows up in Zoho Books.
- Phase 3 (still pending, not started): wire `Widget/Proc/Purchase Request/PRs.zip` to
  (a) show the Sourcing Type picker (Import/Local) on the New PR form, (b) call the new
  `approve_po_hc` Custom API as a 4th unconditional call in `runApprovePOBatch()`,
  matching how Fenteng/Tony are already called unconditionally every time (self-
  contained no-op when nothing of that kind exists — approvePOHC already filters by
  `Sourcing_Type == "Local"` so it's safe to call every time too), and (c) make sure the
  PO-grouping UI's existing "sameSupplier" validation treats Local as its own distinct
  group (never mixes a Local PR into the same PO-grouping card as an Import PR) — the
  native Purchase_Order data model doesn't itself enforce one-supplier-per-PO, that
  protection has always lived in the widget's own grouping logic (same as it already
  keeps Fenteng and Tony PRs from grouping together).
- Nothing pasted into Zoho yet. Live-test order once pasted: create a PR, mark Sourcing
  Type "Local", confirm Selected_Supplier auto-shows "HC System" and the PR becomes
  ready (fill Target Delivery + make sure some price source exists), Approve to PO
  (call approve_po_hc, or the widget once Phase 3 is done), confirm in Zoho that NO new
  Books PO appeared, confirm a Shipment + Receiving record were created with
  Supplier="HC System", do a Create Receive on it and confirm in Zoho Books that NO new
  Purchase Receive appeared either.
====================================================

````
