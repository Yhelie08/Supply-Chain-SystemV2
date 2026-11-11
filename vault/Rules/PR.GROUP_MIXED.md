---
title: PR.GROUP_MIXED
tags: [rule, blocks]
rule: PR.GROUP_MIXED
kind: BLOCKS
module: Purchase Request
---

# PR.GROUP_MIXED

> A Sales Order group with PRs for more than one supplier cannot be turned into a PO, because a PO goes to one supplier.

**Kind:** BLOCKS · **Module:** Purchase Request

## Enforced by
- [[prGroupCreatePO]] (`src/domain/actions.js:489`)

## Seen on
- [[Purchase Request]]

Back to [[Rules Index]].
