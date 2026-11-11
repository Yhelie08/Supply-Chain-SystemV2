---
title: inquiryCreate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:187"
---

# inquiryCreate

Saves a new inquiry from the form: matched item and customer, quotes, collateral, specs and SRP. Tags every supplier, assigns the quote group, and starts the timeline.

**Source:** `src/domain/actions.js:187`

## Offered on
- [[Inquiry]] (Procurement)

## Creates records in
- [[inquiries]]
- [[timeline]]

## Rules
- [[INQ.NEW]]: An inquiry needs an item and a customer picked from the lists, a customer type, a sales owner, a target date and a quantity above zero.
- [[INQ.PROJECT_CUSTOMER]]: A project must belong to the inquiry's customer. Changing the customer clears the project.
- [[GEN.FIELD]]: A required field is missing.
- [[INQ.QUOTE_DUP]]: Each supplier can have only one quote row on an inquiry.
- [[INQ.PRICE]]: A Negotiated price can only be entered once there is an Initial price. The Final price is never typed: it is the Negotiated price if entered, otherwise the Initial price.
- [[INQ.ONE_SELECTED]]: Only one supplier quote can be Selected at a time.
- [[INQ.TAGGED]]: Every supplier is tagged on a new inquiry. Each answers through its own quote row.
- [[INQ.QUOTE_GROUP]]: Inquiries with the same project and group discount share one quote group.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
