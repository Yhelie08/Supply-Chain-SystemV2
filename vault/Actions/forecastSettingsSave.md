---
title: forecastSettingsSave
tags: [action, procurement]
module: Procurement
source: "src/domain/actions.js:1195"
---

# forecastSettingsSave

Saves the forecast lead-time settings (each leg is a min and max in days), the two toggles and the weeks shown. A minimum above its maximum is refused. Every forecast date is recalculated from them.

**Source:** `src/domain/actions.js:1195`

## Offered on
- [[Forecast Setting]] (Procurement)

## Rules
- [[FC.RANGE]]: In every leg the minimum days cannot be above the maximum days.
- [[FC.VALUES]]: Leg lengths must be zero or more, and the weeks shown must be a whole number from 1 to 52.
- [[FC.WINDOW]]: The forecast is a window (Earliest, Likely, Latest), never one exact date. Likely is the midpoint.
- [[FC.ANCHOR]]: With re-anchoring on, the forecast counts from the most advanced real event: shipped date, arrival, or the current Fulfillment stage, so the window tightens as the order moves.
- [[FC.STOCK]]: An order that has reached Fulfillment and is not a pre-order has no import leg left: only preparation and delivery.
- [[FC.TARGET]]: An order with no client target date is counted separately as No target. You cannot be on time against a promise nobody recorded.
- [[FC.SEVERITY]]: Overdue: today is past the client date. On track: the latest date fits. At risk: only the earliest date fits. Will miss: even the earliest is too late.
- [[FC.SOURCE]]: The forecast is built from the Purchase Requests, so a pure-stock order with no PR is not listed. Cancelled PRs and delivered orders are left out.

## How it behaves
A step runs on a copy of the data. If any rule refuses, the copy is thrown away and nothing changes. See [[How the engine works]].
