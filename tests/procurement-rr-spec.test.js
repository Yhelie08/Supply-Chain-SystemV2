// Exceptions and Replacement Requests of the spec v1.4 (server/modules/procurement/rr-spec.mjs, replacement-requests.mjs, sorting.mjs):
// target and order date, the supplier choice, Broken first, events, the not-acknowledged alert, the monthly report, and a Local (HC System)
// replacement that still gets a working shipment. On PGlite.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { invokeCustomApi } from '../server/custom-apis.mjs';
import { createRRMain } from '../server/modules/procurement/replacement-requests.mjs';
import { rollupRr, runRrDaily, get_rr_report, targetFor } from '../server/modules/procurement/rr-spec.mjs';
import { rescoreShipments } from '../server/modules/procurement/ship-track.mjs';
import { addDays, ymd, todayDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Exceptions', 'Purchase_Request1', 'Purchase_Order', 'Sales_Order_Fulfillment', 'Shipments', 'Receiving', 'Tony_Shipment', 'Fenteng_Shipment', 'Replacement_Request',
  'Tony_Fan_Replacement_Request', 'Fenteng_Lighting_Replacement_Request', 'Stage_Events', 'App_Notifications', 'Procurement_Settings', 'Approval_Queue', 'Ladder_Events', 'Exception_Control1', 'Package_Shipments'];
let db, raw, store;
const day = (n) => ymd(addDays(todayDate(), n));
const text = (v) => (v == null ? '' : String(v));
const events = async (type, id) => (await raw.find('Stage_Events', (e) => e.Record_Type === type && String(e.Record_Id) === String(id))).map((e) => e.Event);

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); await db.query('DELETE FROM _number_series'); });

async function exception({ target = day(30), orderDate = day(-20), supplier = 'Tony Fan', extra = {} } = {}) {
  await raw.addRecord('Purchase_Order', { PO_No: 'PO-00001' });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-1', Sales_Order: 'SO-A', Target_Delivery: target, Order_Date: orderDate });
  return raw.addRecord('Exceptions', {
    Exception_No: 'EXC-00001', Source_Module: 'Receiving', Exception_Status: 'Open', Sales_Order: 'SO-A', PO_No: 'PO-00001', Receiving_Line_ID: 'PR-1',
    Product_Context1: [{ PR_No: 'PR-1', SKU: 'L-1', Item: 'Lamp', Supplier: supplier, Type_field: 'Damage', Qty: 2, Repairable: 'No' }], ...extra,
  });
}
const rrs = () => raw.find('Replacement_Request');

test('RR-R3: the RR has a Target Delivery (the original one if it is still ahead, else today + 21) and the original Order Date', async () => {
  const id = await exception({ target: day(30), orderDate: day(-20) });
  assert.equal((await createRRMain({ exceptionId: String(id) }, raw)).created, 1);
  const [rr] = await rrs();
  assert.equal(rr.Target_Delivery, day(30));
  assert.equal(rr.Order_Date, day(-20));
  assert.equal(rr.Original_Supplier, 'Tony Fan');
  assert.equal(rr.RR_Supplier, 'Tony Fan');
  assert.deepEqual(await events('rr', rr.ID), ['rr.created']);
  assert.deepEqual([rr.Rr_Category, Number(rr.Rr_Queue_Rank)], ['broken', 1], 'a new RR is Broken and ranked at once');
  // the original target has passed: today + rr_default_days (21)
  await db.query('DELETE FROM "Replacement_Request"'); await db.query('DELETE FROM "Exceptions"'); await db.query('DELETE FROM "Purchase_Request1"');
  const late = await exception({ target: day(-5) });
  await createRRMain({ exceptionId: String(late) }, raw);
  assert.equal((await rrs())[0].Target_Delivery, day(21));
  assert.equal(targetFor('', { rr_default_days: 10 }), day(10), 'no original target');
});

test('RR-R3: the Order Date falls back to the Sales Order creation date', async () => {
  const id = await exception({ orderDate: '' });
  await db.query('UPDATE "Purchase_Request1" SET "Order_Date" = NULL');
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-A', SO_Created_Date: day(-40) });
  await createRRMain({ exceptionId: String(id) }, raw);
  assert.equal((await rrs())[0].Order_Date, day(-40));
});

