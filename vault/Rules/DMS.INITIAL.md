---
title: DMS.INITIAL
tags: [rule, required]
rule: DMS.INITIAL
kind: REQUIRED
module: Initial Scheduling
---

# DMS.INITIAL

> The initial delivery date must be set before the job is handed off to Service Request.

**Kind:** REQUIRED · **Module:** Initial Scheduling

## Enforced by
- [[srSetInitial]] (`src/domain/actions.js:785`)
- [[srHandOff]] (`src/domain/actions.js:801`)

## Seen on
- [[Initial Scheduling]]
- [[Service Request]]

Back to [[Rules Index]].
