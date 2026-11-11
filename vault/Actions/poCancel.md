---
title: poCancel
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:591"
---

# poCancel

Cancels a Draft, Sent or Confirmed PO that has not shipped, with a reason. Its pending shipment and receiving are removed and its PRs return to the Ready queue.

**Source:** `src/domain/actions.js:591`

## Offered on
- [[Purchase Order]] (Procurement)

## Rules
- [[PO.CANCEL]]: A PO can be cancelled only before anything has shipped, and needs a reason. Its pending shipment and receiving are removed and its PRs go back to the queue.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
