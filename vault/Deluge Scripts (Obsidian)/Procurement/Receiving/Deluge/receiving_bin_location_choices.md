---
title: "receiving_bin_location_choices"
source_file: "receiving_bin_location_choices.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]"
lines: 115
tags:
  - deluge
  - fulfillment
  - inquiry
  - pack
  - pick
  - procurement
  - purchase-order
  - zoho-books
---

# receiving_bin_location_choices

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `receiving_bin_location_choices.txt`
> - **Lines of Code:** 115
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#pack`, `#pick`, `#procurement`, `#purchase-order`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SUPERSEDED 2026-07-06 — DO NOT PASTE THIS FILE ==
== Live version now folded into receiving_shipment_populate.txt's
   Receiving_Populate_From_Shipment action instead. Reasons: (1) this Load-of-form
   approach populates ONE shared choice list for the whole Bin_location subform column,
   but each Receiving_Line_Items row can hold a different item/category needing DIFFERENT
   filtered choices — only possible once each row's SKU is known, i.e. inside the
   row-building loop in receiving_shipment_populate.txt, not at Load of form before any
   rows exist. (2) This file also wrongly EXCLUDED "Package Area"/"Receiving Area"/
   "Default Area" from the choices — confirmed via screenshot that Books' own bin picker
   always includes those 3 as valid choices; the live version adds them back
   unconditionally. See receiving_shipment_populate.txt NOTES for the full current logic
   (category-based zone_name filtering + stock-based default selection). Kept here for
   history only. ==

== Receiving form: populate Bin_location choices from live Zoho Books bin master (WH3) ==
== Source: GET /settings/warehouses/{id}/storagelocations (no item_id) — same undocumented
   endpoint already used in SyncItemsCust/syncWarehouseBins.dg for per-item bin strings ==

====================================================
PREREQUISITE — change field type in Creator field builder BEFORE pasting this script:
  Form: Receiving, Subform: Receiving_Line_Items, Field: Bin_location
  CURRENT (wrong for this): type=picklist, values=Items.ID, displayformat=[Bin_location]
    — this is a LOOKUP into Items styled as a dropdown. It stores an Items record ID and
    only shows that item's own Bin_location text as the label — not a real bin-name field.
  CHANGE TO: plain "Dropdown" field (Single Line based choice field, no source form).
    Leave static choices empty/blank — they get replaced dynamically by the script below
    every time the form loads.
====================================================

====================================================
WORKFLOW SETUP — Receiving_Load_Bin_Choices
  Form: Receiving
  Trigger: Created or Edited > Load of form
====================================================

orgId = "751117756";
whId = "2680178000042173149"; // HC WH3 BAESA

binNames = List();
for each page in {1,2,3,4,5}
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
	for each loc in locs
	{
		bName = loc.get("name");
		if(bName != "Receiving Area" && bName != "Package Area" && bName != "Default Area" && !binNames.contains(bName))
		{
			binNames.add(bName);
		}
	}
	hasMore = binResp.get("page_context").get("has_more_page");
	if(hasMore == false)
	{
		break;
	}
}

clear Receiving_Line_Items.Bin_location;
for each bName in binNames
{
	Receiving_Line_Items.Bin_location:ui.add(bName);
}

====================================================
NOTES:
- Endpoint confirmed live 2026-07-06: GET .../settings/warehouses/{whId}/storagelocations
  WITHOUT an item_id param returns the full master list of bins configured for that
  warehouse (paginated, per_page up to 200, page_context.has_more_page drives the loop) —
  this is the exact same list Books' own "Select Bin Locations" popup (seen during
  Purchase Receive) shows. WITH an item_id param it instead returns that specific item's
  currently-assigned bin(s), which came back empty for the test item checked — bins
  aren't pre-assigned per item in this org, they're picked at receiving time. So this
  script deliberately does NOT try to auto-select a bin per line item; it just gives the
  user the full valid WH3 bin list to choose from per line, matching how Books itself
  behaves in the screenshot (a "Select bin" dropdown, not an auto-fill).
- Filters out "Receiving Area" / "Package Area" / "Default Area" — same exclusion already
  used in syncWarehouseBins.dg's per-item bin string builder (these are default holding
  zones, not real putaway bins).
- CONNECTION: reuses "zoho_books" (same connection name as syncWarehouseBins.dg, already
  proven live in this project) — connections are app-scoped, not function-scoped, so
  using it from a form workflow instead of a scheduled function should work the same way.
  Not independently re-verified from this trigger type — first thing to check if it errors.
- SUBFORM DROPDOWN POPULATION SYNTAX — UNVERIFIED, flag for first live test: this project
  has one existing "populate dropdown choices dynamically" example
  (INQ_Load_Unit_Choices in SyncItemsCust/CLAUDE.md), but that's a plain top-level field
  (`clear unit; input.unit:ui.add(list)`), not a subform column. Web research (Zoho's own
  add-to-picklist-dynamically doc + community examples) shows subform population
  conventionally uses either `row.Field:ui.add(...)` (inside a per-row loop, for "On User
  Input" events where rows already exist) or `SubformName.ColumnName:ui.add(...)` directly
  (for populating the choices ALL future new rows will show, used at Load of form before
  any rows exist — this script's case). Went with the latter since Load of form fires
  before Receiving_Line_Items has any rows to loop. VERIFY live: if Creator rejects the
  `Receiving_Line_Items.Bin_location:ui.add(...)` syntax, the fallback is checking whether
  Load of form even fires before/after the grid's default empty row renders, and whether
  a per-row loop variant is needed instead.
- COST: 1-2 invokeurl calls to Books per Receiving form open (per_page=200, WH3 bin count
  is in the low hundreds based on the live dump — TL-ALE0x/FL-ALE0x/TBL-ALE0x/CL-ALE0x
  zones seen, page 1 alone returned ~90 with has_more_page=true). Shared against the
  10,000/day Books API limit. If Receiving form gets opened very frequently by many users,
  consider switching to the same daily-scheduled-sync-into-a-Creator-form pattern already
  used for Items.Bin_location (syncWarehouseBins.dg) instead of a live call per form load
  — not built now since current expected usage (a few receivings/day) doesn't justify the
  extra Creator form + scheduled function complexity yet.
====================================================

````
