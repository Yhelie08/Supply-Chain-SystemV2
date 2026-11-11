---
title: Exceptions
tags: [page, procurement]
module: Procurement
route: "#/procurement/exceptions"
source: src/pages/screens.jsx (ExceptionScreen)
---

# Exceptions

> Damaged, missing or rejected goods, from both receiving and QC.

**Module:** [[Procurement]] · **Route:** `#/procurement/exceptions` · **Source:** `src/pages/screens.jsx` (`ExceptionScreen`)

**Shows:** [[exceptions]]

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[exceptionCreateRR]] | Raises a Replacement Request for an open exception, sourced from a chosen supplier. One replacement per exception. | [[EXC.DUP]], [[EXC.SUPPLIER]] |

## In the flow

Work arrives from: [[Receiving]], [[QC Checklist]]

Work goes on to: [[Replacement]]
