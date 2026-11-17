# Fulfillment Capacity + Cut Line — Design

Date: 2026-11-17
Scope: Slice 2 of the Fulfillment gap list, per HomeCartel spec v1.4, `05 Shared Engines / 02 Calculators` §1 (Fulfillment manpower calculator) and `05 Shared Engines / 01 Sorting Engine` §4 (Capacity cut line).
Depends on: Slice 4 (Box Count — `docs/superpowers/specs/2026-11-17-fulfillment-box-count-design.md`), built first so `effectiveBoxes()` returns a real number once counted, not just the line-quantity estimate.
Target stack: current Node + Postgres (Railway) codebase.

## 1. Purpose

Slice 1 shipped a cut line stubbed on a flat setting (`fulfillment_cut_line_boxes`, default 50) with no regard for who's actually on shift or how much work is already in progress. This slice replaces that stub with the spec's real formula and adds the backlog/crew-sizing numbers the Order Readiness capacity bar and Fulfillment Dashboard need.

Two formulas, verbatim from the spec:
```
backlog_days = open_boxes ÷ (people × boxes_per_hour × hours_per_day)
people_needed = open_boxes_due ÷ (boxes_per_hour × hours_per_day × days_available)
```

And the cut line (05/01 §4, not §02): **today's free capacity = `people × boxes_per_hour × hours_per_day` minus boxes already released and not yet aggregated** (work-in-progress uses capacity first) — the ranked list is then walked, adding box counts, until that free capacity (not the raw capacity) is used.

## 2. Schema: `Capacity_Days`

New form, declared the same way every other form is (a JSON file under `zoho-export/parsed/forms/`, picked up automatically by `ensureSchema()`):

| Field | Type | Notes |
|---|---|---|
| `Date` | date | One row per day. |
| `People` | number | Who's on shift. Entered by the fulfillment supervisor each morning, or copied from yesterday (§5). |
| `Boxes_Per_Hour` | number | Measured crew throughput. |
| `Hours_Per_Day` | number | Productive hours per person. |

