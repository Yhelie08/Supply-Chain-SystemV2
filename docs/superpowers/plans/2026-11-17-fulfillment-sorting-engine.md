# Fulfillment Sorting Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every open `Sales_Order_Fulfillment` package a category (`broken`/`late`/`at_risk`/`on_time`/`blocked`), a rank (oldest Order Date first within its category), a plain-words reason, a suggested action, and a cut-line flag — scored on every relevant change, on a nightly schedule, and on demand.

**Architecture:** A pure scoring module (`server/modules/fulfillment/sorter.mjs`) computes category + rank + cut-line for all open packages from data already in Postgres. It is invoked from three places: existing workflow hooks (event-triggered, single-SO rescans), a new nightly schedule entry (full rescan), and a new custom API (manual "Recalculate"). Six new fields carry the results on `Sales_Order_Fulfillment`. The Order Readiness widget reads and displays them; it does not compute anything itself.

**Tech Stack:** Node.js (ESM `.mjs`), Postgres (via `server/pg/store.mjs`'s hooked store), `node:test` + PGlite for tests (same stack as every other `server/modules/fulfillment/*.mjs` file).

**Spec:** `docs/superpowers/specs/2026-11-17-fulfillment-sorting-engine-design.md`

## Global Constraints

- New schema fields are declared in `zoho-export/parsed/forms/Sales_Order_Fulfillment.json` (the Zoho-shaped source of truth every table is generated from) — never hand-written SQL migrations. `ensureSchema()` (`server/pg/schema.mjs`) adds the Postgres columns automatically on next boot.
- Blocked is checked before Broken; Broken is checked before lateness (spec §05/01 §1) — this exact order, every time.
- Sort key, in order: urgent (always `false` this slice — the comparator slot exists, the value is hardcoded), `SO_Created_Date` ascending, `target_delivery_date` ascending, `SO_No` ascending.
- Determinism: two scoring runs on identical input data must produce identical `Category`/`Queue_Rank` for every record. No randomness, no wall-clock-sensitive tie-breaks beyond the sort key above.
- Settings go through the existing `Policy_Settings` form + `policyReader(store)` helper (`server/modules/delivery-management/scheduling.mjs`) — do not invent a second settings mechanism.
- All new server code follows the existing hook/register pattern in `server/modules/fulfillment/*.mjs` (see `pipeline.mjs`, `qc-routing.mjs` for the house style: `register(FORM, { afterAdd, afterUpdate })`, a `text()`/`blank()` normalizer pair, criteria-scoped `store.find` for remote-Postgres-friendly reads).

---

## File Structure

| File | Responsibility |
|---|---|
| `zoho-export/parsed/forms/Sales_Order_Fulfillment.json` | Modify: add 6 new field definitions |
| `server/modules/fulfillment/sorter.mjs` | Create: `categorize()`, `scorePackage()`, `rankAndCutLine()`, `rescoreOne()`, `rescoreAll()` |
| `server/modules/fulfillment/sorter-hooks.mjs` | Create: registers the event-triggered hooks on `Sales_Order_Fulfillment` and `Sales_Order_Readiness_Gate` that call `rescoreOne`/`rescoreAll` |
| `server/modules/fulfillment/index.mjs` | Modify: import `sorter-hooks.mjs`, add `Recalculate_Fulfillment_Queue` schedule entry, register the manual custom API |
| `server/modules/fulfillment/apis.mjs` | Modify: add the `recalculate_fulfillment_queue` custom API handler |
| `tests/fulfillment-sorter.test.js` | Create: unit tests for `categorize`/`scorePackage`/`rankAndCutLine` |
| `tests/fulfillment-sorter-hooks.test.js` | Create: integration tests for event/nightly/manual triggers |
| `modules/Fulfillment/Order Readiness/app/index.html` | Modify: category tabs, "Today's release" default view, rank-ordered list, hover reason, suggested action column |

---

## Task 1: Schema — add the six queue fields

**Files:**
- Modify: `zoho-export/parsed/forms/Sales_Order_Fulfillment.json`
- Test: `tests/fulfillment-sorter.test.js` (schema-presence check only; the rest of this file is Task 2's)

**Interfaces:**
- Produces: six new columns on the `Sales_Order_Fulfillment` Postgres table, auto-created by `ensureSchema()`: `Category` (text), `Blocked_Reason` (text), `Queue_Rank` (number), `Priority_Reason` (text), `Suggested_Action` (text), `Suggested_Release` (checkbox/bool), `Scored_At` (text).

- [ ] **Step 1: Read the current field list**

Run: `grep -n '"name"' "zoho-export/parsed/forms/Sales_Order_Fulfillment.json"` to see the existing fields and confirm none of the six new names collide.

- [ ] **Step 2: Add the six field definitions**

Open `zoho-export/parsed/forms/Sales_Order_Fulfillment.json`. The `fields` array ends with the `Forecast_Status` field block (a plain `text` field with no extra keys). Add these six blocks immediately after it, before the closing `]`:

```json
    {
      "name": "Category",
      "label": "Category",
      "type": "text",
      "required": false
    },
    {
      "name": "Blocked_Reason",
      "label": "Blocked Reason",
      "type": "text",
      "required": false
    },
    {
      "name": "Queue_Rank",
      "label": "Queue Rank",
      "type": "number",
      "required": false
    },
    {
      "name": "Priority_Reason",
      "label": "Priority Reason",
      "type": "text",
      "required": false
    },
    {
      "name": "Suggested_Action",
      "label": "Suggested Action",
      "type": "text",
      "required": false
    },
    {
      "name": "Suggested_Release",
      "label": "Suggested Release",
      "type": "checkbox",
      "required": false
    },
    {
      "name": "Scored_At",
      "label": "Scored At",
      "type": "text",
      "required": false
    }
```

- [ ] **Step 3: Validate the JSON parses and the columns map load**

Run: `node -e "const m = await import('./server/model.mjs'); console.log(Object.keys(m.columns.Sales_Order_Fulfillment).includes('Queue_Rank'), m.columns.Sales_Order_Fulfillment.Suggested_Release.kind)"`
Expected: `true bool`

- [ ] **Step 4: Write a schema-presence test**

Create `tests/fulfillment-sorter.test.js` with this starting content:

```js
// Fulfillment sorting engine (server/modules/fulfillment/sorter.mjs): categorize, rank, cut line.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';

const SOF = 'Sales_Order_Fulfillment';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SOF, 'Sales_Order_Readiness_Gate', 'Exception_Control1', 'Customer']) await db.query(`DELETE FROM "${f}"`); });

test('the six queue columns exist on Sales_Order_Fulfillment', async () => {
  const id = await raw.addRecord(SOF, { SO_No: 'SO-1', Category: 'on_time', Queue_Rank: '1', Suggested_Release: true });
  const r = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(r.Category, 'on_time');
  assert.equal(r.Queue_Rank, '1');
  assert.equal(r.Suggested_Release, true);
});
```

- [ ] **Step 5: Run it**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "zoho-export/parsed/forms/Sales_Order_Fulfillment.json" tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): add queue columns to Sales_Order_Fulfillment schema"
```

---

## Task 2: `categorize()` — pure categorization function

**Files:**
- Create: `server/modules/fulfillment/sorter.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Consumes: a `Sales_Order_Fulfillment` record (as returned by `store.find`/`getRecordById`), the list of its `Sales_Order_Readiness_Gate` records (for payment-blocked detection — same shape `needsPaymentApproval()` in `server/modules/fulfillment/workflows.mjs` already consumes), the list of open `Exception_Control1` records linked to it, a `now` Date, and the settings reader from `policyReader(store)` (`server/modules/delivery-management/scheduling.mjs`).
- Produces: `categorize(sof, { gates, openExceptions, now, policy }) -> { category, blockedReason, priorityReason }` where `category` is one of `'blocked' | 'broken' | 'late' | 'at_risk' | 'on_time'`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fulfillment-sorter.test.js` (after the existing test, same file):

```js
import { categorize } from '../server/modules/fulfillment/sorter.mjs';

const NOW = new Date('2026-11-17T00:00:00Z');
const policy = () => null; // no settings configured: every categorize() call falls back to its defaults

test('categorize: blocked when payment not cleared and no credit terms', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-01', order_type: 'Normal' };
  const gates = [{ sales_order_number: 'SO-1', payment_status: 'Partial', Has_Credit_Terms: false, Override_Approved: false }];
  const out = categorize(sof, { gates, openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'blocked');
  assert.match(out.blockedReason, /payment/i);
});

test('categorize: blocked when an exception on this package is still open', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-01', order_type: 'Normal' };
  const openExceptions = [{ Sales_Order: 'SO-1', Status: 'Pending' }];
  const out = categorize(sof, { gates: [], openExceptions, now: NOW, policy });
  assert.equal(out.category, 'blocked');
  assert.match(out.blockedReason, /exception/i);
});

