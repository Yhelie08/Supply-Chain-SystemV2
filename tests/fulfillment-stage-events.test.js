// Fulfillment stage event log (server/modules/fulfillment/stage-events.mjs): one Stage_Events row per
// Fulfillment_Stage change on a Sales_Order_Fulfillment package.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
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
  const id = await raw.addRecord(EVENTS, { Record_Type: 'package', Record_ID: '1', Event: 'package.picking', Occurred_At: 'x', Reported_At: 'x', Source: 'system' });
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
