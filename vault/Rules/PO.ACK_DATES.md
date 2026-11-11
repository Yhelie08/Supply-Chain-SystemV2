---
title: PO.ACK_DATES
tags: [rule, required]
rule: PO.ACK_DATES
kind: REQUIRED
module: Purchase Order
---

# PO.ACK_DATES

> Acknowledging a PO needs both an ETD and an ETA, and the ETA cannot be before the ETD.

**Kind:** REQUIRED · **Module:** Purchase Order

## Enforced by
- [[poAcknowledge]] (`src/domain/actions.js:514`)

## Seen on
- [[Purchase Order]]

Back to [[Rules Index]].
