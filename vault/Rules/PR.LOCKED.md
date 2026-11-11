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
- [[prEdit]] (`src/domain/actions.js:418`)
- [[prSetSrp]] (`src/domain/actions.js:444`)
- [[prHold]] (`src/domain/actions.js:454`)

## Seen on
- [[Purchase Request]]

Back to [[Rules Index]].