test('RR-R1: changing the supplier needs a reason; the original supplier and the reason are recorded; "Other" is a typed supplier', async () => {
  const id = await exception({ extra: { RR_Supplier_Override: 'HC System' } });
  const no = await createRRMain({ exceptionId: String(id) }, raw);
  assert.match(no.message, /reason for changing the supplier/);
  assert.equal((await rrs()).length, 0, 'nothing is written without the reason');
  await raw.updateRecord('Exceptions', id, { RR_Supplier_Change_Reason: 'Tony cannot make it again, the local shop can' }, { byForm: true });
  assert.equal((await createRRMain({ exceptionId: String(id) }, raw)).created, 1);
  const [rr] = await rrs();
  assert.deepEqual([rr.RR_Supplier, rr.Original_Supplier, rr.Supplier_Change_Reason], ['HC System', 'Tony Fan', 'Tony cannot make it again, the local shop can']);
  assert.match((await raw.find('Stage_Events', (e) => e.Event === 'rr.created'))[0].Note, /HC System \(was Tony Fan\)/);
  // the same supplier named another way is not a change; a typed "Other" is
  await db.query('DELETE FROM "Replacement_Request"'); await db.query('DELETE FROM "Stage_Events"');
  await raw.updateRecord('Exceptions', id, { RR_Supplier_Override: 'Tony', RR_Supplier_Change_Reason: '' }, { byForm: true });
  assert.equal((await createRRMain({ exceptionId: String(id) }, raw)).created, 1, '"Tony" is Tony Fan: no reason needed');
  await db.query('DELETE FROM "Replacement_Request"');
  await raw.updateRecord('Exceptions', id, { RR_Supplier_Override: 'Taobao seller Lin', RR_Supplier_Change_Reason: 'one-off' }, { byForm: true });
  assert.equal((await createRRMain({ exceptionId: String(id) }, raw)).created, 1);
  assert.equal((await rrs())[0].RR_Supplier, 'Taobao seller Lin');
});

test('the server fields of an RR cannot be written from a widget', async () => {
  const id = await store.addRecord('Replacement_Request', { RR_SKU: 'L-1', Order_Date: '2000-01-01', Original_Supplier: 'x', Rr_Category: 'broken', Rr_Queue_Rank: 9 });
  const rr = await raw.getRecordById('Replacement_Request', id, { raw: true });
  assert.ok(!rr.Order_Date && !rr.Original_Supplier && !rr.Rr_Category && !rr.Rr_Queue_Rank);
});

test('RR-R4: a shipment that carries a replacement is BROKEN and first, above a shipment that is Act now', async () => {
  const mk = (no, lines) => raw.addRecord('Shipments', { Shipment_No: no, Supplier: 'Tony Fan', Shipment_Status: 'Pending', Target_Date: day(10), Required_Days_Lead: 20, PO_Date: day(0), PO_Shipments: lines });
  const normal = await mk('SHP-1', [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Shipment_QTY: 1, Shipping_Mode: 'LCL' }]);
  const repl = await mk('SHP-2', [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Shipment_QTY: 1, Shipping_Mode: 'LCL' }]);
  await raw.addRecord('Replacement_Request', { RR_No: 'RR-00001', RR_Status: 'Acknowledged', Cloned_Shipment_No: 'SHP-2' });
  await rescoreShipments(raw, { full: true });
  const a = await raw.getRecordById('Shipments', normal, { raw: true });
  const b = await raw.getRecordById('Shipments', repl, { raw: true });
  assert.equal(b.Category, 'broken');
  assert.match(b.Priority_Reason, /^Replacement RR-00001/);
  assert.equal(String(b.Queue_Rank), '1');
  assert.notEqual(a.Category, 'broken');
  assert.ok(Number(a.Queue_Rank) > 1);
});

