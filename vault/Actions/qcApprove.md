---
title: qcApprove
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1122"
---

# qcApprove

Approves at QC. Goes to Crate if the item needs crating, otherwise straight to Order Aggregation.

**Source:** `src/domain/actions.js:1122`

## Offered on
- [[Pack & QC]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PACK.PACKER]]: Approve and Reject at QC are refused until a packer is assigned. The packer is the Quality Checker. The Pack stage itself was retired: Pick goes straight to Pack & QC.
- [[QC.ROUTE]]: Approving QC routes on "For Crate": to the Crate checklist, or straight to Order Aggregation.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
