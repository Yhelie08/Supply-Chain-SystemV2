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
- [[inquiryUpdate]] (`src/domain/actions.js:210`)
- [[inquiryDelete]] (`src/domain/actions.js:222`)
- [[inquiryApproveSrp]] (`src/domain/actions.js:231`)
- [[inquiryEstimate]] (`src/domain/actions.js:245`)

## Seen on
- [[Inquiry]]

Back to [[Rules Index]].
