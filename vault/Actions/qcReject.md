---
title: qcReject
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:728"
---

# qcReject

Rejects at QC with a reason and raises a Fulfillment exception.

**Source:** `src/domain/actions.js:728`

## Offered on
- [[QC Checklist]] (Fulfillment)

## Creates records in
- [[exceptions]]

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[QC.REJECT]]: Rejecting QC needs a reason, and it raises a Fulfillment Exception.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
