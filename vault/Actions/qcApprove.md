---
title: qcApprove
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:714"
---

# qcApprove

Approves at QC. Goes to Crate if the item needs crating, otherwise straight to Order Aggregation.

**Source:** `src/domain/actions.js:714`

## Offered on
- [[QC Checklist]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[QC.ROUTE]]: Approving QC routes on "For Crate": to the Crate checklist, or straight to Order Aggregation.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
