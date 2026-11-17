# Fulfillment Stage Event Log — Design

Date: 2026-11-17
Scope: Slice 11 of the Fulfillment gap list, per HomeCartel spec v1.4, `01 Database` §8 (`stage_events`) and `00 Overview / 02 Decision Log` D13 (one server stamp per stage entry).
Target stack: current Node + Postgres (Railway) codebase.

## 1. Purpose

Today, a package's `Fulfillment_Stage` only ever holds its *current* value — nothing records when it entered that stage, or any stage before it. This makes "how long has this been in Picking" or "median hours Order Readiness → Released" (both needed by later slices: Aging guard and Scoreboard) impossible to compute. This slice adds a write-only event log: one row every time a package's stage changes, server-stamped, never user-editable.

Per D13: **one stamp per stage entry**, not start/end pairs — simpler, and it can never disagree with itself. Per spec §8/§9: `stage_events` is **server-only**, never written by a user action directly.

## 2. Schema: `Stage_Events`

New form (`zoho-export/parsed/forms/Stage_Events.json`), picked up automatically by `ensureSchema()`:

| Field | Type | Notes |
|---|---|---|
| `Record_Type` | text | `'package'` for this slice (the only record type Fulfillment logs). Other departments would add their own values later — not this slice's job. |
| `Record_ID` | text | The `Sales_Order_Fulfillment` record's own `ID`. |
| `Event` | text | `package.<stage_slug>` — see §3. |
| `Occurred_At` | text | Zoho-style datetime string (`zohoNow()`'s format). For this slice, always equal to `Reported_At` (the save that caused the event always happens at the moment it's logged — there's no delayed/backfilled input path yet). |
| `Reported_At` | text | Same as `Occurred_At` for now — kept as its own field because a later import/backfill slice needs the two to be able to differ (spec: "nothing invented" for imported stamps) without a schema change. |
| `Source` | text | `'system'` — every write goes through this app itself; no external sync writes `Fulfillment_Stage` yet. |
| `Note` | text | Optional, blank for now. |

Deliberately **not** carrying the full spec shape this slice: `occurred_bound` (`exact`/`before`/`after` — matters once backfilled/imported data exists, not live writes), `actor_id` (no `staff` table of real users exists yet to point at), `visit_no` (matters for a record that revisits the same stage more than once meaningfully, e.g. QC re-checks — out of scope here, since Fulfillment_Stage only moves forward per the existing `advanceStage` rule). Adding these later is a column addition, not a redesign.

## 3. Event naming

`package.<stage_slug>`, where `stage_slug` is the stage name lowercased with spaces/`&` replaced by underscores:

| `Fulfillment_Stage` value | `Event` |
|---|---|
| `Waiting For Package` | `package.waiting_for_package` |
| `Need Approval` | `package.need_approval` |
| `Order Readiness` | `package.order_readiness` |
| `Picking` | `package.picking` |
| `Pack & QC` | `package.pack_qc` |
| `Crate` | `package.crate` |
| `Order Aggregation` | `package.order_aggregation` |
| `For Delivery` | `package.for_delivery` |

Matches the spec's own dotted style (`po.acknowledged`, `shipment.shipped_out`).

## 4. The hook

One generic hook on `Sales_Order_Fulfillment`, not logging calls added at each of the (currently **five**, confirmed by re-grepping during this design's review — the count had already grown since an earlier pass of this same investigation) separate places that write `Fulfillment_Stage`: `advanceStage` and two spots inside `reconcileFulfillment`'s catch-up sweep, both in `pipeline.mjs`; `stageOnSave`'s `beforeAdd`/`beforeUpdate` input mutation and `stageOnGateSave`'s direct `updateRecord`, both in `workflows.mjs`. That the count grew between two checks is itself the argument for this approach: a hook at the write boundary catches all of them — present and any future one — without per-call-site logging code that someone has to remember to add every time a new write site appears.

New file `server/modules/fulfillment/stage-events.mjs`:

- `afterAdd`: always logs one event for the record's starting `Fulfillment_Stage` (there is no `previous` to compare against on a brand-new record).
- `afterUpdate`: logs one event only when `record.Fulfillment_Stage !== previous.Fulfillment_Stage` — every other field change on the package produces no event.

Both write through the raw store the hook receives (confirmed in Slice 1's Task 5: hook args always carry the unhooked store), so logging a `Stage_Events` row never re-triggers this hook or any other.

## 5. Where it's read (this slice: nowhere)

This slice is purely the write side. Nothing queries `Stage_Events` yet — that's Slice 3 (Aging guard: days since the current stage's own event) and Slice 12 (Scoreboard: medians between consecutive stage events). Building the write side first, correctly, means both of those slices can trust the data is already there and focus entirely on the read/aggregation logic.

## 6. Explicitly out of scope for this slice

- `occurred_bound`, `actor_id`, `visit_no` (named exclusions above, deferred to when they have a real consumer).
- Any reader/query function — no `stageEventsFor(packageId)` or similar this slice; that's for whichever later slice first needs to read the log.
- Other departments' events (Procurement's `po.acknowledged`, Delivery's `job.dispatched`, etc.) — this slice is Fulfillment-only, consistent with every prior slice's department scoping.
- Backfilling history for packages that already exist and have already moved through several stages before this slice shipped — their log simply starts from whatever stage they're in now, which is honest (nothing invented) rather than a gap to "fix."

## 7. Acceptance checklist

- [ ] Creating a new package logs exactly one `Stage_Events` row for its starting stage.
- [ ] A save that changes `Fulfillment_Stage` logs exactly one new row with the new stage's event name.
- [ ] A save that does NOT change `Fulfillment_Stage` (any other field) logs nothing.
- [ ] Two saves in a row that both set the same `Fulfillment_Stage` (no actual change) log only once, not twice.
- [ ] `Occurred_At` and `Reported_At` are identical for every row this slice produces.
- [ ] The hook's own write never triggers itself again (no infinite loop, no duplicate rows from a single stage change).
