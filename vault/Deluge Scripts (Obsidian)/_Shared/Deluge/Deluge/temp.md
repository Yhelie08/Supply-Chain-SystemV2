---
title: "temp"
source_file: "temp.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]"
lines: 68
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# temp

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `temp.txt`
> - **Lines of Code:** 68
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Replacement/Widget/Replacement Widget|Replacement Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
/* resolves RR_No ONCE here, off `input` (safe direct dot-through on a lookup field,
   per this app's own established "works on input, not on a re-fetched record"
   convention) — only real when this Shipment traces back to a replacement PO.
   Deliberately NOT re-derived later at sync time by reading a subform off a
   criteria-queried record (confirmed-unreliable elsewhere in this codebase) —
   computed once here, stamped onto each row, done. */
rrNoForShip = input.PO_No.RR_Reference_No + "";
if(rrNoForShip == "null")
{
	rrNoForShip = "";
}
/* Shipments is per-supplier at the HEADER level (input.Supplier is a plain text
   field on the aggregate record itself — confirmed via the live schema dump in
   plan.txt, no per-line Supplier column exists on PO_Shipments) — so the WHOLE
   PO_Shipments list belongs to one supplier, no need to split it. NOTE: both forms'
   real link name for this field is Added_User1 (not Added_User) — confirmed live on
   BOTH Fenteng_Shipment and Tony_Shipment (an earlier version of this note wrongly
   said Tony's was plain Added_User — corrected by the user directly). */
/* FIXED 2026-08-12, real bug found live (SHP-00004, stock-item replacement
   shipment never appeared in Tony Fan's Supplier Portal) — input.Supplier can
   hold the short code ("Tony"/"Fenteng") or the full Suppliers-form name
   ("Tony Fan"/"Fenteng Lighting") depending on record history, same root
   cause already fixed in clone_shipment_for_replacement.txt's supStatus/
   Tony_Shipment branches on 2026-08-07. Old strict == silently matched
   NEITHER branch for the full-name case, so no Fenteng_Shipment/Tony_Shipment
   record was created at all for that Shipment — confirmed live via the
   supplier's own portal tiles showing 0 pending / one shipment short. Cast to
   string once, match with contains() as a fallback, same pattern as the rest
   of this codebase. */
shipSupplierVal = input.Supplier + "";
if(shipSupplierVal == "Fenteng" || shipSupplierVal.contains("Fenteng"))
{
	newSuppRecID = insert into Fenteng_Shipment
	[
		Shipment_No=input.Shipment_No
		Added_User1=zoho.loginuser
		Added_User=zoho.loginuser
	];
	newSuppRec = Fenteng_Shipment[ID == newSuppRecID];
	for each  li in input.PO_Shipments
	{
		row = Fenteng_Shipment.Supplier1_Shipment_Details();
		row.SKU=li.SKU;
		row.Item_Name=li.Item_Name;
		row.PR_No=li.PR_No;
		row.RR_No=rrNoForShip;
		insert(row);
	}
}
else if(shipSupplierVal == "Tony" || shipSupplierVal.contains("Tony"))
{
	newSuppRecID = insert into Tony_Shipment
	[
		Shipment_No=input.Shipment_No
		Added_User1=zoho.loginuser
		Added_User=zoho.loginuser
	];
	newSuppRec = Tony_Shipment[ID == newSuppRecID];
	for each  li in input.PO_Shipments
	{
		row = Tony_Shipment.Supplier2_Shipment_Details();
		row.SKU=li.SKU;
		row.Item_Name=li.Item_Name;
		row.PR_No=li.PR_No;
		row.RR_No=rrNoForShip;
		newSuppRec.Supplier2_Shipment_Details.insert(row);
	}
}

````
