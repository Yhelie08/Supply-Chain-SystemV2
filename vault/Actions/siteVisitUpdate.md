---
title: siteVisitUpdate
tags: [action, delivery-management]
module: Delivery Management
source: "src/domain/actions.js:873"
---

# siteVisitUpdate

Field Service Site Visits: records whether the site is ready, with notes.

**Source:** `src/domain/actions.js:873`

## Offered on
- [[Field Service Site Visits]] (Delivery Management)

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
