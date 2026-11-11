---
title: PACK.PACKER
tags: [rule, blocks]
rule: PACK.PACKER
kind: BLOCKS
module: Pack & QC
---

# PACK.PACKER

> Approve and Reject at QC are refused until a packer is assigned. The packer is the Quality Checker. The Pack stage itself was retired: Pick goes straight to Pack & QC.

**Kind:** BLOCKS · **Module:** Pack & QC

## Enforced by
- [[qcAssign]] (`src/domain/actions.js:1113`)
- [[qcApprove]] (`src/domain/actions.js:1122`)
- [[qcReject]] (`src/domain/actions.js:1137`)

## Describes behaviour of
- [[qcAssign]]

This rule is documentation of what the step does by itself. No code path refuses with it.

## Seen on
- [[Pack & QC]]

Back to [[Rules Index]].
