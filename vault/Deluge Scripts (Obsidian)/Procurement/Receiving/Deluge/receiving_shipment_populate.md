---
title: "receiving_shipment_populate"
source_file: "receiving_shipment_populate.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]"
lines: 432
tags:
  - deluge
  - fulfillment
  - inquiry
  - pack
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# receiving_shipment_populate

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `receiving_shipment_populate.txt`
> - **Lines of Code:** 432
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Order/Widget/Purchase Order Widget|Purchase Order Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Receiving: populate Receiving_Line_Items from selected Shipment ==
== Source: Shipments.PO_Shipments subform (label "Shipment Line Items", link name PO_Shipments), matched via Receiving.Shipments picklist ==

====================================================
WORKFLOW SETUP — Receiving_Populate_From_Shipment
  Form: Receiving
  Trigger: Created or Edited > User input of Shipments
  Action: Execute script
====================================================

if(input.Shipments != null)
{
	shipRec = Shipments[ID == input.Shipments];
	if(shipRec != null)
	{
		input.SO_No = shipRec.Sales_Order;
		input.PO_No = shipRec.PO_No.PO_No;
		input.Customer_Name = shipRec.Customer;
		input.Supplier = shipRec.Supplier;

		orgId = "751117756";
		whId = "2680178000042173149";
		binLocs = List();
		for each  page in {1,2,3,4,5,6}
		{
			binUrl = "https://www.zohoapis.com/books/v3/settings/warehouses/" + whId + "/storagelocations?organization_id=" + orgId + "&page=" + page + "&per_page=200";
			binResp = invokeurl
			[
				url: binUrl
				type: GET
				connection: "zoho_books"
			];
			locs = binResp.get("storage_locations");
			if(locs == null || locs.size() == 0)
			{
				break;
			}
			for each  loc in locs
			{
				binLocs.add(loc);
			}
			hasMore = binResp.get("page_context").get("has_more_page");
			if(hasMore == false)
			{
				break;
			}
		}
		defaultBinNames = {"Package Area","Receiving Area","Default Area"};

		input.Receiving_Line_Items.clear();
		for each  li in shipRec.PO_Shipments
		{
			row = Receiving.Receiving_Line_Items();
			row.PR_No = li.PR_No;
			row.SKU = li.SKU;
			row.Item_Name = li.Item_Name;
			row.Expected_Qty = li.Shipment_QTY;
			input.Receiving_Line_Items.insert(row);
		}

		for each  r in input.Receiving_Line_Items
		{
			itemRecBin = Items[SKU == r.SKU];
			rowCategory = "";
			if(itemRecBin != null)
			{
				rowCategory = itemRecBin.category;
			}

			candidateBins = List();
			if(rowCategory != "")
			{
				for each  loc in binLocs
				{
					zName = loc.get("zone_name") + "";
					if(zName.toLowerCase().contains(rowCategory.toLowerCase()))
					{
						candidateBins.add(loc);
					}
				}
			}

			clear r.Bin_location;
			for each  dName in defaultBinNames
			{
				r.Bin_location:ui.add(dName);
			}
			if(candidateBins.size() > 0)
			{
				for each  cLoc in candidateBins
				{
					r.Bin_location:ui.add(cLoc.get("name"));
				}
			}
			else
			{
				for each  aLoc in binLocs
				{
					r.Bin_location:ui.add(aLoc.get("name"));
				}
			}

			stockedBinName = "";
			if(itemRecBin != null && itemRecBin.ID1 != null && itemRecBin.ID1 != "")
			{
				itemBinResp = invokeurl
				[
					url: "https://www.zohoapis.com/books/v3/settings/warehouses/" + whId + "/storagelocations?organization_id=" + orgId + "&item_id=" + itemRecBin.ID1
					type: GET
					connection: "zoho_books"
				];
				itemBins = itemBinResp.get("storage_locations");
				if(itemBins != null)
				{
					for each  ib in itemBins
					{
						ibQty = ib.get("balance_quantity");
						if(ibQty != null && ibQty > 0 && stockedBinName == "")
						{
							stockedBinName = ib.get("name") + "";
						}
					}
				}
			}
			if(stockedBinName != "")
			{
				r.Bin_location = stockedBinName;
			}
			else
			{
				r.Bin_location = "Receiving Area";
			}
		}
	}
}
else
{
	input.SO_No = "";
	input.PO_No = "";
	input.Customer_Name = "";
	input.Supplier = "";
	input.Receiving_Line_Items.clear();
}

