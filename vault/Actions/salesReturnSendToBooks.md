---
title: salesReturnSendToBooks
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:857"
---

# salesReturnSendToBooks

Sales Returns: sends a return to Books with an RMA number, reason, quantity and signature.

**Source:** `src/domain/actions.js:857`

## Offered on
- [[Sales Returns]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[RET.BOOKS]]: Sending a return to Books needs an RMA number, a reason, a quantity above zero and a signature. It goes once.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
