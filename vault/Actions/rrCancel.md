---
title: rrCancel
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:701"
---

# rrCancel

Cancels a replacement before it ships, with a reason. The replacement shipment is removed and the exception opens again.

**Source:** `src/domain/actions.js:701`

## Offered on
- [[Replacement Request]] (Procurement)

## Rules
- [[RR.CANCEL]]: A replacement can be cancelled before it ships, with a reason. Its pending replacement shipment is removed and the exception opens again.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
