---
title: customerCreate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:382"
---

# customerCreate

Creates a customer from the New Customer modal: type, contact details, billing and shipping address. Names must be unique.

**Source:** `src/domain/actions.js:382`

## Offered on
- [[Inquiry List]] (Procurement)

## Creates records in
- [[customers]]

## Rules
- [[GEN.FIELD]]: A required field is missing.
- [[INQ.CUSTOMER_DUP]]: A customer with that name already exists.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