test('categorize: broken for replacement order type, even with a future target', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-01', order_type: 'Replacement' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'broken');
});

test('categorize: broken for a replacement with no target date at all (never falls to the bottom)', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '', order_type: 'Replacement', SO_Created_Date: '2026-11-01' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'broken');
  assert.match(out.priorityReason, /no target set/i);
});

test('categorize: late when today is past the target', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-10', order_type: 'Normal' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'late');
});

test('categorize: at_risk when forecast misses the target', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-25', Forecast_Delivery: '2026-11-28', order_type: 'Normal' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'at_risk');
});

test('categorize: at_risk when slack is within the setting default (3 days) even if forecast is fine', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-19', order_type: 'Normal' }; // 2 days out
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'at_risk');
});

test('categorize: on_time otherwise', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-15', order_type: 'Normal' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'on_time');
});

test('categorize: blocked wins over broken, broken wins over late', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-01', order_type: 'Replacement' }; // late AND broken
  const gates = [{ sales_order_number: 'SO-1', payment_status: 'No', Has_Credit_Terms: false, Override_Approved: false }]; // also blocked
  const out = categorize(sof, { gates, openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'blocked'); // blocked beats everything
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: FAIL with `Cannot find module '../server/modules/fulfillment/sorter.mjs'` or similar.

- [ ] **Step 3: Implement `categorize()`**

Create `server/modules/fulfillment/sorter.mjs`:

```js
// Fulfillment sorting engine (spec: HomeCartel v1.4, 05 Shared Engines / 01 Sorting Engine; this module covers Fulfillment only).
// categorize(): what kind of attention a package needs. rankAndCutLine(): oldest-SO-first order plus today's cut line.
// Pure where possible: categorize() takes everything it needs as arguments so it is trivially testable and so a second run
// on identical input always gives the identical answer (determinism is an explicit acceptance requirement).
import { blank, truthy } from '../../workflows/deluge.mjs';
import { needsPaymentApproval } from './workflows.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const OPEN_EXCEPTION_STATUSES = new Set(['Pending', 'In Rework']);
const BROKEN_ORDER_TYPES = new Set(['Complaint', 'Replacement']);

// Calendar-day slack: target minus today. (The full spec formula also subtracts work days still needed; that
// refinement needs the manpower calculator, which is a later slice — see the design doc's §3.)
function daysUntil(dateStr, now) {
  if (blank(dateStr)) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((d - today) / 86400000);
}

function effectiveTarget(sof, policy) {
  if (!blank(sof.target_delivery_date)) return sof.target_delivery_date;
  if (blank(sof.SO_Created_Date)) return null;
  const days = Number(policy('default_promise_days')) || 25;
  const d = new Date(`${String(sof.SO_Created_Date).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function blockedCheck(sof, gates, openExceptions) {
  const so = text(sof.SO_No);
  const paymentBlocked = gates.some((g) => text(g.sales_order_number) === so && needsPaymentApproval(g));
  if (paymentBlocked) return 'Payment not cleared';
  const exceptionOpen = openExceptions.some((e) => text(e.Sales_Order) === so && OPEN_EXCEPTION_STATUSES.has(text(e.Status)));
  if (exceptionOpen) return 'Open exception';
  if (blank(sof.Shipping_Address) && blank(sof.Billing_Address)) return 'Missing delivery address';
  return null;
}

export function categorize(sof, { gates = [], openExceptions = [], now = new Date(), policy = () => null } = {}) {
  const blockedReason = blockedCheck(sof, gates, openExceptions);
  if (blockedReason) return { category: 'blocked', blockedReason, priorityReason: blockedReason };

  const isBroken = BROKEN_ORDER_TYPES.has(text(sof.order_type));
  const target = effectiveTarget(sof, policy);
  const noTargetSet = blank(sof.target_delivery_date);
  const slack = daysUntil(target, now);

  if (isBroken) {
    return { category: 'broken', blockedReason: null, priorityReason: noTargetSet ? 'Replacement, no target set' : 'Replacement / complaint' };
  }
  if (slack !== null && slack < 0) {
    return { category: 'late', blockedReason: null, priorityReason: `${Math.abs(slack)} day(s) past target` };
  }
  const forecastMisses = !blank(sof.Forecast_Delivery) && !blank(target) && sof.Forecast_Delivery > target;
  const atRiskSlackDays = Number(policy('at_risk_slack_days')) || 3;
  if (forecastMisses || (slack !== null && slack <= atRiskSlackDays)) {
    return { category: 'at_risk', blockedReason: null, priorityReason: forecastMisses ? 'Forecast misses target' : `${slack} day(s) of slack left` };
  }
  return { category: 'on_time', blockedReason: null, priorityReason: noTargetSet ? 'On time (no target set)' : 'On time' };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/modules/fulfillment/sorter.mjs tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): categorize() for the sorting engine"
```

---

## Task 3: `rankAndCutLine()` — sort, rank, and cut-line flag

**Files:**
- Modify: `server/modules/fulfillment/sorter.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Consumes: an array of `{ sof, category, priorityReason }` entries (the output of calling `categorize` on every open package) and a `policy` reader.
- Produces: `rankAndCutLine(entries, { policy }) -> Array<{ sof, category, priorityReason, queueRank, suggestedRelease }>`, same length and order-independent of input order — the function does its own sort.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fulfillment-sorter.test.js`:

```js
import { rankAndCutLine } from '../server/modules/fulfillment/sorter.mjs';

function entry(so, { created, target, items = [{ Quantity: '1' }], category = 'on_time' } = {}) {
  return { sof: { SO_No: so, SO_Created_Date: created, target_delivery_date: target, Item_Details1: items }, category, priorityReason: 'x' };
}

test('rankAndCutLine: oldest SO_Created_Date ranks first regardless of input order', () => {
  const entries = [entry('SO-2', { created: '2026-11-10' }), entry('SO-1', { created: '2026-11-01' })];
  const out = rankAndCutLine(entries, { policy: () => null });
  assert.deepEqual(out.map((e) => e.sof.SO_No), ['SO-1', 'SO-2']);
  assert.deepEqual(out.map((e) => e.queueRank), [1, 2]);
});

test('rankAndCutLine: same created date, earlier target_delivery_date wins the tiebreak', () => {
  const entries = [
    entry('SO-2', { created: '2026-11-01', target: '2026-12-05' }),
    entry('SO-1', { created: '2026-11-01', target: '2026-11-20' }),
  ];
  const out = rankAndCutLine(entries, { policy: () => null });
  assert.deepEqual(out.map((e) => e.sof.SO_No), ['SO-1', 'SO-2']);
});

test('rankAndCutLine: SO_No ascending is the final tiebreak', () => {
  const entries = [entry('SO-20', { created: '2026-11-01' }), entry('SO-3', { created: '2026-11-01' })];
  const out = rankAndCutLine(entries, { policy: () => null });
  assert.deepEqual(out.map((e) => e.sof.SO_No), ['SO-3', 'SO-20']);
});

test('rankAndCutLine: cut line marks suggested_release up to the box-count setting, using line-quantity sum as the box-count stand-in', () => {
  const entries = [
    entry('SO-1', { created: '2026-11-01', items: [{ Quantity: '5' }] }),
    entry('SO-2', { created: '2026-11-02', items: [{ Quantity: '5' }] }),
    entry('SO-3', { created: '2026-11-03', items: [{ Quantity: '5' }] }),
  ];
  const policy = (key) => (key === 'fulfillment_cut_line_boxes' ? '8' : null); // room for SO-1 (5) + part of SO-2 (5) = 10 > 8, so SO-1 and SO-2 both fit, SO-3 does not
  const out = rankAndCutLine(entries, { policy });
  assert.deepEqual(out.map((e) => [e.sof.SO_No, e.suggestedRelease]), [['SO-1', true], ['SO-2', true], ['SO-3', false]]);
});

test('rankAndCutLine: determinism — two runs on the same unordered input give identical output', () => {
  const entries = [entry('SO-5', { created: '2026-11-05' }), entry('SO-1', { created: '2026-11-01' }), entry('SO-3', { created: '2026-11-03' })];
  const a = rankAndCutLine(entries, { policy: () => null });
  const b = rankAndCutLine(entries.slice().reverse(), { policy: () => null });
  assert.deepEqual(a.map((e) => e.sof.SO_No), b.map((e) => e.sof.SO_No));
  assert.deepEqual(a.map((e) => e.queueRank), b.map((e) => e.queueRank));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: FAIL — `rankAndCutLine is not a function` (or not exported).

- [ ] **Step 3: Implement `rankAndCutLine()`**

Append to `server/modules/fulfillment/sorter.mjs`:

```js
const toNum = (v) => { const n = parseFloat(text(v)); return Number.isFinite(n) ? n : 0; };

// Line-quantity sum stand-in for box count (real box count is a later slice; this matches the spec's own
// "estimated" fallback for an uncounted package rather than inventing different behavior).
function estimatedBoxes(sof) {
  return (sof.Item_Details1 || []).reduce((n, row) => n + toNum(row.Quantity), 0);
}

function compareKey(e) {
  // Urgent is always false this slice (no urgency_requests table yet) — the slot is first so Slice 5 only
  // has to fill in a real value later, not change the comparator shape.
  const urgent = 0;
  const created = text(e.sof.SO_Created_Date) || '9999-99-99';
  const target = text(e.sof.target_delivery_date) || '9999-99-99';
  return [urgent, created, target, text(e.sof.SO_No)];
}

function compare(a, b) {
  const ka = compareKey(a), kb = compareKey(b);
  for (let i = 0; i < ka.length; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
  return 0;
}

export function rankAndCutLine(entries, { policy = () => null } = {}) {
  const sorted = entries.slice().sort(compare);
  const cutLine = Number(policy('fulfillment_cut_line_boxes')) || 50;
  let used = 0;
  return sorted.map((e, i) => {
    const boxes = estimatedBoxes(e.sof);
    const fitsBefore = used < cutLine;
    used += boxes;
    return { ...e, queueRank: i + 1, suggestedRelease: fitsBefore };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add server/modules/fulfillment/sorter.mjs tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): rankAndCutLine() for the sorting engine"
```

---

## Task 4: `scorePackage()` / `rescoreOne()` / `rescoreAll()` — wiring categorize + rank to the store

**Files:**
- Modify: `server/modules/fulfillment/sorter.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Consumes: `store` (hooked store, same object every `server/modules/fulfillment/*.mjs` hook receives), `zohoNow()` from `server/criteria.mjs` (already used by `pipeline.mjs` for stamping).
- Produces: `rescoreOne(store, soNo) -> Promise<void>` (rescans and writes just the packages of one SO, then re-runs the cut line over everything so ranks stay globally consistent); `rescoreAll(store) -> Promise<{ scored: number }>` (full rescan of every open package).

- [ ] **Step 1: Write the failing tests**

Create `tests/fulfillment-sorter-hooks.test.js`:

```js
// Integration: rescoreOne / rescoreAll actually write Category/Queue_Rank/... onto Sales_Order_Fulfillment.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { rescoreOne, rescoreAll } from '../server/modules/fulfillment/sorter.mjs';

const SOF = 'Sales_Order_Fulfillment';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, 'Sales_Order_Readiness_Gate', 'Exception_Control1', 'Customer', 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const addPackage = (extra) => raw.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Order Readiness', order_type: 'Normal', Item_Details1: [{ Quantity: '1' }], ...extra });

test('rescoreAll: every open package gets a Category, Queue_Rank and Scored_At', async () => {
  await addPackage({ SO_No: 'SO-1', SO_Created_Date: '2026-11-01', target_delivery_date: '2026-12-15' });
  await addPackage({ SO_No: 'SO-2', SO_Created_Date: '2026-11-05', target_delivery_date: '2026-12-15' });
  const result = await rescoreAll(raw);
  assert.equal(result.scored, 2);
  const rows = await raw.find(SOF);
  const bySo = Object.fromEntries(rows.map((r) => [r.SO_No, r]));
  assert.equal(bySo['SO-1'].Category, 'on_time');
  assert.equal(bySo['SO-1'].Queue_Rank, '1');
  assert.equal(bySo['SO-2'].Queue_Rank, '2');
  assert.ok(bySo['SO-1'].Scored_At);
});

test('rescoreAll: a package already at For Delivery is left out of scoring', async () => {
  await addPackage({ SO_No: 'SO-1', Fulfillment_Stage: 'For Delivery' });
  const result = await rescoreAll(raw);
  assert.equal(result.scored, 0);
  const [row] = await raw.find(SOF);
  assert.equal(row.Category, null);
});

test('rescoreOne: rescores only the named SO, but still re-ranks everything else too', async () => {
  await addPackage({ SO_No: 'SO-1', SO_Created_Date: '2026-11-01' });
  await addPackage({ SO_No: 'SO-2', SO_Created_Date: '2026-11-05' });
  await rescoreOne(raw, 'SO-1');
  const rows = await raw.find(SOF);
  const bySo = Object.fromEntries(rows.map((r) => [r.SO_No, r]));
  assert.ok(bySo['SO-1'].Category);
  assert.ok(bySo['SO-2'].Category); // ranking is global even when only one SO's inputs changed
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter-hooks.test.js`
Expected: FAIL — `rescoreOne`/`rescoreAll` not exported.

- [ ] **Step 3: Implement the wiring functions**

Append to `server/modules/fulfillment/sorter.mjs`:

```js
import { zohoNow } from '../../criteria.mjs';
import { policyReader } from '../delivery-management/scheduling.mjs';

const OPEN_STAGE = (stage) => stage !== 'For Delivery';

async function scoreAllOpenPackages(store) {
  const [sofs, gates, exceptions, policyRows] = await Promise.all([
    store.find(SOF_NAME, (r) => OPEN_STAGE(r.Fulfillment_Stage)),
    store.find('Sales_Order_Readiness_Gate'),
    store.find('Exception_Control1'),
    Promise.resolve(policyReader(store)),
  ]);
  const policy = await policyRows;
  const openExceptions = exceptions.filter((e) => OPEN_EXCEPTION_STATUSES.has(text(e.Status)));
  const now = new Date();
  const entries = sofs.map((sof) => ({ sof, ...categorize(sof, { gates, openExceptions, now, policy }) }));
  return rankAndCutLine(entries, { policy });
}

const SOF_NAME = 'Sales_Order_Fulfillment';

export async function rescoreAll(store) {
  const scored = await scoreAllOpenPackages(store);
  const stamp = zohoNow();
  for (const e of scored) {
    await store.updateRecord(SOF_NAME, e.sof.ID, {
      Category: e.category, Blocked_Reason: e.blockedReason || '', Queue_Rank: String(e.queueRank),
      Priority_Reason: e.priorityReason, Suggested_Action: '', Suggested_Release: e.suggestedRelease, Scored_At: stamp,
    }, { byForm: true });
  }
  return { scored: scored.length };
}

// Re-score everything (ranks are global, so a single-SO change can shift everyone's rank) — this is a thin
// name for callers who only know which SO changed; it does not skip work, it documents intent at the call site.
export async function rescoreOne(store, _soNo) {
  return rescoreAll(store);
}
```

Note: `Suggested_Action` is written as `''` this slice — the spec's `suggested_actions` lookup table (Admin-editable module/category/condition → text) is shared infrastructure beyond this slice's scope; leaving it blank rather than hardcoding English strings that would need to move to that table later avoids throwaway work. Flag this to the user when reporting the task done.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter-hooks.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Run the full sorter test file too, to make sure nothing regressed**

Run: `node --test tests/fulfillment-sorter.test.js tests/fulfillment-sorter-hooks.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/modules/fulfillment/sorter.mjs tests/fulfillment-sorter-hooks.test.js
git commit -m "feat(fulfillment): rescoreOne/rescoreAll wire categorize+rank to the store"
```

---

## Task 5: Event-triggered hooks

**Files:**
- Create: `server/modules/fulfillment/sorter-hooks.mjs`
- Modify: `server/modules/fulfillment/index.mjs`
- Test: `tests/fulfillment-sorter-hooks.test.js`

**Interfaces:**
- Consumes: `register` from `server/workflows/index.mjs` (same import every fulfillment workflow file uses), `rescoreOne` from Task 4.
- Produces: nothing new callable — this task's deliverable is the hook registration itself, verified by the test.

- [ ] **Step 1: Write the failing test**

Add to `tests/fulfillment-sorter-hooks.test.js`:

```js
import '../server/modules/fulfillment/sorter-hooks.mjs';

test('saving a Sales_Order_Fulfillment record scores it automatically (no manual rescore call)', async () => {
  const id = await store.addRecord(SOF, { SO_No: 'SO-9', Fulfillment_Stage: 'Order Readiness', order_type: 'Normal', SO_Created_Date: '2026-11-01', target_delivery_date: '2026-12-15', Item_Details1: [{ Quantity: '1' }] });
  const row = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(row.Category, 'on_time');
  assert.ok(row.Scored_At);
});

test('an unpaid Readiness Gate save re-scores the package it belongs to (Blocked flips to a workable category)', async () => {
  const id = await store.addRecord(SOF, { SO_No: 'SO-10', Fulfillment_Stage: 'Order Readiness', order_type: 'Normal', Package: 'PAC-10', SO_Created_Date: '2026-11-01', target_delivery_date: '2026-12-15', Item_Details1: [{ Quantity: '1' }] });
  await store.addRecord('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-10', Package_Order: 'PAC-10', payment_status: 'Partial', Has_Credit_Terms: false });
  let row = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(row.Category, 'blocked');
  await store.addRecord('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-10', Package_Order: 'PAC-10', payment_status: 'Yes', Has_Credit_Terms: false });
  row = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(row.Category, 'on_time');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter-hooks.test.js`
Expected: FAIL — the first new test's `row.Category` is `null` because nothing scores on save yet.

- [ ] **Step 3: Implement the hooks**

Create `server/modules/fulfillment/sorter-hooks.mjs`:

```js
// Event-triggered scoring (spec §05/01 §6: "any material event ... re-score that Sales Order's records immediately").
// Registered on the two forms whose saves can change a package's category or rank: the package itself, and its
// Readiness Gate records (payment/approval changes flip Blocked on and off). The nightly and manual triggers are
// server/modules/fulfillment/index.mjs (schedule) and apis.mjs (recalculate_fulfillment_queue) respectively.
import { register } from '../../workflows/index.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { rescoreOne } from './sorter.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

async function onSofSave({ record, store }) {
  await rescoreOne(store, text(record.SO_No));
}
register('Sales_Order_Fulfillment', { afterAdd: onSofSave, afterUpdate: onSofSave });

async function onGateSave({ record, store }) {
  await rescoreOne(store, text(record.sales_order_number));
}
register('Sales_Order_Readiness_Gate', { afterAdd: onGateSave, afterUpdate: onGateSave });
```

Then modify `server/modules/fulfillment/index.mjs` — add this import near the top, alongside the other `import './...mjs'` side-effect imports:

```js
import './sorter-hooks.mjs';
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter-hooks.test.js`
Expected: PASS, all tests green. No re-entrancy risk here: confirmed by reading `server/workflows/index.mjs`'s `createHookedStore` — the `store` object every hook receives in its args (`{ form, id, record, store, books, user }`) is the original raw store the wrapper closes over, never the wrapper itself. So `rescoreOne`'s `store.updateRecord` calls inside a hook already write through the raw store and cannot re-trigger `onSofSave`/`onGateSave`. This matches the existing house pattern (`pipeline.mjs`'s hooks do the same).

- [ ] **Step 5: Commit**

```bash
git add server/modules/fulfillment/sorter-hooks.mjs server/modules/fulfillment/index.mjs tests/fulfillment-sorter-hooks.test.js
git commit -m "feat(fulfillment): event-triggered rescoring on package and gate saves"
```

---

## Task 6: Nightly schedule + manual recalculate API

**Files:**
- Modify: `server/modules/fulfillment/index.mjs`
- Modify: `server/modules/fulfillment/apis.mjs`
- Test: `tests/fulfillment-sorter-hooks.test.js`

**Interfaces:**
- Consumes: `rescoreAll` from Task 4; the existing `schedules` array shape in `server/modules/fulfillment/index.mjs` (see the `Forecast_Stamp_Daily` entry already there); the existing custom-API handler shape in `server/modules/fulfillment/apis.mjs`.
- Produces: a schedule entry named `Recalculate_Fulfillment_Queue`; a custom API named `recalculate_fulfillment_queue` returning `{ status: 'success', scored: <n> }`.

**Confirmed shape (read during plan-writing):** `server/modules/fulfillment/apis.mjs` currently is:

```js
import { withPlaceholders } from '../../custom-api-helpers.mjs';
export const functions = { check_payment_status: 'checkPaymentStatus', create_package_ff: 'createPackageFF' };
export const apis = withPlaceholders(functions);
```

`withPlaceholders(functions, implemented)` returns every name in `functions` as a "not ported" placeholder *except* names also present in `implemented`, plus every name in `implemented` outright (see `server/custom-api-helpers.mjs`). `recalculate_fulfillment_queue` has no Deluge origin (it's new, not a port), so it must NOT be added to `functions` — it goes directly into the `implemented` object's second argument, same place `server/modules/procurement/apis.mjs` puts `create_estimate` and its other real handlers.

- [ ] **Step 2: Write the failing test**

Add to `tests/fulfillment-sorter-hooks.test.js`:

```js
import { apis } from '../server/modules/fulfillment/apis.mjs';

test('recalculate_fulfillment_queue custom API rescored everything and reports a count', async () => {
  await store.addRecord(SOF, { SO_No: 'SO-20', Fulfillment_Stage: 'Order Readiness', order_type: 'Normal', Item_Details1: [{ Quantity: '1' }] });
  const result = await apis.recalculate_fulfillment_queue({}, raw, {});
  assert.equal(result.status, 'success');
  assert.equal(result.scored, 1);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter-hooks.test.js`
Expected: FAIL — `apis.recalculate_fulfillment_queue is not a function`.

- [ ] **Step 4: Implement the API and the schedule entry**

Replace the contents of `server/modules/fulfillment/apis.mjs` with:

```js
// Fulfillment custom APIs: all still to port, so each is a "not ported yet" placeholder, except the ones below.
import { withPlaceholders } from '../../custom-api-helpers.mjs';
import { rescoreAll } from './sorter.mjs';

// Custom API name -> the Deluge function it runs (zoho-export/parsed/functions/).
export const functions = {
  check_payment_status: 'checkPaymentStatus',
  create_package_ff: 'createPackageFF'
};

// Manual "Recalculate" trigger for the sorting engine (spec §05/01 §6). Not a Deluge port — new in this system —
// so it is passed straight into `implemented`, not listed in `functions`.
async function recalculate_fulfillment_queue(payload, data) {
  const result = await rescoreAll(data);
  return { status: 'success', ...result };
}

export const apis = withPlaceholders(functions, { recalculate_fulfillment_queue });
```

In `server/modules/fulfillment/index.mjs`, add to the existing `schedules` array (alongside `Forecast_Stamp_Daily`):

```js
import { rescoreAll } from './sorter.mjs';
// ... inside the schedules array:
{ name: 'Recalculate_Fulfillment_Queue', at: '05:00', timeZone: 'Asia/Manila', run: (store) => rescoreAll(store) },
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter-hooks.test.js`
Expected: PASS

- [ ] **Step 6: Run the entire fulfillment test suite to confirm no regressions**

Run: `node --test tests/fulfillment-*.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/modules/fulfillment/index.mjs server/modules/fulfillment/apis.mjs tests/fulfillment-sorter-hooks.test.js
git commit -m "feat(fulfillment): nightly schedule and manual recalculate API for the sorting engine"
```

---

## Task 7: Order Readiness widget — category tabs, ranked list, today's release view

**Files:**
- Modify: `modules/Fulfillment/Order Readiness/app/index.html`

**Interfaces:**
- Consumes: the six new fields now present on every `Sales_Order_Fulfillment`-backed record the widget already fetches (`Category`, `Queue_Rank`, `Priority_Reason`, `Suggested_Action`, `Suggested_Release`, `Scored_At`) — no new API calls needed, the existing report/list fetch already returns whatever columns exist on the table.
- Produces: no new exports (this is a leaf UI file) — manual verification only, no automated test (matches this codebase's existing pattern: these widgets are plain HTML/JS with manual browser verification, not unit-tested).

- [ ] **Step 1: Locate the current row-rendering and list-filtering code**

Run: `grep -n "computeOrderedRows\|function renderAll\|groupHeaderRow" "modules/Fulfillment/Order Readiness/app/index.html"` to find the existing list pipeline (seen earlier in this session: `computeOrderedRows` already filters out `needsPaymentApproval` rows — this task adds category tabs and rank-based ordering on top of it, it does not replace that filter).

- [ ] **Step 2: Add a category tab bar above the existing table**

Add a row of tab buttons (`Today's release` [default] / `Broken` / `Already late` / `About to be late` / `On time` / `Blocked`) above the existing filter controls. Wire a `currentCategoryTab` variable (default `'suggested'`) that `computeOrderedRows` reads: when `'suggested'`, filter to `r.Suggested_Release === true` across all categories; otherwise filter to `r.Category === tabValue` (mapping `'Already late'` → `'late'`, `'About to be late'` → `'at_risk'`, `'On time'` → `'on_time'`, `'Broken'` → `'broken'`, `'Blocked'` → `'blocked'`).

- [ ] **Step 3: Sort the filtered rows by `Queue_Rank` ascending**

In `computeOrderedRows`, after the existing payment-approval filter, sort remaining rows by `Number(r.Queue_Rank || 0)` ascending before grouping by SO (ranking should determine display order; the existing group-by-SO behavior stays, but which SO's group appears first now follows rank).

- [ ] **Step 4: Show the reason on hover and the suggested action as a column**

Add a `title="${escapeHtml(r.Priority_Reason || '')}"` attribute to each row's SO/category cell, and a new table column showing `r.Suggested_Action` (blank is fine — Task 4 left it empty this slice; the column exists now so a later slice filling it in needs no widget change).

- [ ] **Step 5: Manual verification**

Start the dev server (`npm run dev`), open Order Readiness in the browser, confirm: tabs switch the visible rows, rows are ordered by rank within a tab, hovering a row's SO shows the priority reason as a tooltip, and the "Today's release" tab is selected by default on page load.

- [ ] **Step 6: Commit**

```bash
git add "modules/Fulfillment/Order Readiness/app/index.html"
git commit -m "feat(fulfillment): Order Readiness category tabs and rank-ordered list"
```

---

## Self-Review Notes (for the plan author, not a task)

- Spec coverage: categorize (§1), sort key incl. urgent-slot-reserved (§2), suggest fields incl. deliberately-blank `Suggested_Action` (§3, scoped down), cut line stand-in (§4), event/nightly/manual triggers (§6) are all covered. Aging guard (§5) and manual urgency's real value (§7) are explicitly out of scope per the design doc — not silently dropped.
- Blocked-owner-id, `job_runs` logging, and the `suggested_actions` lookup table are named exclusions in the design doc §7 and repeated here at the relevant task (Task 4) rather than silently omitted.
- Task 5's hook re-entrancy question was resolved during plan-writing by reading `server/workflows/index.mjs`: hook args always carry the raw (unhooked) store, so no fix is needed — confirmed, not assumed.
