// The two daily forecast schedules (server/forecast/schedule.mjs) and the runner (server/schedules.mjs), on PGlite.
// "today" is passed in (12 Nov 2026). Tests marked "mirrors Zoho" follow the Deluge literally.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { runForecastStampDaily, runBackfillPreOrder } from '../../server/forecast/schedule.mjs';
import { fcStampBySoNo, NULL_TEXT } from '../../server/forecast/stamp.mjs';
import { localParts, runDueSchedules, startSchedules } from '../../server/schedules.mjs';
import { modules } from '../../server/modules/index.mjs';

const FORMS = ['Forecast_Settings', 'Schedule_Test_Settings', 'Sales_Order_Fulfillment', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Pick1', 'Checker_Checklist', 'Order_Aggregation1', 'Crate_Checklist', 'Receiving', 'Purchase_Request1', 'Shipments', 'Service_Request1', 'Service_Appointment_Form'];
const today = new Date(2026, 10, 12);
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); await db.query('DROP TABLE IF EXISTS "_schedule_runs"'); });

const add = (form, data) => raw.addRecord(form, data);
const read = (form, id) => raw.getRecordById(form, id, { raw: true });
const addedOn = (form, id, text) => db.query(`UPDATE "${form}" SET "Added_Time" = $1 WHERE "ID" = $2::bigint`, [text, id]);
const daily = () => runForecastStampDaily(raw, { today });

