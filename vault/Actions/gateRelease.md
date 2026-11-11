---
title: gateRelease
tags: [action, fulfillment]
module: Fulfillment
source: "src/domain/actions.js:684"
---

# gateRelease

Releases an item from the Readiness Gate to Pick. Needs a package, a picker and settled payment.

**Source:** `src/domain/actions.js:684`

## Offered on
- [[Readiness Gate]] (Fulfillment)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[GATE.PAC]]: A package (PAC #) must exist before release. A blank PAC means no package covers the line.
- [[GATE.PICKER]]: Assign a picker before releasing to Pick.
- [[GATE.PAYMENT]]: An unpaid item needs credit terms or a still-valid Approve Dispatch override before release.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
