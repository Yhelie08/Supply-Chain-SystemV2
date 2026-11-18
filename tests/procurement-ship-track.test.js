// Ship & Track of the spec v1.4 (server/modules/procurement/{plan,sorting,events,ship-track}.mjs), on PGlite with the hooked store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { DEFAULT_SETTINGS, SPEC_NUMBERS, feasibility, plannedChain, forecastChain } from '../server/modules/procurement/plan.mjs';
import { categorise, rank } from '../server/modules/procurement/sorting.mjs';
import { rescoreShipments, runShipmentLadder } from '../server/modules/procurement/ship-track.mjs';
import { addDays, ymd, todayDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Purchase_Order', 'Shipments', 'Receiving', 'Sales_Order', 'Sales_Order_Fulfillment', 'Purchase_Request1', 'Stage_Events', 'Ladder_Events', 'Approval_Queue', 'App_Notifications', 'Procurement_Settings', 'Procurement_Settings_History', 'Target_Date_Changes', 'Suppliers', 'Forecast_Settings'];
let db, raw, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); await db.query('DELETE FROM _number_series'); await useSpecNumbers(raw); });
// The spec's worked numbers (LCL 30, Air 14, fulfillment 3, delivery 2) as saved Procurement Settings rows, so the arithmetic of these tests is the spec's.
const SPEC_ROWS = { transit_lcl_min_days: 30, transit_lcl_max_days: 30, transit_fcl_min_days: 30, transit_fcl_max_days: 30, transit_air_min_days: 14, transit_air_max_days: 14,
  customs_lcl_min_days: 0, customs_lcl_max_days: 0, customs_fcl_min_days: 0, customs_fcl_max_days: 0, customs_air_min_days: 0, customs_air_max_days: 0, fulfillment_days: 3, delivery_days: 2 };
async function useSpecNumbers(rawStore) { for (const [k, v] of Object.entries(SPEC_ROWS)) await rawStore.addRecord('Procurement_Settings', { Setting_Key: k, Value: String(v) }); }
const rowOf = async (rawStore, key) => (await rawStore.find('Procurement_Settings', (r) => r.Setting_Key === key))[0];


const S = { ...DEFAULT_SETTINGS, ...SPEC_NUMBERS }; // the calculator tests use the spec's worked example
const today = todayDate();
const day = (n) => ymd(addDays(today, n));
const rejects = (fn, re) => assert.rejects(fn, (e) => re.test(e.message));
const line = { PR_No: 'PR-1', SKU: 'L-1', Item: 'Lamp', QTY: 2, Supplier: 'Tony Fan', Line_Total: 10, Shipping_Mode: 'LCL' };

async function shipment({ poDays = 0, soDays = -10, target = 60, lines = [line], extra = {}, so = 'SO-100' } = {}) {
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: so, SO_Created_Date: day(soDays) });
  const poId = await store.addRecord('Purchase_Order', { Customer: 'C', PO_Date: day(poDays), PO_Line_Items: lines });
  const id = await store.addRecord('Shipments', {
    PO_No: poId, Sales_Order: so, Supplier: 'Tony Fan', Target_Date: target == null ? '' : day(target),
    PO_Shipments: lines.map((l) => ({ PR_No: l.PR_No, SKU: l.SKU, Item_Name: l.Item, Ordered_QTY: l.QTY, Shipment_QTY: l.QTY, Shipping_Mode: l.Shipping_Mode })), ...extra,
  });
  return { id, poId };
}
const get = (id) => raw.getRecordById('Shipments', id, { raw: true });
const events = async (id) => (await raw.find('Stage_Events', (e) => String(e.Record_Id) === String(id))).sort((a, b) => Number(a.ID) - Number(b.ID));

// ---------- the calculator (Calculators section 3) ----------
test('feasibility: the spec example (target 20 days away, lead 20, LCL) is impossible, 41 days short, and Air is still 25 short', () => {
  const f = feasibility(S, { poDate: today, productionDays: 20, mode: 'LCL', target: addDays(today, 20) });
  assert.equal(f.feasibility, 'impossible');
  assert.equal(f.shortfall_days, 41); // 1 + 20 + 3 + 30 + 2 + 3 + 2 = 61 days needed
  assert.equal(f.air_saving_days, 16);
  assert.equal(f.air_shortfall_days, 25);
  assert.match(f.air_option, /Even by air/);
});

