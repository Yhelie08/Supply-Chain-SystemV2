---
title: crateSet
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:1161"
---

# crateSet

Updates Crating Status: Pending, In Progress or Done.

**Source:** `src/domain/actions.js:1161`

## Offered on
- [[Crate]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
