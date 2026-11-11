---
title: receivingCreate
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:772"
---

# receivingCreate

New Receiving, Create From Scratch: a receiving with no PO, for goods that arrived without one. Needs a supplier, an item and a quantity.

**Source:** `src/domain/actions.js:772`

## Offered on
- [[Receiving]] (Procurement)

## Creates records in
- [[shipments]]
- [[receivings]]

## Rules
- [[RCV.SCRATCH]]: A receiving created from scratch needs a supplier, an item and a quantity above zero. It has no PO.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
