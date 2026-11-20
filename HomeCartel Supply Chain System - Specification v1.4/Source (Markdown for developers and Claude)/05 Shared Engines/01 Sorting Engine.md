# Sorting Engine

## Purpose

Humans cannot read hundreds of orders each morning, and the old lists were sorted newest first, so old orders got buried. This engine does the reading. It runs one method for all three departments:

**scan → categorise → sort → suggest**

1. **Scan**: look at every open record.
2. **Categorise**: put each record in a category that says *what kind of attention* it needs.
3. **Sort**: inside each category, **oldest Sales Order date first**, always ascending.
4. **Suggest**: write a reason and a next action on the record. Humans decide.

The engine is **plain code** (SQL views and functions plus a Python job). No AI, ever. The same input must always give the same answer, so a supervisor can ask "why is this first?" and get the same reply every time.

## 1. Categories

### Fulfillment and Delivery

| Order | Category | Code | Rule |
|---|---|---|---|
| 1 | **Broken / complaint** | `broken` | `order_type` in (`complaint`, `replacement`), or the record is linked to an open RR, a Sales Return redelivery or a failed / partial job with reason `damaged_in_transit` or `refused` |
| 2 | **Already late** | `late` | today > `target_delivery` |
| 3 | **About to be late** | `at_risk` | `forecast_delivery` > `target_delivery`, **or** slack ≤ `at_risk_slack_days` |
| 4 | **On time** | `on_time` | everything else |
| — | **Blocked** | `blocked` | cannot be worked: payment hold, items missing, no address or contact, open exception, permit pending. Shown in a separate list with `blocked_reason` and a named `blocked_owner_id`. |

- **Slack** = `target_delivery` − today − work days still needed (from the calculators).
- `at_risk_slack_days` **[DEFAULT: 3 days]** (setting).
- A record with **no Target Delivery** uses `order_date + default_promise_days` as its target for categorising **[DEFAULT: 25 days, the recent median promise]** and shows "no target set" in its reason. It is never pushed to the bottom.
- Blocked is checked **first**. A blocked record is not in the work list, whatever its age.
- Broken is checked before lateness. A replacement that is also late shows `broken` with "late" in its reason.

### Procurement

Nothing in procurement can be "worked today": the goods are in a factory. The question is whether we can still change the outcome.

| Order | Category | Code | Rule |
|---|---|---|---|
| 1 | **Act now** | `act_now` | Forecast arrival will miss the date needed for on-time delivery, **and** something can still change it: not yet shipped out (mode can be upgraded to air), or production not started (supplier can be changed), or the supplier ladder has fired |
| 2 | **Tell the customer** | `tell_customer` | Will miss, and nothing is left to change (already shipped out, or no faster option exists) |
| 3 | **Watch** | `watch` | On track but slack ≤ `proc_watch_slack_days` **[DEFAULT: 7 days]** |
| — | On track | `on_track` | Hidden by default; viewable with a filter |
| — | Blocked | `blocked` | PR on hold, missing price, missing supplier, SO voided |

"Date needed" = the date the goods must be **pickable** = `target_delivery` − `fulfillment_days` − `delivery_days` (the same settings the feasibility calculator uses; defaults 3 + 2). It is compared with the forecast **pickable** date (arrival + `receiving_days`).

## 2. Sort key

Inside every category, records are ordered by:

1. **Manual urgency first** (`urgent = true` and not expired). This is the only thing that can go ahead of an older order, and it costs a name and a reason.
2. **`order_date` ascending** (Books Sales Order date): oldest first. This is the rule for everything else.
3. `target_delivery` ascending (only matters for orders with the same Order Date)
4. Record number ascending (always unique, so the order never changes between runs)

Records with no customer order (stock PRs) use their creation date as the Order Date.

Rules:

- **SE-1** The record keeps its **true age**. An order that leaves a gate (unblocked, rework finished, reschedule) re-enters at its original Order Date, never at the bottom.
- **SE-2** Rank **work units**, not lines. Fulfillment ranks packages; delivery ranks jobs; procurement ranks PO lines (grouped by shipment for display). All lines of one Sales Order stay together.
- **SE-3** Score the **whole** open list, then filter for screens. Never sort only what is currently visible.
- **SE-4** The primary key is a **setting** (`sort_primary_key`, values `order_date` or `target_delivery`, **[DEFAULT: order_date]**). Switch to target date only after the feasibility gate has made target dates trustworthy.
- **SE-5** Every screen that shows a queue (Readiness, Pick, QC, Rework, Crate, Aggregation, Kanban, Service Requests, scheduling, Ship & Track) uses **the same ranking**. No screen has its own sort. Users may click a column to sort differently for their session only.

