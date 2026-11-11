---
title: Exception Control
tags: [page, fulfillment, built]
module: Fulfillment
route: "#/fulfillment/exception-control"
status: partial
source: src/pages/extras.jsx (ExceptionControl)
---

# Exception Control

> Damaged items: exception module for items rejected during QC, assessed, reworked and resolved before re-dispatch.

**Section:** [[Fulfillment]] · **Route:** `#/fulfillment/exception-control` · **Source:** `src/pages/extras.jsx` (`ExceptionControl`) · **Status:** built, not yet at parity

**Shows:** [[exceptions]], [[items]]

## What the live page has

- **Inner tabs:** QC Rejects · CMS Complaints · All · Pending · In Rework · Completed · Unrepairable
- **Buttons:** + Create RR

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[ecRework]] | Exception Control: sends a QC reject to rework. | [[EC.STATE]] |
| [[ecUnrepairable]] | Exception Control: marks a QC reject unrepairable, which is what allows a replacement to be requested. | [[EC.STATE]] |
| [[ecComplete]] | Exception Control: finishes the rework, closes the exception and lets the item be rechecked. | [[EC.STATE]] |
| [[exceptionCreateRR]] | Raises a Replacement Request for an open exception, sourced from a chosen supplier. One replacement per exception. | [[EC.RR]], [[EXC.DUP]], [[EXC.SUPPLIER]] |

