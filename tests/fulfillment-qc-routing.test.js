// QC routing (server/modules/fulfillment/qc-routing.mjs), run on PGlite with the hooked store:
// approved -> To Ship (or Crate when the package is for crating), rejected -> Exception Control, split = both.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const SOF = 'Sales_Order_Fulfillment', QC = 'Checker_Checklist', AGG = 'Order_Aggregation1', CRATE = 'Crate_Checklist', EXC = 'Exception_Control1';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, QC, AGG, CRATE, EXC, 'ExceptionControl_Notifications']) await db.query(`DELETE FROM "${f}"`); });

const addPackage = () => raw.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage: 'Pack & QC', Package: 'PAC-1', Item_Details1: [{ Item: 'Lamp', SKU: 'L-1', Quantity: '3' }] });
const addQc = (extra = {}) => store.addRecord(QC, {
  SO: 'SO-1', PAC: 'PAC-1', SKU: 'L-1', Item_Name: 'Lamp', Quantity: '3', Bin_Location: 'A-01', Customer_Name: 'Sample Customer', Customer_Address: '1 Main St',
  Order_Type: 'Normal', Delivery_Type: 'Delivery Only', ...extra,
});
const decide = (id, QC_Status, Quantity, extra = {}) => store.updateRecord(QC, id, { QC_Status, Quantity: String(Quantity), ...extra });
const stage = async () => (await raw.find(SOF))[0].Fulfillment_Stage;

test('approved, not for crating: one To Ship record with the item row and the approved quantity', async () => {
  await addPackage();
  const id = await addQc();
  await decide(id, 'Approved', 3);
  const agg = await raw.find(AGG);
  assert.equal(agg.length, 1);
  assert.equal(agg[0].SO, 'SO-1');
  assert.deepEqual(agg[0].Item_Details.map((r) => [r.SKU, String(r.QTY), r.PAC, r.Bin_Location]), [['L-1', '3', 'PAC-1', 'A-01']]);
  assert.equal((await raw.find(CRATE)).length, 0);
  assert.equal((await raw.find(EXC)).length, 0);
  assert.equal(await stage(), 'Order Aggregation');
});

test('approved and for crating: goes to Crate, not To Ship', async () => {
  await addPackage();
  const id = await addQc({ For_Crate: true });
  await decide(id, 'Approved', 3, { Quality_Checker: 'Kurt' });
  const crate = await raw.find(CRATE);
  assert.equal(crate.length, 1);
  assert.equal(crate[0].SO, 'SO-1');
  assert.equal(crate[0].Package_Order, 'PAC-1');
  assert.equal(String(crate[0].Quantity), '3');
  assert.equal(crate[0].Assigned_Checker, 'Kurt');
  assert.equal((await raw.find(AGG)).length, 0);
  assert.equal(await stage(), 'Crate');
});

test('rejected: one Exception Control record per unit, numbered, and nothing goes to To Ship or Crate', async () => {
  await addPackage();
  const id = await addQc();
  await decide(id, 'Rejected', 2, { Remarks: 'Cracked glass' });
  const exc = await raw.find(EXC);
  assert.equal(exc.length, 2);
  assert.deepEqual(exc.map((e) => e.Exception_Number).sort(), ['EXC-FF-00001', 'EXC-FF-00002']);
  assert.ok(exc.every((e) => e.Sales_Order === 'SO-1' && e.SKU === 'L-1' && e.PAC === 'PAC-1' && String(e.Qty) === '1' && e.Remarks === 'Cracked glass'));
  assert.equal((await raw.find(AGG)).length + (await raw.find(CRATE)).length, 0);
});

test('3 units, 2 pass and 1 fails: the failed one is in Exception Control and the two that passed are in To Ship', async () => {
  await addPackage();
  const id = await addQc();
  await decide(id, 'Rejected', 1);                                                      // the page writes the rejected share first,
  await decide(id, 'Approved', 2, { Split_Rejected_Qty: '1', Split_Original_Qty: '3' }); // then the approved share
  assert.equal((await raw.find(EXC)).length, 1);
  const agg = await raw.find(AGG);
  assert.equal(agg.length, 1);
  assert.equal(String(agg[0].Item_Details[0].QTY), '2');
});

test('saving the same decision again adds nothing', async () => {
  await addPackage();
  const id = await addQc();
  await decide(id, 'Rejected', 1);
  await decide(id, 'Rejected', 1);
  await decide(id, 'Approved', 2);
  await decide(id, 'Approved', 2);
  assert.equal((await raw.find(EXC)).length, 1);
  const agg = await raw.find(AGG);
  assert.equal(agg.length, 1);
  assert.equal(agg[0].Item_Details.length, 1);
  assert.equal(String(agg[0].Item_Details[0].QTY), '2');
});

test('a later batch of the same item adds to the To Ship row; a different item adds a row to the same record', async () => {
  await addPackage();
  const a = await addQc({ Quantity: '2' });
  await decide(a, 'Approved', 2);
  const b = await addQc({ Quantity: '1' });
  await decide(b, 'Approved', 1);
  const c = await addQc({ SKU: 'S-1', Item_Name: 'Shade', Quantity: '5' });
  await decide(c, 'Approved', 5);
  const agg = await raw.find(AGG);
  assert.equal(agg.length, 1);
  const rows = Object.fromEntries(agg[0].Item_Details.map((r) => [r.SKU, String(r.QTY)]));
  assert.deepEqual(rows, { 'L-1': '3', 'S-1': '5' });
});

test('pending or blank status does nothing', async () => {
  await addPackage();
  const id = await addQc();
  await store.updateRecord(QC, id, { Remarks: 'draft' });
  assert.equal((await raw.find(AGG)).length + (await raw.find(CRATE)).length + (await raw.find(EXC)).length, 0);
  assert.equal(await stage(), 'Pack & QC');
});

test('store.find with a criteria reads only the matching rows; without one it reads everything; a bad criteria still gives the right rows', async () => {
  const { eq } = await import('../server/modules/fulfillment/where.mjs');
  await raw.addRecord(AGG, { SO: 'SO-A', PAC: 'PAC-A', Item_Details: [] });
  await raw.addRecord(AGG, { SO: 'SO-B', PAC: 'PAC-B', Item_Details: [] });
  assert.equal((await raw.find(AGG)).length, 2);
  assert.deepEqual((await raw.find(AGG, () => true, { criteria: eq('SO', 'SO-A') })).map((r) => r.SO), ['SO-A']);
  assert.equal((await raw.find(AGG, () => true, { criteria: eq('SO', 'a "quoted" \ value') })).length, 0);
  assert.deepEqual((await raw.find(AGG, (r) => r.SO === 'SO-B', { criteria: '(NoSuchField == "x")' })).map((r) => r.SO), ['SO-B']);
});
