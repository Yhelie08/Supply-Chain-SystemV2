---
title: productCreate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:343"
---

# productCreate

Adds an item to the catalog by Item ID, or updates the item if that ID is already there.

**Source:** `src/domain/actions.js:343`

## Offered on
- [[Inquiry]] (Procurement)

## Creates records in
- [[products]]

## Rules
- [[INQ.ITEM_ID]]: Adding an item needs its Item ID and name. An ID already in the catalog updates that item instead of duplicating it.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
