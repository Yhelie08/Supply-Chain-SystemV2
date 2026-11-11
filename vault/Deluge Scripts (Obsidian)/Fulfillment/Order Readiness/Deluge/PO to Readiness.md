---
title: "PO to Readiness"
source_file: "PO to Readiness"
category: "Fulfillment/Order Readiness/Deluge"
associated_widget: "[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]"
lines: 129
tags:
  - crate
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
---

# PO to Readiness

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]
> - **Category:** `Fulfillment/Order Readiness/Deluge`
> - **Source File:** `PO to Readiness`
> - **Lines of Code:** 129
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
// ASSUMED TRIGGER: Zoho Creator native "Created or Edited" Workflow attached
// directly to the Pre_Order_FF form — same native pattern as readiness_gate_sync.txt
// (both forms live in the same app, no invokeurl/API connection needed anywhere
// here). Field values below are read directly by their Field Link Name.
info "Pre_Order_Status: " + Pre_Order_Status;
info "Package_Number: " + Package_Number;
info "SO: " + SO;
packageNumberVal = Package_Number + "";
preOrderStatusVal = Pre_Order_Status + "";
// ===== CONDITION GATE =====
// Only sync to Sales_Order_Readiness_Gate once the item actually has a Package
// Number (PAC#) AND has been marked Received — per user request 2026-07-20: a
// pre-order item isn't ready for the Readiness Gate until both are true.
if(packageNumberVal == "" || preOrderStatusVal != "Received")
{
	info "Pre_Order_FF not ready yet (Package_Number blank or status not Received) — skipping.";
	return;
}
soVal = SO + "";
orderTypeVal = Order_Type + "";
deliveryTypeVal = Delivery_Type + "";
statusVal = Status + "";
prVal = PR + "";
custNameVal = Customer_Name + "";
custTypeVal = Customer_Type + "";
custAddressVal = Customer_Address + "";
itemNameVal = Item_Name + "";
skuVal = SKU + "";
qtyVal = Qty + "";
binVal = Bin_Location + "";
// For_Crate is checkbox-to-checkbox (boolean), no stringify/translation needed.
forCrateVal = For_Crate;
// Target_Delivery (Pre_Order_FF) -> Target_Delivery_Date (Sales_Order_Readiness_Gate)
// date-to-date, same as For_Crate: pass through directly, no stringify.
targetDeliveryVal = Target_Delivery;
// ===== PAYMENT STATUS TRANSLATION =====
// Pre_Order_FF's Status picklist (Yes/No/Partially) maps to
// Sales_Order_Readiness_Gate's payment_status picklist (Paid/Partially Paid/Pending)
// — same translation idea as readiness_gate_sync.txt, just a different source label
// ("Partially" here vs "Partial" on Sales_Order_Fulfillment's own Status field).
paymentStatusVal = "Pending";
if(statusVal == "Yes")
{
	paymentStatusVal = "Paid";
}
else if(statusVal == "Partially")
{
	paymentStatusVal = "Partially Paid";
}
// ===== RE-FETCH FULL RECORD FOR RR SUBFORM DATA =====
// Same gotcha as readiness_gate_sync.txt's Item_Details1 fix — the bare
// Replacement_Request trigger variable doesn't give subform row data, so re-fetch
// the full record by its own ID and read the subform off that instead. recId stays
// NUMBER (ID's own type) — stringifying it before the criteria comparison errors.
recId = ID;
rrRows = List();
fullList = Pre_Order_FF[ID == recId];
for each  fullRec in fullList
{
	rrRows = fullRec.Replacement_Request;
}
rrJoined = "";
for each  rrRow in rrRows
{
	rrVal = rrRow.RR + "";
	if(rrVal != "" && rrVal != "null" && !rrJoined.contains(rrVal))
	{
		if(rrJoined == "")
		{
			rrJoined = rrVal;
		}
		else
		{
			rrJoined = rrJoined + ", " + rrVal;
		}
	}
}
// ===== UPSERT INTO Sales_Order_Readiness_Gate =====
// Matched per SO + SKU, same pattern/syntax as readiness_gate_sync.txt: update the
// existing record in place if found, otherwise insert a new one. Pre_Order_FF is
// already one record per item (not a subform), so this is a single upsert, not a
// per-row loop like readiness_gate_sync.txt's Item_Details1 handling.
matchingGateRecords = Sales_Order_Readiness_Gate[sales_order_number == soVal && SKU == skuVal];
foundExisting = false;
for each  gateRec in matchingGateRecords
{
	update gateRec
	[
		Order_Type = orderTypeVal
		Package_Order = packageNumberVal
		Delivery_Type = deliveryTypeVal
		For_Crate = forCrateVal
		payment_status = paymentStatusVal
		customer_name = custNameVal
		customer_type = custTypeVal
		customer_address = custAddressVal
		pr_number = prVal
		rr_number = rrJoined
		Item_Name = itemNameVal
		Quantity = qtyVal
		Bin_Location = binVal
		Target_Delivery_Date = targetDeliveryVal
	];
	info "Sales_Order_Readiness_Gate record updated, ID: " + gateRec.ID;
	foundExisting = true;
}
if(!foundExisting)
{
	newId = insert into Sales_Order_Readiness_Gate
	[
		sales_order_number = soVal
		Order_Type = orderTypeVal
		Package_Order = packageNumberVal
		Delivery_Type = deliveryTypeVal
		For_Crate = forCrateVal
		payment_status = paymentStatusVal
		customer_name = custNameVal
		customer_type = custTypeVal
		customer_address = custAddressVal
		pr_number = prVal
		rr_number = rrJoined
		Item_Name = itemNameVal
		SKU = skuVal
		Quantity = qtyVal
		Bin_Location = binVal
		Target_Delivery_Date = targetDeliveryVal
	];
	info "Sales_Order_Readiness_Gate record created, ID: " + newId;
}

````
