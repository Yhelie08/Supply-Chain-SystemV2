---
title: rrApprove
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:630"
---

# rrApprove

Approves a replacement with an expected ship date and ETA, once only. Creates the replacement shipment and its receiving.

**Source:** `src/domain/actions.js:630`

## Offered on
- [[Replacement]] (Procurement)

## Creates records in
- [[shipments]]
- [[receivings]]

## Rules
- [[RR.ONCE]]: A replacement can be approved only once.
- [[RR.DATES]]: Approving a replacement needs both an Expected Ship Date and an ETA.
- [[RR.CLONE]]: Approving a replacement creates its replacement Shipment and Receiving. Completion comes only from the physical receipt.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
