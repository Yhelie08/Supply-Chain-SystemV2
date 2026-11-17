# Fulfillment Stage Event Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log one `Stage_Events` row every time a `Sales_Order_Fulfillment` package's `Fulfillment_Stage` actually changes (and one for its starting stage on creation), server-stamped, write-only this slice.

**Architecture:** A new `Stage_Events` form. A single generic `afterAdd`/`afterUpdate` hook on `Sales_Order_Fulfillment`, registered once, that compares `record.Fulfillment_Stage` against `previous.Fulfillment_Stage` (or logs unconditionally on `afterAdd`, where there is no `previous`) and writes one event row through the raw store. The event name is derived programmatically from the stage string, not a hand-written lookup table, so it can never drift from `STAGE_ORDER`.

**Tech Stack:** Node.js (ESM `.mjs`), Postgres, `node:test` + PGlite — same stack as every prior Fulfillment slice.

**Spec:** `docs/superpowers/specs/2026-11-17-fulfillment-stage-event-log-design.md`

## Global Constraints

- This is write-only. No reader function, no query helper — nothing in this plan reads `Stage_Events` back for any purpose other than test assertions.
- The hook writes through the store it receives in its own hook args (confirmed in Slice 1: this is always the raw, unhooked store), never re-triggering itself.
- `Record_Type` is always `'package'` this slice — no other department's events are logged.
- Event names are `package.<stage_slug>`, derived from the stage string, not hand-listed per stage.
- Every existing Fulfillment test must still pass unchanged after this plan.

---

## File Structure

| File | Responsibility |
|---|---|
| `zoho-export/parsed/forms/Stage_Events.json` | Create: new form — `Record_Type`, `Record_ID`, `Event`, `Occurred_At`, `Reported_At`, `Source`, `Note` |
| `server/modules/fulfillment/index.mjs` | Modify: add `Stage_Events` to the module's `forms` array; import the new hook file |
| `server/modules/fulfillment/stage-events.mjs` | Create: `stageSlug()`, the `afterAdd`/`afterUpdate` hook registration |
| `tests/fulfillment-stage-events.test.js` | Create: tests for `stageSlug()` and the end-to-end logging behavior |

---

## Task 1: `Stage_Events` form + module registration

**Files:**
- Create: `zoho-export/parsed/forms/Stage_Events.json`
- Modify: `server/modules/fulfillment/index.mjs`
- Test: `tests/fulfillment-stage-events.test.js`

**Interfaces:**
- Produces: a `Stage_Events` table with columns `Record_Type`, `Record_ID`, `Event`, `Occurred_At`, `Reported_At`, `Source`, `Note` (all text).

- [ ] **Step 1: Create the form JSON**

Create `zoho-export/parsed/forms/Stage_Events.json`:

```json
{
  "name": "Stage_Events",
  "label": "Stage Events",
  "successMessage": "Data Added Successfully!",
  "fields": [
    {
      "name": "Record_Type",
      "label": "Record Type",
      "type": "text",
      "required": false
    },
    {
      "name": "Record_ID",
      "label": "Record ID",
      "type": "text",
      "required": false
    },
    {
      "name": "Event",
      "label": "Event",
      "type": "text",
      "required": false
    },
    {
      "name": "Occurred_At",
      "label": "Occurred At",
      "type": "text",
      "required": false
    },
    {
      "name": "Reported_At",
      "label": "Reported At",
      "type": "text",
      "required": false
    },
    {
      "name": "Source",
      "label": "Source",
      "type": "text",
      "required": false
    },
    {
      "name": "Note",
      "label": "Note",
      "type": "text",
      "required": false
    }
  ]
}
```

- [ ] **Step 2: Register the form under Fulfillment**

In `server/modules/fulfillment/index.mjs`, add `'Stage_Events'` to the `forms` array (append to the list that currently ends with `'Capacity_Days'`).

- [ ] **Step 3: Validate the schema picks it up**

Run: `node -e "import('./server/model.mjs').then(m => console.log(Object.keys(m.columns.Stage_Events)))"`
Expected: `[ 'Record_Type', 'Record_ID', 'Event', 'Occurred_At', 'Reported_At', 'Source', 'Note' ]`

- [ ] **Step 4: Write a schema-presence test**

Create `tests/fulfillment-stage-events.test.js`:

