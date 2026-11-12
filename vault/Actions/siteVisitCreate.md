---
title: siteVisitCreate
tags: [action, domain]
module: Domain
source: "src/domain/actions.js:865"
---

# siteVisitCreate

Field Service Site Visits: schedules an assessment for a service request.

**Source:** `src/domain/actions.js:865`

## Creates records in
- [[siteVisits]]

## Rules
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
