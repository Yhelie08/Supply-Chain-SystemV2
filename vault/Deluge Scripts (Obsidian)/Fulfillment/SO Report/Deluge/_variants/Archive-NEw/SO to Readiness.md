---
title: "SO to Readiness"
source_file: "Deluge Script/SO to Readiness"
category: "Fulfillment/SO Report/Deluge/_variants/Archive-NEw"
associated_widget: "[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]"
lines: 191
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
  - zoho-books
  - zoho-creator
---

# SO to Readiness

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]
> - **Category:** `Fulfillment/SO Report/Deluge/_variants/Archive-NEw`
> - **Source File:** `Deluge Script/SO to Readiness`
> - **Lines of Code:** 191
> - **Tags:** `#crate`, `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Order Readiness/Widget/Sales Order Readiness Gate Widget|Sales Order Readiness Gate Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
// FIXED 2026-07-28, per user report ("yung pac# wala", ibang field din daw): kung "On
// Add" LANG ang naka-set na trigger nito sa Zoho Creator (Form > Workflow > Choose form:
// Sales_Order_Fulfillment > Run when a record is: Created), HINDI na ito muling tatakbo
// kapag na-edit/na-update ang record — pero ang Package/PAC# AT Delivery_Type ay
// itinatakda lang mismo sa syncpackagetofulfillment.txt sa pamamagitan ng pag-UPDATE
// (zoho.creator.v2_1.updateRecords) sa record na ito, HINDI bagong Add. Kaya kung
// blangko pa ang Package noong una itong ginawa (karaniwan, dahil so_fulfillment_sync.txt
// ang gumagawa nito bago pa magkaroon ng package), at "On Add" lang ang trigger, ang
// PACKAGE REQUIRED GUARD sa ibaba ay mag-e-early-return at HINDI NA MULING TATAKBO kailan
// man — kaya laging blangko ang Package_Order (at ibang field na kasabay na-a-update,
// tulad ng Delivery_Type) sa Sales_Order_Readiness_Gate.
//
// TAMANG SETUP: Choose form: Sales Order Fulfillment
//               Run when a record is ( Record Event ): Created OR EDITED (parehong dapat
//               naka-check, HINDI Created lang) — para muling tumakbo ang workflow na ito
//               sa sandaling ma-update ng syncpackagetofulfillment.txt ang Package/
//               Delivery_Type, at doon na makikita ng PACKAGE REQUIRED GUARD sa ibaba na
//               may laman na ang Package, saka na ito magpapatuloy sa pag-sync papunta sa
//               Sales_Order_Readiness_Gate.
// When to trigger workflow ( Form Event ): Successful form submission
//
// Field values below are read directly by their Field Link Name, the standard
// convention for Creator form workflows.
// DIAGNOSTIC — log the raw values first so a bad assumption (like the SO ID mixup in
// so_creation_sync.txt) shows up immediately in the Execution Result log instead of
// failing silently or blowing up deeper in the script.
info "SO_No: " + SO_No;
info "Package: " + Package;
info "order_type: " + order_type;
info "Delivery_Type: " + Delivery_Type;
info "Status: " + Status;
info "Customer: " + Customer;
info "PR_No: " + PR_No;
info "RR_No: " + RR_No;
info "For_Crate: " + For_Crate;
info "target_delivery_date: " + target_delivery_date;
info "Item_Details1: " + Item_Details1;
soNoVal = SO_No + "";
packageVal = Package + "";
// ===== PACKAGE REQUIRED GUARD (per user request 2026-07-22) — Sales_Order_Fulfillment
// records can exist before a Package/PAC# is assigned (e.g. created straight from
// SO-creation, so_creation_sync.txt), in which case Package is still blank. The
// Readiness Gate is meant to track packages that are actually ready for picking, so a
// record with no Package yet should not sync into it at all. Stop here — no Readiness
// Gate record gets created or updated until this same workflow re-runs later with a
// real Package value (e.g. once so_fulfillment_sync.txt sets it after a package is
// created in Books).
if(packageVal == "" || packageVal == "null")
{
	info "No Package Number yet on this Sales_Order_Fulfillment record (SO " + (SO_No + "") + ") — skipping Readiness Gate sync until a package exists.";
	return;
}
orderTypeVal = order_type + "";
deliveryTypeVal = Delivery_Type + "";
statusVal = Status + "";
prNoVal = PR_No + "";
rrNoVal = RR_No + "";
// For_Crate is checkbox-to-checkbox (boolean), no stringify/translation needed.
forCrateVal = For_Crate;
// target_delivery_date (Sales_Order_Fulfillment) -> Target_Delivery_Date (Readiness
// Gate), date-to-date, no stringify/translation needed.
targetDeliveryDateVal = target_delivery_date;
custTypeVal = Customer_Type + "";
billAddrVal = Billing_Address + "";
shipAddrVal = Shipping_Address + "";
// ===== PAYMENT STATUS TRANSLATION =====
// Sales_Order_Fulfillment's Status picklist (Yes/No/Partial) maps to
// Sales_Order_Readiness_Gate's payment_status picklist (Paid/Partially Paid/Pending)
// — different label sets for the same underlying concept, translate here.
paymentStatusVal = "Pending";
if(statusVal == "Yes")
{
	paymentStatusVal = "Paid";
}
else if(statusVal == "Partial")
{
	paymentStatusVal = "Partially Paid";
}
// ===== CUSTOMER NAME LOOKUP (native form query, same app) =====
// Sales_Order_Fulfillment only carries the linked Customer record's ID — fetch the
// Customer record by that ID to get the actual name. custIdVal stays NUMBER (not
// stringified) — the earlier Sales_Order_Fulfillment[ID == recId] fetch errored when
// the right side was TEXT against ID's NUMBER type, same rule applies here.
// Dot-notation on a record errors immediately on a field that doesn't exist (unlike
// Map.get(), which just returns null) — both custRec.Name and custRec.Customer_Name
// errored with "Variable ... does not exist in Customer" (2026-07-20). The original
// Sales_Order_Fulfillment form schema's own Customer field definition
// ("displayformat = [customer_name]") names the real field: lowercase customer_name.
custNameVal = "";
custIdVal = Customer;
if(custIdVal != null)
{
	custRecordsList = Customer[ID == custIdVal];
	for each  custRec in custRecordsList
	{
		custNameVal = custRec.customer_name + "";
	}
	if(custNameVal == "null")
	{
		custNameVal = "";
	}
}
// customer_address: prefer Shipping_Address, fall back to Billing_Address — same
// preference order used for Pre_Order_FF's Customer_Address in so_fulfillment_sync.txt.
custAddressVal = shipAddrVal;
if(custAddressVal == "")
{
	custAddressVal = billAddrVal;
}
// ===== RE-FETCH FULL RECORD FOR SUBFORM DATA =====
// The bare "Item_Details1" trigger variable does NOT give the subform's row data —
// confirmed live 2026-07-20: logging it printed a single bare ID number (matching
// the same format as the Customer field's linked-record ID), not a list of rows, so
// every row.Item / row.get("Item") attempt against it came back null. Same fix
// pattern as so_fulfillment_sync.txt's SO detail fetch: re-fetch the full record by
// its own ID and read the subform off THAT instead.
// recId stays NUMBER (ID's own type) — comparing ID (NUMBER) == a stringified ID
// (TEXT) errored with "In Criteria left expression is of type NUMBER and right
// expression is of type TEXT and the operator == is not valid" (2026-07-20).
recId = ID;
info "own record ID: " + recId;
itemRows = List();
soFullList = Sales_Order_Fulfillment[ID == recId];
for each  soFullRec in soFullList
{
	itemRows = soFullRec.Item_Details1;
}
info "itemRows (re-fetched): " + itemRows;
// ===== ONE Sales_Order_Readiness_Gate RECORD PER ITEM ROW — UPSERT =====
// Readiness Gate's Item_Name/SKU/Quantity/Bin_Location are plain fields, not a
// subform, so a Fulfillment record with several items becomes several Readiness
// Gate records — same per-item pattern already used for Pre_Order_FF. Matched per
// SO_No + SKU: if a record already exists for that item, update it in place
// (correct native syntax confirmed via Zoho's own docs, 2026-07-20: "update
// <loop_variable> [ field = value ];" — operates on the loop variable itself with
// square brackets, NOT "update FormName[criteria] (...)", which doesn't exist and
// was the source of every earlier save error); only insert if nothing matched.
for each  row in itemRows
{
	itemName = row.Item + "";
	itemSKU = row.SKU + "";
	itemQty = row.Quantity + "";
	itemBin = row.Bin_Location + "";
	matchingGateRecords = Sales_Order_Readiness_Gate[sales_order_number == soNoVal && SKU == itemSKU];
	foundExisting = false;
	for each  gateRec in matchingGateRecords
	{
		update gateRec
		[
			Order_Type = orderTypeVal
			Package_Order = packageVal
			Delivery_Type = deliveryTypeVal
			For_Crate = forCrateVal
			Target_Delivery_Date = targetDeliveryDateVal
			payment_status = paymentStatusVal
			customer_name = custNameVal
			customer_type = custTypeVal
			customer_address = custAddressVal
			pr_number = prNoVal
			rr_number = rrNoVal
			Item_Name = itemName
			Quantity = itemQty
			Bin_Location = itemBin
		];
		info "Sales_Order_Readiness_Gate record updated, ID: " + gateRec.ID;
		foundExisting = true;
	}
	if(!foundExisting)
	{
		newId = insert into Sales_Order_Readiness_Gate
		[
			sales_order_number = soNoVal
			Order_Type = orderTypeVal
			Package_Order = packageVal
			Delivery_Type = deliveryTypeVal
			For_Crate = forCrateVal
			Target_Delivery_Date = targetDeliveryDateVal
			payment_status = paymentStatusVal
			customer_name = custNameVal
			customer_type = custTypeVal
			customer_address = custAddressVal
			pr_number = prNoVal
			rr_number = rrNoVal
			Item_Name = itemName
			SKU = itemSKU
			Quantity = itemQty
			Bin_Location = itemBin
		];
		info "Sales_Order_Readiness_Gate record created, ID: " + newId;
	}
}

````
