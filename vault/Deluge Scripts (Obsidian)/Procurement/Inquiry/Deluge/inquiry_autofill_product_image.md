---
title: "inquiry_autofill_product_image"
source_file: "inquiry_autofill_product_image.txt"
category: "Procurement/Inquiry/Deluge"
associated_widget: "[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]"
lines: 61
tags:
  - deluge
  - inquiry
  - procurement
  - purchase-order
  - purchase-request
  - supplier-portal
  - zoho-creator
---

# inquiry_autofill_product_image

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]
> - **Category:** `Procurement/Inquiry/Deluge`
> - **Source File:** `inquiry_autofill_product_image.txt`
> - **Lines of Code:** 61
> - **Tags:** `#deluge`, `#inquiry`, `#procurement`, `#purchase-order`, `#purchase-request`, `#supplier-portal`, `#zoho-creator`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Inquiry/Widget/Inquiry Widget|Inquiry Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== INQ_AutoFill_Product_Image ==
== NEW 2026-07-09, found during INQs widget full workflow audit ==
== Fields: Inquiry_Form.Product_Image (single Image field) ==
== Source: Items.Image, matched via input.Items ==

====================================================
ROOT CAUSE:
INQ_AutoFill_Item_Details (Created or Edited > User input of Items) is the native
workflow that copies Items.Image -> Inquiry_Form.Product_Image, alongside sku/
description/unit/SRP_Approved1. "User input of X" triggers only fire on live native-
form field interaction — confirmed repeatedly this project (Trigger_Estimate history,
Supplier_2 image sync earlier today) that they never fire for API/widget-driven
creates or edits. The INQs widget (UI/EndUser/INQs) already replicates sku/description/
unit/SRP_Approved1 client-side to work around this (applyItemMatch), matching the same
gotcha — but Product_Image was missed, because unlike text/number fields, an Image
field's raw value CANNOT be set via a plain JSON create/update payload at all
(zoho.creator.v2_1.createRecord rejects it outright, code 3001 "File Upload type and
Image type fields are not allowed" — same restriction applies to the widget SDK's
addRecords/updateRecordById since both hit the same v2.1 REST layer). So every
Inquiry created via the widget has a permanently blank Product_Image — no client-side
fix is possible, this has to run server-side.
This is the SAME root cause as sideUpdateScript.txt's Product_Image_Supplier1/2_INQ
fix earlier today — same fallback pattern applied one level up the chain, to
Inquiry_Form's OWN Product_Image field directly.
====================================================

====================================================
WORKFLOW SETUP — INQ_AutoFill_Product_Image
  Form: Inquiry_Form
  Trigger: Created or Edited > Successful form submission
  Action: Execute script
====================================================

picStrChk = input.Product_Image + "";
if(input.Product_Image == null || picStrChk == "" || picStrChk == "{}" || picStrChk == "[]")
{
	itemRec = Items[ID == input.Items];
	if(itemRec != null && itemRec.Image != null)
	{
		input.Product_Image = itemRec.Image;
	}
}

====================================================
NOTES:
- input.Items works directly because this runs on the Inquiry Form itself (direct
  input context — see Deluge Gotchas in CLAUDE.md).
- Product_Image is a SINGLE Image field (not multi) — confirmed via InquiryBtn/Inq.html
  passing it straight to applyCreatorImage with no array handling — so no List() wrap
  needed here, unlike sideUpdateScript.txt's Supplier1/2_INQ target fields.
- Only fills when currently blank — won't clobber a manually different photo, and is
  safe to fire on every edit (not just create) since it's a no-op once populated.
- Standalone new workflow rather than folding into an existing action, since this
  project has repeatedly found existing "Successful form submission" actions on
  Inquiry_Form (Supplier_Populate_From_INQ, Stage_Inquiry_Changed, INQ_Stage_On_Submit)
  documented inconsistently across files — safer not to guess which one is live and
  risk breaking it, add this as its own isolated action instead.
- EXISTING BAD DATA: only fixes the sync going forward. Inquiries already created via
  the widget before this fix stay blank until edited/re-saved once (fires this same
  trigger), or backfilled manually.
====================================================

````
