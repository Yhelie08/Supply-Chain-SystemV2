---
title: "inquiry_check_readiness"
source_file: "inquiry_check_readiness.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 274
tags:
  - deluge
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - readiness-gate
  - supplier-portal
---

# inquiry_check_readiness

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `inquiry_check_readiness.txt`
> - **Lines of Code:** 274
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#readiness-gate`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== INQ_Check_Readiness — Inquiry_Form Readiness Checklist + Margin + supplier
   stage/decline tracking + Projects-level SRP rollup ==
== MERGE, 2026-07-08: this is INQ_Sync_Supplier_Quotes_OnEdit's real logic (live since
   2026-06-22, Edited-only) moved onto INQ_CHECK_READINESS'S trigger (already live,
   Created or Edited > Validations) — closes the "blank until first edit" gap the old
   Edited-only trigger had. Body is UNCHANGED from the original script, only the target
   workflow/trigger changed. SETUP STEPS FOR USER:
     1. Paste this exact body into INQ_Check_Readiness (already has the right trigger).
     2. Delete/disable INQ_Sync_Supplier_Quotes_OnEdit entirely — do NOT run both, they
        write the same fields and would race/overwrite each other on every edit. ==

====================================================
WORKFLOW SETUP — INQ_Check_Readiness
  Form: Inquiry_Form
  Trigger: Created or Edited > Validations (on form submission)
====================================================

