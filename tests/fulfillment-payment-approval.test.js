// Partial / unpaid packages stay out of Order Readiness ("Need Approval") until they are approved (server/modules/fulfillment/workflows.mjs).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const SOF = 'Sales_Order_Fulfillment', GATE = 'Sales_Order_Readiness_Gate', PICK = 'Pick1';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, GATE, PICK, 'Pick_Notifications']) await db.query(`DELETE FROM "${f}"`); });

const lamp = { Item: 'Lamp', SKU: 'L-1', Quantity: '2', Bin_Location: 'A-01' };
const shade = { Item: 'Shade', SKU: 'S-1', Quantity: '1', Bin_Location: 'A-02' };
const addPackage = (extra = {}) => store.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Waiting For Package', Package: 'PAC-1', Status: 'Partial', Item_Details1: [lamp, shade], ...extra });
const stage = async (id) => (await raw.getRecordById(SOF, id, { raw: true })).Fulfillment_Stage;
const approve = (gateId, For = 'Partial') => store.updateRecord(GATE, gateId, { Override_Approved: true, Override_Approved_For_Status: For, Override_By: 'Boss', Override_Reason: 'ok' }, { byForm: true });

test('Partial: the package is "Need Approval" and its Gate records exist (for the Approve Dispatch tab)', async () => {
  const id = await addPackage();
  assert.equal(await stage(id), 'Need Approval');
  assert.equal((await raw.find(GATE)).length, 2);
});

test('approving every Gate record of the package moves it to Order Readiness; approving only one does not', async () => {
  const id = await addPackage();
  const [g1, g2] = await raw.find(GATE);
  await approve(g1.ID);
  assert.equal(await stage(id), 'Need Approval');
  await approve(g2.ID);
  assert.equal(await stage(id), 'Order Readiness');
});

test('an approval is only good for the payment status it was given for: Partial -> No needs a new approval', async () => {
  const id = await addPackage();
  for (const g of await raw.find(GATE)) await approve(g.ID, 'Partial');
  assert.equal(await stage(id), 'Order Readiness');
  await store.updateRecord(SOF, id, { Status: 'No' }, { byForm: true });
  assert.equal(await stage(id), 'Need Approval');
});

test('paying moves it to Order Readiness with no approval; credit terms need none either', async () => {
  const id = await addPackage();
  await store.updateRecord(SOF, id, { Status: 'Yes' }, { byForm: true });
  assert.equal(await stage(id), 'Order Readiness');
  const id2 = await addPackage({ SO_No: 'SO-2', Package: 'PAC-2', Has_Credit_Terms: true });
  assert.equal(await stage(id2), 'Order Readiness');
});

test('a Gate record that still needs approval is never released to Pick; after the approval it can be', async () => {
  await addPackage();
  const [g1] = await raw.find(GATE);
  await store.updateRecord(GATE, g1.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  assert.equal((await raw.find(PICK)).length, 0);
  await approve(g1.ID);
  await store.updateRecord(GATE, g1.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  assert.equal((await raw.find(PICK)).length, 1);
});
