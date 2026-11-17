# Fulfillment Box Count — Design

Date: 2026-11-17
Scope: Slice 4 of the Fulfillment gap list, pulled forward as a prerequisite for Slice 2 (Capacity + Cut Line), per HomeCartel spec v1.4, `03 Fulfillment / 01 Packages and Box Count` (PKG-R3, PKG-R4) and `03 Fulfillment / 03 Pick, QC, Rework and Crate` (PK-R3).
Target stack: current Node + Postgres (Railway) codebase — same decision as Slice 1.

## 1. Purpose

"Box count" is one number per package: how many boxes physically leave the warehouse. The cut line and manpower calculator (Slice 2, next) need it to be real — right now `server/modules/fulfillment/sorter.mjs`'s `rankAndCutLine()` always estimates boxes as the sum of item-line quantities, which is a stand-in, not an actual count. This slice makes the real count capturable, per spec: entered at pick completion (default), updated at crate if crating changes it, falling back to the line-quantity estimate (marked *estimated*) until then.

Per **PKG-R4**: box count is explicitly **not** used for categorizing or ranking (Slice 1's `categorize`/`rankAndCutLine`'s sort order are untouched) — only the capacity calculators and the cut line (Slice 2) read it.

## 2. Schema change

Add two fields to `Sales_Order_Fulfillment` (same form Slice 1 added queue columns to), declared in `zoho-export/parsed/forms/Sales_Order_Fulfillment.json`:

| Field | Type | Notes |
|---|---|---|
| `Box_Count` | number | How many boxes leave the warehouse for this package. Blank until first entered. |
| `Box_Count_Source` | text | `'estimated'` (default, line-quantity sum) or `'counted'` (a human entered a real number). |

## 3. The estimate fallback

`sorter.mjs` already has `estimatedBoxes(sof)` (sums `Item_Details1` quantities) — used today as `rankAndCutLine`'s only source. Replace its call site with a new `effectiveBoxes(sof)`:

```js
function effectiveBoxes(sof) {
  if (text(sof.Box_Count_Source) === 'counted' && !blank(sof.Box_Count)) return toNum(sof.Box_Count);
  return estimatedBoxes(sof); // the existing line-quantity sum, now explicitly the *estimated* fallback
}
```

`estimatedBoxes` itself is unchanged — it keeps its name and existing meaning (the line-quantity sum), it just becomes the fallback branch instead of the only branch. No other function in `sorter.mjs` changes.

## 4. Capturing the count at pick completion (PKG-R3 default: "at pick completion")

Pick1 is one row per item line within a package (confirmed: `Pick1.json` has `SO`, `Package_Order`, `Marked` as separate fields — a package's box count has no single row to live on until every line is picked). New helper in `pipeline.mjs`:

```js
// True once every Pick1 row of this package (SO + Package_Order) is Marked. Used to know when "the pick is
// complete" for the whole package, not just one line — that is the moment PKG-R3 asks for the box count.
async function allPickedForPackage(store, so, pkg) { ... }
```

`pickedToQc`'s existing hook (fires on a `Pick1` row's `afterUpdate`/`afterAdd` when `Marked` becomes true) gains one more check: when this save is the one that makes `allPickedForPackage` go from false→true for its package, it is the trigger point the Pick widget uses to prompt for a box count (see §5). The hook itself does not invent a number — only a human knows the real count — it only flags that the package has reached "pick complete, box count wanted."

No new field on `Pick1` is needed to carry this flag back to the widget: the widget already re-reads the package's own `Sales_Order_Fulfillment` row after a Pick1 save (existing pattern in other Fulfillment widgets, confirmed in Slice 1's Order Readiness work), so it can check `Box_Count_Source` is still blank/estimated right after the last line is marked and prompt then.

## 5. Where it surfaces

- **Pick widget**: when a `Mark Picked` save completes the last line of a package (i.e., the response shows the package's Fulfillment_Stage has advanced to "Pack & QC" and `Box_Count_Source` is not yet `'counted'`), show a small modal: "How many boxes?" with a numeric input and a "Skip for now" option (per spec: the estimate stands in until counted — skipping is valid, not an error). Entering a number writes `Box_Count` + `Box_Count_Source: 'counted'` on the package via the existing `updateRecords` pattern this widget already uses for other package-level writes.
- **Crate widget**: add a "Box Count" field to the Crate Done form, pre-filled with the package's current `Box_Count` (or the estimate, labeled as such, if not yet counted). Saving Crate Done with a changed number updates the package's `Box_Count` (source stays/becomes `'counted'`) — this is PKG-R3's "updated at crate" clause, for when consolidating into crates changes the box total.
- No other widget needs to read or show box count this slice (Order Readiness's "boxes" column, the capacity bar, and crew sizing are Slice 2's job to wire up next).

## 6. Explicitly out of scope for this slice

- The `package.box_counted` stamp (spec's Timestamps section) — deferred to the stage-event-log slice (Slice 11) rather than a one-off stamp mechanism built just for this field.
- Any categorization/ranking change — PKG-R4 is explicit that box count never affects sorting; `categorize()`/`rankAndCutLine()`'s comparator keys are untouched.
- Slice 2's real cut-line/manpower formula — this slice only makes `effectiveBoxes()` return a real number when one exists; Slice 2 is what actually uses it for the cut line instead of the flat setting.
- PKG-R1/R2/R5/R6 (package auto-creation, partial-package-as-decision, replacement-gets-own-package, SO-field-copy-down) — separate "Packages" gap item, not part of box count.

## 7. Acceptance checklist

- [ ] A package with no `Box_Count` shows the line-quantity sum as its box count, and `Box_Count_Source` reads `'estimated'`.
- [ ] Marking the last (only remaining unmarked) `Pick1` line of a package triggers the box-count prompt; marking a line that still leaves siblings unmarked does not.
- [ ] Entering a number in the pick-completion prompt sets `Box_Count` and flips `Box_Count_Source` to `'counted'`.
- [ ] Skipping the prompt leaves the package on the estimated fallback — it is not an error state.
- [ ] Changing the box count on Crate Done updates `Box_Count` (source stays `'counted'`) even if a count was already entered at pick.
- [ ] `effectiveBoxes()` is the only thing Slice 2's cut line will call — `estimatedBoxes()` is never called directly except as `effectiveBoxes`'s own fallback.
- [ ] Categorization and rank order (Slice 1) are provably unaffected by any value of `Box_Count` — existing Slice 1 tests still pass unchanged.
