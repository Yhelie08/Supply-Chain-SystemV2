---
title: PR.LOCKED
tags: [rule, blocks]
rule: PR.LOCKED
kind: BLOCKS
module: Purchase Request
---

# PR.LOCKED

> A PR that has been converted to a PO is locked and cannot be held or cancelled.

**Kind:** BLOCKS · **Module:** Purchase Request

## Enforced by
- [[prEdit]] (`src/domain/actions.js:491`)
- [[prSetSrp]] (`src/domain/actions.js:517`)
- [[prHold]] (`src/domain/actions.js:527`)

## Seen on
- [[Purchase Request]]

Back to [[Rules Index]].
