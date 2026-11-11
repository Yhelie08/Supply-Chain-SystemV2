---
title: "add_item_by_id_custom_api"
source_file: "add_item_by_id_custom_api.txt"
category: "_Shared/Deluge/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 381
tags:
  - custom-api
  - deluge
  - fulfillment
  - inquiry
  - kanban
  - pack
  - procurement
  - purchase-order
  - purchase-request
  - zoho-books
  - zoho-creator
  - zoho-inventory
---

# add_item_by_id_custom_api

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `_Shared/Deluge/Deluge`
> - **Source File:** `add_item_by_id_custom_api.txt`
> - **Lines of Code:** 381
> - **Tags:** `#custom-api`, `#deluge`, `#fulfillment`, `#inquiry`, `#kanban`, `#pack`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-books`, `#zoho-creator`, `#zoho-inventory`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== "Add Item" button — Inquiry widget (INQsv2), new 2026-08-03 ==
== Per user request ("add in inquiry. add item button. like add customer. but this
   function user will input item id then it will do the same as sync.js and add
   that item in All_Items complete details") ==
== Mirrors SyncItemsCust/sync-single-item.js's own field mapping and upsert logic
   exactly (ID1/item_name/SKU/Item_ref/Description/Unit/Rate/category/Warehouse/
   Bin_location), just triggered on-demand from inside the widget instead of via a
   Node script — same real Books item ID input (e.g. "2680178000024629990"), same
   3 real storage warehouses, same physical-stock-only warehouse-presence rule
   (warehouse_actual_available_stock, matches so_to_pr_scripts_NewScripts.txt/
   so_kanban_sync.txt's own already-established accounting-vs-physical convention),
   same generic-bin-name filter (Receiving/Package/Default Area). ==
== FIXED same day, real bug hit on first live paste: "Error at line number: 61
   Improper Statement" — root cause was 3 one-liner blocks cramming
   if->for each->if all onto a single line (no prior precedent for that nesting
   depth as a one-liner anywhere in this codebase), plus 3 real ternary
   expressions (cond ? a : b) — Deluge has NO ternary syntax at all, a
   documented gotcha in this app's own CLAUDE.md, hit again here despite that.
   Expanded all 3 nested blocks to normal multi-line if/for each, and replaced
   every ternary with a plain if/else building a variable first. Balance-checked
   (braces/brackets/parens) after the fix. ==
== Image sync ADDED same day, per user request ("but item image needs to be
   included. can you search") — researched first (WebSearch, official Zoho
   Deluge docs + a real community GitHub example): confirmed a FILE-typed
   invokeurl response (Deluge auto-detects a binary/non-JSON response as its own
   FILE data type) "can be assigned...to another Zoho Creator file field"
   directly, per the official "File data type" help page, and the same FILE
   value is shown used directly with zoho.crm.attachFile/zoho.workdrive.uploadFile
   in a real GitHub reference script — no separate Upload File API call needed,
   unlike sync-single-item.js's own Node-side 2-step (download bytes, then a
   separate multipart upload). GENUINELY UNCONFIRMED until live-tested — no
   exact "assign invokeurl FILE response directly to a Creator Image field via
   insert/update" code example was found anywhere, only the 2 corroborating
   signals above. Built as best-effort: fetches the item record's core fields
   first and always commits them regardless of what happens with the image;
   only THEN attempts the image invokeurl + `update Items[...][Image=imageFile]`
   inside a try/catch, so a failure here can never undo the already-saved item
   data. Skips the fetch entirely if Books has no image_name, or if this Creator
   record already has one (mirrors sync-single-item.js's own hasImage/
   existingHasImage skip-if-already-set rule, avoids re-downloading on every
   re-click for an already-synced item). Response includes `imageSynced` +
   an inline "(image sync failed...)" note in the message if it didn't take. ==
== Connection used: zhbooks3 (Creator -> Books), same one already proven for
   every other Creator-side invokeurl call to Books in this app. ==

PREREQUISITE: none — Items/All_Items already exist and are already fully proven
(this is the same form the daily SyncItemsCust bulk sync writes to).

============================================================
CUSTOM FUNCTION — paste as a new Creator Custom Function
Name: addItemByIdBooks
============================================================

map addItemByIdBooks(String itemBooksId)
{
	response = Map();
	orgId = "751117756";
	itemBooksId = itemBooksId.trim();

	if(itemBooksId == "")
	{
		response.put("status","error");
		response.put("message","Item ID is required.");
		return response;
	}

	itemResp = invokeurl
	[
		url :"https://www.zohoapis.com/books/v3/items/" + itemBooksId + "?organization_id=" + orgId
		type :GET
		connection:"zhbooks3"
	];
	detail = itemResp.get("item");
	if(detail == null)
	{
		response.put("status","error");
		response.put("message","Item not found in Books for ID " + itemBooksId + " — check the ID and try again.");
		return response;
	}

	itemName = ifnull(detail.get("name"),"");
	skuVal = ifnull(detail.get("sku"),"");
	itemRefVal = ifnull(detail.get("cf_oldsku"),"");
	descriptionVal = ifnull(detail.get("cf_description"),"");
	unitVal = ifnull(detail.get("unit"),"");
	rateVal = ifnull(detail.get("rate"),0);
	categoryVal = ifnull(detail.get("category_name"),"");
	warehouses = detail.get("warehouses");

	// Warehouse presence string — PHYSICAL stock only (actual_available_stock),
	// matches sync-single-item.js's own 2026-07-29 fix, not accounting stock_on_hand.
	warehouseStr = "";
	if(warehouses != null)
	{
		for each wh in warehouses
		{
			avail = wh.get("warehouse_actual_available_stock");
			if(avail != null && avail != 0)
			{
				whName = wh.get("warehouse_name") + "";
				if(warehouseStr == "") { warehouseStr = whName; } else { warehouseStr = warehouseStr + ", " + whName; }
			}
		}
	}

	// Bin locations — the same 3 real storage warehouses sync-single-item.js checks.
	// Unrolled (no Map.keys() iteration — unproven in this codebase) into 3 identical
	// blocks, one per warehouse, same as this app's own established "hand-roll a
	// small fixed set instead of reaching for an unconfirmed loop construct" convention.
	binStr = "";

	whMatch1 = null;
	if(warehouses != null)
	{
		for each wh in warehouses
		{
			if((wh.get("warehouse_id") + "") == "2680178000042173149")
			{
				whMatch1 = wh;
			}
		}
	}
	if(whMatch1 != null && whMatch1.get("is_storage_location_enabled") == true)
	{
		binResp1 = invokeurl
		[
			url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000042173149/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
			type :GET
			connection:"zhbooks3"
		];
		locs1 = binResp1.get("storage_locations");
		realBins1 = "";
		if(locs1 != null)
		{
			for each loc in locs1
			{
				locName = loc.get("name") + "";
				if(locName != "Receiving Area" && locName != "Package Area" && locName != "Default Area")
				{
					if(realBins1 == "") { realBins1 = locName; } else { realBins1 = realBins1 + ", " + locName; }
				}
			}
		}
		seg1 = "";
		if(realBins1 != "") { seg1 = "HC WH3 BAESA: " + realBins1; } else { seg1 = "HC WH3 BAESA: Map Bins"; }
		binStr = seg1;
	}

	whMatch2 = null;
	if(warehouses != null)
	{
		for each wh in warehouses
		{
			if((wh.get("warehouse_id") + "") == "2680178000055220196")
			{
				whMatch2 = wh;
			}
		}
	}
	if(whMatch2 != null && whMatch2.get("is_storage_location_enabled") == true)
	{
		binResp2 = invokeurl
		[
			url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000055220196/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
			type :GET
			connection:"zhbooks3"
		];
		locs2 = binResp2.get("storage_locations");
		realBins2 = "";
		if(locs2 != null)
		{
			for each loc in locs2
			{
				locName = loc.get("name") + "";
				if(locName != "Receiving Area" && locName != "Package Area" && locName != "Default Area")
				{
					if(realBins2 == "") { realBins2 = locName; } else { realBins2 = realBins2 + ", " + locName; }
				}
			}
		}
		seg2 = "";
		if(realBins2 != "") { seg2 = "HC WH1 BANAWE: " + realBins2; } else { seg2 = "HC WH1 BANAWE: Map Bins"; }
		if(binStr == "") { binStr = seg2; } else { binStr = binStr + " | " + seg2; }
	}

	whMatch3 = null;
	if(warehouses != null)
	{
		for each wh in warehouses
		{
			if((wh.get("warehouse_id") + "") == "2680178000047672049")
			{
				whMatch3 = wh;
			}
		}
	}
	if(whMatch3 != null && whMatch3.get("is_storage_location_enabled") == true)
	{
		binResp3 = invokeurl
		[
			url :"https://www.zohoapis.com/books/v3/settings/warehouses/2680178000047672049/storagelocations?item_id=" + itemBooksId + "&organization_id=" + orgId
			type :GET
			connection:"zhbooks3"
		];
		locs3 = binResp3.get("storage_locations");
		realBins3 = "";
		if(locs3 != null)
		{
			for each loc in locs3
			{
				locName = loc.get("name") + "";
				if(locName != "Receiving Area" && locName != "Package Area" && locName != "Default Area")
				{
					if(realBins3 == "") { realBins3 = locName; } else { realBins3 = realBins3 + ", " + locName; }
				}
			}
		}
		seg3 = "";
		if(realBins3 != "") { seg3 = "INVENTORY: " + realBins3; } else { seg3 = "INVENTORY: Map Bins"; }
		if(binStr == "") { binStr = seg3; } else { binStr = binStr + " | " + seg3; }
	}

	// Upsert into Creator's Items form, matched by ID1 (the Books item id — same
	// dedup key sync-single-item.js's own findCreatorRecord() uses).
	existingId = "";
	existingImageVal = "";
	for each rec in Items[ID1 == itemBooksId]
	{
		existingId = rec.ID + "";
		existingImageVal = rec.Image + "";
	}

	wasUpdate = false;
	newRecordId = "";
	if(existingId != "")
	{
		wasUpdate = true;
		newRecordId = existingId;
		update Items[ID == existingId.toLong()]
		[
			item_name = itemName
			SKU = skuVal
			Item_ref = itemRefVal
			Description = descriptionVal
			Unit = unitVal
			Rate = rateVal
			category = categoryVal
			Warehouse = warehouseStr
			Bin_location = binStr
		];
	}
	else
	{
		insertedId = insert into Items
		[
			ID1 = itemBooksId
			item_name = itemName
			SKU = skuVal
			Item_ref = itemRefVal
			Description = descriptionVal
			Unit = unitVal
			Rate = rateVal
			category = categoryVal
			Warehouse = warehouseStr
			Bin_location = binStr
			Added_User = zoho.loginuser
		];
		newRecordId = insertedId + "";
	}

	// Image sync — best-effort, wrapped so a Books/network hiccup here never
	// undoes the item record that's already been created/updated above. Only
	// attempts a fetch when Books actually has an image AND (this is a brand-new
	// record OR the existing record has no image yet) — same skip-if-already-set
	// rule as sync-single-item.js's own hasImage/existingHasImage check, avoids
	// re-downloading on every "add item" re-click for an item already synced.
	// Per official Zoho Deluge docs, a FILE-typed invokeurl response "can be
	// assigned...to another Zoho Creator file field" directly — first use of this
	// exact mechanism in this codebase, genuinely UNCONFIRMED until live-tested.
	imageNameVal = ifnull(detail.get("image_name"),"");
	shouldFetchImage = false;
	if(imageNameVal != "" && existingImageVal == "")
	{
		shouldFetchImage = true;
	}
	imageSynced = false;
	if(shouldFetchImage)
	{
		try
		{
			imageFile = invokeurl
			[
				url :"https://www.zohoapis.com/books/v3/items/" + itemBooksId + "/image?organization_id=" + orgId
				type :GET
				connection:"zhbooks3"
			];
			update Items[ID == newRecordId.toLong()]
			[
				Image = imageFile
			];
			imageSynced = true;
		}
		catch (e)
		{
			imageSynced = false;
		}
	}

	response.put("status","success");
	response.put("imageSynced", imageSynced);
	response.put("wasUpdate", wasUpdate);
	response.put("recordId", newRecordId);
	response.put("ID1", itemBooksId);
	response.put("item_name", itemName);
	response.put("SKU", skuVal);
	response.put("Rate", rateVal);
	response.put("Unit", unitVal);
	response.put("Description", descriptionVal);
	response.put("category", categoryVal);
	response.put("Warehouse", warehouseStr);
	response.put("Bin_location", binStr);
	messageText = "";
	if(wasUpdate) { messageText = "Updated existing item: " + itemName; } else { messageText = "Added new item: " + itemName; }
	if(shouldFetchImage && !imageSynced) { messageText = messageText + " (image sync failed — item saved without photo)"; }
	response.put("message", messageText);
	return response;
}

============================================================
CUSTOM API — Microservices -> Custom API -> Create
============================================================
Name / link name: add_item_by_id
Method: POST
Function: addItemByIdBooks
Request Body parameter: itemBooksId -> {param_value}
Response: Standard
Auth: Public Key (confirm Enabled, not stuck in Draft — a recurring gotcha in this
app, e.g. see pr_approve_po_custom_api.txt's own NOTES on this exact trap)

After creating, wire the real public key into UI/EndUser/INQsv2/app/index.html's
CUSTOM_API_ADD_ITEM_KEY const (currently 'REPLACE_WITH_KEY' placeholder).

MANUAL STEPS NEEDED:
1. Create the Custom Function above (paste verbatim, including the map
   addItemByIdBooks(...) signature line — Creator Custom Functions need the full
   signature pasted, unlike Books Custom Functions which want body-only).
2. Create the Custom API per the block above, confirm Enabled.
3. Copy its real public key into CUSTOM_API_ADD_ITEM_KEY in INQsv2/app/index.html.
4. Re-zip and re-upload UI/EndUser/INQsv2.zip.

CONFIRMED LIVE 2026-08-04 — real live paste captured verbatim in Temp.txt
(re-captured here, matches this file exactly except Creator's own script editor
auto-added `Added_User = zoho.loginuser` to the insert block — a real Zoho system
field auto-fill on any `insert into` block missing it, same harmless behavior
already documented for Shipment_ID_Counter, now folded into this file too).

REAL BUG FOUND SAME DAY, per user ("i tried to add item. but it saved in
development not in production"): this function has NO environment-locking code
anywhere (confirmed — no `config.put("environment",...)`, every task here is a
plain native `insert into`/`update`/`for each` against the form directly, not a
cross-app `zoho.creator.v2_1.*` REST-style call). A native Custom Function simply
operates on whichever environment it's actually deployed/running in — that's
determined purely by PUBLISH STATUS, not by anything in this code. Since this
function was only ever created live in DEVELOPMENT and has never been part of a
Production publish (same class of gap already hit this session for the Items
form itself — Custom Functions/Custom APIs are publishable components too, not
exempt from the Dev->Stage->Production pipeline). Real fix: publish
`addItemByIdBooks` (Function) + `add_item_by_id` (Custom API) to Production the
same way as any other component — check Environments -> Publish, they should
show up as pending under Functions once genuinely modified/created. Not yet
confirmed whether publishing them resolves it (should, per this reasoning, but
not independently re-tested against Production after a publish as of this
writing).

IMAGE SYNC IS THE RISKIEST PART, GENUINELY UNCONFIRMED — if it errors, the most
likely failure point is the `update Items[ID==newRecordId.toLong()][Image=imageFile]`
line specifically (the item's other fields should still save fine either way,
since that line is wrapped in try/catch and runs AFTER the main upsert). If the
response comes back with `imageSynced:false`, check the Custom Function's own
Execution History in Creator for the real error on that specific line before
assuming the whole feature is broken — everything else may have worked.

````
