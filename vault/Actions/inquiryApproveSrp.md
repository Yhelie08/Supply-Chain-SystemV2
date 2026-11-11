---
title: inquiryApproveSrp
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:304"
---

# inquiryApproveSrp

Approves the selling price (SRP) in PHP, from the detail view or straight from a Quote Group chip.

**Source:** `src/domain/actions.js:304`

## Offered on
- [[Inquiry List]] (Procurement)

## Creates records in
- [[timeline]]

## Rules
- [[INQ.LOCKED]]: An inquiry that has become a Sales Order is locked. It cannot be edited or deleted.
- [[INQ.SRP]]: Approving the SRP needs an amount above zero.
- [[INQ.MARGIN]]: Margin = (SRP − selected final cost) ÷ SRP. The cost is in CNY and the SRP in PHP, and no exchange rate is applied, exactly as in the original widget.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
