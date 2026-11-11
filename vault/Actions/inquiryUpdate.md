---
title: inquiryUpdate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:210"
---

# inquiryUpdate

Saves edits to an inquiry. Runs the same checks as create, and writes only what changed to the timeline. Locked once the inquiry is a Sales Order.

**Source:** `src/domain/actions.js:210`

## Offered on
- [[Inquiry]] (Procurement)

## Creates records in
- [[timeline]]

## Rules
- [[INQ.LOCKED]]: An inquiry that has become a Sales Order is locked. It cannot be edited or deleted.
- [[INQ.NEW]]: An inquiry needs an item and a customer picked from the lists, a customer type, a sales owner, a target date and a quantity above zero.
- [[INQ.PROJECT_CUSTOMER]]: A project must belong to the inquiry's customer. Changing the customer clears the project.
- [[GEN.FIELD]]: A required field is missing.
- [[INQ.QUOTE_DUP]]: Each supplier can have only one quote row on an inquiry.
- [[INQ.PRICE]]: A Negotiated price can only be entered once there is an Initial price. The Final price is never typed: it is the Negotiated price if entered, otherwise the Initial price.
- [[INQ.ONE_SELECTED]]: Only one supplier quote can be Selected at a time.
- [[INQ.QUOTE_GROUP]]: Inquiries with the same project and group discount share one quote group.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
