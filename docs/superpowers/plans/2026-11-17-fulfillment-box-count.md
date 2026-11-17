# Fulfillment Box Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `Sales_Order_Fulfillment` package a real `Box_Count` (how many boxes leave the warehouse) captured at pick completion and updatable at crate, falling back to the existing line-quantity estimate until counted — so Slice 2 (Capacity + Cut Line) has a real number to read instead of a stand-in.

**Architecture:** Two new fields on `Sales_Order_Fulfillment`. A new pure helper `effectiveBoxes()` in `server/modules/fulfillment/sorter.mjs` that prefers the counted value over the existing `estimatedBoxes()` line-sum. A new package-completion check in `pipeline.mjs` that the Pick widget polls after a Mark Picked save, to know when to prompt for a count. A new field on the Crate widget's existing edit form.

**Tech Stack:** Node.js (ESM `.mjs`), Postgres, `node:test` + PGlite (server), plain JS widget code (client) — same stack as Slice 1.

**Spec:** `docs/superpowers/specs/2026-11-17-fulfillment-box-count-design.md`

## Global Constraints

- New schema fields go in `zoho-export/parsed/forms/Sales_Order_Fulfillment.json`, same auto-migration pattern as Slice 1.
- Box count is never used for categorization or ranking (PKG-R4) — `categorize()`'s and `rankAndCutLine()`'s comparator keys must not change in this plan; only `estimatedBoxes()`'s call site inside `rankAndCutLine` changes to `effectiveBoxes()`.
- `estimatedBoxes()` keeps its existing name and behavior (line-quantity sum) — it becomes `effectiveBoxes()`'s fallback branch, not a function that's renamed or removed.
- Every existing Slice 1 test must still pass unchanged after this plan (confirms the no-ranking-impact constraint above empirically, not just by inspection).

---

## File Structure

| File | Responsibility |
|---|---|
| `zoho-export/parsed/forms/Sales_Order_Fulfillment.json` | Modify: add `Box_Count`, `Box_Count_Source` fields |
| `server/modules/fulfillment/sorter.mjs` | Modify: add `effectiveBoxes()`, change `rankAndCutLine`'s internal call from `estimatedBoxes` to `effectiveBoxes` |
| `server/modules/fulfillment/pipeline.mjs` | Modify: add `allPickedForPackage()`, used by a new exported helper the widget calls |
| `server/modules/fulfillment/apis.mjs` | Modify: add a `package_pick_status` custom API the Pick widget calls after Mark Picked, returning whether the package is now fully picked and still estimated |
| `tests/fulfillment-sorter.test.js` | Modify: tests for `effectiveBoxes()` |
| `tests/fulfillment-pipeline.test.js` | Modify: tests for `allPickedForPackage()` |
| `tests/fulfillment-box-count-api.test.js` | Create: tests for the new custom API |
| `modules/Fulfillment/Pick/app/index.html` | Modify: box-count prompt modal after the last line of a package is marked |
| `modules/Fulfillment/Crate/app/index.html` | Modify: Box Count field on the edit form, written to the package on save |

---

## Task 1: Schema — add `Box_Count` and `Box_Count_Source`

**Files:**
- Modify: `zoho-export/parsed/forms/Sales_Order_Fulfillment.json`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Produces: two new columns on `Sales_Order_Fulfillment`: `Box_Count` (number), `Box_Count_Source` (text).

- [ ] **Step 1: Add the two field definitions**

Open `zoho-export/parsed/forms/Sales_Order_Fulfillment.json`. Add these two blocks after the `Scored_At` field Slice 1 added (the current last field in the array), before the closing `]`:

```json
    {
      "name": "Box_Count",
      "label": "Box Count",
      "type": "number",
      "required": false
    },
    {
      "name": "Box_Count_Source",
      "label": "Box Count Source",
      "type": "text",
      "required": false
    }
```

- [ ] **Step 2: Validate**

Run: `node -e "import('./server/model.mjs').then(m => console.log('Box_Count' in m.columns.Sales_Order_Fulfillment, 'Box_Count_Source' in m.columns.Sales_Order_Fulfillment))"`
Expected: `true true`

- [ ] **Step 3: Write a schema-presence test**

Add to `tests/fulfillment-sorter.test.js` (after the existing schema test):