```js
// Fulfillment stage event log (server/modules/fulfillment/stage-events.mjs): one Stage_Events row per
// Fulfillment_Stage change on a Sales_Order_Fulfillment package.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';

const SOF = 'Sales_Order_Fulfillment', EVENTS = 'Stage_Events';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SOF, EVENTS]) await db.query(`DELETE FROM "${f}"`); });

test('Stage_Events form exists with the expected columns', async () => {
  const id = await raw.addRecord(EVENTS, { Record_Type: 'package', Record_ID: '1', Event: 'package.picking', Occurred_At: 'x', Reported_At: 'x', Source: 'system' });
  const r = await raw.getRecordById(EVENTS, id, { raw: true });
  assert.equal(r.Record_Type, 'package');
  assert.equal(r.Event, 'package.picking');
});
```

- [ ] **Step 5: Run it**

Run: `node --test tests/fulfillment-stage-events.test.js`
Expected: PASS

- [ ] **Step 6: Run the module invariant tests too**

Run: `node --test tests/core/modules.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "zoho-export/parsed/forms/Stage_Events.json" server/modules/fulfillment/index.mjs tests/fulfillment-stage-events.test.js
git commit -m "feat(fulfillment): add Stage_Events form for the stage event log"
```

---

## Task 2: `stageSlug()` — derive the event name from a stage string

**Files:**
- Create: `server/modules/fulfillment/stage-events.mjs`
- Test: `tests/fulfillment-stage-events.test.js`

