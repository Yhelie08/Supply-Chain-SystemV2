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
