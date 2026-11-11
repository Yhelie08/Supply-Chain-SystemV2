---
title: rrClose
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:719"
---

# rrClose

Closes a replacement that has been received.

**Source:** `src/domain/actions.js:719`

## Offered on
- [[Replacement Request]] (Procurement)

## Rules
- [[RR.CLOSE]]: Only a replacement that has been received can be closed.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
