---
title: "sideUpdateScriptPR"
source_file: "sideUpdateScriptPR.txt"
category: "Procurement/Purchase Request/Deluge"
associated_widget: "[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]"
lines: 120
tags:
  - delivery-management
  - deluge
  - dms
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
---

# sideUpdateScriptPR

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]
> - **Category:** `Procurement/Purchase Request/Deluge`
> - **Source File:** `sideUpdateScriptPR.txt`
> - **Lines of Code:** 120
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Purchase Request/Widget/Purchase Request Widget|Purchase Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== SIDE UPDATE: Product Image on Supplier PR reports ==
== Fields: Product_Image_Supplier1_PR (Fenteng), Product_Image_Supplier2_PR (Tony) ==
== Source: Items.Image, matched via Items_Supplier1 / Items_Supplier2 lookup ==

====================================================
WHY "Created or Edited > Successful form submission" (2026-07-02, 2nd rewrite)
====================================================
Tried "Load of form" first (simplest idea — just show the image live, no storage).
FAILED: confirmed live that Load of form only affects the browser's in-memory view of
the form — it never writes to the DB. Image fields especially don't persist through
that path (unlike a plain text field, there's no real "submit" happening on Load of
form; the browser's actual multipart POST on Save has nothing in that field, so nothing
sticks). Result: image showed nowhere, not even after Edit + Save.

REAL FIX: back to a "Successful form submission" trigger (Created or Edited) — this is
a genuine backend record write via `update r [...]`, same as every other confirmed-
working sync in this codebase (Inquiry -> Supplier_1/Supplier_2, sideUpdateScript.txt).
No REST Upload File API involved, no browser file-picker involved — just a plain field
assignment task, which reliably persists.

Confirmed 2026-07-02 that Product_Image_Supplier1_PR / _Supplier2_PR are SINGLE "Image"
fields (not "Image/s" multi-image like the Inquiry-side ones) — wrapping in List()
throws "LIST value cannot be assigned to 'Product_Image_Supplier1_PR'". Assign
itemRec.Image directly, no List().

====================================================
1. WORKFLOW — Fenteng_Sync_Image_PR
   Form: Fenteng_Lighting_Purchase_Request
   Trigger: Created or Edited > Successful form submission
====================================================

if(input.Items_Supplier1 != null)
{
	itemRec = Items[ID == input.Items_Supplier1];
	if(itemRec != null && itemRec.Image != null)
	{
		r = Fenteng_Lighting_Purchase_Request[ID == input.ID];
		r.Product_Image_Supplier1_PR = itemRec.Image;
	}
}

====================================================
2. WORKFLOW — Tony_Sync_Image_PR
   Form: Tony_Fan_Purchase_Request
   Trigger: Created or Edited > Successful form submission
====================================================

if(input.Items_Supplier2 != null)
{
	itemRec = Items[ID == input.Items_Supplier2];
	if(itemRec != null && itemRec.Image != null)
	{
		r = Tony_Fan_Purchase_Request[ID == input.ID];
		r.Product_Image_Supplier2_PR = itemRec.Image;
	}
}

====================================================
3. PR_Changed (Purchase_Request1 Edited) — resync image if Item changed
   Add to existing ACTION 1 (Fenteng) and ACTION 2 (Tony Fan) in purchase_request_scripts1.txt
   Only relevant for manually-edited PRs (SO-created PRs aren't edited through PR1 directly)
====================================================

ACTION 1 addition (Fenteng) — add itemRecPR fetch at top of the action, add one line
inside the existing "update r [...]" block (dot-notation, right after the block):

itemRecPR = Items[ID == input.Items];
... (existing hasChanges check unchanged) ...
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
	];
	if(itemRecPR != null && itemRecPR.Image != null)
	{
		r.Product_Image_Supplier1_PR=itemRecPR.Image;
	}
... (rest of Action 1 unchanged) ...

ACTION 2 addition (Tony) — same pattern:
  itemRecPR = Items[ID == input.Items];
  r.Product_Image_Supplier2_PR=itemRecPR.Image inside the Tony update block.

Note: this addition is redundant with items 1/2 above IF Items_Supplier1/2 on the
supplier PR form always mirrors Purchase_Request1.Items (true for both PR_Populate_From_PR
and SO_To_PR). Keep it anyway as a safety net in case Items is ever changed directly on
PR1 after the supplier PR record already exists.

====================================================
NOTES:
- Field link names: Product_Image_Supplier1_PR (Fenteng), Product_Image_Supplier2_PR
  (Tony). Both single "Image" fields -> assign itemRec.Image directly, no List(). List()
  is only for "Image/s" multi-image fields (that's the Inquiry-side pattern in
  sideUpdateScript.txt — different field type, don't copy that part over).
- Items_Supplier1 / Items_Supplier2 on the supplier PR forms are lookup fields to Items,
  already set by both PR_Populate_From_PR and SO_To_PR at create time.
- Lookup fields return NUMBER (record ID) via input.field, not text — check with
  `!= null` only, NOT `!= ""` (comparing NUMBER != TEXT throws "operator != is not
  valid" in criteria). Confirmed live 2026-07-01 on input.Items_Supplier1/2.
- input.Items_Supplier1/2 in items 1/2 is direct input context (event fires on the
  supplier form itself) — Items[ID == input.Items_Supplier1] is safe there (per Deluge
  Gotchas in CLAUDE.md: direct input context only, not on fetched records).
- input.Items in item 3 is direct input context on Purchase_Request1's own Edited event
  — Items[ID == input.Items] is fine there too.
- Guard itemRec/itemRecPR != null and .Image != null throughout — items with no image
  simply don't get one, PR creation/edit is never blocked by a missing image.
- Existing PRs with no image yet: this trigger fires on "Successful form submission"
  only, so an already-created PR won't get its image until it's Edited + Saved once
  (any edit, doesn't need to touch Items) — or re-trigger by editing and saving. There is
  no "Load of form" backfill path anymore (that's the part that didn't work).
- If the old Load-of-form workflows (Fenteng_Show_Image_PR / Tony_Show_Image_PR) were
  ever pasted into Creator, delete them — replaced by items 1/2 above.
====================================================

````
