---
title: "paste-shipments_auto_create_supplier_shipment"
source_file: "paste-shipments_auto_create_supplier_shipment.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]"
lines: 42
tags:
  - deluge
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# paste-shipments_auto_create_supplier_shipment

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `paste-shipments_auto_create_supplier_shipment.txt`
> - **Lines of Code:** 42
> - **Tags:** `#deluge`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Shipments/Widget/Shipment Widget|Shipment Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
rrNoForShip = input.PO_No.RR_Reference_No + "";
if(rrNoForShip == "null")
{
	rrNoForShip = "";
}
shipSupplierVal = input.Supplier + "";
if(shipSupplierVal == "Fenteng" || shipSupplierVal.contains("Fenteng"))
{
	newSuppRecID = insert into Fenteng_Shipment
	[
		Shipment_No = input.Shipment_No
		Added_User1 = zoho.loginuser
	];
	newSuppRec = Fenteng_Shipment[ID == newSuppRecID];
	for each  li in input.PO_Shipments
	{
		row = Fenteng_Shipment.Supplier1_Shipment_Details();
		row.SKU = li.SKU;
		row.Item_Name = li.Item_Name;
		row.PR_No = li.PR_No;
		row.RR_No = rrNoForShip;
		newSuppRec.Supplier1_Shipment_Details.insert(row);
	}
}
else if(shipSupplierVal == "Tony" || shipSupplierVal.contains("Tony"))
{
	newSuppRecID = insert into Tony_Shipment
	[
		Shipment_No = input.Shipment_No
		Added_User1 = zoho.loginuser
	];
	newSuppRec = Tony_Shipment[ID == newSuppRecID];
	for each  li in input.PO_Shipments
	{
		row = Tony_Shipment.Supplier2_Shipment_Details();
		row.SKU = li.SKU;
		row.Item_Name = li.Item_Name;
		row.PR_No = li.PR_No;
		row.RR_No = rrNoForShip;
		newSuppRec.Supplier2_Shipment_Details.insert(row);
	}
}

````