test('the RR list: open RRs are Broken, ranked oldest original Order Date first; the forecast comes from the replacement shipment; a closed one has none', async () => {
  const mk = (no, order, extra = {}) => raw.addRecord('Replacement_Request', { RR_No: no, RR_Status: 'Open', Order_Date: order, Target_Delivery: day(20), ...extra });
  const young = await mk('RR-00001', day(-5));
  const old = await mk('RR-00002', day(-30), { Cloned_Shipment_No: 'SHP-9' });
  const done = await mk('RR-00003', day(-60), { RR_Status: 'Closed' });
  await rollupRr(raw, [{ Shipment_No: 'SHP-9', Forecast_Pickable: day(14) }]);
  const get = (id) => raw.getRecordById('Replacement_Request', id, { raw: true });
  assert.deepEqual([(await get(old)).Rr_Queue_Rank, (await get(young)).Rr_Queue_Rank].map(Number), [1, 2]);
  assert.equal((await get(old)).Rr_Category, 'broken');
  assert.equal((await get(old)).Rr_Forecast_Pickable, day(14));
  assert.ok(!(await get(done)).Rr_Category && !(await get(done)).Rr_Queue_Rank);
});

test('events: exception.raised, rr.created, rr.acknowledged (once each); rr.replacement_received when the replacement is counted and binned', async () => {
  const eid = await store.addRecord('Exceptions', { Source_Module: 'Receiving' });
  assert.deepEqual(await events('exception', eid), ['exception.raised']);
  const id = await store.addRecord('Replacement_Request', { RR_SKU: 'L-1', RR_Supplier: 'Tony Fan', Source_Type: 'Receiving Damage' });
  assert.deepEqual(await events('rr', id), ['rr.created']);
  await store.updateRecord('Replacement_Request', id, { RR_Status: 'Acknowledged' });
  await store.updateRecord('Replacement_Request', id, { RR_Reason: 'edited' });
  assert.deepEqual(await events('rr', id), ['rr.created', 'rr.acknowledged']);
  const rrNo = (await raw.getRecordById('Replacement_Request', id, { raw: true })).RR_No;
  const rcv = await store.addRecord('Receiving', { Receiving_Line_Items: [{ PR_No: 'PR-1', RR_No: rrNo, SKU: 'L-1', Item_Name: 'Lamp', Expected_Qty: 2, Accepted_Qty: 2, Bin_location: 'Receiving Area' }] });
  assert.ok(!(await raw.getRecordById('Replacement_Request', id, { raw: true })).Replacement_Received_At, 'not binned yet');
  await store.updateRecord('Receiving', rcv, { Receiving_Line_Items: [{ PR_No: 'PR-1', RR_No: rrNo, SKU: 'L-1', Item_Name: 'Lamp', Expected_Qty: 2, Accepted_Qty: 2, Bin_location: 'A-01-1' }] });
  assert.ok((await raw.getRecordById('Replacement_Request', id, { raw: true })).Replacement_Received_At);
  assert.deepEqual(await events('rr', id), ['rr.created', 'rr.acknowledged', 'rr.replacement_received']);
});

test('an RR the supplier has not acknowledged after 1 day raises one alert for the buyer', async () => {
  const mk = (no, status, ago) => raw.addRecord('Replacement_Request', { RR_No: no, RR_Status: status, RR_Date: day(-ago), RR_Supplier: 'Fenteng Lighting' });
  await mk('RR-00001', 'Open', 3);
  await mk('RR-00002', 'Open', 0);
  await mk('RR-00003', 'Acknowledged', 5);
  assert.equal((await runRrDaily(raw)).alerted, 1);
  const n = await raw.find('App_Notifications', (x) => x.Notification_Type === 'RR Not Acknowledged');
  assert.equal(n.length, 1);
  assert.match(n[0].Message, /RR-00001 \(Fenteng Lighting\) has not been acknowledged after 1 day/);
  assert.equal((await runRrDaily(raw)).alerted, 0, 'once');
});