**Interfaces:**
- Consumes: a stage string (one of `pipeline.mjs`'s `STAGE_ORDER` values, or blank).
- Produces: `stageSlug(stage) -> string`, e.g. `'Pack & QC'` → `'pack_qc'`, used to build `package.<slug>`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fulfillment-stage-events.test.js`:

```js
import { stageSlug } from '../server/modules/fulfillment/stage-events.mjs';

test('stageSlug: lowercases and replaces spaces/& with single underscores', () => {
  assert.equal(stageSlug('Waiting For Package'), 'waiting_for_package');
  assert.equal(stageSlug('Need Approval'), 'need_approval');
  assert.equal(stageSlug('Order Readiness'), 'order_readiness');
  assert.equal(stageSlug('Picking'), 'picking');
  assert.equal(stageSlug('Pack & QC'), 'pack_qc');
  assert.equal(stageSlug('Crate'), 'crate');
  assert.equal(stageSlug('Order Aggregation'), 'order_aggregation');
  assert.equal(stageSlug('For Delivery'), 'for_delivery');
});

test('stageSlug: blank stage produces a blank slug (no event logged for it, see Task 3)', () => {
  assert.equal(stageSlug(''), '');
  assert.equal(stageSlug(undefined), '');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-stage-events.test.js`
Expected: FAIL — `Cannot find module '../server/modules/fulfillment/stage-events.mjs'`.

- [ ] **Step 3: Implement `stageSlug()`**

Create `server/modules/fulfillment/stage-events.mjs`:

```js
// Fulfillment stage event log (spec: HomeCartel v1.4, 01 Database §8 stage_events; D13 one stamp per stage
// entry). Write-only this slice — logs a Stage_Events row whenever Sales_Order_Fulfillment.Fulfillment_Stage
// actually changes. One generic hook catches every current and future write site (pipeline.mjs's advanceStage
// and reconcileFulfillment, workflows.mjs's stageOnSave and stageOnGateSave — five as of this writing) rather
// than a logging call added at each one individually.
import { blank } from '../../workflows/deluge.mjs';

const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// 'Pack & QC' -> 'pack_qc'. Derived from the stage string itself, not a hand-listed table, so it can never
// drift from pipeline.mjs's STAGE_ORDER.
export function stageSlug(stage) {
  return text(stage).toLowerCase().replace(/&/g, ' ').trim().replace(/\s+/g, '_');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-stage-events.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/modules/fulfillment/stage-events.mjs tests/fulfillment-stage-events.test.js
git commit -m "feat(fulfillment): stageSlug() derives the event name from a stage string"
```

---

## Task 3: The logging hook

**Files:**
- Modify: `server/modules/fulfillment/stage-events.mjs`
- Modify: `server/modules/fulfillment/index.mjs`
- Test: `tests/fulfillment-stage-events.test.js`

**Interfaces:**
- Consumes: `register` from `server/workflows/index.mjs` (same pattern every Fulfillment hook file uses); `zohoNow()` from `server/criteria.mjs`.
- Produces: no new exports beyond `stageSlug` — this task's deliverable is the hook registration itself, verified end-to-end by the test.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fulfillment-stage-events.test.js`:

```js
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import '../server/modules/fulfillment/stage-events.mjs';

const store = () => createHookedStore(raw, workflows);

test('creating a package logs exactly one event for its starting stage', async () => {
  const hooked = store();
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Waiting For Package' });
  const rows = await raw.find(EVENTS, (r) => r.Record_ID === String(id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Record_Type, 'package');
  assert.equal(rows[0].Event, 'package.waiting_for_package');
  assert.equal(rows[0].Occurred_At, rows[0].Reported_At);
});

test('a save that changes Fulfillment_Stage logs exactly one new row with the new stage', async () => {
  const hooked = store();
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-2', Fulfillment_Stage: 'Waiting For Package' });
  await hooked.updateRecord(SOF, id, { Fulfillment_Stage: 'Order Readiness' }, { byForm: true });
  const rows = await raw.find(EVENTS, (r) => r.Record_ID === String(id));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.Event).sort(), ['package.order_readiness', 'package.waiting_for_package']);
});

test('a save that does NOT change Fulfillment_Stage logs nothing new', async () => {
  const hooked = store();
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-3', Fulfillment_Stage: 'Waiting For Package', Package: '' });
  await hooked.updateRecord(SOF, id, { Package: 'PAC-3' }, { byForm: true }); // unrelated field, same stage
  const rows = await raw.find(EVENTS, (r) => r.Record_ID === String(id));
  assert.equal(rows.length, 1); // only the creation event
});

test('two saves in a row setting the same Fulfillment_Stage log only once (no duplicate on a no-op stage write)', async () => {
  const hooked = store();
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-4', Fulfillment_Stage: 'Waiting For Package' });
  await hooked.updateRecord(SOF, id, { Fulfillment_Stage: 'Waiting For Package' }, { byForm: true }); // same value again
  const rows = await raw.find(EVENTS, (r) => r.Record_ID === String(id));
  assert.equal(rows.length, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-stage-events.test.js`
Expected: FAIL — no events are logged at all (the hook does not exist yet).

- [ ] **Step 3: Implement the hook**

Append to `server/modules/fulfillment/stage-events.mjs`:

```js
import { register } from '../../workflows/index.mjs';
import { zohoNow } from '../../criteria.mjs';

const SOF = 'Sales_Order_Fulfillment';
const EVENTS = 'Stage_Events';

async function logStageEvent(store, id, stage) {
  const slug = stageSlug(stage);
  if (slug === '') return; // no stage set yet: nothing to log
  const stamp = zohoNow();
  await store.addRecord(EVENTS, {
    Record_Type: 'package', Record_ID: text(id), Event: `package.${slug}`,
    Occurred_At: stamp, Reported_At: stamp, Source: 'system',
  });
}

async function onAdd({ id, record, store }) {
  await logStageEvent(store, id, record.Fulfillment_Stage);
}
async function onUpdate({ id, record, previous, store }) {
  if (text(record.Fulfillment_Stage) === text(previous?.Fulfillment_Stage)) return;
  await logStageEvent(store, id, record.Fulfillment_Stage);
}
register(SOF, { afterAdd: onAdd, afterUpdate: onUpdate });
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-stage-events.test.js`
Expected: PASS, all tests green.

- [ ] **Step 5: Wire the import into `index.mjs`**

In `server/modules/fulfillment/index.mjs`, add `import './stage-events.mjs';` alongside the other side-effect imports (`./sorter-hooks.mjs`, etc.).

- [ ] **Step 6: Run the full fulfillment suite to confirm no regressions and no re-entrancy hang**

Run: `node --test tests/fulfillment-*.test.js`
Expected: PASS, finishing in the same rough time range as before this plan (a hang here would mean the hook is somehow re-triggering itself — confirmed not the case in Slice 1's equivalent check, but re-verify here since this hook touches the same form from a different file).

- [ ] **Step 7: Commit**

```bash
git add server/modules/fulfillment/stage-events.mjs server/modules/fulfillment/index.mjs tests/fulfillment-stage-events.test.js
git commit -m "feat(fulfillment): log a Stage_Events row on every Fulfillment_Stage change"
```

---

## Self-Review Notes

- Spec coverage: one stamp per stage entry (D13) — Task 3's dedup-on-no-change test. `occurred_at`/`reported_at` both present and equal for live writes — Task 1's schema and Task 3's assertion. Server-only (spec §9) — no user-facing write path is added anywhere in this plan.
- Named exclusions (`occurred_bound`, `actor_id`, `visit_no`, no reader function, no other department's events) are carried from the design doc, not silently dropped here.
- The five-write-site count and the "why a generic hook" reasoning are stated once in the module header comment (Task 2, Step 3) rather than scattered across tasks, so a future reader sees the justification where the hook itself lives.
