// Purchase Order of the spec v1.4: the feasibility gate, one PO = one supplier + one mode, states and events, acknowledgement alert,
// closing when received (po-create.mjs, po-spec.mjs), on PGlite.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { approvePOMain, approveSupplierPO } from '../server/modules/procurement/po-approval.mjs';
import { runShipmentLadder } from '../server/modules/procurement/ship-track.mjs';
import { acknowledgePO } from '../server/modules/procurement/supplier-portal.mjs';
import { addDays, ymd, todayDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Exceptions', 'Purchase_Request1', 'Purchase_Order', 'Sales_Order', 'Sales_Order_Fulfillment', 'Items', 'Customer', 'Suppliers', 'Tony_Fan_Purchase_Order', 'Fenteng_Lighting_Purchase_Order', 'Shipments',
  'Tony_Shipment', 'Fenteng_Shipment', 'Receiving', 'Stage_Events', 'App_Notifications', 'Approval_Queue', 'Target_Date_Changes', 'Procurement_Settings', 'Procurement_Settings_History', 'Forecast_Settings', 'Ladder_Events'];
let db, raw, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
const SPEC = { transit_lcl_min_days: 30, transit_lcl_max_days: 30, transit_air_min_days: 14, transit_air_max_days: 14, customs_lcl_min_days: 0, customs_lcl_max_days: 0, customs_air_min_days: 0, customs_air_max_days: 0, fulfillment_days: 3, delivery_days: 2 };
beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  await db.query('DELETE FROM _number_series');
  for (const [k, v] of Object.entries(SPEC)) await raw.addRecord('Procurement_Settings', { Setting_Key: k, Value: String(v) });
});

const today = todayDate();
const day = (n) => ymd(addDays(today, n));
const rejects = (fn, re) => assert.rejects(fn, (e) => re.test(e.message));
let customer, lamp;
async function base(suppliers = ['Tony Fan']) {
  customer = await raw.addRecord('Customer', { customer_name: 'Sample Customer' });
  lamp = await raw.addRecord('Items', { item_name: 'Lamp', SKU: 'L-1', Rate: 150 });
  for (const n of suppliers) await raw.addRecord('Suppliers', { Supplier_Name: { first_name: n, last_name: '' }, Active_PO_Count: 0 });
}
const pr = (no, so, extra = {}) => raw.addRecord('Purchase_Request1', {
  PR_No: no, Sales_Order: so, PR_Approved: false, PR_READY_FOR_PO: true, Selected_Supplier: 'Tony Fan', Customer: customer, Items: lamp, sku: 'L-1', quantity: 2, unit: 'pcs',
  Selcted_Final_Cost: 100, Shipment_Mode: 'LCL', Followed_Recommendation: 'Yes', Sales_Owner: 'HC Sales 1', Customer_Type: 'customer', Target_Delivery: day(120), Required_Days_Lead: 20, ...extra,
});
const pos = () => raw.find('Purchase_Order');
const prOf = (no) => raw.find('Purchase_Request1', (p) => p.PR_No === no).then((r) => r[0]);

test('the gate: a line that cannot arrive in time needs an option first, and nothing is written until it has one (PO-R1)', async () => {
  await base();
  await pr('PR-1', 'SO-A', { Target_Delivery: day(20) }); // 61 days needed by sea
  await pr('PR-2', 'SO-A');
  const r = await approvePOMain({ soNo: 'SO-A' }, raw);
  assert.equal(r.status, 'needs_choice');
  assert.deepEqual(r.lines.map((l) => [l.pr_no, l.shortfall_days, l.can_air]), [['PR-1', 41, true]]);
  assert.equal(r.lines[0].earliest_feasible_date, day(61));
  assert.equal((await pos()).length, 0, 'no PO yet');
  assert.equal((await prOf('PR-2')).PR_Approved === true || (await prOf('PR-2')).PR_Approved === 'true', false, 'no PR touched');
});

test('option C, proceed as is: the PO is made, marked born late, with the shortfall and the choice in its note (PO-R3)', async () => {
  await base();
  await pr('PR-1', 'SO-A', { Target_Delivery: day(20) });
  const r = await approvePOMain({ soNo: 'SO-A', lateChoices: { 'PR-1': 'proceed' } }, raw);
  assert.equal(r.status, 'success', JSON.stringify(r));
  const [po] = await pos();
  assert.equal(po.Born_Late === true || po.Born_Late === 'true', true);
  assert.equal(Number(po.Shortfall_Days), 41);
  assert.match(po.Feasibility_Note, /PR-1: 41 days late; chose proceed as is/);
});