test('feasibility: feasible with room, at_risk with little slack, and Air can rescue a late LCL line', () => {
  assert.equal(feasibility(S, { poDate: today, productionDays: 20, mode: 'LCL', target: addDays(today, 90) }).feasibility, 'feasible');
  assert.equal(feasibility(S, { poDate: today, productionDays: 20, mode: 'LCL', target: addDays(today, 63) }).feasibility, 'at_risk');
  const f = feasibility(S, { poDate: today, productionDays: 20, mode: 'LCL', target: addDays(today, 50) });
  assert.equal(f.feasibility, 'impossible');
  assert.match(f.air_option, /Air saves 16 days -> feasible/);
});

test('planned chain: production starts PO + 1; planned arrival = PO + 1 + production + consolidation + transit + receiving', () => {
  const p = plannedChain(S, { poDate: '2026-01-01', productionDays: 20, mode: 'Airfreight' });
  assert.equal(ymd(p.productionStart), '2026-01-02');
  assert.equal(ymd(p.productionEnd), '2026-01-22');
  assert.equal(ymd(p.shipout), '2026-01-25');
  assert.equal(ymd(p.arrival), '2026-02-08'); // air: 14 days
  assert.equal(ymd(p.receive), '2026-02-10');
});

test('forecast uses actual dates where they exist and never plans a stage in the past', () => {
  const f = forecastChain(S, { poDate: addDays(today, -40), productionDays: 20, mode: 'LCL', today, actual: { production_started: addDays(today, -39) } });
  assert.ok(f.shipout >= today && f.arrival >= today && f.pickable >= today, 'a late supplier pushes the chain from today');
  const g = forecastChain(S, { poDate: addDays(today, -40), productionDays: 20, mode: 'LCL', today, actual: { production_started: addDays(today, -39), production_finished: addDays(today, -20), shipped_out: addDays(today, -10) } });
  assert.equal(ymd(g.arrival), ymd(addDays(today, 20))); // shipped 10 days ago + 30 transit
});

// ---------- the shipment record ----------
test('a new shipment starts in Production, and the planned dates, PO Date and Order Date are computed from the PO and the Sales Order', async () => {
  const { id } = await shipment({ poDays: -2, soDays: -12 });
  const s = await get(id);
  assert.equal(s.Stage, 'production');
  assert.equal(s.PO_Date, day(-2));
  assert.equal(s.Order_Date, day(-12));
  assert.equal(s.Production_Start_Planned, day(-1)); // PO + 1
  assert.equal(s.Production_End_Planned, day(19)); // + 20 days
  assert.equal(s.Shipout_Planned, day(22)); // + 3 consolidation
  assert.equal(s.Arrival_Planned, day(52)); // + 30 LCL
  assert.equal(s.Receive_Planned, day(54)); // + 2 receiving
});

test('a widget cannot type a planned date, an actual stamp, the stage, the order date or a queue column (T-2, ST-R1)', async () => {
  const { id } = await shipment();
  const before = await get(id);
  await store.updateRecord('Shipments', id, {
    Stage: 'received', Order_Date: '2001-01-01', Arrival_Planned: '2001-01-01', Shipped_Out_At: '2001-01-01', Category: 'act_now', Queue_Rank: 99, Notes: 'ok',
  });
  const s = await get(id);
  assert.equal(s.Notes, 'ok', 'normal fields still save');
  assert.equal(s.Stage, 'production');
  assert.equal(s.Order_Date, before.Order_Date);
  assert.equal(s.Arrival_Planned, before.Arrival_Planned);
  assert.ok(!s.Shipped_Out_At);
  assert.notEqual(s.Queue_Rank, '99');
});

