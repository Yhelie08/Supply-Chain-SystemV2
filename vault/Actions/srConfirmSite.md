---
title: srConfirmSite
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:1219"
---

# srConfirmSite

Confirms the site with a method and notes. Both are required, and only a person can confirm.

**Source:** `src/domain/actions.js:1219`

## Offered on
- [[Initial Scheduling]] (Delivery Management)
- [[Service Request]] (Delivery Management)

## Rules
- [[GEN.STATE]]: That step is not available in the record's current status.
- [[DMS.CONFIRM]]: Confirming the site needs both a Confirmation Method and Notes. Only a person may set Confirmed.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
