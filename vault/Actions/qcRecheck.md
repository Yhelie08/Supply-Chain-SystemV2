---
title: qcRecheck
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:742"
---

# qcRecheck

Sends a rejected item (or one whose replacement arrived) back to Pack for a fresh QC.

**Source:** `src/domain/actions.js:742`

## Offered on
- [[QC Checklist]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
