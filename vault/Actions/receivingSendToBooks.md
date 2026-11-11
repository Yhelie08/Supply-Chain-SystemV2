---
title: receivingSendToBooks
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:764"
---

# receivingSendToBooks

Sends a receiving that was counted in full to Books. Once only.

**Source:** `src/domain/actions.js:764`

## Offered on
- [[Receiving]] (Procurement)

## Rules
- [[RCV.BOOKS]]: A receiving goes to Books once, and only after it was counted in full.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
