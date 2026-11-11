---
title: EC.STATE
tags: [rule, blocks]
rule: EC.STATE
kind: BLOCKS
module: Exception Control
---

# EC.STATE

> A QC reject moves Pending to In Rework to Completed, or to Unrepairable. It cannot skip a step or go back.

**Kind:** BLOCKS · **Module:** Exception Control

## Enforced by
- [[ecRework]] (`src/domain/actions.js:803`)
- [[ecUnrepairable]] (`src/domain/actions.js:811`)
- [[ecComplete]] (`src/domain/actions.js:819`)

## Seen on
- [[Exception Control]]

Back to [[Rules Index]].
