---
title: "PASTE_ReceivingSyncShipmentArrived_Production"
source_file: "NEw/PASTE_ReceivingSyncShipmentArrived_Production.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 125
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-creator
---

# PASTE_ReceivingSyncShipmentArrived_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `NEw/PASTE_ReceivingSyncShipmentArrived_Production.txt`
> - **Lines of Code:** 125
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPERSEDED 2026-08-08 — DO NOT PASTE THIS. Confirmed live: zoho.creator.v2_1.updateRecords
   is NOT callable from a native same-app Creator workflow. Sync moved into
   UI/EndUser/Receiving/Receivingv2's own saveReceiving() -> syncShipmentArrivedStatus(). See
   DelugeScripts/receiving_sync_shipment_arrived.txt's own header for the full write-up. ==

arrMapRA = Map();
for each  rlRA in input.Receiving_Line_Items
{
	if(rlRA.PR_No != null && rlRA.PR_No != "" && rlRA.Expected_Qty != null && rlRA.Expected_Qty > 0)
	{
		missingQtyRA = rlRA.Missing_Qty;
		if(missingQtyRA == null)
		{
			missingQtyRA = 0;
		}
		if(missingQtyRA == 0)
		{
			keyRA = (rlRA.PR_No + "") + "|" + (rlRA.RR_No + "") + "|" + (rlRA.SKU + "");
			arrMapRA.put(keyRA, true);
		}
	}
}

if(arrMapRA.size() > 0)
{
	/* FIXED 2026-08-05, real bug found live in Production: Shipments.Supplier_Shipment_Details
	   (the subform this used to loop here) does NOT have PR_No/RR_No/SKU/Status columns at
	   all — confirmed via a live API dump, it only ever holds one field, Shipment_ID (see
	   supplier_shipment_sync.txt's own header comment, "appends a row to the PARENT
	   Shipments.Supplier_Shipment_Details, [holding] Shipment_ID"). The old code below dot-read
	   spLineRA.PR_No/.RR_No/.SKU/.Status off that subform — none of those fields exist there,
	   so every key computed was just the garbage string "||" and never matched arrMapRA's real
	   keys (built from Receiving_Line_Items, which DOES have these fields) — this whole block
	   silently did nothing on every run, regardless of Missing_Qty. Confirmed live: both
	   SHP-00001 and SHP-00004's Receiving lines have Missing_Qty=0 (should have auto-flipped),
	   but Tony_Shipment.Supplier2_Shipment_Details.Status stayed "In Transit"/blank on both.
	   FIX: skip the parent Supplier_Shipment_Details subform read entirely (it was never the
	   right place to look) — go straight from arrMapRA (already correctly keyed, built from
	   Receiving's own line data above) to the supplier-side subform, same as before. */
	shipRecRA = Shipments[ID == input.Shipments];
	/* FIXED 2026-08-07, real bug (same class as the already-fixed approvePOMain
	   crash): Shipments.Supplier can be the short name or the full Suppliers-form
	   name (replacement shipments inherit RR_Supplier, which can hold either shape,
	   confirmed live in Production). Old strict == silently skipped the Arrived
	   auto-flip for any replacement shipment that hit the full-name shape. */
	shipSupplierValRA = shipRecRA.Supplier + "";
	// CHANGED 2026-08-08h, real bug found live — in-place subform-row mutation on an
	// already-fetched existing record silently never persists (confirmed hard Zoho
	// platform limit). Full clear+rebuild via zoho.creator.v2_1.updateRecords instead,
	// every field carried forward. UNTESTED — needs a Creator Connection named
	// "creator_self" (Settings -> Connections -> New Connection -> Zoho Creator,
	// scopes ZohoCreator.form.CREATE,ZohoCreator.report.READ,ZohoCreator.report.UPDATE)
	// — see DelugeScripts/receiving_sync_shipment_arrived.txt's own NOTES for the full
	// write-up.
	if(shipSupplierValRA == "Fenteng" || shipSupplierValRA.contains("Fenteng"))
	{
		suppRecRA = Fenteng_Shipment[Parent_Shipment_ID == shipRecRA.ID + ""];
		newRowsRA = List();
		changedRA = false;
		for each  rowRA in suppRecRA.Supplier1_Shipment_Details
		{
			rowKeyRA = (rowRA.PR_No + "") + "|" + (rowRA.RR_No + "") + "|" + (rowRA.SKU + "");
			okRA = arrMapRA.get(rowKeyRA);
			statusRA = rowRA.Status;
			if(okRA == true && statusRA != "Arrived")
			{
				statusRA = "Arrived";
				changedRA = true;
			}
			newRowRA = Map();
			newRowRA.put("Select_To_Ship",rowRA.Select_To_Ship);
			newRowRA.put("SKU",rowRA.SKU);
			newRowRA.put("Item_Name",rowRA.Item_Name);
			newRowRA.put("PR_No",rowRA.PR_No);
			newRowRA.put("RR_No",rowRA.RR_No);
			newRowRA.put("Date_Shipped",rowRA.Date_Shipped);
			newRowRA.put("Shipment_Mode",rowRA.Shipment_Mode);
			newRowRA.put("Synced",rowRA.Synced);
			newRowRA.put("Status",statusRA);
			newRowsRA.add(newRowRA);
		}
		if(changedRA == true)
		{
			updDataRA = Map();
			updDataRA.put("Supplier1_Shipment_Details",newRowsRA);
			updRespRA = zoho.creator.v2_1.updateRecords("homecartel","supply-chain-app","Fenteng_Shipment_Report","ID==" + suppRecRA.ID,updDataRA,Map(),"creator_self");
			info "Fenteng Arrived sync updateRecords response: " + updRespRA;
		}
	}
	else if(shipSupplierValRA == "Tony" || shipSupplierValRA.contains("Tony"))
	{
		suppRecRAT = Tony_Shipment[Parent_Shipment_ID == shipRecRA.ID + ""];
		newRowsRAT = List();
		changedRAT = false;
		for each  rowRAT in suppRecRAT.Supplier2_Shipment_Details
		{
			rowKeyRAT = (rowRAT.PR_No + "") + "|" + (rowRAT.RR_No + "") + "|" + (rowRAT.SKU + "");
			okRAT = arrMapRA.get(rowKeyRAT);
			statusRAT = rowRAT.Status;
			if(okRAT == true && statusRAT != "Arrived")
			{
				statusRAT = "Arrived";
				changedRAT = true;
			}
			newRowRAT = Map();
			newRowRAT.put("SKU",rowRAT.SKU);
			newRowRAT.put("Item_Name",rowRAT.Item_Name);
			newRowRAT.put("PR_No",rowRAT.PR_No);
			newRowRAT.put("RR_No",rowRAT.RR_No);
			newRowRAT.put("Date_Shipped",rowRAT.Date_Shipped);
			newRowRAT.put("Shipment_Mode",rowRAT.Shipment_Mode);
			newRowRAT.put("Select_To_Ship",rowRAT.Select_To_Ship);
			newRowRAT.put("Synced",rowRAT.Synced);
			newRowRAT.put("Status",statusRAT);
			newRowsRAT.add(newRowRAT);
		}
		if(changedRAT == true)
		{
			updDataRAT = Map();
			updDataRAT.put("Supplier2_Shipment_Details",newRowsRAT);
			updRespRAT = zoho.creator.v2_1.updateRecords("homecartel","supply-chain-app","Tony_Shipment_Report","ID==" + suppRecRAT.ID,updDataRAT,Map(),"creator_self");
			info "Tony Arrived sync updateRecords response: " + updRespRAT;
		}
	}
}

````
