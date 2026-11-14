// Crate -> To Ship -> For Delivery, and Pre-Order -> Readiness Gate (server/modules/fulfillment/crate-dispatch.mjs), on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const SOF = 'Sales_Order_Fulfillment', QC = 'Checker_Checklist', AGG = 'Order_Aggregation1', CRATE = 'Crate_Checklist', GATE = 'Sales_Order_Readiness_Gate', PRE = 'Pre_Order_FF';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, QC, AGG, CRATE, GATE, PRE]) await db.query(`DELETE FROM "${f}"`); });

const addPackage = (Fulfillment_Stage = 'Crate') => raw.addRecord(SOF, { SO_No: 'SO-1', Fulfillment_Stage, Package: 'PAC-1', Item_Details1: [{ Item: 'Lamp', SKU: 'L-1', Quantity: '3' }, { Item: 'Shade', SKU: 'S-1', Quantity: '1' }] });
const stage = async () => (await raw.find(SOF))[0].Fulfillment_Stage;
const crate = (extra = {}) => store.addRecord(CRATE, {
  SO: 'SO-1', Package_Order: 'PAC-1', SKU: 'L-1', Item_Name: 'Lamp', Quantity: '2', Order_Type: 'Normal', Delivery_Type: 'Delivery Only',
  Customer_Name: 'Sample Customer', Customer_Address: '1 Main St', Crating_Status1: 'Pending', ...extra,
});

test('crating not done: nothing goes to To Ship, the stage is Crate', async () => {
  await addPackage('Order Readiness');
  await crate();
  assert.equal((await raw.find(AGG)).length, 0);
  assert.equal(await stage(), 'Crate');
});

test('crating Done: the item goes to To Ship with the crate quantity, the QC bin and For_Crate, stage Order Aggregation', async () => {
  await addPackage();
  await raw.addRecord(QC, { SO: 'SO-1', PAC: 'PAC-1', SKU: 'L-1', QC_Status: 'Approved', Quantity: '2', Bin_Location: 'A-01', City: 'Makati', Email: 'c@example.test', Contact: '0900' });
  const id = await crate();
  await store.updateRecord(CRATE, id, { Crating_Status1: 'Done' });
  const agg = await raw.find(AGG);
  assert.equal(agg.length, 1);
  assert.equal(agg[0].SO, 'SO-1');
  assert.equal(agg[0].For_Crate === true || agg[0].For_Crate === 'true', true);
  assert.deepEqual(agg[0].Item_Details.map((r) => [r.SKU, String(r.QTY), r.PAC, r.Bin_Location]), [['L-1', '2', 'PAC-1', 'A-01']]);
  assert.equal(agg[0].City, 'Makati');
  assert.equal(await stage(), 'Order Aggregation');
  await store.updateRecord(CRATE, id, { Remarks: 'again' }); // saving again changes nothing
  assert.equal((await raw.find(AGG)).length, 1);
  assert.equal((await raw.find(AGG))[0].Item_Details.length, 1);
});

test('a second crated item of the same SO adds a row to the same To Ship record', async () => {
  await addPackage();
  const a = await crate({ Crating_Status1: 'Done' });
  const b = await crate({ SKU: 'S-1', Item_Name: 'Shade', Quantity: '1', Crating_Status1: 'Done' });
  assert.ok(a && b);
  const agg = await raw.find(AGG);
  assert.equal(agg.length, 1);
  assert.deepEqual(agg[0].Item_Details.map((r) => r.SKU).sort(), ['L-1', 'S-1']);
});

test('Dispatch Selected moves every item of the To Ship record to For Delivery; unchecked keeps it at Order Aggregation', async () => {
  await addPackage('Crate');
  const id = await store.addRecord(AGG, { SO: 'SO-1', PAC: 'PAC-1', Item_Details: [{ Item_Name: 'Lamp', SKU: 'L-1', QTY: 2, PAC: 'PAC-1' }, { Item_Name: 'Shade', SKU: 'S-1', QTY: 1, PAC: 'PAC-1' }] });
  assert.equal(await stage(), 'Order Aggregation');
  await store.updateRecord(AGG, id, { Dispatch_Selected: true });
  assert.equal(await stage(), 'For Delivery');
  await store.updateRecord(AGG, id, { Dispatch_Selected: false }); // never pulled back
  assert.equal(await stage(), 'For Delivery');
});

const received = (extra = {}) => ({
  SO: 'SO-1', SKU: 'L-1', Item_Name: 'Lamp', Qty: '3', Bin_Location: 'B-02', Pre_Order_Status: 'Received', Package_Number: 'PAC-1', Status: 'Partial',
  Order_Type: 'Pre Order', Delivery_Type: 'Delivery Only', Customer_Name: 'Sample Customer', Customer_Address: '1 Main St', PR: 'PR-1', ...extra,
});

test('pre-order not received, or no package number yet: nothing enters the Gate', async () => {
  await store.addRecord(PRE, received({ Pre_Order_Status: 'Pending' }));
  await store.addRecord(PRE, received({ Package_Number: '' }));
  assert.equal((await raw.find(GATE)).length, 0);
});

test('pre-order received with a package number: one Gate record with the same values, payment included; saving again adds none', async () => {
  const id = await store.addRecord(PRE, received());
  let gates = await raw.find(GATE);
  assert.equal(gates.length, 1);
  assert.deepEqual([gates[0].sales_order_number, gates[0].SKU, gates[0].Package_Order, gates[0].Quantity, gates[0].Bin_Location, gates[0].payment_status, gates[0].pr_number],
    ['SO-1', 'L-1', 'PAC-1', '3', 'B-02', 'Partial', 'PR-1']);
  await store.updateRecord(PRE, id, { Qty: '4', Status: 'Yes' });
  gates = await raw.find(GATE);
  assert.equal(gates.length, 1);
  assert.deepEqual([gates[0].Quantity, gates[0].payment_status], ['4', 'Yes']);
});

test('an RR replacement gets its own Gate record and leaves the original one alone', async () => {
  await store.addRecord(PRE, received());
  await store.addRecord(PRE, received({ Replacement_Request: [{ RR: 'RR-00001' }] }));
  const gates = await raw.find(GATE);
  assert.equal(gates.length, 2);
  assert.deepEqual(gates.map((g) => g.rr_number || '').sort(), ['', 'RR-00001']);
});
