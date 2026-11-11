---
title: exceptionResolve
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:754"
---

# exceptionResolve

Resolves an Open or Under Review exception by hand, with a note about how it was resolved.

**Source:** `src/domain/actions.js:754`

## Offered on
- [[Exceptions]] (Procurement)

## Rules
- [[EXC.RESOLVE]]: An exception is resolved by hand only while it is Open or Under Review, with a note. One with a replacement under way closes by itself when the replacement is received.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
