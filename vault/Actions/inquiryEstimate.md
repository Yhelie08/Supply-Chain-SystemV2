---
title: inquiryEstimate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:245"
---

# inquiryEstimate

Creates or updates the estimate. Needs all five readiness conditions and a project, and also covers the other Ready inquiries of the same project, with one shared estimate number.

**Source:** `src/domain/actions.js:245`

## Offered on
- [[Inquiry]] (Procurement)

## Creates records in
- [[timeline]]

## Rules
- [[INQ.LOCKED]]: An inquiry that has become a Sales Order is locked. It cannot be edited or deleted.
- [[INQ.READY]]: An estimate needs all five conditions: supplier selected, availability confirmed, a final price, collateral complete or N/A, and SRP approved.
- [[INQ.PROJECT]]: An estimate needs a project linked to the inquiry.
- [[INQ.READINESS]]: Status is always worked out from the record, never stored: 5 of 5 conditions is Ready, 1 to 4 is In Progress, none is Not Ready.
- [[INQ.ESTIMATE_GROUP]]: Creating an estimate also covers the other Ready inquiries of the same project or quote group, which share one estimate number.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
