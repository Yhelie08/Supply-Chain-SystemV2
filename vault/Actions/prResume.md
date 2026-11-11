---
title: prResume
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:541"
---

# prResume

Clears the hold (Resume) or the cancellation (Restore), so the PR carries on from the status it already had.

**Source:** `src/domain/actions.js:541`

## Offered on
- [[Purchase Request]] (Procurement)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[PR.READY]]: A PR becomes Ready for PO by itself when four conditions pass: supplier selected, final price confirmed, shipping mode selected (Local needs none) and a target date. It goes back to For Sourcing if one stops passing.
- [[PR.HOLD_FLAG]]: Hold is a flag on top of the real status. The status is never overwritten, so Resume and Restore put things back.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
