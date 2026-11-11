---
title: PR.HELD
tags: [rule, blocks]
rule: PR.HELD
kind: BLOCKS
module: Purchase Request
---

# PR.HELD

> A PR that is On Hold or Cancelled cannot be converted to a PO.

**Kind:** BLOCKS · **Module:** Purchase Request

## Enforced by
- [[prConvert]] (`src/domain/actions.js:477`)
- [[prGroupCreatePO]] (`src/domain/actions.js:489`)

## Seen on
- [[Purchase Request]]

Back to [[Rules Index]].
