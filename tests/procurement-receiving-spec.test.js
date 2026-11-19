// Receiving of the spec v1.4 (server/modules/procurement/receiving-spec.mjs), on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { rescoreReceivings, checkReceivingSilence, runReceivingDaily } from '../server/modules/procurement/receiving-spec.mjs';
import { loadSettings } from '../server/modules/procurement/plan.mjs';
import { addDays, ymd, todayDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Purchase_Order', 'Purchase_Request1', 'Shipments', 'Receiving', 'Exceptions', 'Tony_Shipment', 'Fenteng_Shipment', 'Sales_Order', 'Sales_Order_Fulfillment', 'App_Notifications', 'Items',
  'Stage_Events', 'Procurement_Settings', 'Forecast_Settings'];
let db, raw, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); await db.query('DELETE FROM _number_series'); });

const today = todayDate();
const day = (n) => ymd(addDays(today, n));
const rejects = (fn, re) => assert.rejects(fn, (e) => re.test(e.message));
const rcv = (id) => raw.getRecordById('Receiving', id, { raw: true });
const line = (extra = {}) => ({ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Expected_Qty: 3, ...extra });
const events = async (id) => (await raw.find('Stage_Events', (e) => e.Record_Type === 'receiving' && String(e.Record_Id) === String(id))).sort((a, b) => Number(a.ID) - Number(b.ID));
async function shipment(extra = {}) { return raw.addRecord('Shipments', { Shipment_No: 'SHP-00001', Supplier: 'Tony', Shipment_Status: 'In Transit', ...extra }); }

test('the four events are server stamps: counted on the first quantity, arrived derived "before" it, binned on the bin, available when pickable', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line()] });
  assert.ok(!(await rcv(id)).Arrived_At && !(await rcv(id)).Counted_At);
  await store.updateRecord('Receiving', id, { Receiving_Line_Items: [line({ Accepted_Qty: 3 })] });
  let r = await rcv(id);
  assert.ok(r.Counted_At && r.Arrived_At);
  assert.ok(!r.Binned_At && !r.Available_At);
  assert.equal(r.Receive_Status, 'Partial Received', 'counted in full, not binned: not pickable (D12)');
  await store.updateRecord('Receiving', id, { Receiving_Line_Items: [line({ Accepted_Qty: 3, Bin_location: 'Receiving Area' })] });
  assert.ok(!(await rcv(id)).Binned_At, '"Receiving Area" is where goods wait, not a bin');
  await store.updateRecord('Receiving', id, { Receiving_Line_Items: [line({ Accepted_Qty: 3, Bin_location: 'A-01-1' })] });
  r = await rcv(id);
  assert.ok(r.Binned_At && r.Available_At);
  assert.equal(r.Receive_Status, 'Received');
  assert.equal(r.Receiving_Line_Items[0].Ready_for_Fulfillment === true || r.Receiving_Line_Items[0].Ready_for_Fulfillment === 'true', true);
  const evs = await events(id);
  assert.deepEqual(evs.map((e) => [e.Event, e.Occurred_Bound]), [['receiving.arrived', 'before'], ['receiving.counted', 'exact'], ['receiving.binned', 'exact'], ['receiving.available', 'exact']]);
  const stamp = r.Counted_At;
  await store.updateRecord('Receiving', id, { Notes_for_Shipment: 'later edit' });
  assert.equal((await rcv(id)).Counted_At, stamp, 'a later save keeps the first stamp (T-6)');
});

test('the shipment is received when every line is pickable: stage and event', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line({ Accepted_Qty: 3 })] });
  assert.notEqual((await raw.getRecordById('Shipments', ship, { raw: true })).Stage, 'received');
  await store.updateRecord('Receiving', id, { Receiving_Line_Items: [line({ Accepted_Qty: 3, Bin_location: 'A-01-1' })] });
  const s = await raw.getRecordById('Shipments', ship, { raw: true });
  assert.equal(s.Stage, 'received');
  assert.ok(s.Received_At);
});

