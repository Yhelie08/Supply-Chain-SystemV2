---
title: exceptionCreateRR
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:681"
---

# exceptionCreateRR

Raises a Replacement Request for an open exception, sourced from a chosen supplier. One replacement per exception.

**Source:** `src/domain/actions.js:681`

## Offered on
- [[Exceptions]] (Procurement)
- [[Exception Control]] (Fulfillment)

## Creates records in
- [[rrs]]

## Rules
- [[EC.RR]]: A replacement can be requested for a QC reject only when it is Unrepairable.
- [[EXC.DUP]]: An exception that already has a Replacement Request cannot raise another.
- [[EXC.SUPPLIER]]: A Replacement Request needs the supplier it will be sourced from.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
