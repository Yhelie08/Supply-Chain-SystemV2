# Fulfillment Sorting Engine — Design

Date: 2026-11-17
Scope: Slice 1 of the Fulfillment gap list (full list in this conversation's record; see also `HomeCartel Supply Chain System - Specification v1.4` §05 Shared Engines / 01 Sorting Engine, and §03 Fulfillment / 02 Order Readiness).
Target stack: current Node + Postgres (Railway) codebase. Not a rewrite onto the spec's Python/FastAPI/Supabase stack — that decision was made explicitly for this pass.

## 1. Purpose

Today, `Sales_Order_Fulfillment` packages have a `Fulfillment_Stage` but no notion of *which ones to work on first*. Order Readiness lists whatever is in "Order Readiness" stage with no ranking beyond whatever the widget's default sort does. This slice ports the spec's sorting engine: every open package gets a **category** (what kind of attention it needs) and a **rank** (oldest Sales Order date first inside its category), plus a plain-words reason and a suggested next action. Humans still decide; the engine only tells them where to look first.

This is the foundational slice — the capacity cut line, aging guard, Kanban colors, and Scoreboard metrics (later slices) all read `category`/`queue_rank`/`suggested_release` rather than recomputing anything themselves.

## 2. Schema change

Add six fields to `Sales_Order_Fulfillment` only (the one form queue screens read today). Declared in `zoho-export/parsed/forms/Sales_Order_Fulfillment.json`'s `fields` array, same shape as existing fields, so `ensureSchema()` (`server/pg/schema.mjs`) picks them up automatically on next boot — no hand-written migration.

| Field (Zoho-style name) | Type | Notes |
|---|---|---|
| `Category` | picklist-as-text | `broken` / `late` / `at_risk` / `on_time` / `blocked` |
| `Blocked_Reason` | text | set only when `Category = blocked` |
| `Queue_Rank` | number | 1 = do first, within the queue |
| `Priority_Reason` | text | plain words, e.g. "45 days old · 6 days past target" |
| `Suggested_Action` | text | e.g. "Release today" |
| `Suggested_Release` | checkbox | above today's cut line |
| `Scored_At` | text (datetime string, Zoho-style) | when the engine last scored this record |

`Blocked_Owner_Id` from the spec is skipped for this slice — current code has no staff/user-id table to point at yet; `Blocked_Reason` alone is enough for Order Readiness to show *why* without an owner link. Revisit once roles/staff exist as real records.

## 3. Categorizing a package

New pure function in `server/modules/fulfillment/sorter.mjs`:

```js
function categorize(sof, now) { ... }
```

Checked in this order (spec §1, "Blocked checked first, Broken before lateness"):

1. **Blocked** — payment not cleared (reuses the existing `needsPaymentApproval()` from `workflows.mjs`), or missing customer address/contact, or an open exception linked to this package (reuses Exception Control's existing link, matched by SO+SKU+PAC the same way `qc-routing.mjs` does). Sets `Blocked_Reason` to whichever check failed first.
2. **Broken** — `Order_Type` is `complaint`/`replacement`, or the package is linked to an open RR.
3. **Already late** — `today > Target_Delivery_Date`.
4. **About to be late** — `Forecast_Delivery > Target_Delivery_Date`, or slack ≤ `at_risk_slack_days` (new setting, default 3). Slack = `Target_Delivery_Date − today` (the "work days still needed" term from the full formula is deferred to Slice 2's calculator; until then slack is calendar days only — noted as a known simplification, not silently different behavior).
5. **On time** — everything else.

A package with no `Target_Delivery_Date` uses `Added_Time + default_promise_days` (new setting, default 25) as its target for this calculation only — never written back onto the record — and `Priority_Reason` says "no target set".

## 4. Ranking and the cut-line stub

`rankAndCutLine(store)`:

1. Read every `Sales_Order_Fulfillment` record not yet in a terminal stage (`For Delivery` excluded).
2. Sort by: (a) `Urgent` — **always false this slice**, since `urgency_requests` doesn't exist yet (Slice 5); the comparator key is wired in now so Slice 5 only has to fill in the value, (b) `Order_Date` (the SO's Books order date — already present as `order_date` on the package, confirm field name during implementation) ascending, (c) `Target_Delivery_Date` ascending, (d) `SO_No` ascending as the final tiebreaker.
3. Assign `Queue_Rank` = position in that sorted list, scoped per category (spec: rank is "within the department queue" but cut line walks the whole ranked list across categories — both are produced from the one sorted list, filtered differently for display vs. cut-line).
4. Cut line: walk the full ranked list, summing box counts, until a flat setting `fulfillment_cut_line_boxes` (new, default: picked during implementation from recent average daily throughput) is reached. Everything at-or-above the line gets `Suggested_Release = true`. Box count itself doesn't exist yet (Slice 4), so this slice sums `Item_Details1` line quantities as the stand-in estimate — matching the spec's own fallback behavior for uncounted packages, not a deviation.

This keeps the cut line real and usable today, with a one-line swap-in point (`boxCountOf(sof)`) for Slice 2's real manpower formula and Slice 4's real box count later.

## 5. When it runs

- **Event-triggered**: register `afterAdd`/`afterUpdate` hooks on `Sales_Order_Fulfillment` (re-score just that one record's category) and on `Sales_Order_Readiness_Gate` (payment/approval changes can flip Blocked↔not-Blocked) — same hook pattern already used throughout `server/modules/fulfillment/*.mjs`. After any single-record re-categorize, re-run the full `rankAndCutLine` sweep (cheap: it's one query + in-memory sort over however many open packages exist, same cost class as the existing `reconcileFulfillment` sweep in `pipeline.mjs`).
- **Nightly**: new entry in `server/modules/fulfillment/index.mjs`'s `schedules` array (same mechanism as the existing `Forecast_Stamp_Daily` entry), `05:00 Asia/Manila`, full re-score of every open package.
- **Manual**: a `recalculate_fulfillment_queue` custom API (same shape as other custom APIs in `server/modules/procurement/apis.mjs` etc.) that Order Readiness's existing "Recalculate" affordance can call — if no such button exists yet, Order Readiness widget work (Slice-adjacent, see §7) adds one.

No `job_runs` log table this slice (spec wants one, but it's shared infrastructure useful to every department, not Fulfillment-specific) — flagged as a near-term follow-up rather than building a one-off version here.

## 6. Where it surfaces (this slice)

- **Order Readiness widget**: add category tabs (Broken / Already late / About to be late / On time, Blocked separate) and sort the existing list by `Queue_Rank` within whatever tab is active. The "Today's release" combined view (all `Suggested_Release = true` across categories) becomes the default landing view.
- Every row shows `Category`, `Priority_Reason` on hover, and `Suggested_Action` — additive columns on the existing table, no layout rebuild needed.
- Kanban/Dashboard/SO Report color-coding by category is explicitly **out of scope** for this slice (Slice 14) — they can read the new field later without this slice's code changing.

## 7. Explicitly out of scope for this slice

- Real manpower cut line (Slice 2) — stubbed as described in §4.
- Aging guard / silence alerts (Slice 3).
- Manual urgency (Slice 5) — comparator key wired in, value always false.
- Box count (Slice 4) — line-quantity sum used as stand-in, matching spec's own "estimated" fallback.
- `job_runs` log (deferred, cross-department).
- Kanban/Dashboard color-coding, Scoreboard metrics (later slices read the new fields once built).
- Procurement and Delivery categorization — spec's sorting engine is one shared method across three departments; this slice only implements the Fulfillment half (categorize rules differ per department, per spec §1).

## 8. Acceptance checklist

- [ ] Two open packages, same category, older Order Date ranks first (`Queue_Rank` lower) regardless of creation order.
- [ ] A package with `Order_Type = replacement` and no target date shows category `broken` with reason mentioning "no target set", not sorted to the bottom.
- [ ] An unpaid package with no credit terms shows category `blocked` with a `Blocked_Reason`, and does not appear in any non-Blocked tab.
- [ ] Changing a package's `Target_Delivery_Date` re-scores it (category and rank both update) without a manual recalculate.
- [ ] The nightly job re-scores every open package and updates `Scored_At`.
- [ ] Manual "Recalculate" re-scores on demand and updates `Scored_At` immediately.
- [ ] Packages above the cut line (by summed line quantity, until Slice 4) show `Suggested_Release = true`; packages below do not.
- [ ] Two scoring runs on identical data produce identical `Category`/`Queue_Rank` for every record (determinism check from spec).
