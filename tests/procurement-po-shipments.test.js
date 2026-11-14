// Purchase_Order, Shipments, Replacement_Request and Exceptions workflows (server/modules/procurement/purchase-order.mjs,
// shipments.mjs, replacement-exceptions.mjs), run on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const FORMS = ['Purchase_Order', 'Shipments', 'Receiving', 'Replacement_Request', 'Tony_Fan_Replacement_Request', 'Fenteng_Lighting_Replacement_Request', 'Exceptions', 'Tony_Shipment', 'Fenteng_Shipment', 'Sales_Order', 'Fenteng_Lighting_Purchase_Order'];
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const rejects = async (fn, re) => { await assert.rejects(fn, (e) => re.test(e.message)); };

// ---------- Purchase_Order ----------
test('PO: number, totals, mixed shipping and the status dates', async () => {
  const a = await store.addRecord('Purchase_Order', { PO_Line_Items: [{ Line_Total: 10.5, Shipping_Mode: 'Air' }, { Line_Total: 4.25, Shipping_Mode: 'Sea' }, { Shipping_Mode: 'Air' }] });
  let po = await raw.getRecordById('Purchase_Order', a, { raw: true });
  assert.equal(po.PO_No, 'PO-00001');
  assert.equal(Number(po.Total_PO_Value), 14.75);
  assert.equal(Number(po.Total_Lines), 3);
  assert.equal(po.Mixed_Shipping === true || po.Mixed_Shipping === 'true', true);
  const b = await store.addRecord('Purchase_Order', { PO_Line_Items: [{ Line_Total: 1, Shipping_Mode: 'Air' }, { Line_Total: 2, Shipping_Mode: 'Air' }] });
  po = await raw.getRecordById('Purchase_Order', b, { raw: true });
  assert.equal(po.PO_No, 'PO-00002');
  assert.equal(po.Mixed_Shipping === true || po.Mixed_Shipping === 'true', false);

  assert.ok(!po.Sent_On);
  await store.updateRecord('Purchase_Order', b, { PO_Status: 'Sent' });
  const sent = (await raw.getRecordById('Purchase_Order', b, { raw: true })).Sent_On;
  assert.ok(sent, 'Sent_On is set when the status becomes Sent');
  await store.updateRecord('Purchase_Order', b, { Notes: 'later edit' });
  assert.equal((await raw.getRecordById('Purchase_Order', b, { raw: true })).Sent_On, sent, 'a later save keeps the date');
  await store.updateRecord('Purchase_Order', b, { PO_Status: 'Completed' });
  assert.ok((await raw.getRecordById('Purchase_Order', b, { raw: true })).Completed_On);
});

test('Fenteng PO copy: totals and mixed shipping on its own _Supplier1 fields, no number of its own', async () => {
  const id = await store.addRecord('Fenteng_Lighting_Purchase_Order', { PO_Line_Items_Supplier1: [{ Line_Total_Supplier1: 3, Shipping_Mode_Supplier1: 'Air' }, { Line_Total_Supplier1: 4, Shipping_Mode_Supplier1: 'Sea' }] });
  const po = await raw.getRecordById('Fenteng_Lighting_Purchase_Order', id, { raw: true });
  assert.equal(Number(po.Total_PO_Value_Supplier1), 7);
  assert.equal(Number(po.Total_Lines_Supplier1), 2);
  assert.equal(po.Mixed_Shipping_Supplier1 === true || po.Mixed_Shipping_Supplier1 === 'true', true);
  assert.ok(!po.PO_No_Supplier1);
});

// ---------- Shipments ----------
async function poWith(lines) {
  const so = await raw.addRecord('Sales_Order', { Sales_Order_Number: 'SO-77' });
  const id = await store.addRecord('Purchase_Order', { SO_No: so, Customer: 'Sample Customer', PO_Line_Items: lines });
  return id;
}
const lamp = { PR_No: 'PR-1', SKU: 'L-1', Item: 'Lamp', QTY: 2, Supplier: 'Tony', Line_Total: 10, Shipping_Mode: 'Air' };
const shade = { PR_No: 'PR-2', SKU: 'S-1', Item: 'Shade', QTY: 1, Supplier: 'Tony', Line_Total: 5, Shipping_Mode: 'Air' };
const shipRow = (l, qty) => ({ PR_No: l.PR_No, SKU: l.SKU, Item_Name: l.Item, Ordered_QTY: l.QTY, Shipment_QTY: qty });