test('Report_Event stores the stamp once, with when it happened and when we were told', async () => {
  const { id } = await shipment();
  await store.updateRecord('Shipments', id, { Report_Event: 'production_started', Report_Occurred_At: day(-3), Report_Source: 'supplier' });
  let s = await get(id);
  assert.equal(s.Production_Started_At, day(-3));
  assert.ok(s.Last_Supplier_Update_At, 'a supplier report stamps the last supplier update');
  assert.equal(s.Report_Event, '', 'the transient field is cleared');
  const [e] = await events(id);
  assert.equal(e.Event, 'shipment.production_started');
  assert.equal(e.Occurred_At, day(-3));
  assert.ok(e.Reported_At && e.Reported_At !== e.Occurred_At);
  assert.equal(e.Occurred_Bound, 'exact');
  assert.equal(e.Source, 'supplier');
  assert.equal(Number(e.Visit_No), 1);
  // reported again: the stamp on the shipment is the first one, the log gets a second visit
  await store.updateRecord('Shipments', id, { Report_Event: 'production_started', Report_Occurred_At: day(-1) });
  s = await get(id);
  assert.equal(s.Production_Started_At, day(-3), 'never overwritten (T-6)');
  assert.deepEqual((await events(id)).map((x) => Number(x.Visit_No)), [1, 2]);
});

test('an event cannot have happened in the future, and a bad date is refused', async () => {
  const { id } = await shipment();
  await rejects(() => store.updateRecord('Shipments', id, { Report_Event: 'production_started', Report_Occurred_At: day(2) }), /future/);
  await rejects(() => store.updateRecord('Shipments', id, { Report_Event: 'production_started', Report_Occurred_At: 'yesterday' }), /not a date/);
  assert.equal((await events(id)).length, 0);
});

test('leaving Production needs a production photo (ST-R3); with one, a shipout implies production finished, stored as "before"', async () => {
  const { id } = await shipment();
  await rejects(() => store.updateRecord('Shipments', id, { Report_Event: 'shipped_out', Report_Occurred_At: day(-1) }), /production photo/);
  assert.equal((await get(id)).Stage, 'production');
  await store.updateRecord('Shipments', id, { Production_Photos: ['p1.jpg'] });
  await store.updateRecord('Shipments', id, { Report_Event: 'shipped_out', Report_Occurred_At: day(-1) });
  const s = await get(id);
  assert.equal(s.Stage, 'shipped_out');
  assert.equal(s.Shipment_Status, 'In Transit', 'the legacy status the Zoho widgets read follows the stage');
  assert.equal(s.Ship_Out_Date, day(-1));
  assert.equal(s.Production_Finished_At, day(-1), 'implied by the shipout');
  const evs = await events(id);
  assert.deepEqual(evs.map((e) => [e.Event, e.Occurred_Bound]), [['shipment.production_finished', 'before'], ['shipment.shipped_out', 'exact']]);
});

test('the old way still works: Shipment_Status "In Transit" is a shipout event and needs the photo too', async () => {
  const { id } = await shipment();
  await rejects(() => store.updateRecord('Shipments', id, { Shipment_Status: 'In Transit' }), /production photo/);
  await store.updateRecord('Shipments', id, { Production_Photos: ['p.jpg'], Shipment_Status: 'In Transit' });
  assert.equal((await get(id)).Stage, 'shipped_out');
});

// ---------- the sorting engine ----------
test('categorise: act_now when it will miss and can still change, tell_customer when nothing can change, watch, on_track, blocked first', () => {
  const base = { stage: 'production', orderDate: addDays(today, -10), target: addDays(today, 30), mode: 'LCL', held: '', noSupplier: false, ladderRung: 0, daysLate: 0, productionStarted: false, productionFinished: false };
  const miss = addDays(today, 40); // date needed = target - 5 = today + 25
  assert.equal(categorise({ ...base, forecastPickable: miss }, S, today).category, 'act_now');
  assert.equal(categorise({ ...base, stage: 'shipped_out', forecastPickable: miss }, S, today).category, 'tell_customer');
  assert.equal(categorise({ ...base, forecastPickable: addDays(today, 22) }, S, today).category, 'watch'); // 3 days of slack <= 7
  assert.equal(categorise({ ...base, forecastPickable: addDays(today, 5) }, S, today).category, 'on_track');
  const b = categorise({ ...base, held: 'PR-1 is On Hold', forecastPickable: miss }, S, today);
  assert.equal(b.category, 'blocked');
  assert.match(b.blocked_reason, /On Hold/);
  assert.equal(categorise({ ...base, noSupplier: true, forecastPickable: miss }, S, today).category, 'blocked');
});

test('a shipment already by air with production started and no ladder has nothing left to change: tell the customer', () => {
  const r = categorise({ stage: 'production', orderDate: addDays(today, -10), target: addDays(today, 30), mode: 'Airfreight', held: '', noSupplier: false, ladderRung: 0, daysLate: 0, productionStarted: true, forecastPickable: addDays(today, 40) }, S, today);
  assert.equal(r.category, 'tell_customer');
});

