---
title: PO.CANCEL
tags: [rule, blocks]
rule: PO.CANCEL
kind: BLOCKS
module: Purchase Order
---

# PO.CANCEL

> A PO can be cancelled only before anything has shipped, and needs a reason. Its pending shipment and receiving are removed and its PRs go back to the queue.

**Kind:** BLOCKS · **Module:** Purchase Order

## Enforced by
- [[poCancel]] (`src/domain/actions.js:591`)

## Seen on
- [[Purchase Order]]

Back to [[Rules Index]].
