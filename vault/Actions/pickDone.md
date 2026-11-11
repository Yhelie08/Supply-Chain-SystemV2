---
title: pickDone
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1103"
---

# pickDone

Marks the item picked and sends it straight to Pack & QC. The picker is deliberately not carried forward.

**Source:** `src/domain/actions.js:1103`

## Offered on
- [[Pick]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PICK.NEXT]]: Marking an item picked creates its Pack record. The picker is deliberately not copied.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
