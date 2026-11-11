---
title: "books_estimate_sync"
source_file: "production\books_estimate_sync.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 181
tags:
  - delivery-management
  - deluge
  - dms
  - inquiry
  - procurement
  - purchase-order
  - zoho-books
  - zoho-creator
---

# books_estimate_sync

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `production\books_estimate_sync.txt`
> - **Lines of Code:** 181
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== PRODUCTION COPY — books_estimate_sync.txt ==
== Twinned from DelugeScripts/books_estimate_sync.txt on 2026-08-04 ==
== Per docs/DevToProd/2026-08-04-deluge-dev-to-prod-cutover.md ==
== Key rule: environment header OMITTED = defaults to Production (confirmed live 2026-08-04) ==
== Do NOT write environment:"production" as a literal — that throws code 2930. ==
== Books Estimate → Creator Sync ==
== Zoho Books Custom Function (Deluge) ==
== Trigger: Books Workflow Rule → Estimate Edited ==
== Updates all linked Creator Inquiry records ==

====================================================
SETUP STEPS (after writing function):
====================================================
1. Zoho Books → Settings → Automation → Workflow Rules → New Rule
2. Module: Estimates
3. Rule Name: Sync Estimate to Creator
4. When: On Edit
5. Conditions: All Estimates (no filter) — or set criteria if needed
6. Action: Custom Function → select "syncEstimateToCreator"
7. Parameters: pass estimate_id → map to ${estimate.estimate_id}

HOW TO CREATE THE FUNCTION FIRST:
Books → Settings → Automation → Custom Functions → New Function
Name: syncEstimateToCreator
Parameters: string estimate_id
Paste script below → Save → then wire it in Workflow Rule

====================================================
WHAT IT SYNCS TO CREATOR (Inquiry_Form):
====================================================
Estimate-level (all Inquiries with matching Books_Estimate_ID):
  Sales_Owner          ← "Sales Agent" custom field
  Design_Company       ← "Design Company" custom field
  Designer_Architect   ← "Designer/ Architect" custom field
  Design_Partner       ← "Design Partner" custom field
  Commission           ← "Commission " custom field (trailing space!)
  Customer_Type        ← "Customer Type" custom field
  Order_Type           ← "Order Type" custom field
  Project_Type         ← "Project Type:" custom field
  For_Bidding          ← "For Bidding? (✓ if yes)" custom field
  Addtl_Disc_Needed1   ← "Additional discount needed" custom field
  target_date          ← "Target Delivery Date" custom field

Line-item-level (per Inquiry matched by Books_Estimate_ID + SKU):
  SRP_Approved1        ← line_item.rate
  quantity             ← line_item.quantity
  description          ← line_item.description
  unit                 ← line_item.unit

====================================================
NOTES:
- zoho.creator tasks used (no connection needed — same Zoho account)
- Creator app: homecartel / supply-chain-app
- Report used for search + update: All_Inquiries
- Line item match: Books item_id → Creator Items[ID1] → get SKU → find Inquiry
- Commission: if Creator field is decimal, may need value cast — test first
- unit: only sets if value matches existing Creator dropdown option
- Does NOT sync: INQ_No, Books_Estimate_ID/No (already stored), estimate status (deferred)
====================================================

FUNCTION SCRIPT:
====================================================
NOTE: Books editor auto-injects: Map estimate, Map organization, Map user
      Paste ONLY the inner body — no wrapper, no parameter declarations.
      Use estimate Map directly — no invokeurl needed, data already available.
      item_code in line_items IS the SKU — no extra item API calls needed.
      Connection "Supply_Chain" required for zoho.creator cross-app calls.

