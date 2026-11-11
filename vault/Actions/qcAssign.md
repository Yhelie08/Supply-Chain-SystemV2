---
title: qcAssign
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1113"
---

# qcAssign

Pack & QC: names the packer, who is also the quality checker. Approve and Reject are refused until this is done.

**Source:** `src/domain/actions.js:1113`

## Offered on
- [[Pack & QC]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PACK.PACKER]]: Approve and Reject at QC are refused until a packer is assigned. The packer is the Quality Checker. The Pack stage itself was retired: Pick goes straight to Pack & QC.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
