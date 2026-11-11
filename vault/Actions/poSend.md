---
title: poSend
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:578"
---

# poSend

Sends a Draft PO to its supplier. An unrecognised supplier is refused. A Local PO is issued without any accounting push.

**Source:** `src/domain/actions.js:578`

## Offered on
- [[Purchase Order]] (Procurement)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PO.SUPPLIER]]: A PO for an unrecognised supplier cannot be sent.
- [[PO.LOCAL]]: A Local (HC System) PO never reaches the accounting system.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
