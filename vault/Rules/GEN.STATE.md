---
title: GEN.STATE
tags: [rule, blocks]
rule: GEN.STATE
kind: BLOCKS
module: General
---

# GEN.STATE

> That step is not available in the record's current status.

**Kind:** BLOCKS · **Module:** General

## Enforced by
- [[inquiryApprove]] (`src/domain/actions.js:269`)
- [[prEdit]] (`src/domain/actions.js:418`)
- [[prResume]] (`src/domain/actions.js:468`)
- [[poSend]] (`src/domain/actions.js:505`)
- [[poAcknowledge]] (`src/domain/actions.js:514`)
- [[shipmentTransit]] (`src/domain/actions.js:547`)
- [[receive]] (`src/domain/actions.js:564`)
- [[createPackage]] (`src/domain/actions.js:655`)
- [[gateRelease]] (`src/domain/actions.js:684`)
- [[pickDone]] (`src/domain/actions.js:695`)
- [[packSend]] (`src/domain/actions.js:703`)
- [[qcApprove]] (`src/domain/actions.js:714`)
- [[qcReject]] (`src/domain/actions.js:728`)
- [[qcRecheck]] (`src/domain/actions.js:742`)
- [[crateSet]] (`src/domain/actions.js:751`)
- [[crateComplete]] (`src/domain/actions.js:759`)
- [[dispatch]] (`src/domain/actions.js:767`)
- [[srSetInitial]] (`src/domain/actions.js:785`)
- [[srConfirmSite]] (`src/domain/actions.js:793`)
- [[srHandOff]] (`src/domain/actions.js:801`)
- [[srSchedule]] (`src/domain/actions.js:809`)
- [[srStart]] (`src/domain/actions.js:827`)
- [[srComplete]] (`src/domain/actions.js:835`)
- [[srFail]] (`src/domain/actions.js:843`)
- [[srResolve]] (`src/domain/actions.js:852`)

## Seen on
- [[Inquiry]]
- [[Purchase Request]]
- [[Purchase Order]]
- [[Shipments]]
- [[Receiving]]
- [[Readiness Gate]]
- [[Pick]]
- [[Pack]]
- [[QC Checklist]]
- [[Crate]]
- [[Order Aggregation]]
- [[Initial Scheduling]]
- [[Service Request]]
- [[Appointments]]
- [[Ongoing Service]]
- [[Exception Queue]]

Back to [[Rules Index]].
