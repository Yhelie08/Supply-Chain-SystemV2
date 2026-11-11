---
title: "PR1_Created_Edited_Routing"
source_file: "PR1_Created_Edited_Routing.txt"
category: "Procurement/Purchase Request/Deluge/_variants/Main-DelugeScripts"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 563
tags:
  - delivery-management
  - deluge
  - dms
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-books
  - zoho-creator
---

# PR1_Created_Edited_Routing

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge/_variants/Main-DelugeScripts`
> - **Source File:** `PR1_Created_Edited_Routing.txt`
> - **Lines of Code:** 563
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Purchase_Request1 Created/Edited → route + copy Inquiry quote to Supplier PR forms ==
== Mirrors the same INQ routing logic as Books SO_To_PR, but native (no invokeurl) ==
== Source of INQ number: Purchase_Request1.inquiry_reference (Single Line, e.g. "INQ-00002") ==
== ALSO: PR1_Sync_Own_Image (added 2026-07-06) — gives Purchase_Request1 ITSELF a product
   image, same idea as Product_Image_Supplier1/2_PR on the supplier forms ==

====================================================
PREREQUISITE — add field to Purchase_Request1 BEFORE pasting PR1_Sync_Own_Image:
  Product_Image_PR   (Image, single — NOT "Image/s" multi-image, same type as
                       Product_Image_Supplier1_PR/Product_Image_Supplier2_PR)

ALSO (added 2026-07-06) — add these fields to BOTH supplier PR forms BEFORE re-pasting
Action 1/2 of PR_Populate_From_PR and PR_Changed below:
  SRP_Rate_PR_Supplier1   (Number) — on Fenteng_Lighting_Purchase_Request
  SRP_Rate_PR_Supplier2   (Number) — on Tony_Fan_Purchase_Request
  Mirrors Purchase_Request1.SRP_Rate_PR, same "create + resync on every PR1 edit" pattern
  as Priority_PR_Supplier1/2. Used to gate which price fields the supplier must fill in —
  see Disable_PR_Details_Supplier1/2 + Mandatory_PR_Fields_Supplier1/2 in
  purchase_request_scripts1.txt (those two workflows are NOT superseded, still live).

ALSO (added 2026-07-14, per user) — add these fields to BOTH supplier PR forms BEFORE
re-pasting the updated Action 1/2 of PR_Populate_From_PR and PR_Changed below:
  inquiry_reference_Supplier1   (Single Line) — on Fenteng_Lighting_Purchase_Request
  inquiry_reference_Supplier2   (Single Line) — on Tony_Fan_Purchase_Request
  Mirrors Purchase_Request1.inquiry_reference (same "create + resync on every PR1 edit"
  pattern as SRP_Rate_PR_Supplier1/2 above) — previously this only ever existed on PR1
  and its widget, never reached the supplier PR forms at all. User's stated purpose: once
  this has a value (PR came from a routed Inquiry, not manually created), the supplier's
  own PR widget should lock ALL fields to view-only — the supplier already answered via
  the Inquiry flow, so the PR-level quote flow shouldn't be independently editable. See
  `UI/SupplierPortal/Fenteng-PR/`/`Tony-PR/` for the widget-side lock logic.
====================================================

====================================================
WORKFLOW SETUP — PR_Populate_From_PR (REPLACE existing Action 1 + Action 2 bodies)
  Form: Purchase_Request1
  Trigger: Created > Successful form submission
  Condition: Source != "SO"
    (Skip when PR was created by Books SO function — that function creates supplier PRs directly)
  Action 1: Execute script — paste ACTION 1 below (Fenteng)
  Action 2: Execute script — paste ACTION 2 below (Tony Fan)
  NOTE: Keep as SEPARATE actions (same rule as Inquiry → Supplier — cross-form subform
  refs fail when combined into one action)
====================================================

ACTION 1 — Fenteng Lighting (Supplier_1)
====================================================

if(input.Source == "SO") { return; }
matchedInqNo = input.inquiry_reference;
routeFenteng = true;
hasFentengQuote = false;
selAvail = "";
selInitPrice = 0;
selNego = 0;
selFinalPrice = 0;
selLeadTime = 0;

if(matchedInqNo != null && matchedInqNo != "")
{
	routeFenteng = false;
	anySelected = false;
	inqRecs = Inquiry_Form[INQ_No == matchedInqNo];
	for each  inqRec in inqRecs
	{
		for each  q in inqRec.Supplier_Quotes
		{
			if(q.Selected == true)
			{
				anySelected = true;
				sid = q.Supplier_ID + "";
				sidRawC1 = sid.removeFirstOccurence("[").removeLastOccurence("]");
				quoteBooksIdC1 = "";
				if(sidRawC1 != "")
				{
					for each  supRecC1 in Suppliers
					{
						if(supRecC1.ID + "" == sidRawC1) { quoteBooksIdC1 = supRecC1.Supplier_ID + ""; }
					}
				}
				if(quoteBooksIdC1 == "2680178000049168001")
				{
					routeFenteng = true;
					hasFentengQuote = true;
					selAvail = q.Availability;
					selInitPrice = q.Initial_Price;
					selNego = q.Negotiated;
					selFinalPrice = q.Final_Price;
					selLeadTime = q.Lead_Time;
				}
			}
		}
		break;
	}
	if(anySelected == false)
	{
		routeFenteng = true;
	}
}

if(routeFenteng == true)
{
	fResponseStatus = "Waiting";
	if(hasFentengQuote == true) { fResponseStatus = "Selected"; }
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
		Priority_PR_Supplier1=input.Priority
		SRP_Rate_PR_Supplier1=input.SRP_Rate_PR
		inquiry_reference_Supplier1=matchedInqNo
		Response_Status=fResponseStatus
		edit_counter=1
	];
	newRec1 = Fenteng_Lighting_Purchase_Request[ID == newRecID1];
	itemRecF = Items[ID == input.Items];
	if(itemRecF != null && itemRecF.Image != null)
	{
		newRec1.Product_Image_Supplier1_PR = itemRecF.Image;
	}
	subRow1 = Fenteng_Lighting_Purchase_Request.Supplier_Selected_Supplier1();
	subRow1.Suppliers_Supplier1 = "Fenteng";
	if(hasFentengQuote == true)
	{
		subRow1.Availability_Supplier1 = selAvail;
		subRow1.Initial_Price_Supplier1 = selInitPrice;
		subRow1.Negotiated_Supplier1 = selNego;
		subRow1.Final_Price_Supplier1 = selFinalPrice;
		subRow1.Lead_Time_Supplier1 = selLeadTime;
		subRow1.Selected_Supplier1 = true;
	}
	newRec1.Supplier_Selected_Supplier1.insert(subRow1);
}

====================================================
ACTION 2 — Tony Fan (Supplier_2)
====================================================

if(input.Source == "SO") { return; }
matchedInqNo = input.inquiry_reference;
routeTony = true;
hasTonyQuote = false;
selAvail = "";
selInitPrice = 0;
selNego = 0;
selFinalPrice = 0;
selLeadTime = 0;

if(matchedInqNo != null && matchedInqNo != "")
{
	routeTony = false;
	anySelected = false;
	inqRecs = Inquiry_Form[INQ_No == matchedInqNo];
	for each  inqRec in inqRecs
	{
		for each  q in inqRec.Supplier_Quotes
		{
			if(q.Selected == true)
			{
				anySelected = true;
				sid = q.Supplier_ID + "";
				sidRawC2 = sid.removeFirstOccurence("[").removeLastOccurence("]");
				quoteBooksIdC2 = "";
				if(sidRawC2 != "")
				{
					for each  supRecC2 in Suppliers
					{
						if(supRecC2.ID + "" == sidRawC2) { quoteBooksIdC2 = supRecC2.Supplier_ID + ""; }
					}
				}
				if(quoteBooksIdC2 == "2680178000002735078")
				{
					routeTony = true;
					hasTonyQuote = true;
					selAvail = q.Availability;
					selInitPrice = q.Initial_Price;
					selNego = q.Negotiated;
					selFinalPrice = q.Final_Price;
					selLeadTime = q.Lead_Time;
				}
			}
		}
		break;
	}
	if(anySelected == false)
	{
		routeTony = true;
	}
}

if(routeTony == true)
{
	tResponseStatus = "Waiting";
	if(hasTonyQuote == true) { tResponseStatus = "Selected"; }
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
		Priority_PR_Supplier2=input.Priority
		SRP_Rate_PR_Supplier2=input.SRP_Rate_PR
		inquiry_reference_Supplier2=matchedInqNo
		Response_Status=tResponseStatus
		edit_counter=1
	];
	newRec2 = Tony_Fan_Purchase_Request[ID == newRecID2];
	itemRecT = Items[ID == input.Items];
	if(itemRecT != null && itemRecT.Image != null)
	{
		newRec2.Product_Image_Supplier2_PR = itemRecT.Image;
	}
	subRow2 = Tony_Fan_Purchase_Request.Supplier_Selected_Supplier2();
	subRow2.Suppliers_Supplier2 = "Tony";
	if(hasTonyQuote == true)
	{
		subRow2.Availability_Supplier2 = selAvail;
		subRow2.Initial_Price_Supplier2 = selInitPrice;
		subRow2.Negotiated_Supplier2 = selNego;
		subRow2.Final_Price_Supplier2 = selFinalPrice;
		subRow2.Lead_Time_Supplier2 = selLeadTime;
		subRow2.Selected_Supplier2 = true;
	}
	newRec2.Supplier_Selected_Supplier2.insert(subRow2);
}

====================================================
WORKFLOW SETUP — PR_Changed (REPLACE existing Action 1 + Action 2 bodies with these
  FULL scripts — the new block MUST be INSIDE the "for each r in ...Recs" loop, before
  its closing brace, since it reads/writes fields on r. Pasting it after the loop closes
  puts r out of scope — that's the exact error you hit.)
  Form: Purchase_Request1
  Trigger: Edited > Successful form submission
====================================================

ACTION 1 — Fenteng Lighting (FULL, replaces existing Action 1 entirely)
====================================================

input.Last_Update = zoho.currenttime;
itemRecPRF = Items[ID == input.Items];
fentengRecs = Fenteng_Lighting_Purchase_Request[PR_No_Supplier1 == input.PR_No];
for each  r in fentengRecs
{
	hasChanges = false;
	if(r.sku_Supplier1 != input.sku || r.quantity_Supplier1 != input.quantity || r.Target_Delivery_Supplier1 != input.Target_Delivery || r.Description1_Supplier1 != input.Description1)
	{
		hasChanges = true;
	}
	update r
	[
		PR_Date_Supplier1=input.PR_Date
		Items_Supplier1=input.Items
		sku_Supplier1=input.sku
		quantity_Supplier1=input.quantity
		Description1_Supplier1=input.Description1
		description_Supplier1=input.description
		unit_Supplier1=input.unit
		category_Supplier1=input.category
		Target_Delivery_Supplier1=input.Target_Delivery
		Priority_PR_Supplier1=input.Priority
		SRP_Rate_PR_Supplier1=input.SRP_Rate_PR
		inquiry_reference_Supplier1=input.inquiry_reference
	];
	if(itemRecPRF != null && itemRecPRF.Image != null)
	{
		r.Product_Image_Supplier1_PR=itemRecPRF.Image;
	}
	if(input.inquiry_reference != null && input.inquiry_reference != "")
	{
		inqRecsPR = Inquiry_Form[INQ_No == input.inquiry_reference];
		for each  inqRecPR in inqRecsPR
		{
			for each  q in inqRecPR.Supplier_Quotes
			{
				if(q.Selected == true)
				{
					sidPR = q.Supplier_ID + "";
					sidRawC3 = sidPR.removeFirstOccurence("[").removeLastOccurence("]");
					quoteBooksIdC3 = "";
					if(sidRawC3 != "")
					{
						for each  supRecC3 in Suppliers
						{
							if(supRecC3.ID + "" == sidRawC3) { quoteBooksIdC3 = supRecC3.Supplier_ID + ""; }
						}
					}
					if(quoteBooksIdC3 == "2680178000049168001")
					{
						for each  sRow1 in r.Supplier_Selected_Supplier1
						{
							sRow1.Availability_Supplier1 = q.Availability;
							sRow1.Initial_Price_Supplier1 = q.Initial_Price;
							sRow1.Negotiated_Supplier1 = q.Negotiated;
							sRow1.Final_Price_Supplier1 = q.Final_Price;
							sRow1.Lead_Time_Supplier1 = q.Lead_Time;
							sRow1.Selected_Supplier1 = true;
						}
						r.Response_Status = "Selected";
					}
				}
			}
			break;
		}
	}
	fentengSelected = false;
	anySelected = false;
	/* FIXED 2026-08-07, real bug found via codebase-wide audit (same class as the
	   already-fixed approvePOMain crash, memory `reference-deluge-quirks.md`):
	   row.Suppliers (Purchase_Request1.Supplier_Selected) can be the SHORT name
	   ("Fenteng") or the FULL Suppliers-form name ("Fenteng Lighting") depending on
	   whether this PR was auto-routed or INQ-routed — confirmed live in Production
	   holding both shapes across different PRs. The old strict == silently failed
	   to flip Response_Status to "Selected" for any PR that hit the full-name
	   shape, leaving that supplier locked out of editing their own quote. */
	for each  row in input.Supplier_Selected
	{
		if(row.Selected == true)
		{
			anySelected = true;
		}
		rowSupplierValFC = row.Suppliers + "";
		if((rowSupplierValFC == "Fenteng" || rowSupplierValFC.contains("Fenteng")) && row.Selected == true)
		{
			fentengSelected = true;
		}
	}
	if(fentengSelected == true)
	{
		r.Response_Status="Selected";
		r.edit_counter=1;
	}
	else if(anySelected == true)
	{
		r.Response_Status="Not Selected";
		r.edit_counter=0;
	}
	else if(hasChanges == true)
	{
		r.Response_Status="Submit Response";
		r.edit_counter=1;
	}
}

====================================================
ACTION 2 — Tony Fan (FULL, replaces existing Action 2 entirely)
====================================================

itemRecPRT = Items[ID == input.Items];
tonyRecs = Tony_Fan_Purchase_Request[PR_No_Supplier2 == input.PR_No];
for each  r in tonyRecs
{
	hasChanges = false;
	if(r.sku_Supplier2 != input.sku || r.quantity_Supplier2 != input.quantity || r.Target_Delivery_Supplier2 != input.Target_Delivery || r.Description1_Supplier2 != input.Description1)
	{
		hasChanges = true;
	}
	update r
	[
		PR_Date_Supplier2=input.PR_Date
		Items_Supplier2=input.Items
		sku_Supplier2=input.sku
		quantity_Supplier2=input.quantity
		Description1_Supplier2=input.Description1
		description_Supplier2=input.description
		unit_Supplier2=input.unit
		category_Supplier2=input.category
		Target_Delivery_Supplier2=input.Target_Delivery
		Priority_PR_Supplier2=input.Priority
		SRP_Rate_PR_Supplier2=input.SRP_Rate_PR
		inquiry_reference_Supplier2=input.inquiry_reference
	];
	if(itemRecPRT != null && itemRecPRT.Image != null)
	{
		r.Product_Image_Supplier2_PR=itemRecPRT.Image;
	}
	if(input.inquiry_reference != null && input.inquiry_reference != "")
	{
		inqRecsPR = Inquiry_Form[INQ_No == input.inquiry_reference];
		for each  inqRecPR in inqRecsPR
		{
			for each  q in inqRecPR.Supplier_Quotes
			{
				if(q.Selected == true)
				{
					sidPR = q.Supplier_ID + "";
					sidRawC4 = sidPR.removeFirstOccurence("[").removeLastOccurence("]");
					quoteBooksIdC4 = "";
					if(sidRawC4 != "")
					{
						for each  supRecC4 in Suppliers
						{
							if(supRecC4.ID + "" == sidRawC4) { quoteBooksIdC4 = supRecC4.Supplier_ID + ""; }
						}
					}
					if(quoteBooksIdC4 == "2680178000002735078")
					{
						for each  sRow2 in r.Supplier_Selected_Supplier2
						{
							sRow2.Availability_Supplier2 = q.Availability;
							sRow2.Initial_Price_Supplier2 = q.Initial_Price;
							sRow2.Negotiated_Supplier2 = q.Negotiated;
							sRow2.Final_Price_Supplier2 = q.Final_Price;
							sRow2.Lead_Time_Supplier2 = q.Lead_Time;
							sRow2.Selected_Supplier2 = true;
						}
						r.Response_Status = "Selected";
					}
				}
			}
			break;
		}
	}
	tonySelected = false;
	anySelected = false;
	/* FIXED 2026-08-07 — same real bug/fix as Action 1's fentengSelected block above. */
	for each  row in input.Supplier_Selected
	{
		if(row.Selected == true)
		{
			anySelected = true;
		}
		rowSupplierValTC = row.Suppliers + "";
		if((rowSupplierValTC == "Tony" || rowSupplierValTC.contains("Tony")) && row.Selected == true)
		{
			tonySelected = true;
		}
	}
	if(tonySelected == true)
	{
		r.Response_Status="Selected";
		r.edit_counter=1;
	}
	else if(anySelected == true)
	{
		r.Response_Status="Not Selected";
		r.edit_counter=0;
	}
	else if(hasChanges == true)
	{
		r.Response_Status="Submit Response";
		r.edit_counter=1;
	}
}

====================================================
WORKFLOW SETUP — PR1_Sync_Own_Image (added 2026-07-06, SEPARATE workflow, no relation to
  the routing/guard logic above — deliberately NOT gated by Source, so it fires for BOTH
  manually-created AND SO_To_PR-created Purchase_Request1 records)
  Form: Purchase_Request1
  Trigger: Created or Edited > Successful form submission
  Action: Execute script
====================================================

itemRecOwn = Items[ID == input.Items];
if(itemRecOwn != null && itemRecOwn.Image != null)
{
	r = Purchase_Request1[ID == input.ID];
	r.Product_Image_PR = itemRecOwn.Image;
}

====================================================
NOTES:
- PR1_Sync_Own_Image (added 2026-07-06): user asked for PR1 itself to get a product image
  like the supplier PR forms already have. Deliberately built as its OWN independent
  workflow, not folded into PR_Populate_From_PR/PR_Changed above, because those are
  guarded by `Source` and wrapped in routeFenteng/routeTony branching (image would only
  set when a route happened to fire) — the image is unrelated to supplier routing and
  needs to run unconditionally on every PR1 create/edit regardless of how it was created.
  "Created or Edited > Successful form submission" (not the Source-guarded Created-only
  trigger) covers: (1) manual native PR1 creation/edit in Creator's UI, and (2)
  SO_To_PR's `zoho.creator.v2_1.createRecord` call for Purchase_Request1 — confirmed
  earlier in this project that the v2.1 createRecord REST task fires target-form
  workflows reliably (unlike native `insert into`), so this covers the Books path too
  with no extra code needed there.
  Field type: single "Image" (not "Image/s" multi-image), same as
  Product_Image_Supplier1_PR/Product_Image_Supplier2_PR — assign `itemRecOwn.Image`
  directly, no List() wrap (that's only for multi-image fields elsewhere in this
  codebase, e.g. Similar_Design_Photo).
- BUG confirmed live 2026-07-06: SO_To_PR createRecord for Purchase_Request1 returned
  {"code":3001,"error":["Error details: Error at on submit script..."]} on both lines of a
  test SO. Root cause: this file's Action 1/2 relied SOLELY on the trigger-level
  "Condition: Source != 'SO'" (set in Creator UI, not in code) to skip execution for
  SO-created PR1 records — no inline guard in the script itself, unlike the old superseded
  purchase_request_scripts1.txt which had `if(input.Source == "SO") { return; }` at the top
  of both actions. Without that inline guard, Action 1/2 ran on top of the supplier PRs
  SO_To_PR already creates directly via zoho.creator.v2_1.createRecord, duplicate-inserting
  into Fenteng_Lighting_Purchase_Request/Tony_Fan_Purchase_Request and erroring back to the
  Books function. FIXED: added `if(input.Source == "SO") { return; }` as the first line of
  both Action 1 and Action 2, restoring the old file's inline safety net regardless of
  whether the trigger-level condition is actually configured correctly.
- ADDED 2026-07-03 (user request): PR1's `Priority` field carried onto both supplier PR
  forms as `Priority_PR_Supplier1`/`Priority_PR_Supplier2` — set in both Action 1/2's
  insert bracket (create) and both PR_Changed Action 1/2's `update r [...]` bracket
  (edit-sync), matching every other PR-detail field here. Also added
  `input.Last_Update = zoho.currenttime;` at the top of PR_Changed Action 1 — stamps
  PR1's own DATE-TIME `Last_Update` field on every native PR1 edit (only needs to run
  once since Action 1/2 share the same underlying record via `input`).
  MIX-UP CAUGHT LIVE 2026-07-03: both of these were FIRST added to the simpler Action
  1/2 bodies in `purchase_request_scripts1.txt` instead — that file's versions of
  PR_Populate_From_PR/PR_Changed are SUPERSEDED by the ones in THIS file (see the
  WORKFLOW SETUP header above: "REPLACE existing Action 1 + Action 2 bodies"), so those
  edits landed in dead reference text that was never actually pasted into Creator. User
  caught it by pasting their real live script into Temp.txt and asking why it looked
  shorter than expected. Both fields are now correctly in THIS file instead.
- inquiry_reference (Single Line on Purchase_Request1) is the routing key — same field
  SO_To_PR already sets/reads. For manually-created PRs, enter the INQ number by hand
  (or via a lookup UI) to get the same single-supplier routing SO_To_PR gets automatically.
- No inquiry_reference (blank) -> both suppliers created, exactly like before (routeFenteng
  and routeTony both default true, matching Source != "SO" fallback behavior).
- inquiry_reference set but INQ not found / no Selected row -> both suppliers created too
  (anySelected == false -> routeFenteng = routeTony = true), same fallback as SO_To_PR.
- Inquiry_Form.Supplier_Quotes.Selected is a Decision Box (real boolean) in native Creator
  context — no need for the `== "true"` string check that SO_To_PR needed (that was only
  because Books read it through invokeurl JSON, which can stringify booleans).
- Inquiry_Form[INQ_No == matchedInqNo] is a safe lookup (string field) even though this
  runs inside a Purchase_Request1 event — no BIGINT risk since it's not a lookup-field
  criteria (see Deluge Gotchas in CLAUDE.md).
- BUG confirmed live 2026-07-03, FIXED: the claim above ("Fenteng_Sync_Image_PR/
  Tony_Sync_Image_PR already fire on the supplier form's own Created event regardless of
  which flow inserted it") was WRONG for this file's insert path. `Fenteng_Sync_Image_PR`
  triggers on Fenteng_Lighting_Purchase_Request's own "Created > Successful form
  submission" — but Action 1 here creates that record via a plain native
  `insert into Fenteng_Lighting_Purchase_Request[...]` run from Purchase_Request1's OWN
  workflow (a different form). Per this codebase's established gotcha (see
  reference-deluge-quirks.md / the pr_to_po_grouping.txt Shipment/Receiving discovery),
  a native cross-form `insert into` does NOT reliably fire the target form's own Created
  workflow — so the image sync never actually fired for PRs created through this file.
  Compounding this: the documented fallback fix (sideUpdateScriptPR.txt's "item 3" —
  resync the image on every PR1 edit) was only ever written as an addition to
  `purchase_request_scripts1.txt`'s PR_Changed — which is the SUPERSEDED reference copy,
  not this file — so it never actually made it into the live PR_Changed either. No path
  populated the image at all for manually-created PRs.
  FIXED: both Action 1/2 (create) now fetch `itemRecF`/`itemRecT` and set
  `newRec1.Product_Image_Supplier1_PR`/`newRec2.Product_Image_Supplier2_PR` directly
  inline (no dependency on the supplier form's own Created trigger firing at all). Both
  PR_Changed Action 1/2 also now fetch `itemRecPRF`/`itemRecPRT` and resync
  `r.Product_Image_Supplier1_PR`/`r.Product_Image_Supplier2_PR` on every PR1 edit, as a
  safety net if Items changes after creation. `sideUpdateScriptPR.txt`'s own
  Fenteng_Sync_Image_PR/Tony_Sync_Image_PR triggers are unaffected and still relevant for
  SO_To_PR-created records (Books' `zoho.creator.v2_1.createRecord` IS confirmed to fire
  target workflows reliably, unlike native `insert into`) and for any direct native-form
  edits made straight on the supplier PR record itself.
- PR_Changed's EXISTING hasChanges / Selected / Not-Selected logic (driven by
  input.Supplier_Selected, which reflects the supplier's own saved responses back on PR1)
  is unchanged in substance — the Inquiry quote resync block is just inserted INSIDE the
  same "for each r in ...Recs" loop as everything else, so r stays in scope. The two
  Action scripts above are given in FULL (paste-and-replace), not as a diff, specifically
  to avoid the r-out-of-scope mistake from pasting the resync block after the loop closes.
====================================================

````
