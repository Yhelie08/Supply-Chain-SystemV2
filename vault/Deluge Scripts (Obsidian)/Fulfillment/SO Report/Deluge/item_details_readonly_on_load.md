---
title: "item_details_readonly_on_load"
source_file: "item_details_readonly_on_load.txt"
category: "Fulfillment/SO Report/Deluge"
associated_widget: "General / Shared Deluge Logic"
lines: 44
tags:
  - delivery-management
  - deluge
  - dms
  - procurement
  - purchase-order
---

# item_details_readonly_on_load

> [!INFO] Script & Widget Details
> - **Associated Widget:** General / Shared Deluge Logic
> - **Category:** `Fulfillment/SO Report/Deluge`
> - **Source File:** `item_details_readonly_on_load.txt`
> - **Lines of Code:** 44
> - **Tags:** `#delivery-management`, `#deluge`, `#dms`, `#procurement`, `#purchase-order`

---

## ⚡ Role in Widget Architecture
This script powers the **General / Shared Deluge Logic**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
GOAL
Gawing hindi na pwedeng i-edit ang Item_Details grid (laman ng cells, add row, delete row) sa In_Bound_Delivery form, kapag binuksan/gina-load ang form.

NOTE: Nag-error yung una kong tinry (`disable Item_Details;` sa buong grid diretso — hindi pala pwede, kailangan per-column pala ang disable pag subform/grid. Yung Add/Delete row buttons naman ay hindi na-cocover ng script, may separate na hakbang yun sa Part 2 below.

PART 1 — Deluge script (para hindi na pwede i-edit yung laman ng bawat cell)

WORKFLOW
- Choose form: In_Bound_Delivery
- Run when a record is (Record Event): Created or Edited
- When to trigger workflow (Form Event): Load of the form
- Choose Field: N/A (form-level event, hindi field-level)
- Name the workflow: Item_Details_Readonly_On_Load

Deluge script (SAME script, i-paste sa PAREHONG "On Add" at "On Edit" block):

disable Item_Details.Item_Name;
disable Item_Details.SKU;
disable Item_Details.Quantity;

PART 2 — Para hindi na rin pwede mag-add o mag-delete ng row (OFFICIAL na paraan, "Field rules" pala — nasa PAREHONG "When to trigger workflow" dropdown lang, hindi hiwalay na section)

Ito ay BAGONG/HIWALAY na workflow (gawa ka ng panibago, huwag na ipagsama sa Part 1):

WORKFLOW
- Choose form: In_Bound_Delivery
- When to trigger workflow (Form Event): piliin "Field rules" sa dropdown (kasama siya doon kasama ng "Load of the form", "User input of a field", etc.)
- Name the workflow: Item_Details_Hide_Add_Delete

Steps pagkatapos ma-set ang Form Event sa "Field rules":
1. I-click ang "Add new action" button.
2. Sa Criteria (Execute this action for): puwede mo iwan/i-skip (walang condition) para laging active/palagi siyang gagana.
3. Sa Action Type, piliin "Show/hide subform actions".
4. Piliin "Hide subform delete entry" -> sa "Select Fields" dropdown, piliin ang Item_Details -> Save.
5. I-click ulit ang "Add new action" (para maidagdag yung pangalawang action sa parehong rule).
6. Ulitin: Action Type = "Show/hide subform actions" -> piliin "Hide subform add entry" -> Select Fields = Item_Details -> Save.
7. I-click ang "Done" sa taas-kanan para ma-save ang buong workflow.

Note mula sa official Zoho docs: itong hide na ito ay UI-level lang — "manages the visibility of the field only in the user interface," hindi talaga naka-lock yung data sa backend/developer tools level. Sapat na ito pero FYI lang kung may magtatangkang gamitin ng dev tools para bypass-in.

PAANO I-TEST
1. Gawin muna Part 1 (disable per column), i-save. Buksan ang form (bago at existing record) — dapat greyed-out na yung 3 columns (Item_Name, SKU, Quantity), hindi na type-able.
2. Gawin naman Part 2 (Field rules workflow) — dapat mawala na yung "+ Add" at "Delete" (trash icon) sa Item_Details grid, both sa bagong record at existing record.
3. Kung may error pag-Execute sa Part 1, o kung hindi mawala yung buttons sa Part 2, i-screenshot lang para ma-adjust.

````