```js
test('Box_Count and Box_Count_Source columns exist on Sales_Order_Fulfillment', async () => {
  const id = await raw.addRecord(SOF, { SO_No: 'SO-BOX-1', Box_Count: '7', Box_Count_Source: 'counted' });
  const r = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(r.Box_Count, '7');
  assert.equal(r.Box_Count_Source, 'counted');
});
```

- [ ] **Step 4: Run it**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "zoho-export/parsed/forms/Sales_Order_Fulfillment.json" tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): add Box_Count/Box_Count_Source to Sales_Order_Fulfillment schema"
```

---

## Task 2: `effectiveBoxes()` — real count with the line-quantity estimate as fallback

**Files:**
- Modify: `server/modules/fulfillment/sorter.mjs`
- Test: `tests/fulfillment-sorter.test.js`

**Interfaces:**
- Consumes: a `Sales_Order_Fulfillment` record.
- Produces: `effectiveBoxes(sof) -> number`. `rankAndCutLine`'s internal box-sum changes from calling `estimatedBoxes(e.sof)` to calling `effectiveBoxes(e.sof)` — no change to `rankAndCutLine`'s own exported signature.

- [ ] **Step 1: Write the failing tests**

Add to `tests/fulfillment-sorter.test.js`:

```js
import { effectiveBoxes } from '../server/modules/fulfillment/sorter.mjs';

test('effectiveBoxes: counted source returns the real Box_Count, ignoring line quantities', () => {
  const sof = { Box_Count: '12', Box_Count_Source: 'counted', Item_Details1: [{ Quantity: '1' }, { Quantity: '1' }] };
  assert.equal(effectiveBoxes(sof), 12);
});

test('effectiveBoxes: no Box_Count_Source falls back to the line-quantity sum (the existing estimate)', () => {
  const sof = { Item_Details1: [{ Quantity: '3' }, { Quantity: '4' }] };
  assert.equal(effectiveBoxes(sof), 7);
});

test('effectiveBoxes: Box_Count_Source is "estimated" (not yet counted) also falls back to the line-quantity sum', () => {
  const sof = { Box_Count_Source: 'estimated', Item_Details1: [{ Quantity: '2' }] };
  assert.equal(effectiveBoxes(sof), 2);
});