test('Shipment: number, SO / customer / single supplier from the PO, and ONE Receiving record with the lines', async () => {
  const poId = await poWith([lamp, shade]);
  const id = await store.addRecord('Shipments', { PO_No: poId, PO_Shipments: [shipRow(lamp, 2), shipRow(shade, 1)] });
  const ship = await raw.getRecordById('Shipments', id, { raw: true });
  assert.equal(ship.Shipment_No, 'SHP-00001');
  assert.equal(ship.Sales_Order, 'SO-77');
  assert.equal(ship.Customer, 'Sample Customer');
  assert.equal(ship.Supplier, 'Tony');
  assert.equal(ship.Receiving_Record_Created === true || ship.Receiving_Record_Created === 'true', true);
  const rcv = await raw.find('Receiving');
  assert.equal(rcv.length, 1);
  assert.equal(rcv[0].SO_No, 'SO-77');
  assert.equal(rcv[0].Supplier, 'Tony');
  assert.deepEqual(rcv[0].Receiving_Line_Items.map((l) => [l.PR_No, l.SKU, Number(l.Expected_Qty)]), [['PR-1', 'L-1', 2], ['PR-2', 'S-1', 1]]);
});

test('a mixed-supplier PO leaves the shipment supplier alone', async () => {
  const poId = await poWith([lamp, { ...shade, Supplier: 'Fenteng' }]);
  const id = await store.addRecord('Shipments', { PO_No: poId, PO_Shipments: [shipRow(lamp, 2)] });
  assert.ok(!(await raw.getRecordById('Shipments', id, { raw: true })).Supplier);
});

test('a second shipment of the same PO re-uses the Receiving record (no duplicate, lines untouched)', async () => {
  const poId = await poWith([lamp]);
  const first = await store.addRecord('Shipments', { PO_No: poId, PO_Shipments: [shipRow(lamp, 2)] });
  const second = await store.addRecord('Shipments', { PO_No: poId, PO_Shipments: [shipRow(lamp, 1)] });
  const rcv = await raw.find('Receiving');
  assert.equal(rcv.length, 1);
  assert.equal(String(rcv[0].Shipments), String(second), 'pointed at the shipment in flight');
  assert.ok(first && rcv[0].Receiving_Line_Items.length === 1);
  assert.equal(Number(rcv[0].Receiving_Line_Items[0].Expected_Qty), 2, 'Expected_Qty stays the original order quantity');
  assert.equal((await raw.getRecordById('Shipments', second, { raw: true })).Shipment_No, 'SHP-00002');
});

test('editing a shipment: Receiving follows it, new lines are added, existing lines keep Expected_Qty, shipment mode flows down', async () => {
  const poId = await poWith([lamp, shade]);
  const id = await store.addRecord('Shipments', { PO_No: poId, PO_Shipments: [shipRow(lamp, 2)] });
  await store.updateRecord('Shipments', id, { PO_Shipments: [{ ...shipRow(lamp, 1), Shipment_Mode_When_Received: 'Sea' }, shipRow(shade, 1)] });
  const [r] = await raw.find('Receiving');
  assert.equal(r.Receiving_Line_Items.length, 2);
  const l1 = r.Receiving_Line_Items.find((l) => l.SKU === 'L-1');
  assert.equal(Number(l1.Expected_Qty), 2, 'the existing line is not overwritten with the shipment quantity 1');
  assert.equal(l1.Shipment_Mode_When_Received, 'Sea');
  assert.equal(Number(r.Receiving_Line_Items.find((l) => l.SKU === 'S-1').Expected_Qty), 1);
});

test('shipment line status goes back to the supplier copy (Tony), matched by PR_No + SKU', async () => {
  const poId = await poWith([lamp]);
  const id = await store.addRecord('Shipments', { PO_No: poId, PO_Shipments: [shipRow(lamp, 2)] });
  await raw.addRecord('Tony_Shipment', { Parent_Shipment_ID: String(id), Supplier2_Shipment_Details: [{ PR_No: 'PR-1', SKU: 'L-1', Status: 'In Transit' }, { PR_No: 'PR-9', SKU: 'X', Status: 'In Transit' }] });
  await store.updateRecord('Shipments', id, { PO_Shipments: [{ ...shipRow(lamp, 2), Line_Status: 'Arrived' }] });
  const [t] = await raw.find('Tony_Shipment');
  assert.deepEqual(t.Supplier2_Shipment_Details.map((r) => r.Status), ['Arrived', 'In Transit']);
});

test('shipment status change keeps the previous status', async () => {
  const poId = await poWith([lamp]);
  const id = await store.addRecord('Shipments', { PO_No: poId, Shipment_Status: 'In Transit', PO_Shipments: [shipRow(lamp, 2)] });
  await store.updateRecord('Shipments', id, { Shipment_Status: 'Arrived' });
  assert.equal((await raw.getRecordById('Shipments', id, { raw: true })).Previous_Status, 'In Transit');
});

