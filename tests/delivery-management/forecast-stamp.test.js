// Delivery Management, D5: fcStampDelivery and the four *_Instant_Forecast workflows
// (server/modules/delivery-management/forecast-stamp.mjs), run on PGlite with the hooked store. The forecast engine
// (fcStampBySoNo) is not ported: it is a stand-in here. Tests marked "mirrors Zoho" follow the Deluge literally.
import { test, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { fcStampDelivery, forecastEngine } from '../../server/modules/delivery-management/forecast-stamp.mjs';

const FORMS = ['Sales_Order_Fulfillment', 'Delivery_Scheduling', 'Service_Request1', 'Service_Appointment_Form', 'Field_Work', 'Package_Shipments'];
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { forecastEngine.stampBySoNo = null; for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const forecast = (so, date, window = 'Dec 1-3', status = 'On Track') => raw.addRecord('Sales_Order_Fulfillment', { SO_No: so, Forecast_Delivery: date, Forecast_Window: window, Forecast_Status: status });
const row = (form, id) => raw.getRecordById(form, id, { raw: true });

test('a blank sales order text is answered, not stamped', async () => {
  for (const blank of ['', null, undefined, 'null']) assert.equal(await fcStampDelivery(store, blank), 'walang SO sa row na ito');
});

test('orders with no forecast anywhere are reported and nothing is written', async () => {
  const dr = await raw.addRecord('Delivery_Scheduling', { SO: 'SO-1\nSO-2' });
  assert.equal(await fcStampDelivery(store, 'SO-1\nSO-2'), '2 SO, wala pa isa mang may forecast');
  assert.equal((await row('Delivery_Scheduling', dr)).Forecast_Delivery, '');
});

test('the latest date of all the items of all the orders wins, with its window; "Will Miss" overrides the status', async () => {
  await raw.addRecord('Delivery_Scheduling', { SO: 'SO-1, SO-2;SO-3' });
  const target = (await raw.find('Delivery_Scheduling'))[0].ID;
  await forecast('SO-1', '2026-12-01', 'Dec 1-3', 'On Track');
  await forecast('SO-1', '2026-12-10', 'Dec 10-12', 'At Risk');
  await forecast('SO-2', '2026-12-05', 'Dec 5-7', 'Will Miss');
  const answer = await fcStampDelivery(store, 'SO-1, SO-2;SO-3');
  assert.equal(answer, '3 SO -> Dec 10, 2026 | Dec 10-12 | Will Miss | 1 record | engine 0x');
  const r = await row('Delivery_Scheduling', target);
  assert.deepEqual([r.Forecast_Delivery, r.Forecast_Window, r.Forecast_Status], ['2026-12-10', 'Dec 10-12', 'Will Miss']);
});

test('mirrors Zoho: only rows whose text is exactly the one saved are stamped, in all four forms', async () => {
  await forecast('SO-1', '2026-12-04');
  const same = await raw.addRecord('Service_Request1', { Sales_Order: 'SO-1' });
  const neighbour = await raw.addRecord('Service_Request1', { Sales_Order: 'SO-1, SO-2' });
  const appointment = await raw.addRecord('Service_Appointment_Form', { Sales_Order: 'SO-1' });
  const fieldWork = await raw.addRecord('Field_Work', { Sales_Order: 'SO-1' });
  const schedule = await raw.addRecord('Delivery_Scheduling', { SO: 'SO-1' });
  assert.match(await fcStampDelivery(store, 'SO-1'), /\| 4 record \|/);
  for (const [form, id] of [['Service_Request1', same], ['Service_Appointment_Form', appointment], ['Field_Work', fieldWork], ['Delivery_Scheduling', schedule]]) {
    assert.equal((await row(form, id)).Forecast_Delivery, '2026-12-04', form);
  }
  assert.equal((await row('Service_Request1', neighbour)).Forecast_Delivery, '');
});

test('a second run changes nothing', async () => {
  await forecast('SO-1', '2026-12-04');
  const id = await raw.addRecord('Field_Work', { Sales_Order: 'SO-1' });
  await fcStampDelivery(store, 'SO-1');
  const first = (await row('Field_Work', id)).Modified_Time;
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await fcStampDelivery(store, 'SO-1');
  assert.equal((await row('Field_Work', id)).Modified_Time, first);
});

test('mirrors Zoho: a missing window or status is written as the text "null"', async () => {
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-1', Forecast_Delivery: '2026-12-04' });
  const id = await raw.addRecord('Field_Work', { Sales_Order: 'SO-1' });
  await fcStampDelivery(store, 'SO-1');
  const r = await row('Field_Work', id);
  assert.deepEqual([r.Forecast_Window, r.Forecast_Status], ['null', 'null']);
});

test('the engine (a stand-in here) is asked for an order that has no forecast, and its result is used', async () => {
  const calls = [];
  forecastEngine.stampBySoNo = async (so, s) => { calls.push(so); await s.addRecord('Sales_Order_Fulfillment', { SO_No: so, Forecast_Delivery: '2026-12-09', Forecast_Window: 'Dec 9-11', Forecast_Status: 'On Track' }); };
  await forecast('SO-1', '2026-12-04');
  const id = await raw.addRecord('Service_Request1', { Sales_Order: 'SO-1\nSO-2' });
  assert.equal(await fcStampDelivery(store, 'SO-1\nSO-2'), '2 SO -> Dec 09, 2026 | Dec 9-11 | On Track | 1 record | engine 1x');
  assert.deepEqual(calls, ['SO-2']); // SO-1 already had one
  assert.equal((await row('Service_Request1', id)).Forecast_Delivery, '2026-12-09');
});

test('without the engine the missing order is skipped (and said once), the others are still stamped', async (t) => {
  const warn = mock.method(console, 'warn', () => {});
  t.after(() => mock.restoreAll());
  await forecast('SO-1', '2026-12-04');
  const id = await raw.addRecord('Service_Request1', { Sales_Order: 'SO-1, SO-2' });
  assert.match(await fcStampDelivery(store, 'SO-1, SO-2'), /^2 SO -> Dec 04, 2026 .* engine 0x$/);
  await fcStampDelivery(store, 'SO-1, SO-2');
  assert.ok(warn.mock.callCount() <= 1);
  assert.equal((await row('Service_Request1', id)).Forecast_Delivery, '2026-12-04');
});

test('the four workflows stamp the row that was just saved', async () => {
  await forecast('SO-1', '2026-12-04');
  const sr = await store.addRecord('Service_Request1', { Sales_Order: 'SO-1' }); // also creates the appointment
  assert.equal((await row('Service_Request1', sr)).Forecast_Delivery, '2026-12-04');
  const [appointment] = await raw.find('Service_Appointment_Form');
  assert.equal(appointment.Forecast_Delivery, ''); // inserted by a script: its own workflows do not run (checked on Zoho Development)
  await store.updateRecord('Service_Appointment_Form', appointment.ID, { Contact: '09170000000' }, { byForm: true });
  assert.equal((await row('Service_Appointment_Form', appointment.ID)).Forecast_Delivery, '2026-12-04'); // at its next save
  const fw = await store.addRecord('Field_Work', { Sales_Order: 'SO-1', Status: 'Started' });
  assert.equal((await row('Field_Work', fw)).Forecast_Window, 'Dec 1-3');
  const ds = await store.addRecord('Delivery_Scheduling', { SO: 'SO-1' });
  assert.equal((await row('Delivery_Scheduling', ds)).Forecast_Status, 'On Track');
});