test('option A, air: the line goes by air and the dates are worked out again; it is still counted born late (it was late at the gate) and the note says air made it on time', async () => {
  await base();
  await pr('PR-1', 'SO-A', { Target_Delivery: day(50) }); // 61 by sea (11 late); 45 by air (on time)
  const r = await approvePOMain({ soNo: 'SO-A', lateChoices: { 'PR-1': 'air' } }, raw);
  assert.equal(r.status, 'success');
  const [po] = await pos();
  assert.equal(po.Shipment_Mode, 'Airfreight');
  assert.equal(po.PO_Line_Items[0].Shipping_Mode, 'Airfreight');
  assert.equal(po.Born_Late === true || po.Born_Late === 'true', true, 'born late is measured at the gate, before the option');
  assert.equal(Number(po.Shortfall_Days), 11);
  assert.deepEqual([Number(po.Lines_Raised), Number(po.Lines_Born_Late)], [1, 1]);
  assert.match(po.Feasibility_Note, /chose air \(on time\)/);
});

test('option B, propose a new target: the PO is made, a target change goes to Decisions, and the target moves only if it is accepted (PO-R2)', async () => {
  await base();
  const id = await pr('PR-1', 'SO-A', { Target_Delivery: day(20) });
  await approvePOMain({ soNo: 'SO-A', lateChoices: { 'PR-1': 'move_target' } }, raw);
  assert.equal((await prOf('PR-1')).Target_Delivery, day(20), 'the target did not move by itself');
  const [it] = await raw.find('Approval_Queue', (i) => i.Kind === 'forecast_promise_change');
  assert.equal(it.Record_Type, 'pr');
  assert.equal(it.Status, 'pending');
  await store.updateRecord('Approval_Queue', it.ID, { Decision: 'accept_target' }, { user: 'agent@x' });
  assert.equal((await prOf('PR-1')).Target_Delivery, day(61));
  const [ch] = await raw.find('Target_Date_Changes');
  assert.deepEqual([ch.Record_Type, ch.Old_Date, ch.New_Date, ch.Changed_By, ch.Via], ['pr', day(20), day(61), 'agent@x', 'approval_queue']);
  assert.ok(id);
});

test('one PO = one supplier = one mode: other modes get their own PO; Sales Orders can share a PO; the PO keeps the earliest order date and target (PO-R4, DT-1)', async () => {
  await base();
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-OLD', SO_Created_Date: day(-40) });
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-NEW', SO_Created_Date: day(-5) });
  await pr('PR-1', 'SO-OLD', { Order_Date: day(-40), Target_Delivery: day(150) });
  await pr('PR-2', 'SO-NEW', { Order_Date: day(-5), Target_Delivery: day(130) });
  await pr('PR-3', 'SO-NEW', { Order_Date: day(-5), Target_Delivery: day(130), Shipment_Mode: 'Airfreight' });
  const r = await approvePOMain({ prNos: ['PR-1', 'PR-2', 'PR-3'] }, raw);
  assert.equal(r.status, 'success', JSON.stringify(r));
  const list = (await pos()).sort((a, b) => a.PO_No.localeCompare(b.PO_No));
  assert.equal(list.length, 2, 'sea and air are two POs');
  const sea = list.find((p) => p.Shipment_Mode === 'LCL');
  assert.deepEqual(sea.PO_Line_Items.map((l) => l.PR_No).sort(), ['PR-1', 'PR-2'], 'two Sales Orders on one PO');
  assert.equal(sea.Earliest_Order_Date, day(-40));
  assert.equal(sea.Earliest_Target, day(130));
  assert.equal(sea.Customer, 'Sample Customer');
  assert.equal(list.find((p) => p.Shipment_Mode === 'Airfreight').PO_Line_Items[0].PR_No, 'PR-3');
});

test('the supplier is found by ID: a name, an other name, or a whole-word start; two suppliers that fit are never merged (INQ-R6)', async () => {
  await base(['Tony Fan', 'Tony Lee']);
  await raw.addRecord('Suppliers', { Supplier_Name: { first_name: 'Fenteng Lighting', last_name: '' }, Name_Aliases: 'Fenteng, FL' });
  await pr('PR-1', 'SO-A', { Selected_Supplier: 'Tony' }); // fits both Tony Fan and Tony Lee: not merged
  await pr('PR-2', 'SO-A', { Selected_Supplier: 'tony fan' });
  await pr('PR-3', 'SO-A', { Selected_Supplier: 'FL' });
  await pr('PR-4', 'SO-A', { Selected_Supplier: 'Fenteng' });
  const r = await approvePOMain({ soNo: 'SO-A' }, raw);
  assert.match(r.message, /Supplier not in the Suppliers list.*Tony/);
  const list = await pos();
  const tonyFan = (await raw.find('Suppliers', (s) => s.Supplier_Name.first_name === 'Tony Fan'))[0];
  const fenteng = (await raw.find('Suppliers', (s) => s.Supplier_Name.first_name === 'Fenteng Lighting'))[0];
  assert.equal(list.find((p) => p.Supplier_Id === String(tonyFan.ID)).PO_Line_Items.map((l) => l.PR_No).join(), 'PR-2');
  assert.deepEqual(list.find((p) => p.Supplier_Id === String(fenteng.ID)).PO_Line_Items.map((l) => l.PR_No).sort(), ['PR-3', 'PR-4'], 'the alias and the short name are the same supplier');
  assert.equal(list.length, 3, 'the ambiguous "Tony" got its own PO instead of joining either');
});

