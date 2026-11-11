---
title: teamToggleOff
tags: [action, delivery]
module: Delivery
source: "src/domain/actions.js:874"
---

# teamToggleOff

Marks a date as a day off for a team, or brings the team back if it was already off.

**Source:** `src/domain/actions.js:874`

## Offered on
- [[Teams & Capacity]] (Delivery)

## Rules
- [[GEN.FIELD]]: A required field is missing.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
