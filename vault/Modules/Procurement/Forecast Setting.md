---
title: Forecast Setting
tags: [page, procurement, built]
module: Procurement
route: "#/procurement/forecast"
status: partial
source: src/pages/forecast/ (ForecastPage)
---

# Forecast Setting

> Procurement to delivery: when will each open order arrive, against what the client expects.

**Section:** [[Procurement]] · **Route:** `#/procurement/forecast` · **Source:** `src/pages/forecast/` (`ForecastPage`) · **Status:** built, not yet at parity

**Shows:** [[prs]], [[shipments]], [[items]], [[inquiries]], [[serviceRequests]]

## What the live page has

- **Inner tabs:** Volume · Forecast · Forecast Settings
- **Stat cards:** Open orders · This week · At risk · Will miss · No client date
- **Buttons:** Refresh

### Still missing from this page

- button: Refresh

## Steps on this page

| Step | What it does | Rules |
| --- | --- | --- |
| [[forecastSettingsSave]] | Saves the forecast lead-time settings (each leg is a min and max in days), the two toggles and the weeks shown. A minimum above its maximum is refused. Every forecast date is recalculated from them. | [[FC.RANGE]], [[FC.VALUES]], [[FC.WINDOW]], [[FC.ANCHOR]], [[FC.STOCK]], [[FC.TARGET]], [[FC.SEVERITY]], [[FC.SOURCE]] |
| [[forecastSettingsReset]] | Puts every forecast setting back to its default. | — |

