// Fulfillment stage event log (server/modules/fulfillment/stage-events.mjs): one Stage_Events row per
// Fulfillment_Stage change on a Sales_Order_Fulfillment package.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { stageSlug } from '../server/modules/fulfillment/stage-events.mjs';

const SOF = 'Sales_Order_Fulfillment', EVENTS = 'Stage_Events';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SOF, EVENTS]) await db.query(`DELETE FROM "${f}"`); });

test('Stage_Events form exists with the expected columns', async () => {
  const id = await raw.addRecord(EVENTS, { Record_Type: 'package', Record_Id: '1', Event: 'package.picking', Occurred_At: 'x', Reported_At: 'x', Source: 'system' });
  const r = await raw.getRecordById(EVENTS, id, { raw: true });
  assert.equal(r.Record_Type, 'package');
  assert.equal(r.Event, 'package.picking');
});

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

const store = () => createHookedStore(raw, workflows);

test('creating a package logs exactly one event for its starting stage', async () => {
  const hooked = store();
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Waiting For Package' });
  const rows = await raw.find(EVENTS, (r) => r.Record_Id === String(id));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Record_Type, 'package');
  assert.equal(rows[0].Event, 'package.waiting_for_package');
  assert.equal(rows[0].Occurred_At, rows[0].Reported_At);
});

test('a save that changes Fulfillment_Stage logs exactly one new row with the new stage', async () => {
  const hooked = store();
  // A real stage transition, not an assertion workflows.mjs's own stageOnSave hook would just override: no
  // Package number means Waiting For Package; giving it one and marking it paid is what actually moves a
  // package to Order Readiness (server/modules/fulfillment/workflows.mjs's packageStage rule).
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-2', Fulfillment_Stage: 'Waiting For Package' });
  await hooked.updateRecord(SOF, id, { Package: 'PAC-2', Status: 'Yes' }, { byForm: true });
  const rows = await raw.find(EVENTS, (r) => r.Record_Id === String(id));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.Event).sort(), ['package.order_readiness', 'package.waiting_for_package']);
});

test('a save that does NOT change Fulfillment_Stage logs nothing new', async () => {
  const hooked = store();
  // 'Picking' is past the three stages workflows.mjs's stageOnSave auto-manages (Waiting/Need Approval/Order
  // Readiness), so saving an unrelated field here never recomputes the stage out from under this assertion.
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-3', Fulfillment_Stage: 'Picking', Package: 'PAC-3' });
  await hooked.updateRecord(SOF, id, { Delivery_Type: 'Delivery Only' }, { byForm: true }); // unrelated field, same stage
  const rows = await raw.find(EVENTS, (r) => r.Record_Id === String(id));
  assert.equal(rows.length, 1); // only the creation event
});

test('two saves in a row setting the same Fulfillment_Stage log only once (no duplicate on a no-op stage write)', async () => {
  const hooked = store();
  const id = await hooked.addRecord(SOF, { SO_No: 'SO-4', Fulfillment_Stage: 'Waiting For Package' });
  await hooked.updateRecord(SOF, id, { Fulfillment_Stage: 'Waiting For Package' }, { byForm: true }); // same value again
  const rows = await raw.find(EVENTS, (r) => r.Record_Id === String(id));
  assert.equal(rows.length, 1);
});
