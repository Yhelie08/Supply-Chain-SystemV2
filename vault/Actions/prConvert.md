---
title: prConvert
tags: [action, domain]
module: Domain
source: "src/domain/actions.js:550"
---

# prConvert

Converts the selected Ready PRs into Purchase Orders, one PO per supplier, and locks the PRs. Used by the group step.

**Source:** `src/domain/actions.js:550`

## Creates records in
- [[pos]]

## Rules
- [[GEN.FIELD]]: A required field is missing.
- [[PR.HELD]]: A PR that is On Hold or Cancelled cannot be converted to a PO.
- [[PR.NOT_READY]]: Only a PR marked Ready for PO can be converted to a Purchase Order.
- [[PO.ONE_PER_SUPPLIER]]: Converting PRs creates one PO per supplier.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