test('per item: each Fulfillment row is one item, with its own forecast; an item with no PR is stock on hand', async () => {
  const pr = await add('Purchase_Request1', { PR_No: 'PR-1', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  const withPr = await add('Sales_Order_Fulfillment', { SO_No: 'SO-1', SO_SKU_Key: 'SO-1_L-1', PR_No: 'PR-1', order_type: '(PARTLY) PRE ORDER', Shipment_Mode: 'Air' });
  const noPr = await add('Sales_Order_Fulfillment', { SO_No: 'SO-1', SO_SKU_Key: 'SO-1_S-1', order_type: '(PARTLY) PRE ORDER' });
  await daily();
  assert.deepEqual([(await read('Sales_Order_Fulfillment', withPr)).Forecast_Delivery, (await read('Sales_Order_Fulfillment', withPr)).Forecast_Window], ['2026-11-17', 'Nov 15 - Nov 18, 2026 | Air | Procurement']);
  assert.deepEqual([(await read('Sales_Order_Fulfillment', noPr)).Forecast_Delivery, (await read('Sales_Order_Fulfillment', noPr)).Forecast_Window], ['2026-11-19', 'Nov 19 - Nov 19, 2026 | LCL? | Stock on hand']);
});

test('the PR is stamped with the forecast of its item; a PR number that came as the text "null" is no PR', async () => {
  const pr = await add('Purchase_Request1', { PR_No: 'PR-2', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-2', SO_SKU_Key: 'SO-2_L-1', PR_No: 'PR-2', order_type: 'PRE ORDER', Shipment_Mode: 'Air' });
  const noPr = await add('Sales_Order_Fulfillment', { SO_No: 'SO-3', SO_SKU_Key: 'SO-3_L-1', PR_No: 'null', order_type: 'PRE ORDER' });
  await daily();
  assert.equal((await read('Purchase_Request1', pr)).Forecast_Delivery, '2026-11-17');
  assert.match((await read('Sales_Order_Fulfillment', noPr)).Forecast_Window, /Stock on hand/);
});

test('mirrors Zoho: the SKU of the item picks its Gate row and its prep start; with no SKU match the PR number does', async () => {
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-4', SO_SKU_Key: 'SO-4_KB-1', PR_No: 'PR-4', Fulfillment_Stage: 'Picking', order_type: 'STOCK' });
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-4', SO_SKU_Key: 'SO-4_KB-2', PR_No: 'PR-4', Fulfillment_Stage: 'Picking', order_type: 'STOCK' });
  await add('Purchase_Request1', { PR_No: 'PR-4' });
  const g1 = await add('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-4', SKU: 'SKU: kb-1', pr_number: 'PR-4' });
  const g2 = await add('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-4', SKU: 'KB-2', pr_number: 'PR-4' });
  await addedOn('Sales_Order_Readiness_Gate', g1, '2026-11-09 09:00:00 AM'); // KB-1: 3 of 7 days used
  await addedOn('Sales_Order_Readiness_Gate', g2, '2026-11-11 09:00:00 AM'); // KB-2: 1 day used
  await daily();
  assert.equal((await read('Sales_Order_Readiness_Gate', g1)).Forecast_Delivery, '2026-11-16');
  assert.equal((await read('Sales_Order_Readiness_Gate', g2)).Forecast_Delivery, '2026-11-18');
});

test('the forms with no SKU get the roll-up of the order: the latest date and the worst status, naming the item', async () => {
  const early = await add('Sales_Order_Fulfillment', { SO_No: 'SO-5', SO_SKU_Key: 'SO-5_A', order_type: 'STOCK', target_delivery_date: '2026-11-30' });
  const pr = await add('Purchase_Request1', { PR_No: 'PR-5', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  const late = await add('Sales_Order_Fulfillment', { SO_No: 'SO-5', SO_SKU_Key: 'SO-5_B', PR_No: 'PR-5', order_type: 'PRE ORDER', Shipment_Mode: 'Air', target_delivery_date: '2026-11-16' });
  const rcv = await add('Receiving', { SO_No: 'SO-5' });
  const oa = await add('Order_Aggregation1', { SO: 'SO-5' });
  const sr = await add('Service_Request1', { Sales_Order: 'SO-5' });
  const sa = await add('Service_Appointment_Form', { Sales_Order: 'SO-5' });
  await daily();
  assert.equal((await read('Sales_Order_Fulfillment', early)).Forecast_Status, 'On Track');
  assert.equal((await read('Sales_Order_Fulfillment', late)).Forecast_Status, 'At Risk');
  for (const [form, id] of [['Receiving', rcv], ['Order_Aggregation1', oa], ['Service_Request1', sr], ['Service_Appointment_Form', sa]]) {
    const r = await read(form, id);
    // the latest date is the stock item's (Nov 19, prep days), the worst status is the late item's (At Risk)
    assert.deepEqual([r.Forecast_Delivery, r.Forecast_Status], ['2026-11-19', 'At Risk'], form);
    assert.equal(r.Forecast_Window, 'Nov 19 - Nov 19, 2026 | LCL? | Stock on hand | 11d early | item A', form);
  }
});

test('the shipment of a PR is the one with the earliest Date_Shipped, and the order is in transit from that day', async () => {
  const pr = await add('Purchase_Request1', { PR_No: 'PR-6', Sourcing_Type: 'Import', Shipment_Mode: 'LCL' });
  await addedOn('Purchase_Request1', pr, '2026-10-01 08:00:00 AM');
  const s1 = await add('Shipments', { Shipment_Status: 'In Transit', Supplier_Shipment_Details: [{ PR_No: 'PR-6', Date_Shipped: '05-Nov-2026' }] });
  const s2 = await add('Shipments', { Shipment_Status: 'In Transit', Supplier_Shipment_Details: [{ PR_No: 'PR-6', Date_Shipped: '30-Oct-2026' }] });
  const sof = await add('Sales_Order_Fulfillment', { SO_No: 'SO-6', SO_SKU_Key: 'SO-6_A', PR_No: 'PR-6', order_type: 'PRE ORDER', Shipment_Mode: 'LCL' });
  await daily();
  const r = await read('Sales_Order_Fulfillment', sof);
  assert.match(r.Forecast_Window, /\| LCL \| In transit/);
  assert.match(r.Forecast_Window, /^Dec 18 - Jan 15, 2027/); // Oct 30 + 49 and + 77 days
  assert.notEqual((await read('Shipments', s2)).Forecast_Delivery, '');
  assert.equal((await read('Shipments', s1)).Forecast_Delivery, '');
});

test('a PR with no SOF is stamped "No Client Date", and "No Start Date" when it has no Added_Time', async () => {
  const a = await add('Purchase_Request1', { PR_No: 'PR-7', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', a, '2026-11-01 08:00:00 AM');
  const b = await add('Purchase_Request1', { PR_No: 'PR-8', Shipment_Mode: 'Air' });
  await db.query('UPDATE "Purchase_Request1" SET "Added_Time" = $1 WHERE "ID" = $2::bigint', ['', b]);
  const out = await daily();
  assert.deepEqual([(await read('Purchase_Request1', a)).Forecast_Window, (await read('Purchase_Request1', a)).Forecast_Status], ['Nov 15 - Nov 18, 2026 | Air | Procurement', 'No Client Date']);
  assert.deepEqual([(await read('Purchase_Request1', b)).Forecast_Window, (await read('Purchase_Request1', b)).Forecast_Status], ['Walang panimulang petsa', 'No Start Date']);
  assert.equal(out.prOnlyCount, 2);
});

test('mirrors Zoho: a PR with a SOF is not in the second pass (it keeps its item\'s forecast)', async () => {
  const pr = await add('Purchase_Request1', { PR_No: 'PR-9', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-9', SO_SKU_Key: 'SO-9_A', PR_No: 'PR-9', order_type: 'PRE ORDER', Shipment_Mode: 'Air', target_delivery_date: '2026-11-20' });
  const out = await daily();
  assert.equal(out.prOnlyCount, 0);
  assert.equal((await read('Purchase_Request1', pr)).Forecast_Status, 'On Track'); // the item's status, not "No Client Date"
});

test('mirrors Zoho (?): a blank Shipment_Mode on the SOF row is the text "null", so the PR mode is not used (depends on NULL_TEXT)', async () => {
  const pr = await add('Purchase_Request1', { PR_No: 'PR-20', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  const sof = await add('Sales_Order_Fulfillment', { SO_No: 'SO-20', SO_SKU_Key: 'SO-20_A', PR_No: 'PR-20', order_type: 'PRE ORDER' });
  await daily();
  assert.match((await read('Sales_Order_Fulfillment', sof)).Forecast_Window, NULL_TEXT ? /| LCL? | Procurement/ : /| Air | Procurement/);
});

test('Schedule_Test_Settings can set a test "today"', async () => {
  const id = await add('Sales_Order_Fulfillment', { SO_No: 'SO-10', SO_SKU_Key: 'SO-10_A', order_type: 'STOCK' });
  await add('Schedule_Test_Settings', { Test_Current_Date: '2026-12-01' });
  await daily();
  assert.equal((await read('Sales_Order_Fulfillment', id)).Forecast_Delivery, '2026-12-08');
});

test('a second run writes nothing', async () => {
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-11', SO_SKU_Key: 'SO-11_A', order_type: 'STOCK' });
  await add('Receiving', { SO_No: 'SO-11' });
  await daily();
  let writes = 0;
  const counting = { ...raw, updateRecord: async (...a) => { writes += 1; return raw.updateRecord(...a); } };
  await runForecastStampDaily(counting, { today });
  assert.equal(writes, 0);
});

test('the schedule and the on-save stamp give the same forecast for a one-item order (same ladder)', async () => {
  const pr = await add('Purchase_Request1', { PR_No: 'PR-12', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  const sof = await add('Sales_Order_Fulfillment', { SO_No: 'SO-12', SO_SKU_Key: 'SO-12_A', PR_No: 'PR-12', order_type: 'PRE ORDER', Shipment_Mode: 'Air', target_delivery_date: '2026-11-20' });
  await daily();
  const bySchedule = (await read('Sales_Order_Fulfillment', sof));
  const wanted = [bySchedule.Forecast_Delivery, bySchedule.Forecast_Window, bySchedule.Forecast_Status];
  await raw.updateRecord('Sales_Order_Fulfillment', sof, { Forecast_Delivery: '', Forecast_Window: '', Forecast_Status: '' }, { byForm: true });
  await fcStampBySoNo(raw, 'SO-12', { today });
  const bySave = await read('Sales_Order_Fulfillment', sof);
  assert.deepEqual([bySave.Forecast_Delivery, bySave.Forecast_Window, bySave.Forecast_Status], wanted);
});

test('the pre-order backfill copies each PR forecast onto its Pre Order rows, leaving a PR with no date out', async () => {
  const withDate = await add('Purchase_Request1', { PR_No: 'PR-13', Forecast_Delivery: '2026-11-20', Forecast_Window: 'W', Forecast_Status: 'On Track' });
  await add('Purchase_Request1', { PR_No: 'PR-14' });
  const a = await add('Pre_Order_FF', { SO: 'SO-13', PR: 'PR-13' });
  const b = await add('Pre_Order_FF', { SO: 'SO-14', PR: 'PR-14', Forecast_Delivery: '2026-12-01' });
  const c = await add('Pre_Order_FF', { SO: 'SO-15', PR: 'PR-NONE' });
  const out = await runBackfillPreOrder(raw);
  assert.deepEqual(out, { prSeen: 1, filled: 1, noPr: 0, noForecast: 2 });
  assert.deepEqual([(await read('Pre_Order_FF', a)).Forecast_Delivery, (await read('Pre_Order_FF', a)).Forecast_Status], ['2026-11-20', 'On Track']);
  assert.equal((await read('Pre_Order_FF', b)).Forecast_Delivery, '2026-12-01'); // not wiped
  assert.equal((await read('Pre_Order_FF', c)).Forecast_Delivery, '');
  assert.ok(withDate);
});

// ----- the runner -----
const tick = (name, log) => ({ name, at: '01:00', timeZone: 'Asia/Manila', run: async () => { log.push(name); return { ok: true }; } });
const utc = (iso) => new Date(iso);

test('local time in a zone: 01:00 in Manila is 17:00 UTC the day before', () => {
  assert.deepEqual(localParts(utc('2026-11-11T17:00:00Z'), 'Asia/Manila'), { date: '2026-11-12', minutes: 60 });
  assert.deepEqual(localParts(utc('2026-11-11T16:59:00Z'), 'Asia/Manila'), { date: '2026-11-12', minutes: 59 });
});

test('the runner runs a schedule once a day, only after its time, and records the day', async () => {
  const log = [];
  const schedules = [tick('A', log)];
  const common = { db, store: raw, schedules, log: () => {} };
  assert.deepEqual(await runDueSchedules({ ...common, now: utc('2026-11-11T16:30:00Z') }), []); // 00:30 in Manila: not yet
  assert.deepEqual(await runDueSchedules({ ...common, now: utc('2026-11-11T17:05:00Z') }), ['A']); // 01:05
  assert.deepEqual(await runDueSchedules({ ...common, now: utc('2026-11-11T18:00:00Z') }), []); // the same day: not again
  assert.deepEqual(await runDueSchedules({ ...common, now: utc('2026-11-12T17:05:00Z') }), ['A']); // the next day
  assert.deepEqual(log, ['A', 'A']);
  const { rows } = await db.query('SELECT name, last_date, result FROM "_schedule_runs"');
  assert.deepEqual(rows, [{ name: 'A', last_date: '2026-11-13', result: '{"ok":true}' }]);
});

test('a server that was down at 01:00 runs the job when it comes back that day', async () => {
  const log = [];
  assert.deepEqual(await runDueSchedules({ db, store: raw, schedules: [tick('A', log)], now: utc('2026-11-12T03:00:00Z'), log: () => {} }), ['A']); // 11:00 in Manila
});

test('a failing job is logged, is not retried the same day, and does not stop the next schedule', async () => {
  const log = [];
  const boom = { name: 'Boom', at: '01:00', timeZone: 'Asia/Manila', run: async () => { throw new Error('boom'); } };
  const orig = console.error; console.error = () => {};
  try {
    const now = utc('2026-11-11T17:05:00Z');
    assert.deepEqual(await runDueSchedules({ db, store: raw, schedules: [boom, tick('Next', log)], now, log: () => {} }), ['Boom', 'Next']);
    assert.deepEqual(await runDueSchedules({ db, store: raw, schedules: [boom, tick('Next', log)], now: utc('2026-11-11T18:00:00Z'), log: () => {} }), []);
  } finally { console.error = orig; }
  const { rows } = await db.query('SELECT result FROM "_schedule_runs" WHERE name = $1', ['Boom']);
  assert.equal(rows[0].result, 'FAILED: boom');
});

test('an instance that cannot get the lock skips the schedule; the other one runs it', async () => {
  const log = [];
  const held = new Set();
  const acquire = async (name) => { if (held.has(name)) return null; held.add(name); return async () => held.delete(name); };
  held.add('A'); // another instance has A
  const out = await runDueSchedules({ db, store: raw, schedules: [tick('A', log), tick('B', log)], now: utc('2026-11-11T17:05:00Z'), acquire, log: () => {} });
  assert.deepEqual(out, ['B']);
  assert.deepEqual(log, ['B']);
  assert.equal(held.has('B'), false); // released
});

test('it is off unless SCHEDULES=on', () => {
  const lines = [];
  const off = startSchedules({ pool: db, store: raw, schedules: [tick('A', [])], env: {}, log: (m) => lines.push(m) });
  assert.match(lines[0], /off/);
  off.stop();
});

test('the Fulfillment module lists the two forecast schedules under their Zoho names', () => {
  const names = modules.flatMap((m) => (m.schedules || []).map((s) => s.name));
  assert.deepEqual(names.sort(), ['Backfill_PreOrder_Forecas', 'Forecast_Stamp_Daily']);
});
