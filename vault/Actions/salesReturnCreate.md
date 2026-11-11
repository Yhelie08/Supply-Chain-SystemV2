---
title: salesReturnCreate
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:848"
---

# salesReturnCreate

Archived: opens a sales return for a completed or failed delivery. Once per delivery.

**Source:** `src/domain/actions.js:848`

## Offered on
- [[Archived]] (Delivery Management)

## Creates records in
- [[salesReturns]]

## Rules
- [[RET.NEW]]: A sales return can be opened only for a completed or failed delivery, and only once per delivery.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
