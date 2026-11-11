---
title: srConfirmSite
tags: [action, delivery]
module: Delivery
source: "src/domain/actions.js:793"
---

# srConfirmSite

Confirms the site with a method and notes. Both are required, and only a person can confirm.

**Source:** `src/domain/actions.js:793`

## Offered on
- [[Initial Scheduling]] (Delivery)
- [[Service Request]] (Delivery)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[DMS.CONFIRM]]: Confirming the site needs both a Confirmation Method and Notes. Only a person may set Confirmed.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
