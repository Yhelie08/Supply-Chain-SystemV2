---
title: "deletepackage"
source_file: "deletepackage"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]"
lines: 55
tags:
  - deluge
  - fulfillment
  - kanban
  - pack
  - procurement
  - purchase-order
  - zoho-books
  - zoho-creator
  - zoho-inventory
---

# deletepackage

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `deletepackage`
> - **Lines of Code:** 55
> - **Tags:** `#deluge`, `#fulfillment`, `#kanban`, `#pack`, `#procurement`, `#purchase-order`, `#zoho-books`, `#zoho-creator`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Pack/Widget/Pack Widget|Pack Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge

owner = "homecartel";
app = "supply-chain-app";
// ===== FIXED 2026-09-02, same 3 bug classes found+fixed across this whole app today:
// (1) TEST GATE removed — was hard-blocking every real customer's package deletion from
//     ever cleaning up its Sales_Order_Fulfillment record, same leftover 2026-07-29
//     pattern found in so_kanban (see [[project_so_kanban_test_gate_removed]]). This is
//     the Production copy now — all customers are processed.
// (2) Connection name migrated supply_chain -> supply_chain_app (2026-08-26 migration,
//     see [[project_connection_migration_supply_chain_app]] — this file was one of the
//     35+ duplicates never touched during that migration).
// (3) Removed hardcoded headers:{"environment":"development"} on both invokeurl calls —
//     the EXACT bug already fixed in so_kanban 2026-08-07 ("this function wrote to
//     Development no matter which environment's Workflow Rule actually invoked it...
//     fix is to OMIT the environment key entirely — Creator defaults to Production when
//     it's simply not present"). This file never got that fix — every run was reading/
//     deleting against Development, not the real Production Sales_Order_Fulfillment
//     data, which would explain a deleted package never actually cleaning up the real
//     live Kanban record.
// Also per today's [[project_syncpackagetofulfillment_moved_to_inventory]] finding:
// packages for these SOs are created (and therefore deleted) via ZOHO INVENTORY, not
// natively in Books — this function's own Workflow Rule (Module: Package, Deleted
// event) needs to live in Inventory's own Settings -> Automation -> Workflow Rules, same
// as syncpackagetofulfillment's rule, not in Books.
// =====
pkgNo = package.get("package_number") + "";
if(pkgNo == "" || pkgNo == "null")
{
	info "Deleted-package payload had no package_number — cannot resolve which Sales_Order_Fulfillment record to delete. If this keeps happening, the Deleted-trigger payload may not carry the same fields as the Created-trigger one — check the function execution log for the raw package Map.";
	return;
}
findResp = invokeurl
[
	url :"https://creator.zoho.com/api/v2.1/" + owner + "/" + app + "/report/Sales_Order_Fulfillment_Report?criteria=Package%3D%3D%22" + pkgNo + "%22"
	type :GET
	connection:"supply_chain_app_v1"
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
			connection:"supply_chain_app_v1"
		];
		info "Deleted Sales_Order_Fulfillment " + recId + " for removed package " + pkgNo + " — resp: " + delResp;
	}
}
else
{
	info "No Sales_Order_Fulfillment record found for deleted package " + pkgNo + " — nothing to clean up.";
}

````
