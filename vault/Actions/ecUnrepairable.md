---
title: ecUnrepairable
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:811"
---

# ecUnrepairable

Exception Control: marks a QC reject unrepairable, which is what allows a replacement to be requested.

**Source:** `src/domain/actions.js:811`

## Offered on
- [[Exception Control]] (Fulfillment)

## Rules
- [[EC.STATE]]: A QC reject moves Pending to In Rework to Completed, or to Unrepairable. It cannot skip a step or go back.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
