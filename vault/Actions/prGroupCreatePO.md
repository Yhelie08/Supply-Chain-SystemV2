---
title: prGroupCreatePO
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:562"
---

# prGroupCreatePO

Create PO on a Sales Order group: the active PRs of that order go to one supplier in one PO. Refused if suppliers are mixed, a PR is not ready, or one is already converted. Held and cancelled PRs are left out.

**Source:** `src/domain/actions.js:562`

## Offered on
- [[Purchase Request]] (Procurement)

## Creates records in
- [[pos]]

## Rules
- [[GEN.FIELD]]: A required field is missing.
- [[PR.HELD]]: A PR that is On Hold or Cancelled cannot be converted to a PO.
- [[PR.GROUP_MIXED]]: A Sales Order group with PRs for more than one supplier cannot be turned into a PO, because a PO goes to one supplier.
- [[PR.GROUP_CONVERTED]]: A group with a PR that is already converted to a PO cannot be converted again.
- [[PR.GROUP_NOT_READY]]: Every active PR in the group must be Ready for PO before the group can be turned into a PO.
- [[PR.LOAD]]: Supplier load is counted in PO lines against the supplier capacity: 80% is Near Capacity, 100% is Overloaded. It is shown for information and never blocks a PR.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