## 3. Suggest

The engine writes onto each record (queue columns, see 01 Database):

| Field | Example |
|---|---|
| `category` | `late` |
| `queue_rank` | `3` |
| `priority_reason` | "SO dated 2 Oct (45 days) · 6 days past target · 14 boxes" |
| `suggested_action` | "Release today" |
| `suggested_release` | `true` |
| `scored_at` | `16 Nov 2026 06:00` |

**Suggested actions** come from a lookup table (`suggested_actions`: module, category, condition → text), editable by Admin. Examples:

| Module | Condition | Suggested action |
|---|---|---|
| Fulfillment | Above cut line | Release today |
| Fulfillment | Below cut line, late | Add crew or release over capacity; supervisor decides |
| Fulfillment | Blocked: payment | Chase payment with sales agent |
| Delivery | Drop-off, no own-team slot within target | Book third party |
| Delivery | Installation, no slot within target | Ask supervisor: add team day or tell customer |
| Procurement | Production not started, PO+2 | Call supplier (ladder rung 1) |
| Procurement | Not shipped, forecast misses | Upgrade to air (saves 16 days) or move target |
| Procurement | Shipped, forecast misses | Tell sales agent and customer |

## 4. Capacity cut line ("Suggested Release")

Ranking alone still leaves someone guessing how many to do. The engine walks the ranked work list and adds up tomorrow's (or today's) work until capacity is used:

- **Fulfillment:** today's free capacity = `people × boxes_per_hour × hours_per_day` **minus** boxes already released and not yet aggregated (work in progress uses capacity first). Add `box_count` down the ranked list until the free capacity is used (05 / 02 Calculators).
- **Delivery:** fill team-days in rank order with the scheduling engine (Delivery 02).

Everything above the line gets `suggested_release = true`. **Suggested Release is a flag, not a category.** A late order can be (and usually is) both `late` and suggested for release. The supervisor's default view is **all suggested-release records across all categories, in rank order**: that is the shift.

## 5. Anti-burial guard (aging)

Sorting fixes the order of the pile; it does not make anyone look at the bottom. The engine raises its own alert for records that wait too long without moving:

| Days waiting in the same stage | What happens |
|---|---|
| `aging_low_days` **[DEFAULT: 7]** | Flag on the row, low severity |
| `aging_mid_days` **[DEFAULT: 14]** | Exception created, supervisor notified |
| `aging_high_days` **[DEFAULT: 21]** | High severity, escalated to Admin (Allan) |

Aging counts from the stamp of the stage the record is in now. Records imported from Creator without that stamp count from the import date, so go-live does not raise hundreds of alerts on day one. They still sit at the top of their category by Order Date.

## 6. When it runs

| Trigger | What runs |
|---|---|
| Nightly, 05:00 PH **[DEFAULT]** | Full scan of all three departments |
| Any material event (stage change, payment cleared, Books date change, target changed, urgency set, exception opened/closed, schedule change) | Re-score that Sales Order's records immediately |
| **Recalculate** button on every queue screen | Full re-score of that department now |

A run writes a `job_runs` row. If the nightly run fails or `scored_at` is older than 26 hours, every queue screen shows a red "ranking is stale" banner.

## 7. Manual urgency (M1)

The only manual priority. For a reason the system cannot see: VIP, project deadline, relationship call.

- **MU-1** Needs a name and a written reason. Requested by sales agent or supervisor; approved by supervisor (decided: sales agent requests, supervisor approves).
- **MU-2** Expires after the Target Delivery date, or after 14 days if there is no target.
- **MU-3** Can be raised by hand, never lowered by hand. To lower it, let it expire or change the target.
- **MU-4** Never skips a gate: payment, QC, pre-delivery gate still apply.
- **MU-5** Effect: sorts first **inside its category** (sort key 1). It does not move the record to another category **[DEFAULT: see Defaults A-16]**.
- **MU-6** If urgent records exceed `urgency_warning_pct` **[DEFAULT: 5%]** of open orders, the dashboard warns: the categories need fixing, not more flags.

## Acceptance checklist

- [ ] Two packages released, the newer one first: every fulfillment list shows the **older** Sales Order above.
- [ ] A replacement with no target date appears in **Broken**, at the top, not at the bottom.
- [ ] A late order unblocked today re-enters at its original age.
- [ ] Two runs on the same data produce identical ranks.
- [ ] Every row shows its rank and the plain-words reason on hover.
- [ ] Changing a target date re-ranks the order on every screen within one minute, without re-release.
- [ ] Changing `sort_primary_key` switches the ranking without code changes.
- [ ] Stopping the nightly job shows the stale banner the next day.
