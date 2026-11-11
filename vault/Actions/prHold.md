---
title: prHold
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:454"
---

# prHold

Puts a PR On Hold, or Cancels it when called with cancel. Needs a reason from the list ("Other" also needs notes) and records the date and an optional follow-up date. The status underneath is untouched.

**Source:** `src/domain/actions.js:454`

## Offered on
- [[Purchase Request]] (Procurement)

## Rules
- [[PR.LOCKED]]: A PR that has been converted to a PO is locked and cannot be held or cancelled.
- [[PR.HOLD_REASON]]: Putting a PR on hold or cancelling it needs a reason from the list. "Other" also needs notes.
- [[PR.HOLD_FLAG]]: Hold is a flag on top of the real status. The status is never overwritten, so Resume and Restore put things back.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