// === Step 0 (added 2026-07-14, per user): backfill quote_group if blank ===
// quote_group is normally only set ONCE at CREATE time, by INQ_Auto_Populate_Supplier_Quotes
// (`input.quote_group = input.Projects.Project_Code;`, a Created-only trigger — see
// supplier_quotes_last_edited_scripts.txt item 1). If Projects wasn't resolved to a real
// lookup ID at the moment of creation (e.g. the INQs widget's New Inquiry form only sends
// Projects when its autocomplete matched an existing project — see that file's own
// `looksLikeId(selectedProjectId)` gate), quote_group comes out blank and never
// retroactively fixes itself even if Projects gets linked correctly later via an edit,
// since that whole script never re-runs on Edit. This is a safe, idempotent backfill —
// only fills quote_group when it's genuinely blank, never overwrites an already-set
// value — so simply editing and saving the Inquiry again (once Projects is correctly
// linked) is now enough to self-heal it.
if((input.quote_group == null || input.quote_group == "") && input.Projects != null)
{
	input.quote_group = input.Projects.Project_Code;
}
// === Step A: build list of selected supplier names + IDs ===
selectedPairs = List();
for each  sup in input.Suppliers
{
	supRecord = Suppliers[ID == sup];
	supName = supRecord.Supplier_Name.first_name;
	pairMap = Map();
	pairMap.put("name",supName);
	pairMap.put("id",sup);
	selectedPairs.add(pairMap);
}
selectedSupplierNames = List();
for each  pair in selectedPairs
{
	selectedSupplierNames.add(pair.get("name"));
}
// === Step B: mark removed supplier tags as "Declined" ===
existingSupplierNames = List();
for each  qr in input.Supplier_Quotes
{
	existingSupplierNames.add(qr.Suppliers);
	if(!selectedSupplierNames.contains(qr.Suppliers))
	{
		qr.Stage="Declined";
	}
}
// === Step C: add a row for any NEW supplier tag not yet present ===
for each  pair in selectedPairs
{
	supName = pair.get("name");
	if(!existingSupplierNames.contains(supName))
	{
		newRow = Inquiry_Form.Supplier_Quotes();
		newRow.Suppliers=supName;
		newRow.Supplier_ID=pair.get("id");
		newRow.Stage="Not Selected";
		input.Supplier_Quotes.insert(newRow);
	}
}
// === Step D: "Selected" winner logic + Final Cost copy ===
selectedSupplierWinner = "";
hasWinner = false;
winnerFinalPrice = 0;
winnerAvailability = "";
for each  qr in input.Supplier_Quotes
{
	if(qr.Selected)
	{
		selectedSupplierWinner = qr.Suppliers;
		hasWinner = true;
		winnerFinalPrice = qr.Final_Price;
		winnerAvailability = qr.Availability;
	}
}
if(hasWinner)
{
	for each  qr in input.Supplier_Quotes
	{
		if(qr.Suppliers == selectedSupplierWinner)
		{
			if(qr.Stage == "Declined" && qr.Prev_Stage != null && qr.Prev_Stage != "")
			{
				qr.Stage=qr.Prev_Stage;
				qr.Prev_Stage="";
			}
		}
		else
		{
			if(qr.Stage != "Declined")
			{
				qr.Prev_Stage=qr.Stage;
			}
			qr.Stage="Declined";
			qr.Selected=false;
		}
	}
	input.Select_Final_Cost = winnerFinalPrice;
}
else
{
	for each  qr in input.Supplier_Quotes
	{
		if(qr.Stage == "Declined" && qr.Prev_Stage != null && qr.Prev_Stage != "")
		{
			qr.Stage=qr.Prev_Stage;
			qr.Prev_Stage="";
		}
	}
	input.Select_Final_Cost = 0;
}
// === Step E: Readiness Checklist auto-check ===
input.Supplier_Selected = hasWinner;
if(hasWinner && winnerAvailability != null && winnerAvailability != "")
{
	input.Availability = true;
}
else
{
	input.Availability = false;
}
if(input.Select_Final_Cost > 0 || input.SRP_Approved1 > 0)
{
	input.Final_Price_Exists = true;
}
else
{
	input.Final_Price_Exists = false;
}
if(input.SRP_Status == "Approved")
{
	input.SRP_Approved = true;
}
else
{
	input.SRP_Approved = false;
}
// === Step F: Margin computation ===
if(input.SRP_Approved1 > 0)
{
	input.Margin = (input.SRP_Approved1 - input.Select_Final_Cost) / input.SRP_Approved1 * 100;
}
else
{
	input.Margin = 0;
}
// === Step G: Ready for Estimate ===
if(input.Supplier_Selected && input.Availability && input.Final_Price_Exists && input.SRP_Approved && input.Collateral_Comple_NA)
{
	input.Ready_for_Estimates = true;
}
else
{
	input.Ready_for_Estimates = false;
}
// === Step H: Collateral Comple/NA auto-check ===
// FIXED 2026-07-14 (confirmed live bug, not intentional lenience — user flagged a real
// record showing Specification="Pending" with Collateral_Comple_NA/Ready_for_Estimates
// both true): was `if(val != "HideToSupplier" && val == null || val == "")` — due to
// Deluge/Java operator precedence (&& binds tighter than ||) this reduced to just
// "val is null or blank", so ANY non-blank value (Pending/Required, not just
// Completed/N/A) counted as complete. Now requires the literal field value to actually
// be Completed or N/A, matching the field's own label ("Collateral Comple/NA") and the
// PR1-side convention (pr_check_readiness.txt's explicit per-condition checks).
collateralFields = List();
collateralFields.add(input.Product_Sample);
collateralFields.add(input.D_Image);
collateralFields.add(input.Specification);
collateralFields.add(input.Technical_Drawing);
allComplete = true;
for each  val in collateralFields
{
	if(val != "Completed" && val != "N/A")
	{
		allComplete = false;
	}
}
input.Collateral_Comple_NA = allComplete;
// === Step H (2nd, same name in live script): check if ALL Inquiries in the same
// Project are SRP_Approved, roll up onto Projects.All_SRP_Approved ===
if(input.Projects != null)
{
	allApproved = true;
	relatedInquiries = Inquiry_Form[Projects == input.Projects];
	for each  relInq in relatedInquiries
	{
		if(relInq.SRP_Status != "Approved")
		{
			allApproved = false;
		}
	}
	projRec = Projects[ID == input.Projects];
	projRec.All_SRP_Approved=allApproved;
}

====================================================
NOTES:
- ADDED 2026-07-14, per user (found live: INQ-00002 created via the INQs widget had a
  blank `quote_group` despite `Projects` correctly showing "Test Project" — root cause
  traced to the widget's create payload only sending `Projects` when its autocomplete
  resolved to a real ID, so the CREATE-only quote_group auto-fill computed off a null
  Projects and stayed blank forever): Step 0 above backfills `quote_group` from
  `Projects.Project_Code` whenever it's blank, on every Created-or-Edited save (this
  script's own trigger). Since it only fills when blank, it can't clobber a correctly-
  set value, and it makes a bad/missing quote_group self-heal on the next ordinary edit
  instead of needing a manual fix. UNTESTED — needs re-pasting into Creator + a retest
  editing INQ-00002 (or any Inquiry with blank quote_group but a real Projects link) to
  confirm it populates on save.
