---
title: "Plan - Forecast Engine"
tags:
  - plan
  - forecast
status: F0 to F4 built 2026-11-12 on branch feature/forecast-engine (425 tests); F5 (comparison with Zoho Development) planned for the next session; no PR yet
date: 2026-11-12
---

> [!INFO] Where this fits
> The forecast is shared by Fulfillment, Procurement and Delivery, so it is its own milestone ([[Plan - Full Migration Off Zoho Creator]]). Delivery waits on it only for the four `*_Instant_Forecast` stamps ([[Plan - Delivery Management Open Items]]). What changed, step by step: [[00 - Change Log]].

# Forecast engine: what is built and what is left

## 1. Buod (Tagalog)
- **Tapos na sa code (F0 hanggang F4):** ang forecast ladder, ang pag-stamp kada order sa pag-save, ang bahagi ng PR, ang pitong Instant Forecast na workflow, ang dalawang daily schedule, at ang runner ng mga schedule.
- **Hindi pa nasusubukan laban sa Zoho Development (F5).** Ipinagpaliban ng may-ari sa susunod na araw. Hangga't hindi ito nagagawa, ang mga bagay na may markang (?) sa code ay hula batay sa Deluge, hindi kumpirmado.
- Hindi pa naka-open ang PR. Naka-push ang branch para may backup.

## 2. Where the code is (`server/forecast/`, shared code like `server/workflows/suppliers.mjs`)
| File | What it is |
|---|---|
| `engine.mjs` | **One pure function** `computeForecast` (the ladder: position, earliest/latest, middle date, window text, status), the settings defaults, `bucketOf` and `finish`. No database. |
| `stamp.mjs` | `fcStampBySoNo(store, soNo)`: reads the facts of one order and stamps 9 forms, only where a value differs. |
| `hooks.mjs` | The 7 Instant Forecast workflows of the Fulfillment forms (imported by `server/modules/fulfillment/workflows.mjs`). |
| `purchase-request.mjs`, `pr-hooks.mjs` | `fcStampPurchaseRequest`, `fcPrToPreOrder` and `PR1_Forecast_Stamp` (imported by Procurement's `workflows.mjs`). A second, slightly different ladder, kept as written. |
| `schedule.mjs` | `Forecast_Stamp_Daily` (per item, order roll-up, earliest shipment per PR, PR-only pass) and `Backfill_PreOrder_Forecast`. |
| `../schedules.mjs` | The runner: once a day at the schedule's local time (Asia/Manila), the day recorded in `_schedule_runs` when a run starts, a Postgres advisory lock per schedule, **off unless `SCHEDULES=on`**. A module lists its schedules in its `index.mjs`. |

Delivery's `fcStampDelivery` now asks this engine for an order that has no forecast (`server/modules/delivery-management/forecast-stamp.mjs`).
Tests: `tests/forecast/` (about 60). The Port Checklist lists the schedules as ported.

## 3. Things Zoho does that look odd and are kept (marked "mirrors Zoho" in the code)
- The on-save engine works **per order**; the daily schedule works **per item** (one Fulfillment row = one item, an item with no PR is stock on hand) and rolls the order up (latest date, worst status) for Receiving, Order Aggregation, Service Request and Service Appointment. They can give different answers for a partly pre-ordered order. Both use the same ladder.
- The PR version of the ladder (`fcStampPurchaseRequest`) differs from the order version: it stamps nothing until the PR has a mode, has no "+Nd vs client" text, adds the supplier lead time only when the shipment branch is not taken, and lets each shipment row override the one before.
- Picking, Pack, Quality Checking and Crate count as prep stages even with re-anchoring off (a precedence slip in the Deluge condition).
- The middle date is `round(span / 2)`, taken as round-half-up.

## 4. To settle on Zoho Development (F5), in order of importance
1. **Does a blank field joined to text become the word "null"?** The code assumes yes (`NULL_TEXT = true` in `stamp.mjs`, one switch). It decides: whether a blank `Shipment_Mode` on the SOF row blocks the fallback to the PR's mode (then the bucket is "LCL?"), and whether the PR gate "no stamp until the PR has a mode" can ever fire. Experiment: a SOF row with a blank mode and a PR with Air; a PR with a blank mode.
2. The ladder against Zoho for each position and status: stock on hand, a prep stage, Ready, in transit, at the warehouse, procurement, and a client date giving each of the five statuses, including the exact window text.
3. Round-half-up of the middle date (a span of 3 days: Zoho gives +1 or +2).
4. The per-item schedule: SKU matching, the order roll-up, "item <SKU>" in the window, the earliest shipment per PR (run the schedule on Development, which is read-only on the code and only stamps).
5. That a script write does not fire the Instant Forecast workflows again (as found for insert on the Delivery forms).

How: Development only, records marked `ZZ-FC`, listed and deleted afterwards, nothing left (same rules and the same kind of script as the Delivery comparison). **Needs the owner's OK before the first write** (asked 2026-11-12; the owner chose to plan it for the next day).

## 5. After the comparison
1. Fix the port or the tests where Zoho differs, or write the difference down as deliberate.
2. Open ONE pull request for Sir Yhel and Sir JV. It touches, and the description must say so: `server/index.mjs` (starts the runner), `tools/build-port-checklist.mjs` and `tools/build-module-readmes.mjs` (core, `@Yhelie08`), the Fulfillment module (hooks and schedules), the Procurement module (`workflows.mjs`, `ported.json`) and the Delivery module (the engine wiring).
3. Update [[Plan - Delivery Management Open Items]] (the forecast blocker closes) and the Change Log.
4. Go-live needs `SCHEDULES=on`, `TZ=Asia/Manila`, `BACKEND=pg` and the data on Railway, with the other modules.

## 6. Risks
- No `Forecast_Settings` rows in the Development backup: the defaults in the script run there. The comparison needs one settings record on Development (created and deleted).
- The runner needs a real Postgres to test the lock between two instances; the unit test uses a stand-in lock.
- The daily schedule reads every table into memory once; with Production-sized data this needs a look at memory (the tables are small now).