test('no target set: order date + 25 days is used, and the reason says so (never pushed to the bottom)', () => {
  const r = categorise({ stage: 'production', orderDate: addDays(today, -40), target: null, mode: 'LCL', held: '', noSupplier: false, ladderRung: 0, daysLate: 0, forecastPickable: addDays(today, 10) }, S, today);
  assert.equal(r.no_target, true);
  assert.match(r.priority_reason, /no target set/);
  assert.equal(r.category, 'act_now'); // order date + 25 = 15 days ago: long past
});

test('rank: oldest Sales Order date first inside a category, then target, then number; the same input gives the same rank', () => {
  const d = (n) => addDays(today, n);
  const items = [
    { id: '1', no: 'SHP-00010', category: 'act_now', orderDate: d(-5), target: d(10) },
    { id: '2', no: 'SHP-00002', category: 'act_now', orderDate: d(-30), target: d(50) },
    { id: '3', no: 'SHP-00003', category: 'act_now', orderDate: d(-30), target: d(40) },
    { id: '4', no: 'SHP-00004', category: 'watch', orderDate: d(-90), target: d(1) },
    { id: '5', no: 'SHP-00005', category: 'tell_customer', orderDate: d(-1), target: d(1) },
  ];
  const a = rank(items);
  assert.deepEqual(['3', '2', '1', '5', '4'].map((i) => a.get(i)), [1, 2, 3, 4, 5]);
  const again = rank([...items].reverse());
  assert.deepEqual(items.map((i) => again.get(i.id)), items.map((i) => a.get(i.id)), 'same ranks whatever the input order');
});

test('rescore: the board columns are written, the oldest order is ranked first, and a PR on hold blocks the shipment', async () => {
  const older = await shipment({ so: 'SO-OLD', soDays: -60, target: 20 });
  const newer = await shipment({ so: 'SO-NEW', soDays: -5, target: 20, lines: [{ ...line, PR_No: 'PR-2' }] });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-2', Hold_Status: 'On Hold' });
  await rescoreShipments(raw);
  const o = await get(older.id), n = await get(newer.id);
  assert.equal(o.Category, 'act_now');
  assert.equal(Number(o.Queue_Rank), 1);
  assert.equal(o.Risk_Status, 'Delayed', 'Risk Status follows the forecast');
  await store.updateRecord('Shipments', older.id, { Risk_Status: 'On Track' });
  assert.equal((await get(older.id)).Risk_Status, 'Delayed', 'and cannot be typed');
  assert.match(o.Priority_Reason, /SO dated/);
  assert.ok(o.Suggested_Action);
  assert.ok(o.Date_Needed && o.Forecast_Pickable && o.Scored_At);
  assert.equal(n.Category, 'blocked');
  assert.match(n.Blocked_Reason, /PR-2/);
});

test('rescore reaches every Sales Order behind the shipment: its own PR gets the same forecast pickable, not only the shipment', async () => {
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-1', Sales_Order: 'SO-100' });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-9', Sales_Order: 'SO-OTHER' }); // not on any shipment: untouched
  const ship = await shipment({ target: 60 });
  await rescoreShipments(raw);
  const s = await get(ship.id);
  const pr1 = (await raw.find('Purchase_Request1', (p) => p.PR_No === 'PR-1'))[0];
  const pr9 = (await raw.find('Purchase_Request1', (p) => p.PR_No === 'PR-9'))[0];
  assert.ok(s.Forecast_Pickable);
  assert.equal(pr1.Pr_Forecast_Pickable, s.Forecast_Pickable.slice(0, 10));
  assert.equal(pr9.Pr_Forecast_Pickable, '');
});

test('a PR cannot have its own forecast pickable typed; it only follows the shipment', async () => {
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-1', Sales_Order: 'SO-100' });
  await shipment({ target: 60 });
  await rescoreShipments(raw);
  const pr = (await raw.find('Purchase_Request1', (p) => p.PR_No === 'PR-1'))[0];
  await store.updateRecord('Purchase_Request1', pr.ID, { Pr_Forecast_Pickable: '2001-01-01' });
  assert.notEqual((await raw.getRecordById('Purchase_Request1', pr.ID, { raw: true })).Pr_Forecast_Pickable, '2001-01-01');
});

