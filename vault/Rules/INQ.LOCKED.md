---
title: INQ.LOCKED
tags: [rule, blocks]
rule: INQ.LOCKED
kind: BLOCKS
module: Inquiry
---

# INQ.LOCKED

> An inquiry that has become a Sales Order is locked. It cannot be edited or deleted.

**Kind:** BLOCKS · **Module:** Inquiry

## Enforced by
- [[inquiryUpdate]] (`src/domain/actions.js:283`)
- [[inquiryDelete]] (`src/domain/actions.js:295`)
- [[inquiryApproveSrp]] (`src/domain/actions.js:304`)
- [[inquiryEstimate]] (`src/domain/actions.js:318`)

## Seen on
- [[Inquiry List]]

Back to [[Rules Index]].
