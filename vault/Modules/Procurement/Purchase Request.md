---
title: Purchase Request
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/pr"
status: partial
source: src/pages/pr/ (PRPage)
---

# Purchase Request

> One PR per item. A PR becomes Ready for PO by itself once four conditions pass, then its Sales Order group becomes a PO.

**Section:** [[Procurement]] · **Route:** `#/procurement/pr` · **Source:** `src/pages/pr/` (`PRPage`) · **Status:** built, not yet at parity

**Shows:** [[prs]], [[pos]], [[products]], [[customers]]

## What the live page has

- **Inner tabs:** All PRs · Ready for PO Queue · Converted to PO · On Hold · Cancelled · PR Groups · Supplier Load View
- **Stat cards:** Total Ready PRs · High Priority · At Risk · Supplier Overrides · Near Capacity Suppliers · On Hold
- **Buttons:** + New PR · PO Grouping Workspace · Group→PO

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[prEdit]] | Edits the supplier, shipping mode, priority, supplier price, target date or quantity of a PR that has not been converted. Choosing a supplier other than the recommended one needs an override reason. Recomputes whether the PR is Ready for PO. | [[PR.LOCKED]], [[PR.OVERRIDE]], [[PR.READY]], [[PR.PRICE]], [[PR.RECOMMEND]] |
| [[prGroupCreatePO]] | Create PO on a Sales Order group: the active PRs of that order go to one supplier in one PO. Refused if suppliers are mixed, a PR is not ready, or one is already converted. Held and cancelled PRs are left out. | [[PR.HELD]], [[PR.GROUP_MIXED]], [[PR.GROUP_CONVERTED]], [[PR.GROUP_NOT_READY]], [[PR.LOAD]] |
| [[prResume]] | Clears the hold (Resume) or the cancellation (Restore), so the PR carries on from the status it already had. | [[PR.READY]], [[PR.HOLD_FLAG]] |
| [[prHold]] | Puts a PR On Hold, or Cancels it when called with cancel. Needs a reason from the list ("Other" also needs notes) and records the date and an optional follow-up date. The status underneath is untouched. | [[PR.LOCKED]], [[PR.HOLD_REASON]], [[PR.HOLD_FLAG]] |
| [[prSetSrp]] | Approves the SRP (PHP) for a PR. An approved SRP is the top-priority final price and what goes onto the Purchase Order. | [[PR.LOCKED]], [[PR.SRP]], [[PR.READY]], [[PR.PRICE]] |
| [[prCreate]] | Creates a PR by hand from the New PR form, for an item that did not come through an inquiry. Needs item, target date, quantity, customer, customer type and sales owner. Local sourcing goes to HC System with no freight. | [[PR.NEW]], [[PR.OVERRIDE]], [[PR.READY]], [[PR.RECOMMEND]] |

## In the flow

Work arrives from: [[Inquiry List]]

Work goes on to: [[Purchase Order]]
