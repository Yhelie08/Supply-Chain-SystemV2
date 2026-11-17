# Fulfillment Capacity + Cut Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `fulfillment_cut_line_boxes` cut-line stub (Slice 1) with the spec's real manpower formula — today's capacity minus work-in-progress — and add backlog-days and crew-sizing numbers for the Order Readiness capacity bar and the Fulfillment Dashboard.

**Architecture:** A new `Capacity_Days` form (one row per date: people, boxes/hour, hours/day), read by a new `capacityFor(store, date)` helper with a yesterday-then-settings fallback chain. `rankAndCutLine` changes to separate WIP-stage entries (already in its input, just not treated specially before) from not-yet-released ones, summing WIP's boxes to reduce free capacity and only walking the not-yet-released entries against what's left. Two new pure arithmetic functions, `backlogDays` and `peopleNeeded`, straight from the spec's formulas.

**Tech Stack:** Node.js (ESM `.mjs`), Postgres, `node:test` + PGlite — same stack as Slices 1 and 4.

**Spec:** `docs/superpowers/specs/2026-11-17-fulfillment-capacity-cut-line-design.md`

## Global Constraints

- `rankAndCutLine` stays a pure function — no store access inside it. The caller (`scoreAllOpenPackages` in `sorter.mjs`) computes `capacityBoxes` via `capacityFor(store, today)` and passes it in; `rankAndCutLine` derives WIP itself from the `entries` it already receives.
- WIP stages (reuse `pipeline.mjs`'s own `STAGE_ORDER` — never hand-list stage names a second time) are `Picking`, `Pack & QC`, `Crate`, `Order Aggregation`. Not-yet-released stages are `Waiting For Package`, `Need Approval`, `Order Readiness`.
- A WIP entry always gets a `queueRank` (for display) but never `suggestedRelease: true` and is never walked against free capacity a second time.
- New schema (`Capacity_Days` form) and new `Policy_Settings` keys follow the same JSON-file / `policyReader` patterns Slices 1 and 4 already established — no new persistence mechanism.
- Every Slice 1 and Slice 4 test must still pass unchanged after this plan.

---

## File Structure

| File | Responsibility |
|---|---|
| `zoho-export/parsed/forms/Capacity_Days.json` | Create: new form — `Date`, `People`, `Boxes_Per_Hour`, `Hours_Per_Day` |
| `server/modules/fulfillment/index.mjs` | Modify: add `Capacity_Days` to the module's `forms` array |
| `server/modules/fulfillment/sorter.mjs` | Modify: add `capacityFor()`, `backlogDays()`, `peopleNeeded()`; change `rankAndCutLine`'s WIP handling and signature; update `scoreAllOpenPackages` to pass `capacityBoxes` |
| `tests/fulfillment-sorter.test.js` | Modify: tests for `capacityFor`, `backlogDays`, `peopleNeeded`, and the revised `rankAndCutLine` |
| `tests/fulfillment-sorter-hooks.test.js` | Modify: confirm `rescoreAll` still works end-to-end with the new capacity path |
| `modules/Fulfillment/Order Readiness/app/index.html` | Modify: capacity bar (people/boxes-per-hour/hours, capacity, suggested, released-so-far), editable people input, crew-sizing line |
| `modules/Fulfillment/Fulfillment Dashboard/app/index.html` | Modify: backlog-days figure |

---

## Task 1: `Capacity_Days` form + `Policy_Settings` defaults

**Files:**
- Create: `zoho-export/parsed/forms/Capacity_Days.json`
- Modify: `server/modules/fulfillment/index.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Produces: a `Capacity_Days` table with columns `Date` (text, Zoho-style date string), `People` (number), `Boxes_Per_Hour` (number), `Hours_Per_Day` (number).

- [ ] **Step 1: Create the form JSON**

Create `zoho-export/parsed/forms/Capacity_Days.json`:

```json
{
  "name": "Capacity_Days",
  "label": "Capacity Days",
  "successMessage": "Data Added Successfully!",
  "fields": [
    {
      "name": "Date",
      "label": "Date",
      "type": "date",
      "required": false
    },
    {
      "name": "People",
      "label": "People",
      "type": "number",
      "required": false
    },
    {
      "name": "Boxes_Per_Hour",
      "label": "Boxes Per Hour",
      "type": "number",
      "required": false
    },
    {
      "name": "Hours_Per_Day",
      "label": "Hours Per Day",
      "type": "number",
      "required": false
    }
  ]
}
```

- [ ] **Step 2: Register the form under Fulfillment**

In `server/modules/fulfillment/index.mjs`, add `'Capacity_Days'` to the `forms` array (the list currently reads `['Sales_Order_Fulfillment', 'Checker_Checklist', 'Crate_Checklist', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Order_Aggregation1', 'Pick1', 'Warehouse_Request', 'Transfer_Warehouse']` — append `'Capacity_Days'`).

- [ ] **Step 3: Validate the schema picks it up**

Run: `node -e "import('./server/model.mjs').then(m => console.log(Object.keys(m.columns.Capacity_Days)))"`
Expected: `[ 'Date', 'People', 'Boxes_Per_Hour', 'Hours_Per_Day' ]`

- [ ] **Step 4: Write a schema-presence test**

Add to `tests/fulfillment-sorter.test.js` (near the other schema-presence tests):

```js
test('Capacity_Days form exists with Date/People/Boxes_Per_Hour/Hours_Per_Day', async () => {
  const id = await raw.addRecord('Capacity_Days', { Date: '2026-11-17', People: '4', Boxes_Per_Hour: '8', Hours_Per_Day: '7' });
  const r = await raw.getRecordById('Capacity_Days', id, { raw: true });
  assert.equal(r.People, '4');
  assert.equal(r.Boxes_Per_Hour, '8');
  assert.equal(r.Hours_Per_Day, '7');
});
```

Also add `'Capacity_Days'` to this test file's `beforeEach` cleanup list (the array of forms it `DELETE`s between tests).

- [ ] **Step 5: Run it**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS

- [ ] **Step 6: Run the module invariant tests too (a new form changes module ownership bookkeeping)**

Run: `node --test tests/core/modules.test.js`
Expected: PASS — `Capacity_Days` must not collide with any other module's `forms` list (it won't; it's a brand-new name).

- [ ] **Step 7: Commit**

```bash
git add "zoho-export/parsed/forms/Capacity_Days.json" server/modules/fulfillment/index.mjs tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): add Capacity_Days form for the manpower calculator"
```

---

## Task 2: `capacityFor(store, date)`

**Files:**
- Modify: `server/modules/fulfillment/sorter.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Consumes: `store`, a `date` string (`'YYYY-MM-DD'`), `policyReader(store)` (existing import from Slice 1).
- Produces: `capacityFor(store, date) -> Promise<{ people: number, boxesPerHour: number, hoursPerDay: number, capacityBoxes: number }>`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fulfillment-sorter.test.js`:

```js
import { capacityFor } from '../server/modules/fulfillment/sorter.mjs';

test('capacityFor: uses the Capacity_Days row for the exact date when one exists', async () => {
  await raw.addRecord('Capacity_Days', { Date: '2026-11-17', People: '5', Boxes_Per_Hour: '10', Hours_Per_Day: '8' });
  const c = await capacityFor(raw, '2026-11-17');
  assert.equal(c.people, 5);
  assert.equal(c.boxesPerHour, 10);
  assert.equal(c.hoursPerDay, 8);
  assert.equal(c.capacityBoxes, 400); // 5 * 10 * 8
});

test('capacityFor: falls back to the most recent earlier Capacity_Days row ("copied from yesterday")', async () => {
  await raw.addRecord('Capacity_Days', { Date: '2026-11-15', People: '3', Boxes_Per_Hour: '9', Hours_Per_Day: '7' });
  const c = await capacityFor(raw, '2026-11-17'); // no row for the 17th
  assert.equal(c.people, 3);
  assert.equal(c.capacityBoxes, 189); // 3 * 9 * 7
});

test('capacityFor: no Capacity_Days row at all falls back to Policy_Settings defaults (4 / 8 / 7)', async () => {
  const c = await capacityFor(raw, '2026-11-17');
  assert.equal(c.people, 4);
  assert.equal(c.boxesPerHour, 8);
  assert.equal(c.hoursPerDay, 7);
  assert.equal(c.capacityBoxes, 224);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: FAIL — `capacityFor is not a function`.

- [ ] **Step 3: Implement `capacityFor()`**

In `server/modules/fulfillment/sorter.mjs`, add near the top (after the existing imports, since it needs `policyReader` which is already imported):

```js
// Capacity for a date (05/02 §1): the Capacity_Days row for that date, else the most recent earlier row
// ("or copied from yesterday"), else the Policy_Settings defaults.
export async function capacityFor(store, date) {
  const rows = await store.find('Capacity_Days');
  const exact = rows.find((r) => text(r.Date) === date);
  const row = exact || rows.filter((r) => text(r.Date) !== '' && text(r.Date) < date).sort((a, b) => (a.Date < b.Date ? 1 : -1))[0];
  const policy = await policyReader(store);
  const people = row ? toNum(row.People) : (Number(policy('fulfillment_default_people')) || 4);
  const boxesPerHour = row ? toNum(row.Boxes_Per_Hour) : (Number(policy('fulfillment_boxes_per_hour')) || 8);
  const hoursPerDay = row ? toNum(row.Hours_Per_Day) : (Number(policy('fulfillment_hours_per_day')) || 7);
  return { people, boxesPerHour, hoursPerDay, capacityBoxes: people * boxesPerHour * hoursPerDay };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/modules/fulfillment/sorter.mjs tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): capacityFor() reads today's capacity with a yesterday/settings fallback"
```

---

## Task 3: `rankAndCutLine` — separate WIP from the release walk

**Files:**
- Modify: `server/modules/fulfillment/sorter.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Consumes: the same `entries` shape as before (`{ sof, category, priorityReason }`), now relying on `e.sof.Fulfillment_Stage` to classify WIP vs. not-yet-released.
- Produces: `rankAndCutLine(entries, { capacityBoxes }) -> Array<{ sof, category, priorityReason, queueRank, suggestedRelease }>` — **signature change**: `policy` is removed (the flat `fulfillment_cut_line_boxes` setting is gone, replaced entirely by `capacityBoxes`); `capacityBoxes` is required (no silent default — the caller always has a real value from `capacityFor`).

- [ ] **Step 1: Write the failing tests**

Replace the existing cut-line test in `tests/fulfillment-sorter.test.js` (the one titled `'rankAndCutLine: cut line marks suggested_release up to the box-count setting...'`) and the determinism test's call signature, and add new WIP-specific tests. First, update the `entry()` helper to carry a stage:

```js
function entry(so, { created, target, items = [{ Quantity: '1' }], category = 'on_time', stage = 'Order Readiness' } = {}) {
  return { sof: { SO_No: so, SO_Created_Date: created, target_delivery_date: target, Item_Details1: items, Fulfillment_Stage: stage }, category, priorityReason: 'x' };
}
```

Update every existing call to `rankAndCutLine(entries, { policy: () => null })` in this file to `rankAndCutLine(entries, { capacityBoxes: 50 })` (50 matches the old flat default, so the existing ranking-order assertions in those tests keep passing unchanged — only the cut-line-specific test and the new WIP tests below actually exercise different capacity numbers).

Replace the old cut-line test:

```js
test('rankAndCutLine: cut line marks suggested_release up to free capacity, using effectiveBoxes as the box count', () => {
  const entries = [
    entry('SO-1', { created: '2026-11-01', items: [{ Quantity: '5' }] }),
    entry('SO-2', { created: '2026-11-02', items: [{ Quantity: '5' }] }),
    entry('SO-3', { created: '2026-11-03', items: [{ Quantity: '5' }] }),
  ];
  // capacity 8: SO-1 (5) fits (0 < 8), SO-2 (5) fits (5 < 8), SO-3 (5) does not (10 >= 8)
  const out = rankAndCutLine(entries, { capacityBoxes: 8 });
  assert.deepEqual(out.map((e) => [e.sof.SO_No, e.suggestedRelease]), [['SO-1', true], ['SO-2', true], ['SO-3', false]]);
});

test('rankAndCutLine: a WIP-stage entry (Picking/Pack & QC/Crate/Order Aggregation) never gets suggestedRelease and never consumes capacity twice', () => {
  const entries = [
    entry('SO-1', { created: '2026-11-01', items: [{ Quantity: '100' }], stage: 'Picking' }), // huge WIP box count
    entry('SO-2', { created: '2026-11-02', items: [{ Quantity: '5' }], stage: 'Order Readiness' }),
  ];
  // Free capacity = 200 (capacityBoxes) - 100 (WIP) = 100, plenty of room left for SO-2's 5 boxes.
  const out = rankAndCutLine(entries, { capacityBoxes: 200 });
  const so1 = out.find((e) => e.sof.SO_No === 'SO-1');
  const so2 = out.find((e) => e.sof.SO_No === 'SO-2');
  assert.equal(so1.suggestedRelease, false); // WIP: already released, never re-suggested
  assert.equal(so2.suggestedRelease, true); // free capacity (100) comfortably covers its 5 boxes
  assert.ok(Number.isInteger(so1.queueRank) && Number.isInteger(so2.queueRank)); // both still ranked for display
});

test('rankAndCutLine: WIP exceeding capacity floors free capacity at 0 — nothing new is suggested, without throwing', () => {
  const entries = [
    entry('SO-1', { created: '2026-11-01', items: [{ Quantity: '999' }], stage: 'Crate' }),
    entry('SO-2', { created: '2026-11-02', items: [{ Quantity: '1' }], stage: 'Order Readiness' }),
  ];
  const out = rankAndCutLine(entries, { capacityBoxes: 10 }); // WIP alone (999) already blows past capacity (10)
  const so2 = out.find((e) => e.sof.SO_No === 'SO-2');
  assert.equal(so2.suggestedRelease, false);
});
```

Also update the determinism test's two `rankAndCutLine` calls to pass `{ capacityBoxes: 50 }` instead of `{ policy: () => null }`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: FAIL — the rewritten cut-line tests fail against the old implementation (old signature ignores `capacityBoxes` entirely and still reads a `policy` that is no longer passed, so `cutLine` silently becomes the hardcoded `|| 50` fallback — some assertions will coincidentally pass and others won't; confirm at least the two new WIP-specific tests fail, since the old code has no WIP-exclusion logic at all).

- [ ] **Step 3: Implement the revised `rankAndCutLine`**

Replace the existing `rankAndCutLine` function in `server/modules/fulfillment/sorter.mjs`:

```js
import { STAGE_ORDER } from './pipeline.mjs';

const WIP_STAGES = new Set(STAGE_ORDER.slice(STAGE_ORDER.indexOf('Picking'), STAGE_ORDER.indexOf('Order Aggregation') + 1));
const isWip = (sof) => WIP_STAGES.has(text(sof.Fulfillment_Stage));

export function rankAndCutLine(entries, { capacityBoxes }) {
  const sorted = entries.slice().sort(compare);
  const wipBoxes = sorted.filter((e) => isWip(e.sof)).reduce((n, e) => n + effectiveBoxes(e.sof), 0);
  const freeCapacity = Math.max(0, capacityBoxes - wipBoxes);
  let used = 0;
  return sorted.map((e, i) => {
    if (isWip(e.sof)) return { ...e, queueRank: i + 1, suggestedRelease: false };
    const boxes = effectiveBoxes(e.sof);
    const fitsBefore = used < freeCapacity;
    used += boxes;
    return { ...e, queueRank: i + 1, suggestedRelease: fitsBefore };
  });
}
```

This replaces the old `const cutLine = Number(policy('fulfillment_cut_line_boxes')) || 50;` line entirely — the flat setting is gone, not kept as a fallback (the design doc's whole point is to stop using it).

- [ ] **Step 4: Update `scoreAllOpenPackages` to supply `capacityBoxes`**

Find `scoreAllOpenPackages` in the same file and change its `rankAndCutLine(entries, { policy })` call:

**Confirmed (read during plan-writing):** `server/criteria.mjs` exports `today()`, returning exactly `YYYY-MM-DD` (no time component) — the right function here, not `zohoNow()` (which includes a time and would need slicing). Import it alongside the existing `zohoNow` import in `sorter.mjs`.

```js
import { zohoNow, today } from '../../criteria.mjs';

async function scoreAllOpenPackages(store) {
  const [sofs, gates, exceptions, policy, capacity] = await Promise.all([
    store.find(SOF_NAME, (r) => OPEN_STAGE(r.Fulfillment_Stage)),
    store.find('Sales_Order_Readiness_Gate'),
    store.find('Exception_Control1'),
    policyReader(store),
    capacityFor(store, today()),
  ]);
  const openExceptions = exceptions.filter((e) => OPEN_EXCEPTION_STATUSES.has(text(e.Status)));
  const now = new Date();
  const entries = sofs.map((sof) => ({ sof, ...categorize(sof, { gates, openExceptions, now, policy }) }));
  return rankAndCutLine(entries, { capacityBoxes: capacity.capacityBoxes });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS, all tests green.

- [ ] **Step 6: Run the hooks test file too — rescoreAll's end-to-end path now depends on capacityFor**

Run: `node --test tests/fulfillment-sorter-hooks.test.js`
Expected: PASS. If any test fails because it asserted a specific `Suggested_Release` value that depended on the old flat 50-box default, update that assertion to account for the new default capacity (4 × 8 × 7 = 224) rather than loosening the test's intent.

- [ ] **Step 7: Run the full fulfillment suite**

Run: `node --test tests/fulfillment-*.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/modules/fulfillment/sorter.mjs tests/fulfillment-sorter.test.js tests/fulfillment-sorter-hooks.test.js
git commit -m "feat(fulfillment): rankAndCutLine uses real capacity minus WIP instead of a flat setting"
```

---

## Task 4: `backlogDays()` and `peopleNeeded()`

**Files:**
- Modify: `server/modules/fulfillment/sorter.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Produces: `backlogDays(openBoxes, capacityBoxes) -> number`; `peopleNeeded(openBoxesDue, capacityBoxes, daysAvailable) -> number`. Both pure arithmetic, no store access — callers (widgets, via a later task or a follow-up) compute `openBoxes`/`openBoxesDue` themselves from `effectiveBoxes()` over whatever package set they care about.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fulfillment-sorter.test.js`:

```js
import { backlogDays, peopleNeeded } from '../server/modules/fulfillment/sorter.mjs';

test('backlogDays: open_boxes / (people * boxes_per_hour * hours_per_day)', () => {
  // 224 open boxes, capacity 4*8*7=224 boxes/day -> exactly 1 day
  assert.equal(backlogDays(224, 224), 1);
  assert.equal(backlogDays(448, 224), 2);
});

test('backlogDays: zero capacity does not throw or return Infinity silently — returns 0 when there are no open boxes, Infinity when there are', () => {
  assert.equal(backlogDays(0, 0), 0);
  assert.equal(backlogDays(10, 0), Infinity);
});

test('peopleNeeded: open_boxes_due / (boxes_per_hour * hours_per_day * days_available)', () => {
  // spec\'s own example figures: to clear a known backlog in 3 days at 8/hr * 7hr/day
  assert.equal(peopleNeeded(168, 8 * 7, 3), 1); // 168 / (56 * 3) = 1
  assert.equal(peopleNeeded(672, 8 * 7, 3), 4); // 672 / (56 * 3) = 4
});
```

Note: `peopleNeeded`'s second argument is `boxesPerHour * hoursPerDay` (people-independent throughput per worker), not the full `capacityBoxes` (which already includes a people count) — matching the spec's own formula `people_needed = open_boxes_due ÷ (boxes_per_hour × hours_per_day × days_available)`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: FAIL — `backlogDays is not a function`.

- [ ] **Step 3: Implement both functions**

Add to `server/modules/fulfillment/sorter.mjs`, near `rankAndCutLine`:

```js
// backlog_days = open_boxes / (people * boxes_per_hour * hours_per_day) — the spec's Fulfillment manpower
// calculator (05/02 §1). capacityBoxes is already people * boxesPerHour * hoursPerDay (capacityFor's own output).
export function backlogDays(openBoxes, capacityBoxes) {
  if (openBoxes === 0) return 0;
  if (capacityBoxes === 0) return Infinity;
  return openBoxes / capacityBoxes;
}

// people_needed = open_boxes_due / (boxes_per_hour * hours_per_day * days_available)
export function peopleNeeded(openBoxesDue, perPersonDailyBoxes, daysAvailable) {
  if (openBoxesDue === 0) return 0;
  if (perPersonDailyBoxes === 0 || daysAvailable === 0) return Infinity;
  return openBoxesDue / (perPersonDailyBoxes * daysAvailable);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS

- [ ] **Step 5: Run the full fulfillment suite one more time**

Run: `node --test tests/fulfillment-*.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/modules/fulfillment/sorter.mjs tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): backlogDays() and peopleNeeded() calculators"
```

---

## Task 5: Order Readiness capacity bar

**Files:**
- Modify: `modules/Fulfillment/Order Readiness/app/index.html`

**Interfaces:**
- Consumes: the `sofQueueMap` join already built in Slice 1's Task 7 (SO + Package → Sales_Order_Fulfillment row, including `Suggested_Release`), plus a new fetch of today's `Capacity_Days` row for the editable people input.
- Produces: no exports — manual verification only (same limitation noted in Slices 1 and 4: no browser tool available this session, state that explicitly rather than claiming it was checked).

- [ ] **Step 1: Add a capacity bar section to the list view**

Near the category tabs added in Slice 1 (`<div id="categoryTabs">`), add a sibling bar:

```html
<div id="capacityBar" class="bg-white rounded-2xl border border-slate-200 shadow-card px-5 py-4 mb-4 flex flex-wrap items-center gap-4 text-sm"></div>
```

- [ ] **Step 2: Fetch today's Capacity_Days row and compute the bar's numbers**

Add, near `fetchSofQueue` (Slice 1's Task 7):

```js
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fetchTodayCapacity() {
  return ZOHO.CREATOR.DATA.getRecords({
    app_name: CONFIG.APP_NAME, report_name: "Capacity_Days", field_config: "all", max_records: 1,
    criteria: `(Date == "${todayDateStr()}")`,
  }).then((response) => (response && response.data && response.data[0]) || null).catch(() => null);
}
```

**Confirmed (read during plan-writing, `server/model.mjs`'s `formOfReport`):** a `report_name` that has no entry in `reports.json` but matches a real form name resolves to that form directly (`formOfReport` falls back to `columns[reportName]` when `reports[reportName]` doesn't exist). So `Capacity_Days` — the form name itself — works as the `report_name`/`form_name` everywhere in this task without adding anything to `reports.json`.

- [ ] **Step 3: Render the bar**

```js
function renderCapacityBar(capacityRow) {
  const people = capacityRow ? Number(capacityRow.People) : 4;
  const boxesPerHour = capacityRow ? Number(capacityRow.Boxes_Per_Hour) : 8;
  const hoursPerDay = capacityRow ? Number(capacityRow.Hours_Per_Day) : 7;
  const capacityBoxes = people * boxesPerHour * hoursPerDay;
  const suggestedBoxes = allRecords.filter((r) => isTrue(sofQueueFor(r).Suggested_Release)).length; // count of suggested rows as a proxy; refine to a real box sum if Item_Details1 quantities are available on these rows
  document.getElementById("capacityBar").innerHTML = `
    <label class="flex items-center gap-1.5 font-medium text-slate-600">People today:
      <input id="capacityPeopleInput" type="number" min="0" value="${people}" class="w-16 border border-slate-200 rounded px-2 py-1 text-sm" />
    </label>
    <span class="text-slate-500">× ${boxesPerHour} boxes/hr × ${hoursPerDay} hrs = <strong>${capacityBoxes} boxes capacity</strong></span>
    <span class="text-slate-500">Suggested today: <strong>${suggestedBoxes}</strong></span>
  `;
  document.getElementById("capacityPeopleInput").addEventListener("change", (ev) => {
    const n = parseInt(ev.target.value, 10);
    if (!Number.isFinite(n) || n < 0) return;
    saveTodayPeople(n, capacityRow);
  });
}

// Confirmed (read during plan-writing, server/pg/api.mjs's updateRecords handler): a criteria that matches
// zero rows THROWS (ZohoError 9280 "No records found"), it does not resolve with an empty data array. So this
// checks for an existing row (the same `capacityRow` already fetched for the bar, passed in) and only calls
// updateRecords when one exists; otherwise it creates one directly — no error-path reliance at all.
function saveTodayPeople(n, existingRow) {
  if (existingRow) {
    ZOHO.CREATOR.DATA.updateRecords({
      app_name: CONFIG.APP_NAME, report_name: "Capacity_Days",
      payload: { criteria: `(Date == "${todayDateStr()}")`, data: { People: String(n) } },
    }).then((response) => {
      if (response && response.code === 3000) toast("Updated.", "success");
      else toast("Couldn't update today's capacity.", "error");
    });
  } else {
    // addRecords takes form_name, not report_name (confirmed during plan-writing against server/pg/api.mjs
    // and real widget usage, e.g. the Inquiry List and New Customer widgets' own addRecords calls).
    ZOHO.CREATOR.DATA.addRecords({
      app_name: CONFIG.APP_NAME, form_name: "Capacity_Days",
      payload: { data: { Date: todayDateStr(), People: String(n), Boxes_Per_Hour: "8", Hours_Per_Day: "7" } },
    }).then((response) => {
      if (response && response.code === 3000) toast("Capacity set for today.", "success");
      else toast("Couldn't save today's capacity.", "error");
    });
  }
}
```

- [ ] **Step 4: Wire the fetch and render into `loadLive()`**

In `loadLive()` (Slice 1's version, which already does `Promise.all([fetchAllRecords(), fetchSofQueue()])`), add the capacity fetch to the same `Promise.all` and call `renderCapacityBar` after it resolves:

```js
Promise.all([fetchAllRecords(), fetchSofQueue(), fetchTodayCapacity()]).then(([records, sofRecords, capacityRow]) => {
  allRecords = records;
  sofQueueMap = new Map(sofRecords.map((s) => [sofQueueKey(s.SO_No, s.Package), s]));
  renderCapacityBar(capacityRow);
  return applyAutoPriority(allRecords);
}).then(() => { ... });
```

- [ ] **Step 5: Syntax-check the file**

Run the same inline-script syntax check pattern used in Slices 1 and 4, pointed at this file.
Expected: `all script blocks parse OK, count: <N>`

- [ ] **Step 6: Manual verification**

Open Order Readiness, confirm the capacity bar shows people/boxes-per-hour/hours and the computed capacity, changing the people input saves and persists on reload. State explicitly if no browser is available this session.

- [ ] **Step 7: Commit**

```bash
git add "modules/Fulfillment/Order Readiness/app/index.html"
git commit -m "feat(fulfillment): Order Readiness capacity bar with editable people count"
```

---

## Task 6: Fulfillment Dashboard — backlog days

**Files:**
- Modify: `modules/Fulfillment/Fulfillment Dashboard/app/index.html`

**Interfaces:**
- Consumes: the dashboard's existing `Sales_Order_Fulfillment_Report` fetch (confirmed present from this session's earlier reading of this widget) to sum open boxes, plus a `Capacity_Days` fetch for today's capacity.
- Produces: no exports — manual verification only.

- [ ] **Step 1: Confirm the dashboard's existing data shape**

Run: `grep -n "SOF_REPORT\|results\[0\]\|setRaw" "modules/Fulfillment/Fulfillment Dashboard/app/index.html"` to find exactly where the SOF records this widget already fetches are stored, so the backlog figure reuses that fetch rather than adding a duplicate one.

- [ ] **Step 2: Compute and display backlog days**

Add a small stat alongside the dashboard's existing stat cards (found during plan-writing at whatever component renders `notStarted`/`inProgress`/`delivered` — reuse that same rendering pattern):

```js
const openBoxes = raw.sof.filter((r) => r.Fulfillment_Stage !== "For Delivery").reduce((n, r) => n + (r.Item_Details1 || []).reduce((m, row) => m + (parseFloat(row.Quantity) || 0), 0), 0);
// Backlog days needs today's real capacity; fetch Capacity_Days the same way Task 5's Order Readiness bar does,
// or fall back to the 4/8/7 defaults if no row exists for today — do not hardcode a different default here.
```

Wire this into whatever existing fetch/render cycle this dashboard already uses (confirmed by Step 1), following its established pattern rather than introducing a new one.

- [ ] **Step 3: Syntax-check the file**

Same pattern as prior tasks.

- [ ] **Step 4: Manual verification**

Open the Fulfillment Dashboard, confirm a backlog-days figure appears and changes sensibly when Capacity_Days or open package counts change. State explicitly if no browser is available.

- [ ] **Step 5: Commit**

```bash
git add "modules/Fulfillment/Fulfillment Dashboard/app/index.html"
git commit -m "feat(fulfillment): Fulfillment Dashboard shows backlog days"
```

---

## Self-Review Notes

- Spec coverage: both formulas (backlogDays, peopleNeeded) — Task 4. Cut line with WIP subtraction — Task 3. Capacity_Days table + yesterday/settings fallback — Tasks 1–2. Capacity bar + editable people + crew-sizing surfacing — Task 5 (crew-sizing line itself is a small addition left for whoever executes Task 5 to add alongside the bar, using `peopleNeeded` from Task 4 — not spelled out as its own task since it's a one-line read of an already-built function, consistent with not padding the plan with trivial steps).
- The WIP-exclusion correction (found during plan-writing, before Task 3 was drafted) is already reflected in the committed design doc, so plan and spec agree — not a last-minute deviation.
- `assign_batch_boxes`'s non-use, Delivery/Procurement calculators, and stamp-derived `boxes_per_hour` are named exclusions in the design doc, not silently dropped here.
- Three real unknowns were resolved during plan-writing rather than guessed: (1) a report name for a brand-new form needs no `reports.json` entry — `formOfReport` falls back to the form name itself; (2) `updateRecords` throws (does not resolve empty) when its criteria matches zero rows, so Task 5's upsert checks for an existing row first instead of relying on an error path; (3) `addRecords` takes `form_name`, not `report_name` — confirmed against real widget usage. Task 6 still leaves the dashboard's exact existing fetch-variable names to be read at execution time, since this plan was not written having opened that file's current state in full.
