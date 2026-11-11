---
title: forecastSettingsReset
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:1205"
---

# forecastSettingsReset

Puts every forecast setting back to its default.

**Source:** `src/domain/actions.js:1205`

## Offered on
- [[Forecast Setting]] (Procurement)

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