// ---------- the supplier ladder (Ship & Track) ----------
test('ladder: late = production not started by PO + 1; one rung per day, each only once, day 3 is a prepared decision and never a cancel', async () => {
  const { id } = await shipment({ poDays: -2 }); // PO + 1 was yesterday: 1 day late
  await runShipmentLadder(raw, { today });
  let rungs = await raw.find('Ladder_Events');
  assert.deepEqual(rungs.map((r) => Number(r.Rung)), [1]);
  await runShipmentLadder(raw, { today });
  assert.equal((await raw.find('Ladder_Events')).length, 1, 'a rung fires once');
  await runShipmentLadder(raw, { today: addDays(today, 2) }); // 3 days late
  rungs = await raw.find('Ladder_Events');
  assert.deepEqual(rungs.map((r) => Number(r.Rung)).sort(), [1, 2, 3]);
  const q = (await raw.find('Approval_Queue')).filter((i) => i.Kind === 'ladder_day3');
  assert.equal(q.length, 1);
  assert.equal(q[0].Kind, 'ladder_day3');
  assert.equal(q[0].Status, 'pending');
  assert.deepEqual(JSON.parse(q[0].Options), ['cancel_resource', 'hold']);
  assert.notEqual((await get(id)).Stage, 'cancelled', 'no automatic cancellation');
  assert.ok((await raw.find('App_Notifications')).length >= 3);
});

test('ladder day 3: the prepared decision says whether the deposit is paid and how much (spec 04), or that none was paid', async () => {
  const { poId } = await shipment({ poDays: -3, so: 'SO-D1' });
  await raw.updateRecord('Purchase_Order', poId, { Deposit_Paid: true, Deposit_Amount: 5000 }, { byForm: true });
  await runShipmentLadder(raw, { today: addDays(today, 1) });
  const [paid] = (await raw.find('Approval_Queue')).filter((i) => i.Kind === 'ladder_day3');
  assert.match(paid.Summary, /Deposit paid: 5000 on PO-/);
  assert.ok(!/not recorded yet/.test(paid.Summary.replace('Taobao alternative is not recorded yet', '')), 'the deposit is no longer "not recorded yet"');
  await db.query('DELETE FROM "Approval_Queue"'); await db.query('DELETE FROM "Ladder_Events"');
  await raw.updateRecord('Purchase_Order', poId, { Deposit_Paid: false, Deposit_Amount: 0 }, { byForm: true });
  await runShipmentLadder(raw, { today: addDays(today, 1) });
  const [none] = (await raw.find('Approval_Queue')).filter((i) => i.Kind === 'ladder_day3');
  assert.match(none.Summary, /No deposit paid on PO-/);
});

test('ladder: no rung once production has started; older rows with no Stage get no alerts (import safe)', async () => {
  const a = await shipment({ poDays: -5 });
  await store.updateRecord('Shipments', a.id, { Report_Event: 'production_started', Report_Occurred_At: day(-3) });
  const b = await shipment({ poDays: -9, so: 'SO-200' });
  await db.query('UPDATE "Shipments" SET "Stage" = NULL WHERE "ID" = $1', [b.id]); // as if imported from Zoho
  await runShipmentLadder(raw, { today });
  const rungs = await raw.find('Ladder_Events');
  assert.ok(rungs.every((r) => r.Kind !== 'production_start'), 'started on time: no start rung; the imported row is skipped');
});

test('ladder: production finishing late (planned end passed) fires its own rungs, and day 3 offers hold or upgrade, not cancel', async () => {
  const { id } = await shipment({ poDays: -25 });
  await store.updateRecord('Shipments', id, { Report_Event: 'production_started', Report_Occurred_At: day(-24) });
  await runShipmentLadder(raw, { today: addDays(today, 0) }); // planned end = PO + 1 + 20 = 4 days ago
  const rungs = (await raw.find('Ladder_Events')).filter((r) => r.Kind === 'production_finish');
  assert.deepEqual(rungs.map((r) => Number(r.Rung)).sort(), [1, 2, 3]);
  assert.deepEqual(JSON.parse((await raw.find('Approval_Queue')).find((i) => i.Kind === 'ladder_day3').Options), ['hold', 'upgrade_mode']);
});

