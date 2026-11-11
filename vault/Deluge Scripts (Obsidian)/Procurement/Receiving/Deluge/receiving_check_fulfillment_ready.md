---
title: "receiving_check_fulfillment_ready"
source_file: "receiving_check_fulfillment_ready.txt"
category: "Procurement/Receiving/Deluge"
associated_widget: "[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]"
lines: 65
tags:
  - deluge
  - fulfillment
  - inquiry
  - procurement
  - purchase-order
  - readiness-gate
---

# receiving_check_fulfillment_ready

> [!INFO] Script & Widget Details
> - **Associated Widget:** [[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]
> - **Category:** `Procurement/Receiving/Deluge`
> - **Source File:** `receiving_check_fulfillment_ready.txt`
> - **Lines of Code:** 65
> - **Tags:** `#deluge`, `#fulfillment`, `#inquiry`, `#procurement`, `#purchase-order`, `#readiness-gate`

---

## ⚡ Role in Widget Architecture
This script powers the **[[Procurement/Receiving/Widget/Receiving Widget|Receiving Widget]]**. Any changes here affect the backend workflows, data calculations, or Zoho Creator / Books sync for this widget.

---

## Deluge Script Code

````deluge
== Receiving_Compute_Totals — REAL LIVE script, computes Result Flags header fields
   including Ready_for_Fulfillment1 ==
== Found live 2026-07-08 while about to write a redundant replacement for this exact
   job — same mistake pattern as INQ_Check_Readiness earlier this session (a coworker
   also builds workflows in this app independently, so "not in this repo" doesn't mean
   "doesn't exist" — always ask/check before writing new readiness/aggregate logic on
   any form). A drafted `Receiving_Check_Fulfillment_Ready` script was written then
   discarded once this was found — do not rebuild it. ==

====================================================
WORKFLOW SETUP — Receiving_Compute_Totals
  Form: Receiving
  Trigger: Created or Edited > Validations (on form submission)
====================================================

totalExpected = 0;
totalAccepted = 0;
totalDamage = 0;
totalMissing = 0;
totalLines = 0;
incompleteLines = 0;
readyForFulfillment = 0;
for each  ln in input.Receiving_Line_Items
{
	totalLines = totalLines + 1;
	totalExpected = totalExpected + ifnull(ln.Expected_Qty,0);
	totalAccepted = totalAccepted + ifnull(ln.Accepted_Qty,0);
	totalDamage = totalDamage + ifnull(ln.Damage_Qty,0);
	totalMissing = totalMissing + ifnull(ln.Missing_Qty,0);
	if(ln.Line_Result == "Incomplete")
	{
		incompleteLines = incompleteLines + 1;
	}
	if(ln.Ready_for_Fulfillment == true)
	{
		readyForFulfillment = readyForFulfillment + 1;
	}
}
input.Total_Expected_Qty = totalExpected;
input.Total_Accepted_Qty = totalAccepted;
input.Total_Damage_Qty = totalDamage;
input.Total_Missing_Qty = totalMissing;
input.Total_Lines = totalLines;
input.Incomplete_Lines = incompleteLines;
input.Ready_for_Fulfillment1 = readyForFulfillment;

====================================================
NOTES:
- `Ready_for_Fulfillment1` is a COUNT of lines where the per-line
  `Receiving_Line_Items.Ready_for_Fulfillment` Decision Box is true — NOT a 1/0
  all-or-nothing flag (an earlier guess assumed the latter and nearly duplicated this
  script with different semantics).
- Since both `Ready_for_Fulfillment1` (ready count) and `Total_Lines` (line count) are
  already computed by this SAME script, the "Create Receive" button's ALL-lines-ready
  gate condition (per user request, see receiving_create_bin_receiving.txt) needs no
  new script at all — just:
  `Ready_for_Fulfillment1 == Total_Lines && Total_Lines > 0`
  (the `Total_Lines > 0` guard stops it trivially passing on an empty subform, 0==0).
- Likely built by a coworker who works on other parts of this app's workflows
  independently (per user, 2026-07-08) — three other Receiving workflows exist in the
  same Created-or-Edited > Validations bucket, all 2026-07-06, all previously
  undocumented here too: `Receiving_Set_Line_Result`, `Receiving_Validate_Qty`,
  `Receiving_Auto_Exception`. Bodies not yet captured — ask/check before assuming any
  Receiving-side aggregate/validation logic doesn't exist yet.
====================================================

````
