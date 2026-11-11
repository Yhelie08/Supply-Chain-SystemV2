---
title: projectCreate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:325"
---

# projectCreate

Creates a project for a customer from the New Project modal, with the next PRJ-xxxxx code, a group discount and status Active.

**Source:** `src/domain/actions.js:325`

## Offered on
- [[Inquiry]] (Procurement)

## Creates records in
- [[projects]]

## Rules
- [[GEN.FIELD]]: A required field is missing.
- [[INQ.PROJECT_CUSTOMER]]: A project must belong to the inquiry's customer. Changing the customer clears the project.
- [[INQ.PROJECT_CODE]]: A new project gets the next PRJ-xxxxx code and starts Active.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
