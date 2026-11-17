// Integration: rescoreOne / rescoreAll actually write Category/Queue_Rank/... onto Sales_Order_Fulfillment.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { rescoreOne, rescoreAll } from '../server/modules/fulfillment/sorter.mjs';
import '../server/modules/fulfillment/sorter-hooks.mjs';

const SOF = 'Sales_Order_Fulfillment';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, 'Sales_Order_Readiness_Gate', 'Exception_Control1', 'Customer', 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const addPackage = (extra) => raw.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Order Readiness', order_type: 'Normal', Shipping_Address: '1 Main St', Item_Details1: [{ Quantity: '1' }], ...extra });

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
  assert.equal(row.Category, '');
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

test('saving a Sales_Order_Fulfillment record scores it automatically (no manual rescore call)', async () => {
  const id = await store.addRecord(SOF, { SO_No: 'SO-9', Fulfillment_Stage: 'Order Readiness', order_type: 'Normal', SO_Created_Date: '2026-11-01', target_delivery_date: '2026-12-15', Shipping_Address: '1 Main St', Item_Details1: [{ Quantity: '1' }] });
  const row = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(row.Category, 'on_time');
  assert.ok(row.Scored_At);
});

test('an unpaid Readiness Gate save re-scores the package it belongs to (Blocked flips to a workable category)', async () => {
  const id = await store.addRecord(SOF, { SO_No: 'SO-10', Fulfillment_Stage: 'Order Readiness', order_type: 'Normal', Package: 'PAC-10', SO_Created_Date: '2026-11-01', target_delivery_date: '2026-12-15', Shipping_Address: '1 Main St', Item_Details1: [{ Quantity: '1' }] });
  const gateId = await store.addRecord('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-10', Package_Order: 'PAC-10', payment_status: 'Partial', Has_Credit_Terms: false });
  let row = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(row.Category, 'blocked');
  await store.updateRecord('Sales_Order_Readiness_Gate', gateId, { payment_status: 'Yes' }, { byForm: true });
  row = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(row.Category, 'on_time');
});