test('writing what was done on a rung stamps the last chase on the shipment (a side effect, not a button)', async () => {
  const { id } = await shipment({ poDays: -2 });
  await runShipmentLadder(raw, { today });
  const [rung] = await raw.find('Ladder_Events');
  assert.ok(!(await get(id)).Last_Chase_At);
  await store.updateRecord('Ladder_Events', rung.ID, { Action_Taken: 'Called Tony on WeChat' });
  assert.ok((await get(id)).Last_Chase_At);
  assert.ok((await events(id)).some((e) => e.Event === 'shipment.chased'));
});

test('silence alert: shipped out and not at the port within transit days + 3 raises one overdue notification', async () => {
  const { id } = await shipment({ poDays: -60 });
  await store.updateRecord('Shipments', id, { Production_Photos: ['p.jpg'] });
  await store.updateRecord('Shipments', id, { Report_Event: 'shipped_out', Report_Occurred_At: day(-40) }); // 30 + 3 = 33 days allowed
  await runShipmentLadder(raw, { today });
  await runShipmentLadder(raw, { today });
  const n = (await raw.find('App_Notifications')).filter((x) => x.Notification_Type === 'Shipment Overdue');
  assert.equal(n.length, 1);
});

test('Procurement_Settings rows change the numbers (settings, not code)', async () => {
  await raw.updateRecord('Procurement_Settings', (await rowOf(raw, 'transit_lcl_min_days')).ID, { Value: '45' }, { byForm: true });
  await raw.updateRecord('Procurement_Settings', (await rowOf(raw, 'transit_lcl_max_days')).ID, { Value: '45' }, { byForm: true });
  const { id } = await shipment({ poDays: 0 });
  assert.equal((await get(id)).Arrival_Planned, day(1 + 20 + 3 + 45));
});

// ---------- the other writers: Receiving and the supplier's own shipout ----------
test('Receiving: the first count means the shipment arrived at the warehouse "before" it (stage + event with a before bound)', async () => {
  const { id } = await shipment();
  const [rcv] = await raw.find('Receiving');
  await store.updateRecord('Receiving', rcv.ID, { Receiving_Line_Items: rcv.Receiving_Line_Items.map((l) => ({ ...l, Accepted_Qty: l.Expected_Qty })) });
  const s = await get(id);
  assert.equal(s.Stage, 'arrived_warehouse');
  assert.ok(s.Arrived_Warehouse_At);
  const arrived = (await events(id)).find((e) => e.Event === 'shipment.arrived_warehouse');
  assert.equal(arrived.Occurred_Bound, 'before');
  assert.equal(arrived.Source, 'system');
});

test('the supplier ship date is a shipped_out event from the supplier (it implies production finished), and stamps the last supplier update', async () => {
  const { id } = await shipment();
  const sup = await raw.addRecord('Tony_Shipment', { Shipment_No: 'SHP-00001', Parent_Shipment_ID: String(id), Supplier2_Shipment_Details: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', RR_No: '' }] });
  await store.updateRecord('Tony_Shipment', sup, { Supplier2_Shipment_Details: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', RR_No: '', Select_To_Ship: true, Shipment_Mode: 'LCL', Date_Shipped: day(-2) }] });
  const s = await get(id);
  assert.equal(s.Stage, 'shipped_out');
  assert.equal(s.Shipped_Out_At, day(-2));
  assert.equal(s.Production_Finished_At, day(-2));
  assert.ok(s.Last_Supplier_Update_At);
  const evs = await events(id);
  assert.deepEqual(evs.map((e) => [e.Event, e.Source]), [['shipment.production_finished', 'system'], ['shipment.shipped_out', 'supplier']]);
});

test('putting a PR on hold blocks its shipment at once (no waiting for the nightly run)', async () => {
  const { id } = await shipment({ lines: [{ ...line, PR_No: 'PR-9' }] });
  const pr = await raw.addRecord('Purchase_Request1', { PR_No: 'PR-9' });
  await store.updateRecord('Purchase_Request1', pr, { Hold_Status: 'On Hold', Hold_Reason: 'Client stopped order' });
  assert.equal((await get(id)).Category, 'blocked');
  await store.updateRecord('Purchase_Request1', pr, { Hold_Status: '' });
  assert.notEqual((await get(id)).Category, 'blocked');
});
