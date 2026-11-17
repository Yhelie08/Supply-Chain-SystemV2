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