test('production planned start is PO date + 1, on the line and on the PR (PO-R5)', async () => {
  await base();
  await pr('PR-1', 'SO-A');
  await approvePOMain({ soNo: 'SO-A' }, raw);
  assert.equal((await pos())[0].PO_Line_Items[0].Production_Date, day(1));
  assert.equal((await prOf('PR-1')).Production_Date, day(1));
});

test('events and state: created, sent, acknowledged by the supplier; a PO is never deleted; the server fields cannot be typed', async () => {
  await base();
  await pr('PR-1', 'SO-A');
  await approvePOMain({ soNo: 'SO-A' }, raw);
  await approveSupplierPO('Tony', { soNo: 'SO-A' }, raw);
  const [po] = await pos();
  assert.equal(po.Po_State, 'sent');
  await acknowledgePO('Tony', { poNoSupplier2: po.PO_No, etd: day(10), eta: day(60) }, raw);
  assert.equal((await pos())[0].Po_State, 'acknowledged');
  const events = (await raw.find('Stage_Events', (e) => e.Record_Type === 'po')).map((e) => e.Event).sort();
  assert.deepEqual(events, ['po.acknowledged', 'po.created', 'po.sent']);
  await rejects(() => store.deleteRecord('All_Purchase_Orders', po.ID), /never deleted/);
  await store.updateRecord('Purchase_Order', po.ID, { Born_Late: true, Supplier_Id: '999', Po_State: 'closed', Notes: 'ok' });
  const after = (await pos())[0];
  assert.equal(after.Notes, 'ok');
  assert.notEqual(after.Supplier_Id, '999');
  assert.equal(after.Po_State, 'acknowledged');
  await store.updateRecord('Purchase_Order', po.ID, { PO_Status: 'Cancelled' });
  assert.equal((await pos())[0].Po_State, 'cancelled');
  assert.ok((await pos())[0].Cancelled_At);
});

test('a PO not acknowledged within the window raises one alert for the buyer, and it does not move the production clock (PO-R5)', async () => {
  await base();
  await pr('PR-1', 'SO-A');
  await approvePOMain({ soNo: 'SO-A' }, raw);
  await runShipmentLadder(raw, { today: addDays(today, 2) });
  await runShipmentLadder(raw, { today: addDays(today, 3) });
  const n = await raw.find('App_Notifications', (x) => x.Notification_Type === 'PO Not Acknowledged');
  assert.equal(n.length, 1);
  assert.match(n[0].Message, /has not acknowledged it/);
});

test('the PO closes by itself when every line is fully received (PO-R8)', async () => {
  await base();
  await pr('PR-1', 'SO-A');
  await approvePOMain({ soNo: 'SO-A' }, raw);
  await approveSupplierPO('Tony', { soNo: 'SO-A' }, raw);
  const [rcv] = await raw.find('Receiving');
  await store.updateRecord('Receiving', rcv.ID, { Receiving_Line_Items: rcv.Receiving_Line_Items.map((l) => ({ ...l, Accepted_Qty: 1 })) });
  assert.notEqual((await pos())[0].Po_State, 'closed', 'half received');
  const [r2] = await raw.find('Receiving');
  await store.updateRecord('Receiving', r2.ID, { Receiving_Line_Items: r2.Receiving_Line_Items.map((l) => ({ ...l, Accepted_Qty: l.Expected_Qty })) });
  const po = (await pos())[0];
  assert.equal(po.Po_State, 'closed');
  assert.equal(po.PO_Status, 'Completed');
  assert.ok(po.Completed_On);
  assert.ok((await raw.find('Stage_Events', (e) => e.Event === 'po.closed')).length >= 1);
});

