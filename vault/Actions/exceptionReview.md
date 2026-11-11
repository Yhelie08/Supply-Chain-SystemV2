---
title: exceptionReview
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:743"
---

# exceptionReview

Assigns an exception to a person with a due date and department. It then reads Under Review.

**Source:** `src/domain/actions.js:743`

## Offered on
- [[Exceptions]] (Procurement)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[EXC.REVIEW]]: Assigning an exception for review needs an assignee and a due date. It then reads Under Review.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
