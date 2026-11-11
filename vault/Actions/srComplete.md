---
title: srComplete
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:1261"
---

# srComplete

Completes an Ongoing job.

**Source:** `src/domain/actions.js:1261`

## Offered on
- [[Ongoing Service]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