// ---------- Replacement_Request ----------
test('RR: number, Open + date on add; Closed needs the notes and the reason; Closed_At / acknowledge date on the change', async () => {
  const id = await store.addRecord('Replacement_Request', { RR_Status: 'Closed', RR_Reason: 'damaged', Closure_Notes: 'x' });
  let rr = await raw.getRecordById('Replacement_Request', id, { raw: true });
  assert.equal(rr.RR_No, 'RR-00001');
  assert.equal(rr.RR_Status, 'Open', 'a new RR always starts Open');
  assert.ok(rr.RR_Date);
  await store.updateRecord('Replacement_Request', id, { RR_Status: 'Acknowledged' });
  assert.ok((await raw.getRecordById('Replacement_Request', id, { raw: true })).Supplier_Acknowledge_Date);
  await rejects(() => store.updateRecord('Replacement_Request', id, { RR_Status: 'Closed', Closure_Notes: '', RR_Reason: 'damaged' }), /Closure Notes are required/);
  await rejects(() => store.updateRecord('Replacement_Request', id, { RR_Status: 'Closed', Closure_Notes: 'done', RR_Reason: '' }), /RR Reason is required/);
  await store.updateRecord('Replacement_Request', id, { RR_Status: 'Closed', Closure_Notes: 'done', RR_Reason: 'damaged' });
  rr = await raw.getRecordById('Replacement_Request', id, { raw: true });
  assert.equal(rr.RR_Status, 'Closed');
  assert.ok(rr.Closed_At);
});

test('Tony RR copy: its number continues the MAIN RR sequence and Last_Updated is stored', async () => {
  await store.addRecord('Replacement_Request', {});
  const id = await store.addRecord('Tony_Fan_Replacement_Request', {});
  const rr = await raw.getRecordById('Tony_Fan_Replacement_Request', id, { raw: true });
  assert.equal(rr.RR_No, 'RR-00002');
  assert.equal(rr.RR_Status, 'Open');
  assert.ok(rr.Last_Updated);
});

// ---------- Exceptions ----------
test('Exception: number and Open on add; Resolved needs the action; Closed only after Resolved', async () => {
  const id = await store.addRecord('Exceptions', { Exception_Title: 'Broken glass' });
  const exc = await raw.getRecordById('Exceptions', id, { raw: true });
  assert.equal(exc.Exception_No, 'EXC-00001');
  assert.equal(exc.Exception_Status, 'Open');
  assert.ok(exc.Opened_On);
  await rejects(() => store.updateRecord('Exceptions', id, { Exception_Status: 'Resolved' }), /Resolution Action is required/);
  await rejects(() => store.updateRecord('Exceptions', id, { Exception_Status: 'Closed' }), /must be Resolved first/);
  await store.updateRecord('Exceptions', id, { Exception_Status: 'Resolved', Resolution_Action: 'Replaced' });
  await store.updateRecord('Exceptions', id, { Exception_Status: 'Closed' });
  assert.equal((await raw.getRecordById('Exceptions', id, { raw: true })).Exception_Status, 'Closed');
  assert.equal((await raw.getRecordById('Exceptions', await store.addRecord('Exceptions', {}), { raw: true })).Exception_No, 'EXC-00002');
});

// ---------- the Fulfillment "Create RR" button (Exception Control widget) ----------
test('Fulfillment Create RR: the RR lands in the Procurement Replacement_Request, and the supplier copy ends with the SAME number', async () => {
  // the widget: main record first, then the supplier's copy, then a plain edit that puts the main number back on the copy
  const main = await store.addRecord('Replacement_Request', { RR_No: 'RR-00001', RR_Date: '2026-11-14', RR_Status: 'Open', Source_Type: 'QC Failure', Source_Module: 'Fulfillment EXC', Source_Exception_No: 'EXC-FF-00007', RR_Supplier: 'Tony', RR_SKU: 'L-1', RR_SO: 'SO-1', RR_PAC: 'PAC-1', Replacement_Summary: [{ PR_No: 'PR-1', SKU: 'L-1', RR_Qty: 1 }] });
  const copy = await store.addRecord('Tony_Fan_Replacement_Request', { RR_No: 'RR-00001', RR_Status: 'Open', Source_Module: 'Fulfillment EXC', Source_Exception_No: 'EXC-FF-00007', RR_SO: 'SO-1', Replacement_Summary: [{ PR_No: 'PR-1', SKU: 'L-1', RR_Qty: 1 }] });
  await store.updateRecord('Tony_Fan_Replacement_Request', copy, { RR_No: 'RR-00001' });
  const m = await raw.getRecordById('Replacement_Request', main, { raw: true });
  const c = await raw.getRecordById('Tony_Fan_Replacement_Request', copy, { raw: true });
  assert.equal(m.RR_No, 'RR-00001');
  assert.equal(m.RR_Status, 'Open');
  assert.equal(m.Source_Exception_No, 'EXC-FF-00007');
  assert.equal(c.RR_No, 'RR-00001', 'the follow-up edit keeps the main number on the copy');
  assert.equal((await raw.find('Replacement_Request')).length, 1, 'one RR in Procurement');
});
