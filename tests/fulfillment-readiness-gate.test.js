// Fulfillment: a package enters Order Readiness only when it is paid AND has a package
// (server/modules/fulfillment/workflows.mjs), run on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const SOF = 'Sales_Order_Fulfillment';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { await db.query(`DELETE FROM "${SOF}"`); });

const add = (extra) => store.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Waiting For Package', ...extra });
const read = (id) => raw.getRecordById(SOF, id, { raw: true });
const edit = (id, data) => store.updateRecord(SOF, id, data, { byForm: true });

test('paid + package goes to Order Readiness', async () => {
  const id = await add({ Package: 'PAC-1', Status: 'Yes' });
  assert.equal((await read(id)).Fulfillment_Stage, 'Order Readiness');
});

test('a package with a package number that is Partial / unpaid is "Need Approval", not Order Readiness', async () => {
  for (const Status of ['No', 'Partial', '']) {
    const id = await add({ Package: 'PAC-1', Status });
    assert.equal((await read(id)).Fulfillment_Stage, 'Need Approval', `Status "${Status}"`);
  }
});

test('paid but no package yet waits', async () => {
  for (const Package of ['', 'null']) {
    const id = await add({ Package, Status: 'Yes' });
    assert.equal((await read(id)).Fulfillment_Stage, 'Waiting For Package', `Package "${Package}"`);
  }
});

test('the package number moves it to Need Approval; only paying (or an approval) moves it to Order Readiness', async () => {
  const id = await add({ Status: 'No' });
  assert.equal((await read(id)).Fulfillment_Stage, 'Waiting For Package');
  await edit(id, { Package: 'PAC-2' });
  assert.equal((await read(id)).Fulfillment_Stage, 'Need Approval');
  await edit(id, { Status: 'Partial' });
  assert.equal((await read(id)).Fulfillment_Stage, 'Need Approval');
  await edit(id, { Status: 'Yes' });
  assert.equal((await read(id)).Fulfillment_Stage, 'Order Readiness');
});

test('a record already past Order Readiness is never moved by this rule', async () => {
  for (const stage of ['Picking', 'Pack & QC', 'Crate', 'For Delivery']) {
    const id = await add({ Package: 'PAC-3', Status: 'No', Fulfillment_Stage: stage });
    assert.equal((await read(id)).Fulfillment_Stage, stage);
    await edit(id, { Status: 'Partial' });
    assert.equal((await read(id)).Fulfillment_Stage, stage);
  }
});