estimate_id = estimate.get("estimate_id") + "";
cfList = estimate.get("custom_fields");
salesAgent = "";
projNameVal = "";
designCompany = "";
designerArch = "";
designPartner = "";
commissionVal = "";
custTypeVal = "";
orderType = "";
projTypeVal = "";
forBidding = "";
addlDisc = "";
targetDate = "";
for each cf in cfList
{
	cfLabel = cf.get("label") + "";
	cfValue = cf.get("value") + "";
	if(cfLabel == "Sales Agent") { salesAgent = cfValue; }
	if(cfLabel == "Project Name") { projNameVal = cfValue; }
	if(cfLabel == "Design Company") { designCompany = cfValue; }
	if(cfLabel == "Designer/ Architect") { designerArch = cfValue; }
	if(cfLabel == "Design Partner") { designPartner = cfValue; }
	if(cfLabel == "Commission ") { commissionVal = cfValue; }
	if(cfLabel == "Customer Type") { custTypeVal = cfValue; }
	if(cfLabel == "Order Type") { orderType = cfValue; }
	if(cfLabel == "Project Type:") { projTypeVal = cfValue; }
	if(cfLabel.contains("For Bidding")) { forBidding = cfValue; }
	if(cfLabel == "Additional discount needed") { addlDisc = cfValue; }
	if(cfLabel == "Target Delivery Date") { targetDate = cfValue; }
}
config = Map();
updateData = Map();
updateData.put("Sales_Owner", salesAgent);
updateData.put("Design_Company", designCompany);
updateData.put("Designer_Architect", designerArch);
updateData.put("Design_Partner", designPartner);
updateData.put("Commission", commissionVal);
updateData.put("Customer_Type", custTypeVal);
updateData.put("Order_Type", orderType);
updateData.put("Project_Type", projTypeVal);
if(forBidding == "true") { updateData.put("For_Bidding", "True"); } else { updateData.put("For_Bidding", "False"); }
updateData.put("Addtl_Disc_Needed1", addlDisc);
updateData.put("target_date", targetDate);
criteria = "Books_Estimate_ID == \"" + estimate_id + "\"";
zoho.creator.v2_1.updateRecords("homecartel", "supply-chain-app", "All_Inquiries", criteria, updateData, config, "supply_chain");
lineItems = estimate.get("line_items");
for each li in lineItems
{
	liSKU = li.get("sku") + "";
	liRate = li.get("rate") + "";
	liQty = li.get("quantity") + "";
	liDesc = li.get("description") + "";
	liUnit = li.get("unit") + "";
	if(liSKU != "" && liSKU != "null")
	{
		lineData = Map();
		lineData.put("SRP_Approved1", liRate);
		lineData.put("quantity", liQty);
		lineData.put("description", liDesc);
		lineData.put("unit", liUnit);
		criteria2 = "Books_Estimate_ID == \"" + estimate_id + "\" && sku == \"" + liSKU + "\"";
		zoho.creator.v2_1.updateRecords("homecartel", "supply-chain-app", "All_Inquiries", criteria2, lineData, config, "supply_chain");
	}
}

====================================================
STEP BY STEP — HOW TO APPLY:
====================================================

STEP 1: Create the Custom Function in Books
  → Zoho Books → Settings (gear icon) → Automation → Custom Functions
  → Click "+ New Custom Function"
  → Function Name: syncEstimateToCreator
  → Module: Estimates
  → DO NOT add any parameters — Books auto-injects estimate, organization, user
  → Paste ONLY the inner script body (no wrapper { }, no "string estimate_id")
  → Click Save

STEP 2: Test the Function (optional but recommended)
  → In Custom Functions list, find syncEstimateToCreator → click Test
  → Enter a real estimate_id from Books (e.g. from Projects_Report in Creator)
  → Run and check if Creator Inquiry records update

STEP 3: Create Workflow Rule to trigger it
  → Zoho Books → Settings → Automation → Workflow Rules → New Rule
  → Rule Name: Sync Estimate Changes to Creator
  → Module: Estimates
  → When do you want to execute? → On Edit
  → Conditions: skip (or add filters if needed)
  → Actions → Add Action → Custom Function
  → Select: syncEstimateToCreator
  → Map parameter: estimate_id = estimate_id (from estimate fields dropdown)
  → Save the workflow rule
  → IMPORTANT: Enable the rule (toggle it ON)

STEP 4: Test end-to-end
  → Open any estimate in Books that has a matching Inquiry in Creator
  → Edit any field (e.g. change Sales Agent custom field or a line item rate)
  → Save the estimate
  → Check Creator Inquiry record — should update within seconds

====================================================
TROUBLESHOOTING:
====================================================
- "Connection not found" error → zhbooks3 connection needs to be accessible
  from Books context. If so, remove connection param from invokeurl and
  use a Books-native connection or set up a new one in Books Automation settings.
- zoho.creator.getRecords returns empty → check criteria string format,
  confirm Books_Estimate_ID field has data in Creator
- Commission field error → change commission value to commission.toDecimal()
  in the lineData map if Creator field is currency type
====================================================

````