- CHANGED 2026-07-09: Step E's `Final_Price_Exists` now also passes when
  `SRP_Approved1` (the catalog/approved rate) has a value, even if `Select_Final_Cost`
  (the supplier's actual final price) is 0/blank — mirrors the same fallback already
  used on the PR side (`Mandatory_PR_Fields_Supplier1/2` skips Initial/Final Price when
  `SRP_Rate_PR_Supplier1/2` already has a value). Symmetric either direction: either
  field being non-zero is enough, matching "use SRP if final price is 0, use final
  price if SRP is 0/blank." UNTESTED — first live retest still needed after this fix.
- Found live 2026-07-08 (as `INQ_Sync_Supplier_Quotes_OnEdit`, Edited-only) while
  investigating whether the Inquiry Readiness Checklist (Supplier_Selected/Availability/
  Final_Price_Exists/Collateral_Comple_NA/SRP_Approved/Ready_for_Estimates — same field
  set as PR1's own checklist, pr_check_readiness.txt) had ever been built. It had — just
  never saved to a file in this repo, and only fired on Edited, not Created. A
  from-scratch guess (`INQ_Check_Readiness`) had ALREADY been pasted into Creator by the
  user before this was found, creating a live duplicate-logic conflict (both would run
  on every edit, writing the same fields with slightly different rules — whichever ran
  last would silently win). RESOLVED same session: merged onto `INQ_Check_Readiness`'s
  trigger (Created or Edited, already correct) using the REAL script's proven body,
  with instructions to delete `INQ_Sync_Supplier_Quotes_OnEdit` entirely so only one
  copy of this logic runs. See the merge note at the top of this file for exact steps.
- CREATE-PATH ORDERING CAVEAT (new risk from adding the Created trigger, untested):
  `INQ_Auto_Populate_Supplier_Quotes` (Created > Validations, see
  supplier_quotes_last_edited_scripts.txt item 1) is what actually INSERTS the initial
  Supplier_Quotes rows on a brand-new Inquiry — also a Created > Validations action.
  This script's Step A/B/D all read `input.Supplier_Quotes`, so on CREATE specifically,
  this action must run AFTER `INQ_Auto_Populate_Supplier_Quotes` in the Validations
  action order, or it'll see an empty subform and compute everything as "no winner /
  not ready" on the very first save. Check/set the action order in Creator's workflow
  builder when pasting.
- FIXED 2026-07-14 (was: "POSSIBLE BUG flagged, not fixed"): confirmed live via a real
  record (INQ-00001) showing Specification="Pending" with Collateral_Comple_NA AND
  Ready_for_Estimates both true (user screenshot) — not intentional lenience, a genuine
  operator-precedence bug. Old: `if(val != "HideToSupplier" && val == null || val == "")`
  — `&&` binds tighter than `||`, reducing to just "val is null or empty string", so any
  non-blank value (Pending/Required) counted as complete. Fixed to
  `if(val != "Completed" && val != "N/A") { allComplete = false; }` per field — see Step
  H above. UNTESTED — needs re-pasting into Creator's live `INQ_Check_Readiness` action,
  then a retest on INQ-00001 (or any record with a Pending collateral field) to confirm
  Collateral_Comple_NA/Ready_for_Estimates correctly flip to false now.
- Availability logic (Step E) is looser than a literal-"Confirmed" check: passes as
  long as the WINNING supplier's Availability has ANY non-blank value at all (Pending/
  Unavailable/Cannot Produce would all count), not specifically "Confirmed". Differs
  from PR1's own Mandatory_PR_Fields exemption pattern which cares about the specific
  dropdown value. Flagging as a design difference, not fixing — may be intentional
  ("supplier responded at all" vs "supplier confirmed stock").
- Bundles TWO independent concerns in one script: the per-Inquiry Readiness Checklist
  (Steps A-H) AND a Projects-level `All_SRP_Approved` rollup (2nd "Step H") that checks
  every sibling Inquiry in the same Project and flags the Project once all are
  SRP-Approved — unrelated to the checklist itself, presumably feeds some other
  Projects-level gate (not yet investigated/documented).
- Step D's Declined/Prev_Stage supplier-tag tracking logic overlaps conceptually with
  `Stage_Inquiry_Changed`/`INQ_Stage_On_Submit` (documented in SyncItemsCust/CLAUDE.md)
  — both touch Supplier_Quotes.Stage. Not confirmed whether these conflict/race or are
  cleanly separated by trigger type; worth checking if Stage values ever look wrong.
====================================================

````
