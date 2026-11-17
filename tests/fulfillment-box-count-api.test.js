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
