---
title: packageCreateOrder
tags: [action, domain]
module: Domain
source: "src/domain/actions.js:790"
---

# packageCreateOrder

Sales Order Report and Pre-Order: creates one package for a whole Sales Order, with a Delivery Type. Every item must be received.

**Source:** `src/domain/actions.js:790`

## Rules
- [[SOR.TYPE]]: Creating a package needs a Delivery Type: Delivery, Pick Up or Installation.
- [[GEN.FIELD]]: A required field is missing.
- [[SOR.ONE_PACKAGE]]: A Sales Order has one package. Creating a second is refused.
- [[SOR.READY]]: A package covers the whole Sales Order, so every item on it must be received first.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
