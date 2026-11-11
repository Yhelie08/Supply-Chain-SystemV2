---
title: "pr_sync_supplier_load_balancing"
source_file: "pr_sync_supplier_load_balancing.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 243
tags:
  - deluge
  - fulfillment
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
---

# pr_sync_supplier_load_balancing

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `pr_sync_supplier_load_balancing.txt`
> - **Lines of Code:** 243
> - **Tags:** `#deluge`, `#fulfillment`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Purchase_Request1 -> Supplier_Load_Balancing subform sync ==
== Action: PR_Sync_Supplier_Load_Balancing, Created or Edited > Validations ==
== Native workflow, first captured verbatim in purchase_request1_full_workflow_dump.txt
   (2026-07-14, item 4). Builds/maintains the Supplier_Load_Balancing subform
   (Match_Category/Active_POs/Percent/Load_Status/Eligible_Supplier) that the PRs widget
   reads directly and shows as "Supplier Recommendation — Load Balancing". ==

====================================================
BUG FOUND 2026-07-15, live: screenshot of PR-00002 (category "Wall Light") showed BOTH
Fenteng and Tony as "X No match" in the widget's Load Balancing table, even though the
user's own All_Suppliers report (screenshot, Setup > All Suppliers) confirms both
suppliers genuinely list "Wall Light" in their Supported_Categories.

Root cause confirmed by reading the dumped script (line 65 of the full dump):
    catList = sup.Supported_Categories.toList(",");
Supported_Categories reports back in the UI as one category PER LINE (newline-separated),
not comma-separated — confirmed via the All_Suppliers report screenshot showing e.g.
Fenteng's 12 categories stacked vertically in a single cell, no commas visible anywhere.
Splitting a newline-separated blob on "," returns it as ONE list item (the whole blob,
untouched) — `c.trim() == prCategory` then compares the full multi-category string
against a single category name like "Wall Light" and never matches, for every supplier,
every category, silently (no error — the call itself is valid Deluge, just wrong
delimiter), which is exactly the "X No match" symptom seen live.

