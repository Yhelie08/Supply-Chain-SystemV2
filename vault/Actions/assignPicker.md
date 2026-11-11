---
title: assignPicker
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1071"
---

# assignPicker

Names the picker who will collect the item.

**Source:** `src/domain/actions.js:1071`

## Offered on
- [[Order Readiness]] (Fulfillment)

## Rules
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
