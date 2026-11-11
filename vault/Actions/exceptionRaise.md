---
title: exceptionRaise
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:727"
---

# exceptionRaise

Raises an exception by hand (Raise Exception): source, item, type, quantity and optional supplier and notes.

**Source:** `src/domain/actions.js:727`

## Offered on
- [[Exceptions]] (Procurement)

## Creates records in
- [[exceptions]]

## Rules
- [[GEN.FIELD]]: A required field is missing.
- [[EXC.RAISE]]: Raising an exception by hand needs where it came from, the item, a type and a quantity above zero.
- [[EXC.SEVERITY]]: Severity is worked out, never stored: Damaged, Defective and Wrong item are High, anything of 5 or more units is High, the rest are Medium. An exception is Overdue when its due date has passed and it is not Resolved or Closed.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
