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
- [[poAcknowledge]] (`src/domain/actions.js:587`)
- [[supplierAckPO]] (`src/domain/actions.js:1010`)

## Seen on
- [[Purchase Order]]
- [[Tony Fan - Purchase Order]]
- [[Fenteng Lighting - Purchase Order]]

Back to [[Rules Index]].
