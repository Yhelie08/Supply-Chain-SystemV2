---
title: "warehouse_request_item_image_backfill"
source_file: "Deluge Script/warehouse_request_item_image_backfill.txt"
category: "Fulfillment/Warehouse Request/Deluge"
associated_widget: "[[Fulfillment/Warehouse Request/Widget/Warehouse Request Widget|Warehouse Request Widget]]"
lines: 75
tags:
  - deluge
  - fulfillment
  - inquiry
  - pick
  - procurement
  - purchase-order
  - purchase-request
  - zoho-creator
---

# warehouse_request_item_image_backfill

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Fulfillment/Warehouse Request/Widget/Warehouse Request Widget|Warehouse Request Widget]]
> - **Category:** `Fulfillment/Warehouse Request/Deluge`
> - **Source File:** `Deluge Script/warehouse_request_item_image_backfill.txt`
> - **Lines of Code:** 75
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#pick`, `#procurement`, `#purchase-order`, `#purchase-request`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Fulfillment/Warehouse Request/Widget/Warehouse Request Widget|Warehouse Request Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Warehouse_Request_Item_Image_Backfill ==
== NEW 2026-08-18, found during Warehouse Request widget live testing ==
== Fields: Warehouse_Request.Item (subform) .Image ==
== Source: Items.Image, matched via row.Items ==

====================================================
ROOT CAUSE:
Same restriction already documented in DelugeScripts\inquiry_autofill_product_image.txt
for Inquiry_Form.Product_Image: an Image-type field's raw value CANNOT be set via a plain
JSON create/update payload at all (zoho.creator.v2_1.createRecord / the widget SDK's
addRecords/updateRecordById all hit the same v2.1 REST layer and reject it, code 3001
"File Upload type and Image type fields are not allowed"). The Warehouse Request widget
(Widget\Fulfillment\Transfer Warehouse\app\index.html) tried to auto-fill each item row's
Photo cell from the matched item's own catalog photo (All_Items.Image) and submit it
client-side — confirmed live 2026-08-18 that it never actually saves (SKU and the item
itself save fine, Photo always comes back blank), which matches this same restriction,
just hit one level deeper since Item.Image is a SUBFORM column, not a top-level field.
The widget's own client-side attempt has been REMOVED (see that file's own CLAUDE.md
entry, "server-side fix required") — it only shows the item's photo as a live preview
while filling the form now, it no longer tries to submit it. This workflow is the actual
fix, same shape as the Inquiry one, adapted for a subform loop instead of a single field.
====================================================

====================================================
WORKFLOW SETUP — Warehouse_Request_Item_Image_Backfill
  Form: Warehouse_Request
  Record Event: Created or Edited
  Form Event: Successful form submission
  Action: Execute script
====================================================

for each row in input.Item
{
	picStrChk = row.Image + "";
	if(row.Image == null || picStrChk == "" || picStrChk == "{}" || picStrChk == "[]")
	{
		itemRec = Items[ID == row.Items];
		if(itemRec != null && itemRec.Image != null)
		{
			row.Image = itemRec.Image;
		}
	}
}

====================================================
NOTES:
- Mirrors DelugeScripts\inquiry_autofill_product_image.txt's exact pattern: only fills
  when currently blank (won't clobber a manually different photo later), safe to fire on
  every edit not just create since it's a no-op once populated.
- input.Item works directly because this runs on Warehouse_Request's OWN "Successful Form
  Submission" trigger (direct input context — see Deluge Gotchas point 1/4 in CLAUDE.md).
- row.Items (inside the for-each) gives the linked Items record's ID, matching the
  subform column's own field link name confirmed via the native form's own schema export
  ("IDE Warehouse Request": Item grid -> Items picklist, values = Items.ID).
- itemRec form name is "Items" (the linked lookup form), NOT "All_Items" — All_Items is
  only the WIDGET's own report name for the same underlying form; Deluge scripts query
  the form itself, matching the exact `Items[ID == input.Items]` line already used and
  confirmed working in inquiry_autofill_product_image.txt.
- NOT YET LIVE-CONFIRMED for this specific case: inquiry_autofill_product_image.txt's own
  precedent mutates a TOP-LEVEL field (`input.Product_Image = ...`) directly on `input`.
  This script mutates a SUBFORM ROW field (`row.Image = ...`) while looping `input.Item`
  directly — per Deluge Gotchas point 8, subform fields can't be touched via
  `update Form[criteria][field=value]`, but the one confirmed-safe subform mutation on
  the CURRENT trigger form's own record is `input.SubformField.insert(row)` (appending a
  NEW row) — mutating an EXISTING row's field while iterating `input.Item` directly is a
  closely analogous operation but hasn't been proven working in this codebase before.
  First live test of this workflow either confirms this pattern for future subform-image
  backfills too, or (if it errors / silently doesn't persist) means each row needs to be
  rebuilt fresh via the `Form.SubformField()` row-builder pattern instead (Gotchas point
  8's "confirmed-safe" list) — flag back if this doesn't work first try, don't just retry
  the same script blindly.
- EXISTING BAD DATA: only fixes the sync going forward. Requests already created via the
  widget before this workflow is added stay blank until edited/re-saved once (fires this
  same trigger), or backfilled manually.
====================================================

````
