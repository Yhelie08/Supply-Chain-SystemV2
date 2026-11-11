---
title: "purchase_request_scripts1"
source_file: "purchase_request_scripts1.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 662
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
---

# purchase_request_scripts1

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `purchase_request_scripts1.txt`
> - **Lines of Code:** 662
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-books`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Purchase Request → Supplier PR Forms ==
== Mirror of Inquiry → Supplier_1/Supplier_2 pattern ==

====================================================
STEP 0 — CREATE FIELDS FIRST (do this before any workflow)
====================================================
Do this on BOTH forms:
  Fenteng_Lighting_Purchase_Request
  Tony_Fan_Purchase_Request

Field 1:
  Label: edit_counter
  Link name: edit_counter
  Field type: Number
  Default value: 0

Field 2:
  Label: Response Status
  Link name: Response_Status
  Field type: Single Line (or Dropdown)
  If Dropdown, add values: Waiting, Submit Response, Selected, Not Selected
  Default value: Waiting

After creating both fields on both forms, proceed to workflows below.
====================================================

====================================================
WORKFLOW SETUP — PR_Populate_From_PR
== SUPERSEDED 2026-07-03: this Action 1/2 body is OLD REFERENCE TEXT ONLY — the live
   version in Creator is `PR1_Created_Edited_Routing.txt`'s Action 1/2 (adds INQ
   routing on top of this same base). Editing THIS copy does nothing in Creator — a
   mix-up already happened once (Priority_PR_Supplier1/2 + Last_Update got added here
   first by mistake, caught only when the user pasted their real live script and it
   looked shorter than expected). Edit `PR1_Created_Edited_Routing.txt` instead. ==
====================================================
Form: Purchase_Request1
Trigger: Created > Successful form submission
Condition: Source != "SO"
  (Skip when PR was created by Books SO function — that function creates supplier PRs directly)
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
	Priority_PR_Supplier1=input.Priority
	Response_Status="Waiting"
	edit_counter=1
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
	Priority_PR_Supplier2=input.Priority
	Response_Status="Waiting"
	edit_counter=1
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
		/* FIXED 2026-08-07, real bug found via codebase-wide audit (same class as the
		   already-fixed approvePOMain crash, memory `reference-deluge-quirks.md`):
		   row.Suppliers (Purchase_Request1.Supplier_Selected) can be the SHORT name
		   ("Fenteng") or the FULL Suppliers-form name ("Fenteng Lighting") depending
		   on whether this PR was auto-routed or INQ-routed — confirmed live in
		   Production holding both shapes across different PRs. The old strict ==
		   silently skipped the sync whenever a PR hit the full-name shape, meaning
		   the supplier's own price/availability edits never made it back onto
		   Purchase_Request1 for those PRs. */
		rowSupplierVal1 = row.Suppliers + "";
		if(rowSupplierVal1 == "Fenteng" || rowSupplierVal1.contains("Fenteng"))
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
if(input.Response_Status != "Selected")
{
	input.edit_counter = 0;
}
openUrl("#Report:Fenteng_Lighting_Purchase_Request_Report", "same window");

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
		/* FIXED 2026-08-07 — same real bug/fix as PR_Stage_Supplier_Changed_Supplier1 above. */
		rowSupplierVal2 = row.Suppliers + "";
		if(rowSupplierVal2 == "Tony" || rowSupplierVal2.contains("Tony"))
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
if(input.Response_Status != "Selected")
{
	input.edit_counter = 0;
}
openUrl("#Report:Tony_Fan_Purchase_Request_Report", "same window");

====================================================
PR EDIT → UPDATE SUPPLIER FORMS + SELECTED/NOT SELECTED
== SUPERSEDED 2026-07-03: same as PR_Populate_From_PR above — the live PR_Changed
   Action 1/2 is in `PR1_Created_Edited_Routing.txt` (adds INQ quote resync inside the
   same loop). Edit that file, not this one. ==
====================================================
WORKFLOW SETUP — PR_Changed
  Form: Purchase_Request1
  Trigger: Edited > Successful form submission
  Action 1: Execute script — paste ACTION 1 below (Fenteng)
  Action 2: Execute script — paste ACTION 2 below (Tony Fan)
  NOTE: Separate actions required
====================================================

ACTION 1 — Fenteng Lighting
====================================================

input.Last_Update = zoho.currenttime;
itemRecPR = Items[ID == input.Items];
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
	];
	if(itemRecPR != null && itemRecPR.Image != null)
	{
		r.Product_Image_Supplier1_PR=itemRecPR.Image;
	}
	fentengSelected = false;
	anySelected = false;
	for each  row in input.Supplier_Selected
	{
		if(row.Selected == true)
		{
			anySelected = true;
		}
		if(row.Suppliers == "Fenteng")
		{
			for each  sRow1 in r.Supplier_Selected_Supplier1
			{
				if(sRow1.Availability_Supplier1 != row.Availability || sRow1.Initial_Price_Supplier1 != row.Initial_Price || sRow1.Negotiated_Supplier1 != row.Negotiated || sRow1.Final_Price_Supplier1 != row.Final_Price || sRow1.Lead_Time_Supplier1 != row.Lead_Time)
				{
					hasChanges = true;
				}
				sRow1.Availability_Supplier1 = row.Availability;
				sRow1.Initial_Price_Supplier1 = row.Initial_Price;
				sRow1.Negotiated_Supplier1 = row.Negotiated;
				sRow1.Final_Price_Supplier1 = row.Final_Price;
				sRow1.Lead_Time_Supplier1 = row.Lead_Time;
			}
			if(row.Selected == true)
			{
				fentengSelected = true;
			}
		}
	}
	if(fentengSelected == true)
	{
		r.Response_Status = "Selected";
		r.edit_counter = 1;
	}
	else if(anySelected == true)
	{
		r.Response_Status = "Not Selected";
		r.edit_counter = 0;
	}
	else if(hasChanges == true)
	{
		r.Response_Status = "Submit Response";
		r.edit_counter = 1;
	}
}

====================================================
ACTION 2 — Tony Fan
====================================================

itemRecPR = Items[ID == input.Items];
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
	];
	if(itemRecPR != null && itemRecPR.Image != null)
	{
		r.Product_Image_Supplier2_PR=itemRecPR.Image;
	}
	tonySelected = false;
	anySelected = false;
	for each  row in input.Supplier_Selected
	{
		if(row.Selected == true)
		{
			anySelected = true;
		}
		if(row.Suppliers == "Tony")
		{
			for each  sRow2 in r.Supplier_Selected_Supplier2
			{
				if(sRow2.Availability_Supplier2 != row.Availability || sRow2.Initial_Price_Supplier2 != row.Initial_Price || sRow2.Negotiated_Supplier2 != row.Negotiated || sRow2.Final_Price_Supplier2 != row.Final_Price || sRow2.Lead_Time_Supplier2 != row.Lead_Time)
				{
					hasChanges = true;
				}
				sRow2.Availability_Supplier2 = row.Availability;
				sRow2.Initial_Price_Supplier2 = row.Initial_Price;
				sRow2.Negotiated_Supplier2 = row.Negotiated;
				sRow2.Final_Price_Supplier2 = row.Final_Price;
				sRow2.Lead_Time_Supplier2 = row.Lead_Time;
			}
			if(row.Selected == true)
			{
				tonySelected = true;
			}
		}
	}
	if(tonySelected == true)
	{
		r.Response_Status = "Selected";
		r.edit_counter = 1;
	}
	else if(anySelected == true)
	{
		r.Response_Status = "Not Selected";
		r.edit_counter = 0;
	}
	else if(hasChanges == true)
	{
		r.Response_Status = "Submit Response";
		r.edit_counter = 1;
	}
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
disable Response_Status;
disable edit_counter;
disable Supplier_Selected_Supplier1.Suppliers_Supplier1;
disable Supplier_Selected_Supplier1.Status_Supplier1;
disable Supplier_Selected_Supplier1.Selected_Supplier1;
if(input.edit_counter == 0)
{
	disable Supplier_Selected_Supplier1.Availability_Supplier1;
	disable Supplier_Selected_Supplier1.Initial_Price_Supplier1;
	disable Supplier_Selected_Supplier1.Negotiated_Supplier1;
	disable Supplier_Selected_Supplier1.Final_Price_Supplier1;
	disable Supplier_Selected_Supplier1.Lead_Time_Supplier1;
}
if(input.Response_Status == "Not Selected")
{
	disable Supplier_Selected_Supplier1.Availability_Supplier1;
	disable Supplier_Selected_Supplier1.Initial_Price_Supplier1;
	disable Supplier_Selected_Supplier1.Negotiated_Supplier1;
	disable Supplier_Selected_Supplier1.Final_Price_Supplier1;
	disable Supplier_Selected_Supplier1.Lead_Time_Supplier1;
}
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
disable Response_Status;
disable edit_counter;
disable Supplier_Selected_Supplier2.Suppliers_Supplier2;
disable Supplier_Selected_Supplier2.Status_Supplier2;
disable Supplier_Selected_Supplier2.Selected_Supplier2;
if(input.edit_counter == 0)
{
	disable Supplier_Selected_Supplier2.Availability_Supplier2;
	disable Supplier_Selected_Supplier2.Initial_Price_Supplier2;
	disable Supplier_Selected_Supplier2.Negotiated_Supplier2;
	disable Supplier_Selected_Supplier2.Final_Price_Supplier2;
	disable Supplier_Selected_Supplier2.Lead_Time_Supplier2;
}
if(input.Response_Status == "Not Selected")
{
	disable Supplier_Selected_Supplier2.Availability_Supplier2;
	disable Supplier_Selected_Supplier2.Initial_Price_Supplier2;
	disable Supplier_Selected_Supplier2.Negotiated_Supplier2;
	disable Supplier_Selected_Supplier2.Final_Price_Supplier2;
	disable Supplier_Selected_Supplier2.Lead_Time_Supplier2;
}
====================================================
VALIDATION — Block submit when locked
====================================================
WORKFLOW SETUP — Mandatory_PR_Fields_Supplier1
  Form: Fenteng_Lighting_Purchase_Request
  Trigger: Edited > Validations
  Action: Execute script
====================================================

if(input.edit_counter == 0)
{
	alert "Editing is locked. Wait for Purchase Request update.";
	cancel submit;
}
hasEmpty = false;
msg = "";
for each  subRow in input.Supplier_Selected_Supplier1
{
	if(subRow.Availability_Supplier1 == null || subRow.Availability_Supplier1 == "")
	{
		hasEmpty = true;
		msg = msg + "Availability, ";
	}
	hasSRPRate1 = (input.SRP_Rate_PR_Supplier1 != null && input.SRP_Rate_PR_Supplier1 != 0);
	/* FIXED 2026-08-25, real bug caught live (PR-00007, Fenteng): choosing Availability
	   ="Unavailable" in the supplier PR widget still popped this native validation's own
	   "Required fields missing: Initial Price, Final Price, Lead Time" alert and blocked
	   submit — this rule only ever exempted "Cannot Produce", never "Unavailable", even
	   though the widget's own client-side JS (Fenteng-PR/Tony-PR app/index.html's
	   onAvailChange/submitResponse) has always treated the two as equivalent
	   (cannotOrUnavailable). Added the same "Unavailable" exemption here so the native
	   server-side rule actually matches what the widget already promises. */
	if(subRow.Availability_Supplier1 != "Cannot Produce" && subRow.Availability_Supplier1 != "Unavailable" && subRow.Availability_Supplier1 != "Confirmed" && hasSRPRate1 == false)
	{
		if(subRow.Initial_Price_Supplier1 == null || subRow.Initial_Price_Supplier1 == 0)
		{
			hasEmpty = true;
			msg = msg + "Initial Price, ";
		}
		if(subRow.Final_Price_Supplier1 == null || subRow.Final_Price_Supplier1 == 0)
		{
			hasEmpty = true;
			msg = msg + "Final Price, ";
		}
	}
	if(subRow.Availability_Supplier1 != "Cannot Produce" && subRow.Availability_Supplier1 != "Unavailable")
	{
		if(subRow.Availability_Supplier1 != "Confirmed")
		{
			if(subRow.Lead_Time_Supplier1 == null || subRow.Lead_Time_Supplier1 == 0)
			{
				hasEmpty = true;
				msg = msg + "Lead Time, ";
			}
		}
	}
}
if(hasEmpty == true)
{
	alert "Required fields missing: " + msg.removeLastOccurence(", ");
	cancel submit;
}

====================================================
WORKFLOW SETUP — Mandatory_PR_Fields_Supplier2
  Form: Tony_Fan_Purchase_Request
  Trigger: Edited > Validations
  Action: Execute script
====================================================

if(input.edit_counter == 0)
{
	alert "Editing is locked. Wait for Purchase Request update.";
	cancel submit;
}
hasEmpty = false;
msg = "";
for each  subRow in input.Supplier_Selected_Supplier2
{
	if(subRow.Availability_Supplier2 == null || subRow.Availability_Supplier2 == "")
	{
		hasEmpty = true;
		msg = msg + "Availability, ";
	}
	hasSRPRate2 = (input.SRP_Rate_PR_Supplier2 != null && input.SRP_Rate_PR_Supplier2 != 0);
	/* FIXED 2026-08-25, same bug/fix as Mandatory_PR_Fields_Supplier1 above (real live
	   bug, PR-00007) — "Unavailable" was never exempted here, only "Cannot Produce",
	   even though the widget's own client-side JS (Tony-PR app/index.html's
	   onAvailChange/submitResponse) always treated the two the same. */
	if(subRow.Availability_Supplier2 != "Cannot Produce" && subRow.Availability_Supplier2 != "Unavailable" && subRow.Availability_Supplier2 != "Confirmed" && hasSRPRate2 == false)
	{
		if(subRow.Initial_Price_Supplier2 == null || subRow.Initial_Price_Supplier2 == 0)
		{
			hasEmpty = true;
			msg = msg + "Initial Price, ";
		}
		if(subRow.Final_Price_Supplier2 == null || subRow.Final_Price_Supplier2 == 0)
		{
			hasEmpty = true;
			msg = msg + "Final Price, ";
		}
	}
	if(subRow.Availability_Supplier2 != "Cannot Produce" && subRow.Availability_Supplier2 != "Unavailable")
	{
		if(subRow.Availability_Supplier2 != "Confirmed")
		{
			if(subRow.Lead_Time_Supplier2 == null || subRow.Lead_Time_Supplier2 == 0)
			{
				hasEmpty = true;
				msg = msg + "Lead Time, ";
			}
		}
	}
}
if(hasEmpty == true)
{
	alert "Required fields missing: " + msg.removeLastOccurence(", ");
	cancel submit;
}

====================================================
REPORT ACTION ITEM — Submit Response button
====================================================
Add Action Item on BOTH supplier PR reports.
Condition (same for both):
  Response_Status != "Not Selected" && Response_Status != "Selected" && edit_counter == 1

Action Item script — Fenteng_Lighting_Purchase_Request_Report:
  openUrl("#Form:Fenteng_Lighting_Purchase_Request?viewLinkName=Fenteng_Lighting_Purchase_Request_Report&recLinkID=" + input.ID, "same window");

Action Item script — Tony_Fan_Purchase_Request_Report:
  openUrl("#Form:Tony_Fan_Purchase_Request?viewLinkName=Tony_Fan_Purchase_Request_Report&recLinkID=" + input.ID, "same window");

====================================================
PR DELETE → DELETE SUPPLIER RECORDS
====================================================
WORKFLOW SETUP — PR_Deleted
  Form: Purchase_Request1
  Trigger: Deleted
  Action: Execute script
====================================================

delete from Fenteng_Lighting_Purchase_Request [PR_No_Supplier1 == input.PR_No];
delete from Tony_Fan_Purchase_Request [PR_No_Supplier2 == input.PR_No];

====================================================
NOTES:
- ADDED 2026-07-06 (revised same day): when Purchase_Request1.SRP_Rate_PR already has a
  value (SO-approved rate exists), Initial_Price/Negotiated/Final_Price become skippable
  (null/0 accepted) in Mandatory_PR_Fields_Supplier1/2 validation — independent of the
  existing "Cannot Produce" exemption, either condition alone exempts those two fields.
  Availability + Lead_Time still required as before (Lead_Time still exempt when
  Availability=="Confirmed", unchanged existing rule).
  REVERTED same day: an earlier version of this change ALSO disabled Initial_Price/
  Negotiated/Final_Price in Disable_PR_Details_Supplier1/2 whenever SRP_Rate_PR_Supplier1/2
  had a value — user tested and asked to leave them enabled (still fillable, just not
  required) instead of disabled. Only the validation-exemption half stays; the
  disable-block addition was removed from both Disable_PR_Details_Supplier1/2 scripts.
  Requires `SRP_Rate_PR_Supplier1/2` (Number) mirror fields on both supplier forms
  (synced from PR1.SRP_Rate_PR the same way Priority_PR_Supplier1/2 already is — see
  PR1_Created_Edited_Routing.txt PREREQUISITE) — still needed for the validation check
  even though the disable-block use of it was reverted.
- CHANGED 2026-07-06 (same day, second round): tested with Availability=="Confirmed" and
  still got blocked on "Initial Price, Final Price" — user clarified the actual intent:
  Availability=="Confirmed" should ALSO exempt Initial_Price/Negotiated/Final_Price (not
  just Lead_Time, which it already exempted). Mirrors whatever the PO-side "Confirmed"
  meaning is meant to be (user's framing: "same mandatory as PO"). Fixed by adding
  `&& subRow.Availability_Supplier1/2 != "Confirmed"` to the same condition that already
  checks `!= "Cannot Produce"` and `hasSRPRate1/2 == false` — now THREE independent ways
  to exempt Initial_Price/Negotiated/Final_Price: Cannot Produce, Confirmed, or an
  existing SRP_Rate_PR value. Lead_Time's own exemption (Availability=="Confirmed") is
  untouched, still evaluated in its own separate if-block below.
- Always sends to BOTH suppliers on every PR create — no subform check
  (Supplier_Selected subform is empty at create time, so conditional check never fires)
- Separate actions required (Fenteng insert must not be in same script as Tony Fan insert)
- PR_Changed mirrors Stage_Inquiry_Changed pattern:
    hasChanges (sku/quantity/Target_Delivery/Description1 differ) → Submit Response + edit_counter=1
    Fenteng row Selected=true → Selected + edit_counter=1
    anySelected but not Fenteng → Not Selected + edit_counter=0
    Same logic applies for Tony Fan
- Supplier saves → edit_counter=0 (unless Response_Status == "Selected")
- Report Action Item condition: Response_Status != "Not Selected" && Response_Status != "Selected" && edit_counter == 1
- No "Completed" state (no collateral docs for PR)
- Tony Fan's Suppliers value in PR1 subform = "Tony" (not "Tony Fan")
- FIX (2026-07-02): PR_Changed Action 1/2 previously only read input.Supplier_Selected
  to check Selected/set Response_Status — it never actually copied Availability/
  Initial_Price/Negotiated/Final_Price/Lead_Time down into the matching supplier's own
  Supplier_Selected_Supplier1/2 subform. Bug: editing those quote-value fields directly
  on Purchase_Request1's Supplier_Selected subform silently did NOT reflect on the
  supplier PR form. Fixed by looping r.Supplier_Selected_Supplier1/2 (the fetched
  supplier record's own subform) and copying values in whenever row.Suppliers matches
  ("Fenteng"/"Tony"), regardless of Selected state — same subform-row-iteration pattern
  already used in stage_inquiry_changed_actions.txt and PR1_Created_Edited_Routing.txt.
  This is a ONE-WAY sync (PR1 -> supplier form) on every PR1 edit; the other direction
  (supplier form -> PR1) already existed via PR_Stage_Supplier_Changed_Supplier1/2. No
  infinite-loop risk: `rec.field = value` backend updates don't trigger the target
  form's own workflows (confirmed elsewhere in this codebase), so this write into the
  supplier PR record doesn't re-fire PR_Stage_Supplier_Changed, and that script's writes
  into PR1 don't re-fire PR_Changed either.
- FOLLOW-UP FIX (2026-07-02, same session): quote values now copied down correctly, but
  Response_Status/edit_counter stayed frozen — because `hasChanges` only ever compared
  PR-level fields (sku/quantity/Target_Delivery/Description1), never the quote values
  themselves. Editing ONLY Availability/Initial_Price/etc. on PR1 (not touching sku/qty/
  date/description) left `hasChanges=false`, so none of the three Response_Status
  branches fired and the supplier stayed locked (edit_counter unchanged, Submit Response
  button still disabled). Fixed by comparing each sRow1/sRow2 field against the incoming
  row's value BEFORE overwriting, and setting `hasChanges=true` on any diff — same
  `hasChanges` variable feeds the existing branch logic, so a quote-only edit now
  correctly lands on "Submit Response" + edit_counter=1 (unless Selected/Not Selected
  already takes priority via the earlier branches).
- Also folded in the itemRecPR product-image resync (Product_Image_Supplier1/2_PR) that
  had only been applied to Temp.txt earlier and never made it into this master file —
  now present in both Action 1 and Action 2, matching sideUpdateScriptPR.txt's pattern.
- ADDED 2026-07-03 (user request): PR1's `Priority` field now carried onto both supplier
  PR forms as `Priority_PR_Supplier1`/`Priority_PR_Supplier2` — set in the CREATE insert
  bracket (`PR_Populate_From_PR` Actions 1/2) and refreshed on every PR1 edit
  (`PR_Changed` Actions 1/2's `update r [...]` bracket), same "create + keep synced on
  edit" pattern as every other PR-detail field here (sku/quantity/Target_Delivery/etc).
- ADDED 2026-07-03: `input.Last_Update = zoho.currenttime;` at the top of Action 1 —
  stamps Purchase_Request1's own `Last_Update` field (confirmed DATE-TIME type via form
  screenshot, "yyyy-MM-dd hh:mm:ss A" placeholder — needs `zoho.currenttime`, not
  `zoho.currentdate`, same gotcha as Sent_On/Acknowledge_On elsewhere) on every native
  PR1 edit that fires this Edited > Successful form submission trigger. Only needs to run
  once (Action 1), since both actions write to the same underlying record via `input`.
  Also mirrored in `pr_to_po_grouping.txt`'s `PR_Approved` action, since approving a PR
  writes several PR1 fields (PR_Status/Link_PO_No/Production_Date) via the Action Item's
  own `input.field=value` pattern — that path does NOT fire this native Edited trigger,
  so it needs its own explicit stamp.
- FIXED 2026-08-25, real bug caught live (PR-00007, Fenteng Lighting portal): choosing
  Availability=="Unavailable" in the supplier PR widget still got blocked by this
  validation's own "Required fields missing: Initial Price, Final Price, Lead Time"
  alert. Root cause: Mandatory_PR_Fields_Supplier1/2 only ever exempted "Cannot
  Produce" from those three fields — "Unavailable" was never added, even though the
  supplier PR widgets' own client-side JS (Fenteng-PR/Tony-PR app/index.html's
  onAvailChange/submitResponse) have always treated Cannot Produce and Unavailable as
  equivalent (their own `cannotOrUnavailable` flag). The widget-side fix (disabling/
  clearing those inputs client-side) could never actually take effect end-to-end while
  this native server-side validation kept rejecting the submit regardless of what the
  widget sent. Added `&& subRow.Availability_Supplier1/2 != "Unavailable"` alongside the
  existing `!= "Cannot Produce"` check, in BOTH the Initial/Final Price condition and the
  Lead_Time condition, for both Supplier1 and Supplier2 — Unavailable now behaves
  identically to Cannot Produce here, matching the widget's own logic.
====================================================

````
