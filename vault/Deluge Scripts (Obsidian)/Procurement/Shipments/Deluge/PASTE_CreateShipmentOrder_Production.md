---
title: "PASTE_CreateShipmentOrder_Production"
source_file: "NEw/PASTE_CreateShipmentOrder_Production.txt"
category: "Procurement/Shipments/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 213
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - notification
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
  - zoho-inventory
---

# PASTE_CreateShipmentOrder_Production

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Shipments/Deluge`
> - **Source File:** `NEw/PASTE_CreateShipmentOrder_Production.txt`
> - **Lines of Code:** 213
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#notification`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
map createShipmentOrder(String recordId, String packageShipmentId, String typeOfDelivery, String shipDate, String deliveryDate, String carrier, String shippingCharge, String ceilingMaterial, String ceilingHeight, String siteWiringReady, String preparedBy, String deliveryTeam)
{
	response = Map();

	// Same proven single-record-read shape as every other Custom Function in
	// this app (see CLAUDE.md Deluge Gotchas — bare `Form[criteria].get()`
	// silently returns null, always use for-each + dot-notation instead).
	// CHANGED 2026-08-06 — pacVal/existingShipmentOrderNo now come from the
	// specific Package_Shipments row this call targets, not the parent
	// Service_Appointment record (which may now cover multiple packages —
	// see docs/2026-08-06-dms-multi-package-service-appointment-design.md).
	// soVal/typeOfDeliveryVal still come from the parent appointment (shared
	// context across all its packages).
	recFound = false;
	soVal = "";
	typeOfDeliveryVal = "";
	for each rec in Service_Appointment_Form[ID == recordId.toLong()]
	{
		recFound = true;
		soVal = rec.Sales_Order + "";
		typeOfDeliveryVal = rec.Type_of_Delivery + "";
	}
	psFound = false;
	pacVal = "";
	existingShipmentOrderNo = "";
	for each psRec in Package_Shipments[ID == packageShipmentId.toLong()]
	{
		psFound = true;
		pacVal = psRec.Package_Number + "";
		if(psRec.Shipment_Created == true)
		{
			existingShipmentOrderNo = psRec.Shipment_Order_No + "";
		}
	}
	if(!psFound)
	{
		response.put("status","error");
		response.put("message","Package Shipment record not found.");
		return response;
	}
	// ADDED 2026-07-29, per user ("why other data is blank? ... can we add a
	// dropdown instead but auto populate if it have delivery type") — Dispatch
	// only sets Type_of_Delivery when the source value matches one of the DMS's
	// 7 real picklist choices exactly, so it's genuinely blank on several real
	// archived records. The widget's modal is now a dropdown (auto-filled if
	// the record has a value, officer picks manually if blank) — prefer
	// whatever the widget actually sent, fall back to the record's own stored
	// value only if the widget somehow sent nothing (defensive, not expected
	// in normal use since the dropdown always has SOME value once submitted).
	if(typeOfDelivery != null && typeOfDelivery != "")
	{
		typeOfDeliveryVal = typeOfDelivery;
	}
	if(!recFound)
	{
		response.put("status","error");
		response.put("message","Service Appointment record not found.");
		return response;
	}
	if(existingShipmentOrderNo != null && existingShipmentOrderNo != "" && existingShipmentOrderNo != "null")
	{
		response.put("status","error");
		response.put("message","Already sent — Shipment Order " + existingShipmentOrderNo + " already exists for this delivery.");
		return response;
	}
	if(pacVal == null || pacVal == "" || pacVal == "null")
	{
		response.put("status","error");
		response.put("message","No Package Number on this record — a real Inventory Package must exist before a Shipment can be created.");
		return response;
	}

	orgId = "751117756";

	// 1. Find the real Inventory Package for this SO, matched by Package Number
	// (same "search by salesorder_number, scan for the matching package_number"
	// shape as the old script — invokeurl instead of zoho.inventory.getRecords,
	// which the sales_return_to_books.txt saga already confirmed isn't usable
	// from this app's own Creator Deluge engine).
	packageId = null;
	salesorderId = null;
	pkgSearchUrl = "https://www.zohoapis.com/inventory/v1/packages?organization_id=" + orgId + "&salesorder_number=" + soVal;
	try
	{
		pkgSearch = invokeurl
		[
			url :pkgSearchUrl
			type :GET
			connection:"zhinventory3"
		];
	}
	catch (e)
	{
		response.put("status","error");
		response.put("message","Error fetching packages: " + e);
		return response;
	}
	pkgList = pkgSearch.get("packages");
	if(pkgList != null)
	{
		for each pkg in pkgList
		{
			pkgNumber = pkg.get("package_number") + "";
			if(pkgNumber == pacVal)
			{
				packageId = pkg.get("package_id");
				salesorderId = pkg.get("salesorder_id");
				break;
			}
		}
	}
	if(packageId == null)
	{
		response.put("status","error");
		response.put("message","Package '" + pacVal + "' not found in Inventory for Sales Order " + soVal + " — cannot create a Shipment without it.");
		return response;
	}

	// CHANGED 2026-07-29, per user ("but the dropdown choices in shipment
	// creation copy books") — the DMS-value-to-Books-value translation moved
	// to the WIDGET side instead of here: the Create Shipment modal's own
	// dropdown now shows Books' REAL "Type of Delivery" choices directly
	// (confirmed live via a screenshot of that field's own picklist —
	// "Deliver & Install"/"Deliver Only"/"Demo"/"Demo - Design Partner"/
	// "Pick Up"/"Replacement"/"Service"), pre-selected via a mapping FROM the
	// record's own DMS Type_of_Delivery value, but the officer can freely
	// pick any real Books choice. So `typeOfDelivery` arriving here is
	// already a genuine Books value (or blank) — sent through as-is, no
	// translation needed on this side.
	custom_fields = List();
	custom_fields.add({"customfield_id":"2680178000000763374","value":deliveryDate});
	custom_fields.add({"customfield_id":"2680178000000440145","value":typeOfDeliveryVal});
	custom_fields.add({"customfield_id":"2680178000000305854","value":ceilingMaterial});
	custom_fields.add({"customfield_id":"2680178000000305840","value":ceilingHeight});
	custom_fields.add({"customfield_id":"2680178000000305866","value":siteWiringReady});
	custom_fields.add({"customfield_id":"2680178000004081025","value":preparedBy});
	custom_fields.add({"customfield_id":"2680178000004081035","value":deliveryTeam});

	shipData = Map();
	shipData.put("date", shipDate);
	shipData.put("delivery_method", carrier);
	shipData.put("shipping_charge", shippingCharge);
	shipData.put("shipmentorder_custom_fields", custom_fields);
	shipData.put("send_notification", false);
	shipData.put("is_delivered", false);

	headers_data = Map();
	headers_data.put("content-type","application/json");

	createUrl = "https://www.zohoapis.com/inventory/v1/shipmentorders?organization_id=" + orgId + "&salesorder_id=" + salesorderId + "&package_ids=" + packageId;
	createResp = invokeurl
	[
		url :createUrl
		type :POST
		parameters:shipData.toString()
		headers:headers_data
		connection:"zhinventory3"
	];

	shipObj = createResp.get("shipmentorder");
	if(shipObj == null)
	{
		response.put("status","error");
		response.put("message","Inventory rejected the create — " + createResp.get("message"));
		response.put("raw", createResp.toString());
		return response;
	}

	// FIXED 2026-08-06 — real field names confirmed live via the temporary
	// debug dump (now removed): createResp.get("shipmentorder") really uses
	// "shipment_id"/"shipment_number", NOT "shipmentorder_id"/
	// "shipmentorder_number" as originally assumed (never verified against a
	// real response before). Root cause of the whole "null created" bug from
	// earlier this session — Inventory's own create genuinely succeeded every
	// time, only this parsing was wrong.
	shipId = shipObj.get("shipment_id");
	shipNo = shipObj.get("shipment_number");
	shipNoForStorage = shipNo;
	if(shipNoForStorage == null || shipNoForStorage == "")
	{
		shipNoForStorage = shipId;
	}

	// Defensive guard kept even after the real field names are confirmed — if
	// Inventory's response shape ever changes again, Package_Shipments (the
	// authoritative per-package state, Task 6) should stay in a safe,
	// retryable "not shipped" state rather than getting a bad write that
	// PERMANENTLY trips the "already sent" guard with no real shipment behind
	// it.
	if((shipId == null || shipId == "") || (shipNoForStorage == null || shipNoForStorage == ""))
	{
		response.put("status","error");
		response.put("message","Shipment created in Inventory but response parsing failed — check the raw response, Inventory's shape may have changed again.");
		response.put("raw", createResp.toString());
		return response;
	}

	// CHANGED 2026-08-06 — writes back onto the specific Package_Shipments row
	// (a plain top-level record — safe to update independently, no subform
	// involved) instead of the parent Service_Appointment_Form record.
	update Package_Shipments[ID == packageShipmentId.toLong()]
	[
		Shipment_Created = true
		Shipment_Order_No = shipNoForStorage
		Shipment_Order_ID = shipId
	];

	response.put("status","success");
	response.put("message","Shipment Order " + shipNoForStorage + " created.");
	response.put("shipmentorder_id", shipId);
	response.put("shipmentorder_no", shipNoForStorage);
	return response;
}

````
