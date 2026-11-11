---
title: noteSend
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:373"
---

# noteSend

Adds a note to the internal Sales and Purchasing conversation on an inquiry.

**Source:** `src/domain/actions.js:373`

## Offered on
- [[Inquiry]] (Procurement)

## Creates records in
- [[notes]]

## Rules
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