====================================================
WORKFLOW SETUP — Receiving_Load_Bin_Choices (SEPARATE workflow, added 2026-07-06)
  Form: Receiving
  Trigger: Created or Edited > Load of form
  Action: Execute script
  WHY SEPARATE: Receiving_Populate_From_Shipment above only fires on "User input of
  Shipments" — editing an EXISTING record without touching the Shipments field never
  re-runs it, so Bin_location choices/default never populate for existing records. This
  action re-applies the same bin logic every time the form is opened (Created or Edited),
  regardless of whether Shipments was touched. Only sets a DEFAULT value when a row's
  Bin_location is still blank — never overwrites a bin the user already picked.
====================================================

orgId = "751117756";
whId = "2680178000042173149";
binLocsLoad = List();
for each  page in {1,2,3,4,5,6}
{
	binUrlLoad = "https://www.zohoapis.com/books/v3/settings/warehouses/" + whId + "/storagelocations?organization_id=" + orgId + "&page=" + page + "&per_page=200";
	binRespLoad = invokeurl
	[
		url: binUrlLoad
		type: GET
		connection: "zoho_books"
	];
	locsLoad = binRespLoad.get("storage_locations");
	if(locsLoad == null || locsLoad.size() == 0)
	{
		break;
	}
	for each  locLoad in locsLoad
	{
		binLocsLoad.add(locLoad);
	}
	hasMoreLoad = binRespLoad.get("page_context").get("has_more_page");
	if(hasMoreLoad == false)
	{
		break;
	}
}
defaultBinNamesLoad = {"Package Area","Receiving Area","Default Area"};

for each  r in input.Receiving_Line_Items
{
	itemRecBinLoad = Items[SKU == r.SKU];
	rowCategoryLoad = "";
	if(itemRecBinLoad != null)
	{
		rowCategoryLoad = itemRecBinLoad.category;
	}

	candidateBinsLoad = List();
	if(rowCategoryLoad != "")
	{
		for each  locLoad in binLocsLoad
		{
			zNameLoad = locLoad.get("zone_name") + "";
			if(zNameLoad.toLowerCase().contains(rowCategoryLoad.toLowerCase()))
			{
				candidateBinsLoad.add(locLoad);
			}
		}
	}

	existingBinLoad = r.Bin_location + "";
	if(existingBinLoad == "null")
	{
		existingBinLoad = "";
	}
	clear r.Bin_location;
	for each  dNameLoad in defaultBinNamesLoad
	{
		r.Bin_location:ui.add(dNameLoad);
	}
	if(candidateBinsLoad.size() > 0)
	{
		for each  cLocLoad in candidateBinsLoad
		{
			r.Bin_location:ui.add(cLocLoad.get("name"));
		}
	}
	else
	{
		for each  aLocLoad in binLocsLoad
		{
			r.Bin_location:ui.add(aLocLoad.get("name"));
		}
	}

	if(existingBinLoad != "")
	{
		r.Bin_location = existingBinLoad;
	}
	else
	{
		stockedBinNameLoad = "";
		if(itemRecBinLoad != null && itemRecBinLoad.ID1 != null && itemRecBinLoad.ID1 != "")
		{
			itemBinRespLoad = invokeurl
			[
				url: "https://www.zohoapis.com/books/v3/settings/warehouses/" + whId + "/storagelocations?organization_id=" + orgId + "&item_id=" + itemRecBinLoad.ID1
				type: GET
				connection: "zoho_books"
			];
			itemBinsLoad = itemBinRespLoad.get("storage_locations");
			if(itemBinsLoad != null)
			{
				for each  ibLoad in itemBinsLoad
				{
					ibQtyLoad = ibLoad.get("balance_quantity");
					if(ibQtyLoad != null && ibQtyLoad > 0 && stockedBinNameLoad == "")
					{
						stockedBinNameLoad = ibLoad.get("name") + "";
					}
				}
			}
		}
		if(stockedBinNameLoad != "")
		{
			r.Bin_location = stockedBinNameLoad;
		}
		else
		{
			r.Bin_location = "Receiving Area";
		}
	}
}