test('effectiveBoxes: Box_Count_Source is "counted" but Box_Count is blank still falls back (no real count exists yet)', () => {
  const sof = { Box_Count_Source: 'counted', Box_Count: '', Item_Details1: [{ Quantity: '5' }] };
  assert.equal(effectiveBoxes(sof), 5);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: FAIL — `effectiveBoxes is not a function` (or not exported).

- [ ] **Step 3: Implement `effectiveBoxes()`**

In `server/modules/fulfillment/sorter.mjs`, find the existing `estimatedBoxes` function (added in Slice 1, just above `compareKey`) and add `effectiveBoxes` right after it:

```js
// Real count when one has been entered (PKG-R3: "counted when the package is made up"), else the existing
// line-quantity estimate. Box count never affects categorize()/rankAndCutLine()'s sort order (PKG-R4) — this
// is the only function that reads it, and only for the cut-line sum.
export function effectiveBoxes(sof) {
  if (text(sof.Box_Count_Source) === 'counted' && !blank(sof.Box_Count)) return toNum(sof.Box_Count);
  return estimatedBoxes(sof);
}
```

Then change `rankAndCutLine`'s body: find the line `const boxes = estimatedBoxes(e.sof);` and change it to `const boxes = effectiveBoxes(e.sof);`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-sorter.test.js`
Expected: PASS, all tests green, including every Slice 1 test still in this file (confirms no ranking-behavior change).

- [ ] **Step 5: Commit**

```bash
git add server/modules/fulfillment/sorter.mjs tests/fulfillment-sorter.test.js
git commit -m "feat(fulfillment): effectiveBoxes() prefers a real count over the line-quantity estimate"
```

---

## Task 3: `allPickedForPackage()` and the pick-completion API

**Files:**
- Modify: `server/modules/fulfillment/pipeline.mjs`
- Modify: `server/modules/fulfillment/apis.mjs`
- Test: `tests/fulfillment-pipeline.test.js`, `tests/fulfillment-box-count-api.test.js`

**Interfaces:**
- Consumes: `store.find('Pick1', ...)` (existing pattern throughout `pipeline.mjs`).
- Produces: `allPickedForPackage(store, so, pkg) -> Promise<boolean>`, exported from `pipeline.mjs`; a new custom API `package_pick_status` returning `{ status: 'success', allPicked: boolean, needsBoxCount: boolean }`.

- [ ] **Step 1: Write the failing pipeline test**

Add to `tests/fulfillment-pipeline.test.js` (near the existing Pick-related tests — check the file's existing `addPackage`/`lamp`/`shade` fixtures and reuse them):

```js
import { allPickedForPackage } from '../server/modules/fulfillment/pipeline.mjs';

test('allPickedForPackage: false until every Pick1 row of the package is Marked, true once they all are', async () => {
  const id = await addPackage(); // existing fixture: SO-1, PAC-1, two lines (lamp, shade)
  // release both lines into Pick1 via the existing Gate flow
  const gates = await rows(GATE);
  for (const g of gates) await store.updateRecord(GATE, g.ID, { Release: true, Assign_Picker: 'Ana' }, { byForm: true });
  let picks = await rows(PICK);
  assert.equal(picks.length, 2);
  assert.equal(await allPickedForPackage(raw, 'SO-1', 'PAC-1'), false);
  await store.updateRecord(PICK, picks[0].ID, { Marked: true }, { byForm: true });
  assert.equal(await allPickedForPackage(raw, 'SO-1', 'PAC-1'), false); // one of two still unmarked
  await store.updateRecord(PICK, picks[1].ID, { Marked: true }, { byForm: true });
  assert.equal(await allPickedForPackage(raw, 'SO-1', 'PAC-1'), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/fulfillment-pipeline.test.js`
Expected: FAIL — `allPickedForPackage is not a function`.

- [ ] **Step 3: Implement `allPickedForPackage()`**

In `server/modules/fulfillment/pipeline.mjs`, add near `pickedToQc` (after the `customerContact` helper, before `export async function pickedToQc`):

```js
// True once every Pick1 row of this package (SO + Package_Order) has Marked = true. Used to know when the
// PICK OF THE WHOLE PACKAGE is complete (PKG-R3: "entered at pick completion"), not just one item line —
// a package usually has several Pick1 rows, one per item.
export async function allPickedForPackage(store, so, pkg) {
  const picks = await store.find(PICK, (p) => text(p.SO) === text(so) && text(p.Package_Order) === text(pkg), { criteria: eq('SO', so) });
  return picks.length > 0 && picks.every((p) => truthy(p.Marked));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/fulfillment-pipeline.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing API test**

Create `tests/fulfillment-box-count-api.test.js`:

```js
// package_pick_status custom API (server/modules/fulfillment/apis.mjs): tells the Pick widget whether a
// package is now fully picked and still needs its box count, right after a Mark Picked save.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { apis } from '../server/modules/fulfillment/apis.mjs';

const SOF = 'Sales_Order_Fulfillment', GATE = 'Sales_Order_Readiness_Gate', PICK = 'Pick1';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, GATE, PICK, 'Pick_Notifications', 'Customer']) await db.query(`DELETE FROM "${f}"`); });

const lamp = { Item: 'Lamp', SKU: 'L-1', Quantity: '2', Bin_Location: 'A-01' };
const addPackage = () => store.addRecord(SOF, {
  SO_No: 'SO-1', Fulfillment_Stage: 'Waiting For Package', Package: 'PAC-1', Status: 'Yes',
  Customer_Type: 'Corporate', Delivery_Type: 'Delivery Only', order_type: 'Normal', Shipping_Address: '1 Main St', Item_Details1: [lamp],
});

test('package_pick_status: not all picked yet reports allPicked false, needsBoxCount false', async () => {
  await addPackage();
  const [gate] = await raw.find(GATE);
  await store.updateRecord(GATE, gate.ID, { Release: true }, { byForm: true });
  const result = await apis.package_pick_status({ so: 'SO-1', pkg: 'PAC-1' }, raw, {});
  assert.equal(result.status, 'success');
  assert.equal(result.allPicked, false);
  assert.equal(result.needsBoxCount, false);
});

test('package_pick_status: all picked and still estimated reports needsBoxCount true', async () => {
  await addPackage();
  const [gate] = await raw.find(GATE);
  await store.updateRecord(GATE, gate.ID, { Release: true }, { byForm: true });
  const [pick] = await raw.find(PICK);
  await store.updateRecord(PICK, pick.ID, { Marked: true }, { byForm: true });
  const result = await apis.package_pick_status({ so: 'SO-1', pkg: 'PAC-1' }, raw, {});
  assert.equal(result.allPicked, true);
  assert.equal(result.needsBoxCount, true);
});