FIX: split on newline instead of comma. Defensive against both `\n` and `\r\n` line
endings (Creator/Books data has mixed line-ending sources elsewhere in this app — see
CLAUDE.md's so_fulfillment_sync.txt JSON_PARSE_ERROR note) and left a comma fallback in
case a supplier's Supported_Categories ever legitimately uses commas instead (defensive,
doesn't hurt either format).
====================================================

prCategory = input.category;
eligibleSupplierIDs = List();
for each  sup in Suppliers[ID != 0]
{
	matched = false;
	if(sup.Handles_All) { matched = true; }
	else if(sup.Supported_Categories != null && sup.Supported_Categories != "")
	{
		catRaw = sup.Supported_Categories.replaceAll("\r","");
		if(catRaw.contains("\n"))
		{
			catList = catRaw.toList("\n");
		}
		else
		{
			catList = catRaw.toList(",");
		}
		for each  c in catList { if(c.trim() == prCategory) { matched = true; } }
	}
	if(matched) { eligibleSupplierIDs.add(sup.ID.toString()); }
}
existingSupplierIDs = List();
for each  qr in input.Supplier_Load_Balancing
{
	existingSupplierIDs.add(qr.Suppliers.toString());
	if(!eligibleSupplierIDs.contains(qr.Suppliers.toString()))
	{
		qr.Match_Category="Not Match";
		qr.Eligible_Supplier="Removed";
	}
}
for each  sid in eligibleSupplierIDs
{
	if(!existingSupplierIDs.contains(sid))
	{
		supName = "";
		for each  supRec in Suppliers { if(supRec.ID + "" == sid) { supName = supRec.Supplier_Name.first_name + ""; if(supName == "" || supName == "null") { supName = supRec.Supplier_Name.last_name + ""; } } }
		newRow = Purchase_Request1.Supplier_Load_Balancing();
		newRow.Suppliers=sid;
		newRow.Match_Category="Match";
		input.Supplier_Load_Balancing.insert(newRow);
	}
}

/* ADDED 2026-07-15, per user ("active po count might not be accurate... also the load
   bar"): Suppliers.Active_PO_Count/Utilization/Status are stale snapshot fields —
   Active_PO_Count only gets recomputed by pr_to_po_grouping.txt's Action 1, and only for
   whichever ONE supplier gets approved on a given PR (the other supplier's count never
   updates, and neither ever decrements when a PO completes/cancels); Utilization/Status
   are never written by ANY script in this codebase at all (confirmed via grep), so they
   read permanently blank — that's why the load bar always showed 0%. Fix: compute
   Active POs + Load % LIVE right here, every time this script runs, straight from real
   Purchase_Order data — same source Action 1 itself uses (PO_Line_Items ROWS, not
   distinct PO count, per user's explicit choice to stay consistent with Action 1's own
   existing definition), same active/Max_Capacity ratio the widget's own
   computeRecommendedSupplier() client fallback already uses. Deliberately does NOT
   write anything back to the Suppliers form itself — stays fully local to this
   subform's own display columns, so it can't race or conflict with Action 1's separate
   Active_PO_Count snapshot/Supplier_Load_At_PO semantics elsewhere. */
supplierNameById = Map();
for each  sid in eligibleSupplierIDs
{
	nm = "";
	for each  supRec2 in Suppliers { if(supRec2.ID + "" == sid) { nm = supRec2.Supplier_Name.first_name + ""; if(nm == "" || nm == "null") { nm = supRec2.Supplier_Name.last_name + ""; } } }
	supplierNameById.put(sid, nm);
}
liveCountByName = Map();
allActivePOs = Purchase_Order[PO_Status != "Completed" && PO_Status != "Cancelled"];
for each  po in allActivePOs
{
	for each  poLn in po.PO_Line_Items
	{
		supNameLn = poLn.Supplier;
		curCnt = liveCountByName.get(supNameLn);
		if(curCnt == null) { curCnt = 0; }
		liveCountByName.put(supNameLn, curCnt + 1);
	}
}

/* CHANGED 2026-08-15, per user ("dapat ang recommendation ay based sa pinakababang
   Initial Price, or if available ang Negotiated, pinaka mabilis na Lead Time (days).
   Pero if existing na ang price, dapat sa lead time na magbebased ng recommendation.
   and based din sa category.") — recommendedID used to be purely "fewest currently
   active PO line items" (raw count, not even normalized against Max_Capacity). Per
   explicit user direction, replaced with: PRICE first (Negotiated if the supplier has
   entered one, else Initial_Price), LOWEST wins; Lead_Time (days) as the tiebreaker
   ONLY when price is tied/equal between suppliers. Category eligibility (the
   eligibleSupplierIDs list above) is untouched — still the same Handles_All/
   Supported_Categories gate. Active_POs/Percent/Load_Status below are left computed
   and displayed as before (still genuinely useful load info) — they just no longer
   drive which supplier gets the "Recommended" tag.
   Price/Lead_Time source: Purchase_Request1's own generic `Supplier_Selected` subform
   (Suppliers/Availability/Initial_Price/Negotiated/Final_Price/Lead_Time per row,
   already kept in sync from each supplier's own Fenteng_Lighting_Purchase_Request/
   Tony_Fan_Purchase_Request submission by PR_Stage_Supplier_Changed_Supplier1/2 in
   purchase_request_scripts1.txt) — matched by supplier NAME with the same
   `== nm || .contains(nm)` short/full-name-safe pattern already established
   elsewhere in this app (e.g. that same sync script's own 2026-08-07 fix,
   supplierKeyMatch()), since `row.Suppliers` here is a name string, not the ID
   `eligibleSupplierIDs` uses. UNTESTED — needs a live PR with 2 quoted suppliers,
   differing prices (confirm lower price wins) and then equal prices with differing
   Lead_Time (confirm lead time breaks the tie). */
recommendedID = "";
bestPriceVal = -1;
bestLeadTimeVal = -1;
for each  sid in eligibleSupplierIDs
{
	nmForPrice = supplierNameById.get(sid);
	priceForSid = -1;
	leadTimeForSid = -1;
	for each  qsRow in input.Supplier_Selected
	{
		rowSupVal = qsRow.Suppliers + "";
		if(rowSupVal == nmForPrice || rowSupVal.contains(nmForPrice))
		{
			negVal = qsRow.Negotiated;
			initVal = qsRow.Initial_Price;
			if(negVal != null && negVal > 0)
			{
				priceForSid = negVal;
			}
			else if(initVal != null && initVal > 0)
			{
				priceForSid = initVal;
			}
			leadTimeForSid = qsRow.Lead_Time;
		}
	}
	if(priceForSid >= 0)
	{
		if(bestPriceVal == -1 || priceForSid < bestPriceVal)
		{
			bestPriceVal = priceForSid;
			bestLeadTimeVal = leadTimeForSid;
			recommendedID = sid;
		}
		else if(priceForSid == bestPriceVal)
		{
			if(leadTimeForSid != null && (bestLeadTimeVal == -1 || leadTimeForSid < bestLeadTimeVal))
			{
				bestLeadTimeVal = leadTimeForSid;
				recommendedID = sid;
			}
		}
	}
}
for each  qr in input.Supplier_Load_Balancing
{
	sidStr = qr.Suppliers.toString();
	if(eligibleSupplierIDs.contains(sidStr))
	{
		maxCap_tmp = 0;
		for each  supRec in Suppliers { if(supRec.ID + "" == sidStr) { maxCap_tmp = ifnull(supRec.Max_Capacity,0); } }
		nmForRow = supplierNameById.get(sidStr);
		liveCnt = liveCountByName.get(nmForRow);
		if(liveCnt == null) { liveCnt = 0; }
		maxCap = maxCap_tmp;
		pct = 0;
		if(maxCap > 0) { pct = (liveCnt * 100) / maxCap; }
		statusVal = "Normal";
		if(pct >= 100) { statusVal = "Overloaded"; }
		else if(pct >= 80) { statusVal = "Near Capacity"; }
		qr.Match_Category="Match";
		qr.Active_POs=liveCnt;
		qr.Percent=pct;
		qr.Load_Status=statusVal;
		// CHANGED 2026-08-15, label text updated to match the new price/lead-time
		// basis above — "Higher load" was accurate for the old raw-count logic,
		// no longer true now that price/lead time (not active-PO count) decides.
		if(sidStr == recommendedID) { qr.Eligible_Supplier="Recommended"; }
		else { qr.Eligible_Supplier="Available"; }
	}
}

====================================================
NOTES
====================================================
- 2 changes from the dumped original, both 2026-07-15:
  1. The `else if` branch's category-split logic (comma -> newline-aware).
  2. Active_POs/Percent/Load_Status/recommendation now computed LIVE from real
     Purchase_Order data instead of trusted off Suppliers.Active_PO_Count/Utilization/
     Status (stale/never-written snapshot fields — see the inline comment above the
     `supplierNameById`/`liveCountByName` block for the full reasoning). Everything else
     (Handles_All check, eligibility list, existing-row Not-Match/Removed handling,
     new-row insert) is untouched, byte-identical to the live dump.
- Active PO Count basis: PO_Line_Items ROWS (not distinct Purchase_Order records) across
  `Purchase_Order[PO_Status != "Completed" && PO_Status != "Cancelled"]` — deliberately
  matches Action 1's (`pr_to_po_grouping.txt`) own existing count definition, per user's
  explicit choice, so this subform's number and Action 1's snapshot agree conceptually
  even though Action 1's snapshot itself is still only updated for one supplier at a
  time (this script's own live computation doesn't have that limitation).
- Load_Status thresholds (pct >= 100 -> "Overloaded", pct >= 80 -> "Near Capacity", else
  "Normal") match the widget's own existing client-side convention
  (`UI/EndUser/PRs/app/index.html` line ~1542, `nearCap = s.loadPct>=80`) — not invented
  fresh, reused from what's already established elsewhere in this same widget. Exact
  Load_Status dropdown choice values ("Normal"/"Near Capacity"/"Overloaded") inferred
  from the widget's CSS class names (`rec-status-normal`/`rec-status-nearcap`/
  `rec-status-over`) — not independently confirmed against the real field's configured
  choice list, flag if the native form rejects an unrecognized choice value.
- Paste this over the live PR_Sync_Supplier_Load_Balancing action
  (Purchase_Request1 -> Created or Edited > Validations).
- UNTESTED — needs a live resave of PR-00002 (or any PR with a category both suppliers
  support) to confirm: Match_Category shows "Match" (already confirmed working via
  Configure Fields fix), Active_POs reflects a real live PO_Line_Items count instead of
  the old snapshot, Percent computes a real ratio instead of 0%, and Load_Status shows
  Normal/Near Capacity/Overloaded instead of blank.
- If Supported_Categories turns out to actually be a genuine Multi-Select Choice field
  (native List type in Deluge, not Text) rather than a multi-line Text field, this same
  fix would need a different shape (`for each c in sup.Supported_Categories` directly,
  no toList() at all) — not independently confirmed which field type it really is, only
  inferred from the report screenshot (stacked values, no visible commas) and the
  original script running without a type error.

````
