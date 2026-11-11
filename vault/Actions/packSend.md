---
title: packSend
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:703"
---

# packSend

Names the packer and sends the item to QC. The packer becomes the Quality Checker.

**Source:** `src/domain/actions.js:703`

## Offered on
- [[Pack]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PACK.PACKER]]: Send to QC is refused until a packer is named. The packer becomes the Quality Checker on the QC record.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
