---
title: "PASTE_ShipmentStatusBackSync_Production"
source_file: "NEw/PASTE_ShipmentStatusBackSync_Production.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 116
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-creator
---

# PASTE_ShipmentStatusBackSync_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `NEw/PASTE_ShipmentStatusBackSync_Production.txt`
> - **Lines of Code:** 116
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

== SUPERSEDED 2026-08-08 — DO NOT PASTE THIS. Confirmed live: zoho.creator.v2_1.updateRecords
   is NOT callable from a native same-app Creator workflow. Sync moved into
   UI/EndUser/Shipments/Shipmentsv2's own saveShipment() -> syncShipmentStatusBack() (+
   Shipmentsv2's ShipmentGrouping sgSyncSupplierStatus()). See
   DelugeScripts/shipment_status_back_sync.txt's own header for the full write-up. ==

/* FIXED 2026-08-05, real bug found live in Production, same root cause as
   receiving_sync_shipment_arrived.txt's own matching fix (see that file's NOTES for
   the full writeup) — this used to read input.Supplier_Shipment_Details expecting
   per-line PR_No/RR_No/SKU/Status columns, but that subform genuinely only has ONE
   field, Shipment_ID (confirmed live via API dump) — every key computed was the
   garbage string "||" and this whole workflow silently did nothing since the day it
   was pasted. The REAL buyer-editable per-line status field is Line_Status on the
   PO_Shipments subform (confirmed live: choices In Transit/Partial/Arrived/Received,
   see UI/EndUser/Shipments/app/index.html's own field dump) — switched to read that
   instead. PO_Shipments has no RR_No column at all, so the match key here drops RR_No
   (PR_No+SKU only) — a real, accepted precision loss vs the supplier-side subform's
   own RR_No, but there's no RR_No data available on PO_Shipments to match with in the
   first place. */
statusMapBS = Map();
for each  sr in input.PO_Shipments
{
	if(sr.Line_Status != null && sr.Line_Status != "")
	{
		keyBS = (sr.PR_No + "") + "|" + (sr.SKU + "");
		statusMapBS.put(keyBS, sr.Line_Status);
	}
}

if(statusMapBS.size() > 0)
{
	/* FIXED 2026-08-07, real bug (same class as the already-fixed approvePOMain
	   crash): Shipments.Supplier can be the short name or the full Suppliers-form
	   name (replacement shipments inherit RR_Supplier, which can hold either shape,
	   confirmed live in Production). Old strict == silently skipped this sync for
	   any replacement shipment that hit the full-name shape. */
	inputSupplierValBS = input.Supplier + "";
	// CHANGED 2026-08-08h — same real bug/fix as receiving_sync_shipment_arrived.txt's
	// own matching entry: in-place subform-row mutation on an already-fetched EXISTING
	// record silently never persists (confirmed hard Zoho platform limit). Full
	// clear+rebuild via zoho.creator.v2_1.updateRecords instead, every field carried
	// forward. UNTESTED — needs a Creator Connection named "creator_self" (Settings ->
	// Connections -> New Connection -> Zoho Creator, scopes
	// ZohoCreator.form.CREATE,ZohoCreator.report.READ,ZohoCreator.report.UPDATE).
	if(inputSupplierValBS == "Fenteng" || inputSupplierValBS.contains("Fenteng"))
	{
		suppRecBS = Fenteng_Shipment[Parent_Shipment_ID == input.ID + ""];
		newRowsBS = List();
		changedBS = false;
		for each  row in suppRecBS.Supplier1_Shipment_Details
		{
			rowKeyBS = (row.PR_No + "") + "|" + (row.SKU + "");
			newStatusBS = statusMapBS.get(rowKeyBS);
			statusBS = row.Status;
			if(newStatusBS != null)
			{
				statusBS = newStatusBS;
				changedBS = true;
			}
			newRowBS = Map();
			newRowBS.put("Select_To_Ship",row.Select_To_Ship);
			newRowBS.put("SKU",row.SKU);
			newRowBS.put("Item_Name",row.Item_Name);
			newRowBS.put("PR_No",row.PR_No);
			newRowBS.put("RR_No",row.RR_No);
			newRowBS.put("Date_Shipped",row.Date_Shipped);
			newRowBS.put("Shipment_Mode",row.Shipment_Mode);
			newRowBS.put("Synced",row.Synced);
			newRowBS.put("Status",statusBS);
			newRowsBS.add(newRowBS);
		}
		if(changedBS == true)
		{
			updDataBS = Map();
			updDataBS.put("Supplier1_Shipment_Details",newRowsBS);
			updRespBS = zoho.creator.v2_1.updateRecords("homecartel","supply-chain-app","Fenteng_Shipment_Report","ID==" + suppRecBS.ID,updDataBS,Map(),"creator_self");
			info "Fenteng status-back-sync updateRecords response: " + updRespBS;
		}
	}
	else if(inputSupplierValBS == "Tony" || inputSupplierValBS.contains("Tony"))
	{
		suppRecBST = Tony_Shipment[Parent_Shipment_ID == input.ID + ""];
		newRowsBST = List();
		changedBST = false;
		for each  rowT in suppRecBST.Supplier2_Shipment_Details
		{
			rowKeyBST = (rowT.PR_No + "") + "|" + (rowT.SKU + "");
			newStatusBST = statusMapBS.get(rowKeyBST);
			statusBST = rowT.Status;
			if(newStatusBST != null)
			{
				statusBST = newStatusBST;
				changedBST = true;
			}
			newRowBST = Map();
			newRowBST.put("SKU",rowT.SKU);
			newRowBST.put("Item_Name",rowT.Item_Name);
			newRowBST.put("PR_No",rowT.PR_No);
			newRowBST.put("RR_No",rowT.RR_No);
			newRowBST.put("Date_Shipped",rowT.Date_Shipped);
			newRowBST.put("Shipment_Mode",rowT.Shipment_Mode);
			newRowBST.put("Select_To_Ship",rowT.Select_To_Ship);
			newRowBST.put("Synced",rowT.Synced);
			newRowBST.put("Status",statusBST);
			newRowsBST.add(newRowBST);
		}
		if(changedBST == true)
		{
			updDataBST = Map();
			updDataBST.put("Supplier2_Shipment_Details",newRowsBST);
			updRespBST = zoho.creator.v2_1.updateRecords("homecartel","supply-chain-app","Tony_Shipment_Report","ID==" + suppRecBST.ID,updDataBST,Map(),"creator_self");
			info "Tony status-back-sync updateRecords response: " + updRespBST;
		}
	}
}

````
