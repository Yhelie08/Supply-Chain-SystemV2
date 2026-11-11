---
title: PR.PRICE
tags: [rule, reference]
rule: PR.PRICE
kind: REFERENCE
module: Purchase Request
---

# PR.PRICE

> The final price comes from, in order: an approved SRP, a supplier quote, the SO reference rate, then the catalog rate. A PR from an inquiry, or whose item has a catalog rate, counts as confirmed on its own.

**Kind:** REFERENCE · **Module:** Purchase Request

## Describes behaviour of
- [[prSetSrp]]
- [[prEdit]]

This rule is documentation of what the step does by itself. No code path refuses with it.

## Seen on
- [[Purchase Request]]

Back to [[Rules Index]].
