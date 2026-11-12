---
title: Inquiry List
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/inquiry"
status: partial
source: src/pages/inquiry/ (InquiryPage)
---

# Inquiry List

> Quote suppliers, clear five readiness conditions, then create the estimate and convert it to a Sales Order.

**Section:** [[Procurement]] · **Route:** `#/procurement/inquiry` · **Source:** `src/pages/inquiry/` (`InquiryPage`) · **Status:** built, not yet at parity

**Shows:** [[inquiries]], [[customers]], [[projects]], [[products]], [[timeline]], [[messages]], [[notes]]

## What the live page has

- **Inner tabs:** INQ List · Quote Groups · All · Ready · In Progress · Not Ready
- **Stat cards:** Open INQs · Quote Groups · Ready for Estimate · Blocked / Not Ready · Fully Ready Groups
- **Buttons:** + New Inquiry · Create Estimate

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[inquiryEstimate]] | Creates or updates the estimate. Needs all five readiness conditions and a project, and also covers the other Ready inquiries of the same project, with one shared estimate number. | [[INQ.LOCKED]], [[INQ.READY]], [[INQ.PROJECT]], [[INQ.READINESS]], [[INQ.ESTIMATE_GROUP]] |
| [[inquiryApproveSrp]] | Approves the selling price (SRP) in PHP, from the detail view or straight from a Quote Group chip. | [[INQ.LOCKED]], [[INQ.SRP]], [[INQ.MARGIN]] |
| [[inquiryDelete]] | Deletes an inquiry after confirmation. Its timeline keeps a trail. Locked once the inquiry is a Sales Order. | [[INQ.LOCKED]] |
| [[inquiryApprove]] | Converts the estimate to a Sales Order. Raises a Purchase Request for the selected supplier (or none for Warehouse Stock) and the Fulfillment item. | [[INQ.SO]] |
| [[chatSend]] | Sends a message in a supplier conversation. Only Fenteng and Tony have threads, and only when they are quoted on the inquiry. | [[INQ.CHAT]] |
| [[noteSend]] | Adds a note to the internal Sales and Purchasing conversation on an inquiry. | — |
| [[inquiryUpdate]] | Saves edits to an inquiry. Runs the same checks as create, and writes only what changed to the timeline. Locked once the inquiry is a Sales Order. | [[INQ.LOCKED]], [[INQ.NEW]], [[INQ.PROJECT_CUSTOMER]], [[INQ.QUOTE_DUP]], [[INQ.PRICE]], [[INQ.ONE_SELECTED]], [[INQ.QUOTE_GROUP]] |
| [[inquiryCreate]] | Saves a new inquiry from the form: matched item and customer, quotes, collateral, specs and SRP. Tags every supplier, assigns the quote group, and starts the timeline. | [[INQ.NEW]], [[INQ.PROJECT_CUSTOMER]], [[INQ.QUOTE_DUP]], [[INQ.PRICE]], [[INQ.ONE_SELECTED]], [[INQ.TAGGED]], [[INQ.QUOTE_GROUP]] |
| [[customerCreate]] | Creates a customer from the New Customer modal: type, contact details, billing and shipping address. Names must be unique. | [[INQ.CUSTOMER_DUP]] |
| [[projectCreate]] | Creates a project for a customer from the New Project modal, with the next PRJ-xxxxx code, a group discount and status Active. | [[INQ.PROJECT_CUSTOMER]], [[INQ.PROJECT_CODE]] |
| [[productCreate]] | Adds an item to the catalog by Item ID, or updates the item if that ID is already there. | [[INQ.ITEM_ID]] |

## In the flow

Work arrives from: [[Procurement Dashboard]]

Work goes on to: [[Purchase Request]], [[Order Readiness]]
