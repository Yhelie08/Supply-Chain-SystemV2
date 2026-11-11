---
title: inquiryDelete
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:295"
---

# inquiryDelete

Deletes an inquiry after confirmation. Its timeline keeps a trail. Locked once the inquiry is a Sales Order.

**Source:** `src/domain/actions.js:295`

## Offered on
- [[Inquiry List]] (Procurement)

## Creates records in
- [[timeline]]

## Rules
- [[INQ.LOCKED]]: An inquiry that has become a Sales Order is locked. It cannot be edited or deleted.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
