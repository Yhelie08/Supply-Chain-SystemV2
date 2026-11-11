---
title: qcReject
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1137"
---

# qcReject

Rejects at QC with a reason and raises a Fulfillment exception.

**Source:** `src/domain/actions.js:1137`

## Offered on
- [[Pack & QC]] (Fulfillment)

## Creates records in
- [[exceptions]]

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PACK.PACKER]]: Approve and Reject at QC are refused until a packer is assigned. The packer is the Quality Checker. The Pack stage itself was retired: Pick goes straight to Pack & QC.
- [[QC.REJECT]]: Rejecting QC needs a reason, and it raises a Fulfillment Exception.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
