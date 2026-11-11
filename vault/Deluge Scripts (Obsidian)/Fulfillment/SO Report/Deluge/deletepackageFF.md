---
title: "deletepackageFF"
source_file: "deletepackageFF"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 43
tags:
  - deluge
  - fulfillment
  - pack
  - procurement
  - purchase-order
  - zoho-books
  - zoho-creator
---

# deletepackageFF

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `deletepackageFF`
> - **Lines of Code:** 43
> - **Tags:** `#deluge`, `#fulfillment`, `#pack`, `#procurement`, `#purchase-order`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

owner = "homecartel";
app = "supply-chain-app";
pkgNo = package.get("package_number") + "";
custBookId = package.get("customer_id") + "";
if(pkgNo == "" || pkgNo == "null")
{
	info "Deleted-package payload had no package_number — cannot resolve which Sales_Order_Fulfillment record to delete. If this keeps happening, the Deleted-trigger payload may not carry the same fields as the Created-trigger one — check the Books function execution log for the raw package Map.";
	return;
}
// TEST GATE REMOVED — this is the Production copy. All customers are processed.
// FIXED 2026-08-24, critical bug found via code review: both invokeurl calls below
// used to send headers:{"environment":"development"} — no other script in this
// codebase uses an environment header at all (established practice here is to target
// production directly), so this was pointing every search-and-delete at the
// DEVELOPMENT copy of the app instead of the live production data. The function would
// report "Executed Successfully" and log a normal-looking response either way, but
// would never actually touch real production Sales_Order_Fulfillment records. Removed
// both headers entirely so calls go to production, matching every other live script.
findResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report?criteria=Package%3D%3D%22" + pkgNo + "%22"
	type :GET
	connection:"supply_chain_app"
];
if(findResp.get("data") != null)
{
	for each  rec in findResp.get("data")
	{
		recId = rec.get("ID") + "";
		delResp = invokeurl
		[
			url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report/" + recId
			type :DELETE
			connection:"supply_chain_app"
		];
		info "Deleted Sales_Order_Fulfillment " + recId + " for removed package " + pkgNo + " — resp: " + delResp;
	}
}
else
{
	info "No Sales_Order_Fulfillment record found for deleted package " + pkgNo + " — nothing to clean up.";
}

````
