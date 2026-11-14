// Receiving workflows (server/modules/procurement/receiving.mjs), run on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const FORMS = ['Purchase_Order', 'Shipments', 'Receiving', 'Exceptions', 'Tony_Shipment', 'Fenteng_Shipment', 'Sales_Order', 'App_Notifications', 'Items'];
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const rcv = (id) => raw.getRecordById('Receiving', id, { raw: true });
const line = (extra = {}) => ({ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Expected_Qty: 3, ...extra });
async function shipment(supplier = 'Tony') {
  return raw.addRecord('Shipments', { Shipment_No: 'SHP-00001', Supplier: supplier, Shipment_Status: 'In Transit' });
}

test('totals, line result and receive status; the shipment becomes Delivered', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line({ Accepted_Qty: 3 }), line({ PR_No: 'PR-2', SKU: 'S-1', Expected_Qty: 2, Accepted_Qty: 1 })] });
  const r = await rcv(id);
  assert.equal(r.Receive_No1, 'RCV-00001');
  assert.deepEqual([r.Total_Expected_Qty, r.Total_Accepted_Qty, r.Total_Lines].map(Number), [5, 4, 2]);
  assert.deepEqual(r.Receiving_Line_Items.map((l) => l.Line_Result), ['Complete', 'Incomplete']);
  assert.equal(r.Receive_Status, 'Partial Received');
  const s = await raw.getRecordById('Shipments', ship, { raw: true });
  assert.equal(s.Shipment_Status, 'Delivered');
  assert.equal(s.Previous_Status, 'In Transit');
  await store.updateRecord('Receiving', id, { Receiving_Line_Items: [line({ Accepted_Qty: 3 }), line({ PR_No: 'PR-2', SKU: 'S-1', Expected_Qty: 2, Accepted_Qty: 2 })] });
  assert.equal((await rcv(id)).Receive_Status, 'Received');
});

test('nothing counted yet is Pending and does not touch the shipment', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line()] });
  assert.equal((await rcv(id)).Receive_Status, 'Pending');
  assert.equal((await raw.getRecordById('Shipments', ship, { raw: true })).Shipment_Status, 'In Transit');
});

test('more than expected is refused', async () => {
  await assert.rejects(() => store.addRecord('Receiving', { Receiving_Line_Items: [line({ Accepted_Qty: 3, Damage_Qty: 1 })] }), /cannot exceed Expected Qty/);
});

test('Create Exception: one exception per damaged / missing line, found again on the next save (never a second one), Need Attention on the shipment', async () => {
  const ship = await shipment();
  const lines = [line({ Accepted_Qty: 1, Damage_Qty: 2 }), line({ PR_No: 'PR-2', SKU: 'S-1', Expected_Qty: 2, Accepted_Qty: 2 })];
  const id = await store.addRecord('Receiving', { Shipments: ship, SO_No: 'SO-5', PO_No: 'PO-00001', Create_Exception_Requested: true, Receiving_Line_Items: lines });
  let exc = await raw.find('Exceptions');
  assert.equal(exc.length, 1);
  assert.equal(exc[0].Exception_No, 'EXC-00001');
  assert.equal(exc[0].Source_Module, 'Receiving');
  assert.equal(exc[0].Exception_Status, 'Open');
  assert.equal(exc[0].Sales_Order, 'SO-5');
  assert.equal(exc[0].Shipment_No, 'SHP-00001');
  assert.equal(exc[0].Exception_Line_Key, 'RCV-00001||L-1');
  let r = await rcv(id);
  assert.equal(Number(r.Exception_Count), 1);
  assert.equal(r.Create_Exception_Requested === false || r.Create_Exception_Requested === 'false', true, 'the request is cleared');
  assert.equal((await raw.getRecordById('Shipments', ship, { raw: true })).Need_Attention1 === true || (await raw.getRecordById('Shipments', ship, { raw: true })).Need_Attention1 === 'true', true);
  // ticking it again re-uses the exception
  await store.updateRecord('Receiving', id, { Create_Exception_Requested: true });
  assert.equal((await raw.find('Exceptions')).length, 1);
  assert.equal(Number((await rcv(id)).Exception_Count), 1);
});

test('damage / missing detail rows: one per unit, no more on a re-save; the exception gets its Product_Context rows and a title', async () => {
  const id = await store.addRecord('Receiving', { Receive_No1: 'RCV-00009', Create_Exception_Requested: true, Supplier: 'Tony', Receiving_Line_Items: [line({ Accepted_Qty: 0, Damage_Qty: 2, Missing_Qty: 1 })] });
  let r = await rcv(id);
  assert.equal(r.Damage_Missing_Details.filter((d) => d.Type_field === 'Damage').length, 2);
  assert.equal(r.Damage_Missing_Details.filter((d) => d.Type_field === 'Missing').length, 1);
  await store.updateRecord('Receiving', id, { Receiving_Notes: 'again' });
  r = await rcv(id);
  assert.equal(r.Damage_Missing_Details.length, 3, 'a re-save adds nothing');
  const [exc] = await raw.find('Exceptions');
  assert.equal(exc.Exception_Title, 'Damage + Missing — Lamp');
  assert.deepEqual(exc.Product_Context1.map((p) => [p.Type_field, Number(p.Qty), p.Repair_Outcome || '']), [['Damage', 1, 'Pending'], ['Damage', 1, 'Pending'], ['Missing', 1, '']]);
  // a repair outcome decided on the exception survives the next receiving save
  const pc = exc.Product_Context1.map((p, i) => (i === 0 ? { ...p, Repair_Outcome: 'Fixed' } : p));
  await raw.updateRecord('Exceptions', exc.ID, { Product_Context1: pc }, { byForm: true });
  await store.updateRecord('Receiving', id, { Receiving_Notes: 'third save' });
  assert.equal((await raw.find('Exceptions'))[0].Product_Context1[0].Repair_Outcome, 'Fixed');
});

test('lines with nothing missing mark the supplier copy of the shipment Arrived; the mode goes to the shipment line', async () => {
  const ship = await raw.addRecord('Shipments', { Shipment_No: 'SHP-00001', Supplier: 'Tony', PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1' }] });
  await raw.addRecord('Tony_Shipment', { Parent_Shipment_ID: String(ship), Supplier2_Shipment_Details: [{ PR_No: 'PR-1', SKU: 'L-1', RR_No: '', Status: 'In Transit' }, { PR_No: 'PR-2', SKU: 'S-1', RR_No: '', Status: 'In Transit' }] });
  await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line({ Accepted_Qty: 3, Shipment_Mode_When_Received: 'Air' })] });
  const [t] = await raw.find('Tony_Shipment');
  assert.deepEqual(t.Supplier2_Shipment_Details.map((r) => r.Status), ['Arrived', 'In Transit']);
  assert.equal((await raw.getRecordById('Shipments', ship, { raw: true })).PO_Shipments[0].Shipment_Mode_When_Received, 'Air');
});

test('quantity mismatch notification: one per receiving record, not one per save', async () => {
  const id = await store.addRecord('Receiving', { Receiving_Line_Items: [line({ Accepted_Qty: 1 })] });
  assert.equal((await raw.find('App_Notifications')).length, 1);
  await store.updateRecord('Receiving', id, { Receiving_Notes: 'x' });
  await store.updateRecord('Receiving', id, { Receiving_Notes: 'y' });
  assert.equal((await raw.find('App_Notifications')).length, 1);
});