====================================================
NOTES:
- PREREQUISITE (added 2026-07-06): Receiving_Line_Items.Bin_location must be a plain
  Dropdown field (no source form, static choices left blank — replaced dynamically every
  time this action runs). It was previously a lookup into Items styled as a picklist
  (values=Items.ID, displayformat=[Bin_location]) — wrong type for ui.add() string choices.
- BIN LOCATION AUTO-POPULATE + FILTER + DEFAULT (added 2026-07-06, folds in and retires
  the standalone receiving_bin_location_choices.txt): per user request — filter each
  line's Bin_location choices down to bins matching that line's own item category, and
  default-select a bin based on current stock, while still letting the user override.
  - Bin master fetched ONCE per Shipment-select (not per line) via the same undocumented
    endpoint as syncWarehouseBins.dg: GET .../settings/warehouses/{whId}/storagelocations
    (no item_id -> full WH3 bin list, paginated per_page=200 — confirmed live 2026-07-06,
    WH3 has 1023 total bins across 6 pages).
  - CATEGORY FILTER — chosen approach vs a hardcoded bin-name-prefix map (user's own
    guess was "Pendant Light" -> prefix "PL", which IS correct, confirmed live) is instead
    to match on the bin's own `zone_name` containing the item's `category` text
    (case-insensitive substring). Confirmed live 2026-07-06 zone_name values: "Table Lamp
    Zone", "Table Lamp Zone 2.0", "Floor Lamp Zone", "Ceiling Light Zone", "Wall Light
    Zone", "Pendant Light Zone", "MEZZANINE 2 - PENDANT LIGHT ZONE", "Chandelier Zone" —
    all follow "<category-ish text> Zone" naming, and Items.category IS literally Books'
    category_name (set directly by syncWarehouseBins.dg), so substring-matching zone_name
    against category self-adapts to new categories/zones without maintaining a manual
    prefix table. Chose this over the prefix-map approach specifically because it needs
    zero maintenance if Home Cartel adds more zones later.
  - "Package Area"/"Receiving Area"/"Default Area" are ALWAYS added as choices regardless
    of category — confirmed via screenshot (image (2).png) that Books' own "Select Bin
    Locations" popup always offers these 3 alongside real bins. (Earlier version of this
    feature — receiving_bin_location_choices.txt — wrongly EXCLUDED these 3, copying an
    exclusion rule from syncWarehouseBins.dg that was for a different purpose: building a
    human-readable "current known location" text on Items.Bin_location, not "what are
    valid choices when receiving new stock". Corrected here.)
  - FALLBACK: if no zone matches the item's category (candidateBins empty), choices fall
    back to the FULL bin list rather than leaving the dropdown looking broken/empty.
  - DEFAULT SELECTION: among category-matching bins only (never the 3 default areas),
    pick the first one with `balance_quantity > 0` (stock already sitting there) as the
    pre-selected value. If none of the category bins currently hold stock, default to
    "Receiving Area" instead (goods not yet putaway) — per user: "if there is no stock in
    bin in that should default to receiving area... but still have choice, vice versa".
    User can still change the selection either way — this only sets the initial value,
    doesn't restrict what's pickable.
  - COST: this now runs on every Shipments picklist selection (not just once per form
    open like the retired Load-of-form version) — up to 6 invokeurl calls per selection,
    shared against the 10,000/day Books API limit. If Receiving gets heavy multi-user
    traffic or Shipments gets re-picked often per record, consider the daily-scheduled-
    sync-into-a-Creator-form alternative flagged in the retired file instead.
  - BUG confirmed live 2026-07-06: original version built `row` via
    `Receiving.Receiving_Line_Items()`, called `clear row.Bin_location;`/`row.Bin_location:
    ui.add(...)` on it, THEN inserted it — errored with a Creator internal crash:
    "Cannot invoke ... NViewComponent.getRefNView() because 'nviewComp' is null". Root
    cause: `clear`/`ui.add()` need the row to already be attached to a rendered/bound
    subform view — a freshly-constructed row object that hasn't been inserted yet has no
    such binding. FIXED: split into two passes — insert all rows PLAIN first (just
    PR_No/SKU/Item_Name/Expected_Qty, no bin logic), then a SEPARATE
    `for each r in input.Receiving_Line_Items { ... }` loop sets Bin_location choices +
    default value per row, now iterating the actual already-attached `input.
    Receiving_Line_Items` collection instead of the bare unattached constructor result —
    matches Zoho's own documented convention more closely (`for each row in input.
    SubformName {...}`). Still not fully proven live past this specific error — if
    `clear r.Bin_location`/`ui.add()` errors AGAIN even on the attached collection, the
    fallback is dropping dynamic choice-population entirely: make Bin_location's static
    choices a fixed pre-set list (all real WH3 bins, refreshed periodically rather than
    live per selection) and only do the default-value assignment
    (`r.Bin_location = stockedBinName;`) via script, no `ui.add()` at all.
  - BUG confirmed live 2026-07-06 (second round): after the two-pass fix above, user
    tested by opening an EXISTING Receiving record and editing it — no error this time,
    but also no choices/filter/default applied at all. Root cause: this whole feature
    only lived in Receiving_Populate_From_Shipment, which triggers on "User input of
    Shipments" — that event ONLY fires when the Shipments field is actually picked/
    changed. Opening an existing record to edit some other field never touches Shipments,
    so the action never re-runs. FIXED by adding Receiving_Load_Bin_Choices as a fully
    SEPARATE workflow (Created or Edited > Load of form) that re-applies the exact same
    bin filter/choice logic every time the form is opened, regardless of whether Shipments
    was touched — see that WORKFLOW SETUP block above. Only fills a DEFAULT when a row's
    Bin_location is still blank (`if(r.Bin_location == null || r.Bin_location == "")`) so
    it never clobbers a bin the user already manually chose on a previous save.
  - COST (revised): bin master is now fetched on BOTH triggers — once per Shipments pick
    AND once per form open (Load of form fires on every single open, not just edits with
    changes). For a form opened/edited often, this could add up meaningfully against the
    10,000/day shared Books API limit (up to 6 calls each time). If this becomes a real
    problem, revisit the daily-scheduled-sync-into-Creator alternative flagged earlier —
    not built yet since actual Receiving open frequency wasn't known at implementation time.
  - BUG confirmed live 2026-07-06 (fourth round): user manually picked a bin, saved, then
    reopened the record — the pick was gone, field back to blank. Root cause: `clear
    r.Bin_location;` (needed to refresh the dropdown's CHOICE LIST every time) also wipes
    the field's currently stored VALUE, not just its available options — undocumented
    side effect, only discovered by this symptom. The existing `if(r.Bin_location==null
    ...)` blank-check ran AFTER `clear` had already blanked it, so it always looked
    "blank" and either re-defaulted or landed on nothing, discarding whatever the user
    had actually saved. FIXED (Receiving_Load_Bin_Choices only — the
    Receiving_Populate_From_Shipment version rebuilds rows from scratch each time via
    `.clear()`+re-insert, so it never had an existing value to lose): capture
    `existingBinLoad = r.Bin_location + "";` BEFORE calling `clear`, then after rebuilding
    choices, explicitly restore it (`if(existingBinLoad != ""){ r.Bin_location =
    existingBinLoad; }`) instead of relying on the value surviving `clear` on its own —
    only runs the stock-based default logic in the `else` branch, when there truly was no
    prior pick.
  - BUG confirmed live 2026-07-06 (third round, via screenshot + direct API check): tested
    with PR-00016 (Acantha Deux | Wall Light) and PR-00017 (Adaren Une | Pendant Light) —
    auto-selected "WL-ALE01-PLBIN01" and "PL-ALE01-PLBN01" respectively, both category-
    correct, but user asked to verify whether stock in those specific bins actually
    belongs to those specific items. Checked live: Books' PER-ITEM bin endpoint
    (.../storagelocations?...&item_id=X, same call as syncWarehouseBins.dg uses) returned
    EMPTY storage_locations for BOTH test items — Books has no confirmed bin assignment
    for either item yet. Yet the script picked a bin anyway, because the default logic
    was checking the GENERAL bin's balance_quantity (WL-ALE01-PLBIN01 shows 52 units
    general stock) — stock that could belong to any OTHER item sharing that category
    zone, not necessarily this one. FIXED in both actions (Receiving_Populate_From_Shipment
    and Receiving_Load_Bin_Choices): default-selection now calls the PER-ITEM endpoint
    directly (`...&item_id=` + `itemRecBin.ID1`, using Items.ID1 = the Books item_id per
    this project's established convention) instead of trusting general category-bin
    stock. Only defaults to a real bin if Books confirms THIS item has stock there; else
    falls back to "Receiving Area" — matches both test items' correct real-world state
    (no confirmed bin yet -> should default to Receiving Area, not guess). Choices
    (the dropdown OPTIONS) still come from the general category filter — only the
    DEFAULT VALUE logic changed. Adds one more invokeurl call per line (per-item lookup),
    on top of the existing per-trigger warehouse-wide dump.
- Trigger = "User input of Shipments" so the grid fills live while the user is still
  filling the Add/Edit form, same mechanism as Trigger_Estimate on Inquiry_Form. Direct
  input context -> Shipments[ID == input.Shipments] is safe (per Deluge Gotchas in
  CLAUDE.md: works on input.X, not on a fetched record's lookup field).
- Field mapping Shipment_Line_Items -> Receiving_Line_Items:
    PR_No -> PR_No, SKU -> SKU, Item_Name -> Item_Name, Shipment_QTY -> Expected_Qty
  (Shipment_QTY = what's actually being shipped on this shipment = what's expected to
  arrive at receiving). Ordered_QTY/Remaining_QTY/Shipping_Mode/Line_Status/Fully_Shipped
  from Shipment_Line_Items are NOT copied — not relevant to receiving inspection.
- Receiving-side fields NOT populated here (filled later during physical inspection):
  RR_No, Single_Line, Accepted_Qty, Damage_Qty, Missing_Qty, Bin_location, Line_Result,
  Has_Exceptions, Ready_for_Fulfillment, Label_Ready, Label_Printed, Receive_Photo,
  Damage_Photo, Damage_Note.
- TOP-FIELD AUTO-FILL: first guess (shipRec.SO_No) was WRONG live — "Variable SO_No does
  not exist in Shipments". Real link name is Sales_Order, not SO_No (confirmed by user
  2026-07-02). PO_No, Customer, Supplier link names confirmed correct as originally
  guessed. PO_No's field TYPE (plain text vs lookup dropdown) was not explicitly
  reconfirmed after the fix — screenshot showed it as a dropdown ("-Select-") unlike the
  other plain-text fields on that form, so if this still errors or stores a wrong value,
  check whether shipRec.PO_No is actually a lookup returning a NUMBER (ID) rather than
  the PO's text number, and adjust to the nested lookup field accordingly.
- SUBFORM LINK NAME: guessed "Shipment_Line_Items" (matching the on-screen label)
  was also WRONG — "Variable Shipment_Line_Items does not exist in Shipments". Real
  link name is PO_Shipments (confirmed by user 2026-07-02), unrelated-looking name vs
  its "Shipment Line Items" display label. Two wrong-link-name errors in a row on this
  same form confirms labels here are NOT a reliable guide to link names — don't guess
  further fields on Shipments without asking first.
- Grid field assignment: `input.Receiving_Line_Items = someList;` (whole-list reassign)
  throws "LIST value cannot be assigned to 'Receiving_Line_Items'" — confirmed live
  2026-07-02.
- Then `input.Receiving_Line_Items.add(row);` ALSO failed — "'add' function is applicable
  for LIST expression, but 'FETCHFIELD' is of type ZC_SUBFORM_2021". Subform fields are
  their own type, not a plain List — use `.insert(row)` instead of `.add(row)`, matching
  the subform-row pattern already used elsewhere in this codebase (e.g. sideUpdateScript.txt:
  `newRec.Supplier_quotes.insert(row1);`).
- Added `input.Receiving_Line_Items.clear();` before the populate loop (2026-07-02) so
  re-picking a different Shipment mid-edit REPLACES the rows instead of accumulating.
  `.clear()` on a subform field is UNTESTED — if it errors like `.add()` did, this needs
  a different clearing approach (e.g. rebuild via a fresh insert on a re-fetched record
  server-side instead of client-side `input.` manipulation).
- Added an else-branch: clearing the Shipments picklist (setting it back to blank) wipes
  SO_No/PO_No/Customer_Name/Supplier and the Receiving_Line_Items grid — also untested.
====================================================

````