test('package_pick_status: all picked but already counted reports needsBoxCount false', async () => {
  const id = await addPackage();
  await raw.updateRecord(SOF, id, { Box_Count: '3', Box_Count_Source: 'counted' }, { byForm: true });
  const [gate] = await raw.find(GATE);
  await store.updateRecord(GATE, gate.ID, { Release: true }, { byForm: true });
  const [pick] = await raw.find(PICK);
  await store.updateRecord(PICK, pick.ID, { Marked: true }, { byForm: true });
  const result = await apis.package_pick_status({ so: 'SO-1', pkg: 'PAC-1' }, raw, {});
  assert.equal(result.allPicked, true);
  assert.equal(result.needsBoxCount, false);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test tests/fulfillment-box-count-api.test.js`
Expected: FAIL — `apis.package_pick_status is not a function`.

- [ ] **Step 7: Implement the API**

In `server/modules/fulfillment/apis.mjs`, add the import and handler, and pass it into `withPlaceholders`'s second argument alongside `recalculate_fulfillment_queue` (added in Slice 1):

```js
import { allPickedForPackage } from './pipeline.mjs';

// Tells the Pick widget, right after a Mark Picked save, whether the whole package is now picked and still
// needs a real box count (PKG-R3). Not a Deluge port — new in this system, like recalculate_fulfillment_queue.
async function package_pick_status({ so, pkg }, data) {
  const allPicked = await allPickedForPackage(data, so, pkg);
  if (!allPicked) return { status: 'success', allPicked: false, needsBoxCount: false };
  const [sof] = await data.find('Sales_Order_Fulfillment', (r) => r.SO_No === so && r.Package === pkg);
  const needsBoxCount = !(sof && sof.Box_Count_Source === 'counted' && sof.Box_Count);
  return { status: 'success', allPicked: true, needsBoxCount };
}
```

Add `package_pick_status` to the object passed as `withPlaceholders`'s second argument, next to `recalculate_fulfillment_queue`.

- [ ] **Step 8: Run to verify it passes**

Run: `node --test tests/fulfillment-box-count-api.test.js`
Expected: PASS

- [ ] **Step 9: Run the full fulfillment suite to confirm no regressions**

Run: `node --test tests/fulfillment-*.test.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add server/modules/fulfillment/pipeline.mjs server/modules/fulfillment/apis.mjs tests/fulfillment-pipeline.test.js tests/fulfillment-box-count-api.test.js
git commit -m "feat(fulfillment): allPickedForPackage + package_pick_status API for the box-count prompt"
```

---

## Task 4: Pick widget — box-count prompt after the last line is marked

**Files:**
- Modify: `modules/Fulfillment/Pick/app/index.html`

**Interfaces:**
- Consumes: the new `package_pick_status` custom API (Task 3) via the widget's existing custom-API call pattern (check `CONFIG` for a `CUSTOM_API_KEY_*`-style constant — this widget already calls at least one custom API if `CONFIG.CUSTOM_API_KEY_CREATE_PACKAGE`-style entries exist elsewhere in this codebase's Fulfillment widgets; otherwise follow whatever pattern this specific file already uses to call `ZOHO.CREATOR.DATA.updateRecords`-adjacent custom endpoints found in Step 1).
- Produces: no exports — manual browser verification only (this codebase's widgets are not unit-tested, confirmed in Slice 1's Task 7).

**Confirmed pattern (read during plan-writing):** `modules/Fulfillment/Pre-Order/app/index.html` defines a small per-widget helper:

```js
function invokeCustomApi(apiName, publicKey, params) {
  return ZOHO.CREATOR.DATA.invokeCustomApi({
    app_name: CONFIG.APP_NAME, api_name: apiName, public_key: publicKey, http_method: "POST", payload: params || {},
  }).then((resp) => (resp && resp.data) ? resp.data : (resp && resp.result) ? resp.result : resp);
}
```

Server-side (`server/index.mjs`'s `invokeCustomApi: async (b) => ({ code: 3000, result: await invokeCustomApi(b.api_name, b.payload) })` and `server/custom-apis.mjs`) **the `public_key` is never read or checked** — only `api_name` and `payload` matter. The widget-side key string is a harmless leftover from this app's real-Zoho-Creator days. So Pick's widget needs the same small `invokeCustomApi` helper (copy it in verbatim — it is not shared/imported anywhere, every widget that needs it defines its own copy, confirmed by it being defined inline in Pre-Order's own `<script>` block) and can pass any placeholder string as the key argument; it is never checked.

- [ ] **Step 1: Add the `invokeCustomApi` helper to Pick's widget**

Add the exact function above (verbatim) to `modules/Fulfillment/Pick/app/index.html`'s script block, near its other top-level helper functions (e.g. next to `updateRecordField`).

- [ ] **Step 2: Add the box-count prompt modal markup**

Near the existing `markPickedModal` div, add a sibling modal:

```html
<div id="boxCountModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
  <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5" style="background: var(--hc-panel, #fff);">
    <h3 class="text-sm font-bold text-slate-900 mb-1">How many boxes?</h3>
    <p class="text-xs text-slate-500 mb-3">This package is fully picked. Enter the box count, or skip for now (the estimate stays until it's counted).</p>
    <input id="boxCountInput" type="number" min="0" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4" placeholder="Number of boxes" />
    <div class="flex items-center justify-end gap-2">
      <button id="boxCountSkipBtn" class="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 transition">Skip for now</button>
      <button id="boxCountSaveBtn" class="text-xs font-semibold bg-slate-900 text-white rounded-lg px-3 py-2 hover:bg-slate-800 transition">Save count</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Wire the prompt into the Mark Picked success handler**

In `startMarkPicked`'s `.then((response) => { if (response && response.code === 3000) { ... } })` block (found during plan-writing at the point where `renderTable(); renderStats();` are called), add a call to a new function after those lines:

```js
function maybePromptBoxCount(r) {
  invokeCustomApi("package_pick_status", "not-checked", { so: r.SO, pkg: r.Package_Order }).then((result) => {
    if (result && result.needsBoxCount) openBoxCountModal(r.SO, r.Package_Order);
  }).catch((err) => console.error(err)); // a failed status check is not worth blocking the mark-picked flow over
}

function openBoxCountModal(so, pkg) {
  const modal = document.getElementById("boxCountModal");
  const input = document.getElementById("boxCountInput");
  input.value = "";
  modal.classList.remove("hidden");

  const close = () => modal.classList.add("hidden");
  document.getElementById("boxCountSkipBtn").onclick = close;
  document.getElementById("boxCountSaveBtn").onclick = () => {
    const n = parseInt(input.value, 10);
    if (!Number.isFinite(n) || n < 0) { toast("Enter a number.", "error"); return; }
    ZOHO.CREATOR.DATA.updateRecords({
      app_name: CONFIG.APP_NAME,
      report_name: "Sales_Order_Fulfillment_Report",
      payload: { criteria: `(SO_No == "${so}" && Package == "${pkg}")`, data: { Box_Count: String(n), Box_Count_Source: "counted" } },
    }).then((response) => {
      if (response && response.code === 3000) toast("Box count saved.", "success");
      else toast("Couldn't save the box count.", "error");
      close();
    });
  };
}
```

Then call `maybePromptBoxCount(r);` right after the existing `renderStats();` line inside `startMarkPicked`'s success branch.

- [ ] **Step 4: Syntax-check the file**

Run:
```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('modules/Fulfillment/Pick/app/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
for (const s of scripts) { try { new Function(s); } catch (e) { console.log('SYNTAX ERROR:', e.message); process.exit(1); } }
console.log('all script blocks parse OK, count:', scripts.length);
"
```
Expected: `all script blocks parse OK, count: <N>`

- [ ] **Step 5: Manual verification (flag the limitation if no browser tool is available)**

Start the dev server, open Pick, mark the last unmarked line of a multi-line package as picked, confirm the box-count modal appears; enter a number and confirm it saves; mark the last line of a different package and confirm "Skip for now" leaves it estimated. If no browser is available this session, say so explicitly rather than claiming it was verified (same honesty standard Slice 1's Task 7 used).

- [ ] **Step 6: Commit**

```bash
git add "modules/Fulfillment/Pick/app/index.html"
git commit -m "feat(fulfillment): Pick widget prompts for box count once a package is fully picked"
```

---

## Task 5: Crate widget — editable Box Count field on Crate Done

**Files:**
- Modify: `modules/Fulfillment/Crate/app/index.html`

**Interfaces:**
- Consumes: nothing new server-side — writes directly to `Sales_Order_Fulfillment` via `ZOHO.CREATOR.DATA.updateRecords`, same pattern Task 4 used for the Skip/Save flow and the same pattern this widget's own `saveEditForm()` already uses for `Crate_Checklist` itself.
- Produces: no exports — manual verification only.

- [ ] **Step 1: Add the Box Count input to the edit form**

Near the Crating Status radio buttons (found during plan-writing at `modules/Fulfillment/Crate/app/index.html` around the `f_Status_Pending`/`f_Status_Done` inputs), add a labeled number input, e.g.:

```html
<div class="mb-3">
  <label class="block text-xs font-semibold text-slate-600 mb-1">Box Count</label>
  <input id="f_Box_Count" type="number" min="0" class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Number of boxes" />
  <p id="boxCountSourceNote" class="text-[11px] text-slate-400 mt-1"></p>
</div>
```

- [ ] **Step 2: Populate the field when the edit form opens**

In the same function that currently sets `f_Status_Pending`/`f_Status_Done` from the record (found during plan-writing — the function containing the `const status = textVal(r.Crating_Status1);` line), add, using `r`'s joined `Sales_Order_Fulfillment` data (fetch it the same way Slice 1's Order Readiness widget joined SOF data, by SO + Package, if this Crate widget does not already have it loaded — check first whether `r` already carries `Box_Count`/`Box_Count_Source` from its own report before adding a second fetch):

```js
document.getElementById("f_Box_Count").value = r.Box_Count || "";
document.getElementById("boxCountSourceNote").textContent = r.Box_Count_Source === "counted" ? "Counted." : "Estimated from line quantities until counted.";
```

- [ ] **Step 3: Write it back on save**

In `saveEditForm()`, after the existing `collectEditFormData()` call and before the `updateRecords` call for `Crate_Checklist` itself, add a second write (only if the box count field was actually changed from what was loaded, to avoid an unconditional write every single Crate save):

```js
const newBoxCount = document.getElementById("f_Box_Count").value.trim();
if (newBoxCount !== "" && newBoxCount !== String(currentEditRecord.Box_Count || "")) {
  await ZOHO.CREATOR.DATA.updateRecords({
    app_name: CONFIG.APP_NAME,
    report_name: "Sales_Order_Fulfillment_Report",
    payload: { criteria: `(SO_No == "${data.SO}" && Package == "${data.Package_Order}")`, data: { Box_Count: newBoxCount, Box_Count_Source: "counted" } },
  });
}
```

Place this after the main `Crate_Checklist` `updateRecords` call succeeds (inside the existing `try` block, after `Object.assign(currentEditRecord, data);`), so a failed Crate save never silently updates the box count on its own.

- [ ] **Step 4: Syntax-check the file**

Run the same inline-script syntax check pattern as Task 4 Step 4, pointed at `modules/Fulfillment/Crate/app/index.html`.
Expected: `all script blocks parse OK, count: <N>`

- [ ] **Step 5: Manual verification**

Open Crate, open a package's edit form, confirm the Box Count field shows the current estimate with the "Estimated..." note, change it, save, and confirm the note becomes "Counted." on reopen. Flag explicitly if no browser is available this session.

- [ ] **Step 6: Run the full fulfillment test suite one more time to confirm nothing server-side regressed**

Run: `node --test tests/fulfillment-*.test.js`
Expected: PASS (this task touches no server code, so this is a final sanity check, not an expected-to-catch-anything step).

- [ ] **Step 7: Commit**

```bash
git add "modules/Fulfillment/Crate/app/index.html"
git commit -m "feat(fulfillment): Crate widget can update the box count at Crate Done"
```

---

## Self-Review Notes

- Spec coverage: PKG-R3 (entered at pick, updated at crate, estimate fallback) — Tasks 3–5. PKG-R4 (never affects sorting) — enforced by Task 2's constraint and the "every Slice 1 test still passes" check in Tasks 2 and 3.
- `package.box_counted` stamp and PKG-R1/R2/R5/R6 are named exclusions in the design doc, not silently dropped.
- Task 4's custom-API call pattern was resolved during plan-writing by reading `modules/Fulfillment/Pre-Order/app/index.html` and `server/custom-apis.mjs` directly: the real helper is `invokeCustomApi(apiName, publicKey, params)`, and the server never checks `public_key` at all — confirmed, not guessed.
