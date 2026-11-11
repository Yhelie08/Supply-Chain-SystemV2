---
title: Exceptions
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/exceptions"
status: partial
source: src/pages/screens.jsx (ExceptionScreen)
---

# Exceptions

> Damaged, missing or rejected goods, from receiving and QC.

**Section:** [[Procurement]] · **Route:** `#/procurement/exceptions` · **Source:** `src/pages/screens.jsx` (`ExceptionScreen`) · **Status:** built, not yet at parity

**Shows:** [[exceptions]]

## What the live page has

- **Inner tabs:** All Open · High Severity · Waiting on Supplier · Receiving Source · Fulfillment QC Source · RR List · All · Open · Under Review · Waiting · Resolved · Closed · Overdue
- **Stat cards:** Open Exceptions · High Severity · Waiting on Supplier · Overdue · Receiving Exceptions · Fulfillment QC Exceptions
- **Buttons:** + Raise Exception

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[exceptionReview]] | Assigns an exception to a person with a due date and department. It then reads Under Review. | [[EXC.REVIEW]] |
| [[exceptionCreateRR]] | Raises a Replacement Request for an open exception, sourced from a chosen supplier. One replacement per exception. | [[EC.RR]], [[EXC.DUP]], [[EXC.SUPPLIER]] |
| [[exceptionResolve]] | Resolves an Open or Under Review exception by hand, with a note about how it was resolved. | [[EXC.RESOLVE]] |
| [[exceptionRaise]] | Raises an exception by hand (Raise Exception): source, item, type, quantity and optional supplier and notes. | [[EXC.RAISE]], [[EXC.SEVERITY]] |

## In the flow

Work arrives from: [[Receiving]], [[Pack & QC]]

Work goes on to: [[Replacement Request]]