test('RR-R6: the monthly report counts replacements by cause, fault origin and supplier', async () => {
  const month = day(0).slice(0, 7);
  await raw.addRecord('Exceptions', { Exception_No: 'EXC-1', Fault_Origin: 'supplier' });
  await raw.addRecord('Exceptions', { Exception_No: 'EXC-2', Fault_Origin: 'transit' });
  const mk = (no, type, exc, sup, orig = sup) => raw.addRecord('Replacement_Request', { RR_No: no, RR_Date: day(0), Source_Type: type, Source_Exception_No: exc, RR_Supplier: sup, Original_Supplier: orig });
  await mk('RR-1', 'Receiving Damage', 'EXC-1', 'Tony Fan');
  await mk('RR-2', 'Receiving Damage', 'EXC-2', 'Tony');
  await mk('RR-3', 'Receiving Missing', 'EXC-1', 'HC System', 'Tony Fan');
  await raw.addRecord('Replacement_Request', { RR_No: 'RR-OLD', RR_Date: '2020-01-01', Source_Type: 'QC Failure' });
  const r = (await get_rr_report({ month }, raw)).data;
  assert.equal(r.total, 3);
  assert.deepEqual(r.by_cause, [{ name: 'Damage', count: 2 }, { name: 'Missing part', count: 1 }]);
  assert.deepEqual(r.by_fault_origin, [{ name: 'supplier', count: 2 }, { name: 'transit', count: 1 }]);
  assert.deepEqual(r.by_supplier, [{ name: 'Tony Fan', count: 2 }, { name: 'HC System', count: 1 }]);
  assert.equal(r.changed_supplier, 1);
  assert.equal(r.rework.rate, null, 'no packages this month: no rate');
});

test('RR-R2: an RR for a Local supplier (HC System) still gets a working replacement shipment and goes to receiving', async () => {
  const po = await raw.addRecord('Purchase_Order', { PO_No: 'PO-00001', Customer: 'ACME' });
  const orig = await raw.addRecord('Shipments', { Shipment_No: 'SHP-00001', PO_No: po, Sales_Order: 'SO-1', Customer: 'ACME', Supplier: 'HC System', Shipment_Status: 'Delivered',
    PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Shipment_QTY: 5, Shipping_Mode: 'Local' }] });
  await raw.addRecord('Receiving', { Receive_No1: 'RCV-00001', Shipments: orig, SO_No: 'SO-1', PO_No: 'PO-00001', Customer_Name: 'ACME', Supplier: 'HC System',
    Receiving_Line_Items: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Expected_Qty: 5, Accepted_Qty: 3 }] });
  await raw.addRecord('Exceptions', { Exception_No: 'EXC-1', PO_No: 'PO-00001', Source_Module: 'Receiving' });
  const rr = await raw.addRecord('Replacement_Request', { RR_No: 'RR-00001', RR_Supplier: 'HC System', Source_Module: 'Receiving', Source_Exception_No: 'EXC-1', RR_SKU: 'L-1', RR_Item_Name: 'Lamp',
    RR_Qty_Value: 2, RR_PR_No: 'PR-1', RR_SO: 'SO-1', Expected_Ship_Date: day(5), ETA: day(9), RR_Status: 'Open' });
  const refused = await invokeCustomApi('clone_shipment_for_replacement', { rrRecordId: rr }, raw, { user: 't' });
  assert.notEqual(refused.status, 'success', 'an HC System RR must be Acknowledged first');
  await raw.updateRecord('Replacement_Request', rr, { RR_Status: 'Acknowledged' }, { byForm: true });
  const out = await invokeCustomApi('clone_shipment_for_replacement', { rrRecordId: rr }, raw, { user: 't' });
  assert.equal(out.status, 'success', JSON.stringify(out));
  const ship = await raw.getRecordById('Shipments', out.shipmentId, { raw: true });
  assert.equal(ship.Supplier, 'HC System');
  assert.equal(ship.Receiving_Record_Created === true || ship.Receiving_Record_Created === 'true', true);
  assert.equal((await raw.find('Receiving')).length, 1, 'the replacement goes to the same receiving record');
  assert.equal((await raw.getRecordById('Replacement_Request', rr, { raw: true })).Cloned_Shipment_No, ship.Shipment_No);
  // and the new shipment is Broken in the queues
  await rescoreShipments(raw, { full: true });
  assert.equal((await raw.getRecordById('Shipments', out.shipmentId, { raw: true })).Category, 'broken');
});