New `Policy_Settings` keys (read through the existing `policyReader(store)` helper, same as Slice 1's `at_risk_slack_days`/`default_promise_days`), used only as fallback defaults when no `Capacity_Days` row exists for a date:

| Key | Default |
|---|---|
| `fulfillment_default_people` | 4 |
| `fulfillment_boxes_per_hour` | 8 |
| `fulfillment_hours_per_day` | 7 |
| `assign_batch_boxes` | 20 |

## 3. `capacityFor(store, date)`

New function in `server/modules/fulfillment/sorter.mjs` (or a sibling `capacity.mjs` if `sorter.mjs` is getting long — decide at implementation time by file size, per the writing-plans file-structure guidance):

```js
async function capacityFor(store, date) {
  // 1. Capacity_Days row for `date`, if any.
  // 2. Else, Capacity_Days row for the most recent earlier date (spec: "or copied from yesterday").
  // 3. Else, Policy_Settings defaults.
  // Returns { people, boxesPerHour, hoursPerDay, capacityBoxes: people * boxesPerHour * hoursPerDay }.
}
```

## 4. The real cut line

`rankAndCutLine` (Slice 1) currently walks every open (not-yet-`For Delivery`) package in rank order, summing `effectiveBoxes()` against a flat setting. This slice changes what it's walking against:

1. **Work in progress**: every `Sales_Order_Fulfillment` row whose `Fulfillment_Stage` is one of `pipeline.mjs`'s own `STAGE_ORDER` entries *after* `Order Readiness` and *before* `For Delivery` — i.e. `Picking`, `Pack & QC`, `Crate`, `Order Aggregation` (reusing `STAGE_ORDER` directly rather than hand-listing these names, so the two files can never drift). Sum their `effectiveBoxes()`.
2. **Free capacity today** = `capacityFor(store, today).capacityBoxes − wipBoxes` (floored at 0 — WIP can exceed today's nominal capacity on a bad day; the cut line then simply releases nothing new).
3. **Walk the ranked list** (the same `entries` `rankAndCutLine` already sorts) exactly as before, but against this free capacity instead of the flat setting.

`rankAndCutLine`'s signature changes from `rankAndCutLine(entries, { policy })` to `rankAndCutLine(entries, { policy, wipBoxes, capacityBoxes })` — the caller (`scoreAllOpenPackages` in `sorter.mjs`) computes `wipBoxes` and `capacityBoxes` once per scoring run (via a query for WIP-stage packages, and `capacityFor`) and passes them in, keeping `rankAndCutLine` itself still a pure, easily-tested function (no store access inside it) — same design principle Slice 1 used.

## 5. Backlog days and crew sizing

Two small pure functions, next to `rankAndCutLine`:

```js
// backlog_days = open_boxes / (people * boxes_per_hour * hours_per_day)
export function backlogDays(openBoxes, capacity) { ... }

// people_needed = open_boxes_due / (boxes_per_hour * hours_per_day * days_available)
export function peopleNeeded(openBoxesDue, capacity, daysAvailable) { ... }
```

`open_boxes` = sum of `effectiveBoxes()` for every not-yet-dispatched package (ready, released, in any stage before `For Delivery`) — a slightly wider set than WIP alone (WIP is "released and not yet aggregated"; backlog's `open_boxes` is "not yet dispatched" per the Calculators table, which includes packages still waiting to be released too). `open_boxes_due` (for crew sizing) = the same sum restricted to packages in categories `late` or `at_risk` (the spec's own crew-sizing example: "to clear all Late and About-to-be-late packages in N days").

## 6. Where it surfaces

- **Order Readiness capacity bar**: today's people / boxes-per-hour / hours → capacity in boxes; boxes suggested (sum of `effectiveBoxes()` for every `Suggested_Release = true` row); boxes released so far today (WIP sum from §4.1). An editable "today's people" input that writes to `Capacity_Days` for today (upsert by date).
- **Crew sizing**: a line reading "To clear Late + About-to-be-late in N days you need X people (you have Y)" — `peopleNeeded(openBoxesDue, capacity, N)`, with N a small fixed input (e.g. 3, matching the spec's own example) rather than a new setting, since the spec gives no default for it.
- **Fulfillment Dashboard**: backlog-days figure, from `backlogDays()`.
- `rescoreAll`/`rescoreOne` (Slice 1) start writing real `Suggested_Release` values derived from the formula above instead of the flat-setting stub — no change to their own signatures, only to what `rankAndCutLine` is called with internally.

## 7. Explicitly out of scope for this slice

- `assign_batch_boxes`'s actual use (giving each picker a batch rather than the whole day) — that's Pick-widget assignment logic, a different piece of work than capacity/cut-line math; the setting is declared here since the spec lists it alongside the other capacity inputs, but nothing in this slice reads it yet.
- Delivery's backlog calculator (05/02 §2) and Procurement's feasibility calculator (05/02 §3) — out of this Fulfillment-only pass, per the same department-scoping note Slice 1's design carried.
- Measuring real `boxes_per_hour` "later from stamps" — this slice keeps it a manually-entered/defaulted `Capacity_Days` value; deriving it from pick/QC/crate stamps needs the stage-event log (Slice 11) first.

## 8. Acceptance checklist

- [ ] Changing `Capacity_Days.Boxes_Per_Hour` for today changes the cut line and backlog days on the next rescore.
- [ ] No `Capacity_Days` row for today falls back to yesterday's row; no row at all falls back to the `Policy_Settings` defaults (4 / 8 / 7).
- [ ] A package in `Picking`/`Pack & QC`/`Crate`/`Order Aggregation` counts toward WIP and reduces today's free capacity; a package still in `Order Readiness` does not.
- [ ] The ranked list's cut line stops exactly at the package that would exceed free capacity (capacity minus WIP), not raw capacity.
- [ ] WIP exceeding today's capacity floors free capacity at 0 (nothing new suggested-released), without throwing.
- [ ] Crew sizing with a known Late+At-risk box total, a known `boxes_per_hour`/`hours_per_day`, and N=3 days matches the formula by hand.
- [ ] Box count's own acceptance checklist (Slice 4) still passes unchanged — this slice only changes what reads `effectiveBoxes()`, not how it's computed.