test('the gate log: arrival can be reported with when it happened; the future is refused; the stamps cannot be typed', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line()] });
  await rejects(() => store.updateRecord('Receiving', id, { Report_Arrived_On: day(2) }), /future/);
  await store.updateRecord('Receiving', id, { Report_Arrived_On: day(-2) });
  const r = await rcv(id);
  assert.equal(r.Arrived_At, day(-2));
  const ev = (await events(id))[0];
  assert.deepEqual([ev.Event, ev.Occurred_At, ev.Occurred_Bound], ['receiving.arrived', day(-2), 'exact']);
  assert.ok(ev.Reported_At && ev.Reported_At !== ev.Occurred_At, 'when it happened and when we were told');
  await store.updateRecord('Receiving', id, { Counted_At: '2001-01-01', Available_At: '2001-01-01', Rcv_State: 'available', Queue_Rank: 1 });
  const after = await rcv(id);
  assert.ok(!after.Counted_At && !after.Available_At);
});

test('an exception found at receiving records where, the fault origin from the root cause, and the quantity; resolving is stamped (RCV-R3)', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', {
    Shipments: ship, Receive_No1: 'RCV-00009', SO_No: 'SO-5', PO_No: 'PO-1', Create_Exception_Requested: true, Receiving_Line_Items: [line({ Accepted_Qty: 1, Damage_Qty: 2 })],
  });
  let [exc] = await raw.find('Exceptions');
  assert.equal(exc.Found_Stage, 'receiving');
  assert.equal(exc.Fault_Origin, 'unknown', 'no root cause given yet');
  // the receiver gives the root cause of the damage rows
  const r = await rcv(id);
  await store.updateRecord('Receiving', id, { Damage_Missing_Details: r.Damage_Missing_Details.map((d) => ({ ...d, Root_Cause_Category: 'Shipping Damage' })), Create_Exception_Requested: true });
  [exc] = await raw.find('Exceptions');
  assert.equal(exc.Found_Stage, 'receiving');
  assert.equal(Number(exc.Affected_Qty), 2);
  assert.ok((await raw.find('Stage_Events', (e) => e.Event === 'exception.raised')).length === 1);
  await store.updateRecord('Exceptions', exc.ID, { Exception_Status: 'Resolved', Resolution_Action: 'Replacement ordered', Found_Stage: 'qc' });
  const done = (await raw.find('Exceptions'))[0];
  assert.ok(done.Resolved_At);
  assert.equal(done.Found_Stage, 'receiving', 'where it was found cannot be retyped');
  assert.ok((await raw.find('Stage_Events', (e) => e.Event === 'exception.resolved')).length === 1);
});

test('received less than ordered: the suggested action asks for a replacement request, and the buyer is told once (RCV-R7)', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line({ Accepted_Qty: 2, Missing_Qty: 1 })] });
  assert.match((await rcv(id)).Suggested_Action, /replacement request/);
  await store.updateRecord('Receiving', id, { Notes_for_Shipment: 'x' });
  assert.equal((await raw.find('App_Notifications', (n) => n.Notification_Type === 'Receiving Shortage')).length, 1);
  const ok = await store.addRecord('Receiving', { Shipments: ship, Receiving_Line_Items: [line({ Accepted_Qty: 3 })] });
  assert.doesNotMatch((await rcv(ok)).Suggested_Action, /replacement request/, 'nothing short: no shortage suggestion');
});

