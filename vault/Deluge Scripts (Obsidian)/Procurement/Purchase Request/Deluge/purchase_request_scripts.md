---
title: "purchase_request_scripts"
source_file: "purchase_request_scripts.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 173
tags:
  - delivery-management
  - deluge
  - dms
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# purchase_request_scripts

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `purchase_request_scripts.txt`
> - **Lines of Code:** 173
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Purchase Request → Supplier PR Forms ==
== On PR create: populate PR Details + Supplier Selected subform for each supplier ==
== Mirror of Inquiry → Supplier_1/Supplier_2 pattern ==
== Counter/Response_Status exchange system: TODO later ==

====================================================
WORKFLOW SETUP — PR_Populate_From_PR
====================================================
Form: Purchase_Request1
Trigger: Created > Successful form submission
Condition: none
Action 1: Execute script — paste ACTION 1 below (Fenteng)
Action 2: Execute script — paste ACTION 2 below (Tony Fan)
NOTE: Keep as SEPARATE actions (same rule as Inquiry → Supplier)
====================================================

ACTION 1 — Fenteng Lighting (Supplier_1)
====================================================

newRecID1 = insert into Fenteng_Lighting_Purchase_Request
[
	PR_No_Supplier1=input.PR_No
	PR_Date_Supplier1=input.PR_Date
	Items_Supplier1=input.Items
	sku_Supplier1=input.sku
	quantity_Supplier1=input.quantity
	Description1_Supplier1=input.Description1
	description_Supplier1=input.description
	unit_Supplier1=input.unit
	category_Supplier1=input.category
	Target_Delivery_Supplier1=input.Target_Delivery
];
newRec1 = Fenteng_Lighting_Purchase_Request[ID == newRecID1];
subRow1 = Fenteng_Lighting_Purchase_Request.Supplier_Selected_Supplier1();
subRow1.Suppliers_Supplier1 = "Fenteng";
newRec1.Supplier_Selected_Supplier1.insert(subRow1);

====================================================
ACTION 2 — Tony Fan (Supplier_2)
====================================================

newRecID2 = insert into Tony_Fan_Purchase_Request
[
	PR_No_Supplier2=input.PR_No
	PR_Date_Supplier2=input.PR_Date
	Items_Supplier2=input.Items
	sku_Supplier2=input.sku
	quantity_Supplier2=input.quantity
	Description1_Supplier2=input.Description1
	description_Supplier2=input.description
	unit_Supplier2=input.unit
	category_Supplier2=input.category
	Target_Delivery_Supplier2=input.Target_Delivery
];
newRec2 = Tony_Fan_Purchase_Request[ID == newRecID2];
subRow2 = Tony_Fan_Purchase_Request.Supplier_Selected_Supplier2();
subRow2.Suppliers_Supplier2 = "Tony";
newRec2.Supplier_Selected_Supplier2.insert(subRow2);

====================================================
SUPPLIER RESPONSE — Sync back to Purchase_Request1
====================================================
WORKFLOW SETUP — PR_Stage_Supplier_Changed_Supplier1
  Form: Fenteng_Lighting_Purchase_Request
  Trigger: Edited > Successful form submission
  Action: Execute script
====================================================

prNo = input.PR_No_Supplier1;
prRecs = Purchase_Request1[PR_No == prNo];
for each  pr in prRecs
{
	for each  row in pr.Supplier_Selected
	{
		if(row.Suppliers == "Fenteng")
		{
			for each  subRow in input.Supplier_Selected_Supplier1
			{
				row.Availability = subRow.Availability_Supplier1;
				row.Initial_Price = subRow.Initial_Price_Supplier1;
				row.Negotiated = subRow.Negotiated_Supplier1;
				row.Final_Price = subRow.Final_Price_Supplier1;
				row.Lead_Time = subRow.Lead_Time_Supplier1;
				break;
			}
			break;
		}
	}
	break;
}

====================================================
WORKFLOW SETUP — PR_Stage_Supplier_Changed_Supplier2
  Form: Tony_Fan_Purchase_Request
  Trigger: Edited > Successful form submission
  Action: Execute script
====================================================

prNo = input.PR_No_Supplier2;
prRecs = Purchase_Request1[PR_No == prNo];
for each  pr in prRecs
{
	for each  row in pr.Supplier_Selected
	{
		if(row.Suppliers == "Tony")
		{
			for each  subRow in input.Supplier_Selected_Supplier2
			{
				row.Availability = subRow.Availability_Supplier2;
				row.Initial_Price = subRow.Initial_Price_Supplier2;
				row.Negotiated = subRow.Negotiated_Supplier2;
				row.Final_Price = subRow.Final_Price_Supplier2;
				row.Lead_Time = subRow.Lead_Time_Supplier2;
				break;
			}
			break;
		}
	}
	break;
}

====================================================
DISABLE PR DETAILS + SUBFORM FIELDS (Read-only on load)
====================================================
WORKFLOW SETUP — Disable_PR_Details_Supplier1
  Form: Fenteng_Lighting_Purchase_Request
  Trigger: Created or Edited > Load of Form
  Action: Execute script
====================================================

disable PR_No_Supplier1;
disable PR_Date_Supplier1;
disable Items_Supplier1;
disable sku_Supplier1;
disable quantity_Supplier1;
disable Description1_Supplier1;
disable description_Supplier1;
disable unit_Supplier1;
disable category_Supplier1;
disable Target_Delivery_Supplier1;
disable Supplier_Selected_Supplier1.Suppliers_Supplier1;
disable Supplier_Selected_Supplier1.Status_Supplier1;
disable Supplier_Selected_Supplier1.Selected_Supplier1;

====================================================
WORKFLOW SETUP — Disable_PR_Details_Supplier2
  Form: Tony_Fan_Purchase_Request
  Trigger: Created or Edited > Load of Form
  Action: Execute script
====================================================

disable PR_No_Supplier2;
disable PR_Date_Supplier2;
disable Items_Supplier2;
disable sku_Supplier2;
disable quantity_Supplier2;
disable Description1_Supplier2;
disable description_Supplier2;
disable unit_Supplier2;
disable category_Supplier2;
disable Target_Delivery_Supplier2;
disable Supplier_Selected_Supplier2.Suppliers_Supplier2;
disable Supplier_Selected_Supplier2.Status_Supplier2;
disable Supplier_Selected_Supplier2.Selected_Supplier2;

====================================================
NOTES:
- Always sends to BOTH suppliers on every PR create — no subform check
  (Supplier_Selected subform is empty at create time, so conditional check never fires)
- Supplier_Selected subform in supplier PR forms: TODO — populate later when supplier exchange system added
- Separate actions required (Fenteng insert must not be in same script as Tony Fan insert)
- Counter / Response_Status exchange system: TODO later
====================================================

````