// ---------- the PO list by category, the born-late rate, the PO tracking (spec 03 Screens, PO-R3) ----------
import { rescoreShipments } from '../server/modules/procurement/ship-track.mjs';
import { get_born_late_rate, get_po_tracking } from '../server/modules/procurement/po-spec.mjs';

test('PO list: a PO takes the most urgent category of its shipments, with a rank, the reason and the forecast', async () => {
  await base();
  await pr('PR-1', 'SO-A', { Target_Delivery: day(20) });
  await approvePOMain({ soNo: 'SO-A', lateChoices: { 'PR-1': 'proceed' } }, raw);
  await approveSupplierPO('Tony', { soNo: 'SO-A' }, raw);
  await rescoreShipments(raw, { full: true });
  const [po] = await pos();
  const [ship] = await raw.find('Shipments');
  assert.ok(['act_now', 'tell_customer', 'watch', 'on_track', 'blocked'].includes(po.Po_Category), po.Po_Category);
  assert.equal(po.Po_Category, ship.Category, 'one shipment: the PO has its category');
  assert.ok(po.Po_Priority_Reason);
  assert.ok(po.Po_Forecast_Pickable && po.Po_Scored_At);
  assert.equal(String(po.Po_Queue_Rank), String(ship.Queue_Rank));
});

test('PO list: the category and the counts are written by the server only', async () => {
  await base();
  await pr('PR-1', 'SO-A');
  await approvePOMain({ soNo: 'SO-A' }, raw);
  const [po] = await pos();
  await store.updateRecord('Purchase_Order', po.ID, { Po_Category: 'on_track', Lines_Born_Late: 0, Lines_Raised: 99 });
  const [after] = await pos();
  assert.equal(after.Po_Category ?? '', '');
  assert.notEqual(Number(after.Lines_Raised), 99);
});

test('PO-R3: the born-late rate counts lines late at the gate (even when air saved them) over lines raised, per week', async () => {
  await base();
  await pr('PR-1', 'SO-A', { Target_Delivery: day(50) }); // 11 days late by sea, saved by air
  await pr('PR-2', 'SO-A', { Target_Delivery: day(120) }); // on time
  const r = await approvePOMain({ soNo: 'SO-A', lateChoices: { 'PR-1': 'air' } }, raw);
  assert.equal(r.status, 'success', JSON.stringify(r));
  const pos2 = await pos();
  assert.equal(pos2.reduce((a, p) => a + Number(p.Lines_Raised), 0), 2);
  assert.equal(pos2.reduce((a, p) => a + Number(p.Lines_Born_Late), 0), 1);
  const res = await get_born_late_rate({ weeks: 4 }, raw);
  assert.equal(res.data.raised, 2);
  assert.equal(res.data.born_late, 1);
  assert.equal(res.data.rate, 50);
  assert.equal(res.data.weeks.length, 4);
  assert.equal(res.data.weeks[0].rate, 50);
});

test('PO detail: the tracking lists the PO\'s shipments with planned and actual dates, the category and the event log', async () => {
  await base();
  await pr('PR-1', 'SO-A');
  await approvePOMain({ soNo: 'SO-A' }, raw);
  await approveSupplierPO('Tony', { soNo: 'SO-A' }, raw);
  const [po] = await pos();
  const [ship] = await raw.find('Shipments');
  await store.updateRecord('Shipments', ship.ID, { Report_Event: 'production_started', Report_Occurred_At: day(0), Report_Source: 'supplier' });
  const res = await get_po_tracking({ poId: String(po.ID) }, raw);
  assert.equal(res.data.shipments.length, 1);
  const t = res.data.shipments[0];
  assert.equal(t.shipment_no, ship.Shipment_No);
  assert.ok(t.planned.production_start && t.planned.arrival);
  assert.ok(t.actual.production_started);
  assert.ok(t.events.some((e) => e.event === 'shipment.production_started' && e.source === 'supplier'));
  assert.deepEqual((await get_po_tracking({ poId: '' }, raw)).data.shipments, []);
});

test('a held or cancelled PR cannot be added to a PO: it is skipped and named in the answer (spec 02 acceptance)', async () => {
  await base();
  await pr('PR-1', 'SO-A');
  await pr('PR-2', 'SO-A', { Hold_Status: 'On Hold', Hold_Reason: 'Customer stopped the order' });
  const r = await approvePOMain({ soNo: 'SO-A' }, raw);
  assert.equal(r.status, 'success', JSON.stringify(r));
  const [po] = await pos();
  assert.deepEqual(po.PO_Line_Items.map((l) => l.PR_No), ['PR-1']);
  assert.match(r.message, /Skipped .*PR-2 \(On Hold\)/);
  assert.notEqual((await prOf('PR-2')).PR_Approved, true);
});