test('the Arrivals list: arrived-not-counted first, then counted, then expected; oldest Sales Order first inside each; with the reason (SE-1..5)', async () => {
  const shipA = await shipment({ Shipment_No: 'SHP-1', Stage: 'arrived_warehouse', Arrived_Warehouse_At: day(-3) });
  const shipB = await shipment({ Shipment_No: 'SHP-2', Stage: 'arrived_warehouse', Arrived_Warehouse_At: day(-1) });
  const shipC = await shipment({ Shipment_No: 'SHP-3', Stage: 'shipped_out', Receive_Planned: day(3) });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-OLD', Order_Date: day(-60) });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-NEW', Order_Date: day(-5) });
  const newer = await store.addRecord('Receiving', { Shipments: shipB, Receive_No1: 'RCV-2', Receiving_Line_Items: [line({ PR_No: 'PR-NEW' })] });
  const older = await store.addRecord('Receiving', { Shipments: shipA, Receive_No1: 'RCV-1', Receiving_Line_Items: [line({ PR_No: 'PR-OLD' })] });
  const expected = await store.addRecord('Receiving', { Shipments: shipC, Receive_No1: 'RCV-3', Receiving_Line_Items: [line({ PR_No: 'PR-OLD' })] });
  const counted = await store.addRecord('Receiving', { Receive_No1: 'RCV-4', Receiving_Line_Items: [line({ PR_No: 'PR-OLD', Accepted_Qty: 3 })] });
  await rescoreReceivings(raw);
  const [o, n, e, c] = await Promise.all([rcv(older), rcv(newer), rcv(expected), rcv(counted)]);
  assert.deepEqual([o.Rcv_State, n.Rcv_State, e.Rcv_State, c.Rcv_State], ['arrived', 'arrived', 'expected', 'counted']);
  assert.ok(Number(o.Queue_Rank) < Number(n.Queue_Rank), 'the older Sales Order is first');
  assert.ok(Number(n.Queue_Rank) < Number(c.Queue_Rank) && Number(c.Queue_Rank) < Number(e.Queue_Rank));
  assert.equal(o.Order_Date, day(-60));
  assert.match(o.Priority_Reason, /arrived 3 day\(s\) ago, not counted/);
  assert.equal(o.Suggested_Action, 'Count and inspect it');
  assert.equal(c.Suggested_Action, 'Write the bin location');
});

test('silence is an alert: arrived and not counted, counted and not binned (RCV-R6), once each, and the daily run ranks and alerts', async () => {
  const ship = await shipment();
  const id = await store.addRecord('Receiving', { Shipments: ship, Receive_No1: 'RCV-7', Receiving_Line_Items: [line()] });
  await db.query(`UPDATE "Receiving" SET "Arrived_At" = $1 WHERE "ID" = $2`, [`${day(-2)} 09:00:00 AM`, id]);
  const settings = await loadSettings(raw);
  assert.equal(await checkReceivingSilence(raw, settings, new Date()), 1);
  assert.equal(await checkReceivingSilence(raw, settings, new Date()), 0, 'once');
  assert.match((await raw.find('App_Notifications', (n) => n.Notification_Type === 'Receiving Backed Up'))[0].Message, /has not been counted/);
  await store.updateRecord('Receiving', id, { Receiving_Line_Items: [line({ Accepted_Qty: 3 })] });
  await db.query(`UPDATE "Receiving" SET "Counted_At" = $1 WHERE "ID" = $2`, [`${day(-2)} 09:00:00 AM`, id]);
  const r = await runReceivingDaily(raw, { now: new Date() });
  assert.equal(r.alerts, 1);
  assert.equal((await raw.find('App_Notifications', (n) => n.Notification_Type === 'Receiving Not Binned')).length, 1);
});

test('the receiving record shows the forecast pickable date of its shipment (it has no forecast of its own)', async () => {
  const { rescoreShipments } = await import('../server/modules/procurement/ship-track.mjs');
  const ship = await raw.addRecord('Shipments', { Shipment_No: 'SHP-F', Supplier: 'Tony Fan', Shipment_Mode: 'LCL', Required_Days_Lead: 20, PO_Date: ymd(addDays(todayDate(), 0)), Target_Date: ymd(addDays(todayDate(), 120)), Stage: 'production', PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Shipment_QTY: 1 }] });
  const rcv = await raw.addRecord('Receiving', { Receive_No1: 'RCV-F', Shipments: ship, Receiving_Line_Items: [{ PR_No: 'PR-1', SKU: 'L-1', Expected_Qty: 1 }] });
  await rescoreShipments(raw, { full: true });
  const s = await raw.getRecordById('Shipments', ship, { raw: true });
  const r = await raw.getRecordById('Receiving', rcv, { raw: true });
  assert.ok(s.Forecast_Pickable);
  assert.equal(r.Rcv_Forecast_Pickable, String(s.Forecast_Pickable).slice(0, 10));
  await store.updateRecord('Receiving', rcv, { Rcv_Forecast_Pickable: '2000-01-01' });
  assert.notEqual((await raw.getRecordById('Receiving', rcv, { raw: true })).Rcv_Forecast_Pickable, '2000-01-01', 'a widget cannot write it');
});
