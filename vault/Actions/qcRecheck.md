---
title: qcRecheck
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1152"
---

# qcRecheck

Puts a rejected item (or one whose replacement arrived) back in Pack & QC for a fresh check, with no packer assigned.

**Source:** `src/domain/actions.js:1152`

## Offered on
- [[Pack & QC]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
