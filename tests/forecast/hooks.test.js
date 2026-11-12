// The seven Instant Forecast workflows (server/forecast/hooks.mjs) and the Delivery stamps that now use the real engine,
// on PGlite with the hooked store. The default "today" is the real date, so dates are worked out from it.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { ymd, addDays, todayDate } from '../../server/workflows/deluge.mjs';

const FORMS = ['Forecast_Settings', 'Sales_Order_Fulfillment', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Pick1', 'Checker_Checklist', 'Order_Aggregation1', 'Crate_Checklist', 'Receiving', 'Purchase_Request1', 'Shipments', 'Delivery_Scheduling', 'Service_Request1', 'Service_Appointment_Form', 'Field_Work', 'Package_Shipments'];
let db, raw, store, writes;
const inDays = (n) => ymd(addDays(todayDate(), n));

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  const counting = { ...raw, updateRecord: async (...a) => { writes += 1; return raw.updateRecord(...a); } };
  store = createHookedStore(counting, workflows);
});
beforeEach(async () => { writes = 0; for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const read = (form, id) => raw.getRecordById(form, id, { raw: true });

test('every form with an Instant Forecast workflow has its hooks', () => {
  for (const form of ['Sales_Order_Fulfillment', 'Sales_Order_Readiness_Gate', 'Pick1', 'Pre_Order_FF', 'Checker_Checklist', 'Crate_Checklist', 'Order_Aggregation1']) {
    assert.ok(workflows[form]?.afterAdd?.length && workflows[form]?.afterUpdate?.length, form);
  }
});

test('saving a Gate row stamps the forecast on the order\'s rows, with its own SO field name', async () => {
  const sof = await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-1', order_type: 'STOCK', target_delivery_date: inDays(30) });
  const gate = await store.addRecord('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-1' });
  for (const [form, id] of [['Sales_Order_Readiness_Gate', gate], ['Sales_Order_Fulfillment', sof]]) {
    const r = await read(form, id);
    assert.equal(r.Forecast_Delivery, inDays(7), form);
    assert.equal(r.Forecast_Status, 'On Track', form);
  }
});

test('each of the other forms stamps its order when it is saved (Pick, Pre Order, QC, Crate, Order Aggregation)', async () => {
  for (const [form, field] of [['Pick1', 'SO'], ['Pre_Order_FF', 'SO'], ['Checker_Checklist', 'SO'], ['Crate_Checklist', 'SO'], ['Order_Aggregation1', 'SO']]) {
    const so = `SO-${form}`;
    await raw.addRecord('Sales_Order_Fulfillment', { SO_No: so, order_type: 'STOCK' });
    const id = await store.addRecord(form, { [field]: so });
    assert.equal((await read(form, id)).Forecast_Delivery, inDays(7), form);
  }
});

test('mirrors Zoho: a Fulfillment row is stamped only when it has no forecast yet', async () => {
  const id = await store.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-2', order_type: 'STOCK' });
  assert.equal((await read('Sales_Order_Fulfillment', id)).Forecast_Delivery, inDays(7));
  await raw.updateRecord('Sales_Order_Fulfillment', id, { Forecast_Delivery: inDays(3) }, { byForm: true });
  writes = 0;
  await store.updateRecord('Sales_Order_Fulfillment', id, { Shipment_Mode: 'Air' }, { byForm: true });
  assert.equal((await read('Sales_Order_Fulfillment', id)).Forecast_Delivery, inDays(3)); // not touched: it has a date
});

test('the stamp does not fire itself: saving again changes nothing', async () => {
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-3', order_type: 'STOCK' });
  const id = await store.addRecord('Pick1', { SO: 'SO-3' });
  assert.ok(writes > 0);
  writes = 0;
  await store.updateRecord('Pick1', id, { SO: 'SO-3' }, { byForm: true });
  assert.equal(writes, 1); // only this save itself: the stamp found nothing to change
});

test('a save with a blank sales order does nothing and does not fail', async () => {
  const id = await store.addRecord('Pick1', {});
  assert.equal((await read('Pick1', id)).Forecast_Delivery, '');
});

test('the Delivery stamps now work out a forecast for an order that had none, and copy it to the delivery rows', async () => {
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-4', order_type: 'STOCK', target_delivery_date: inDays(20) });
  const sr = await store.addRecord('Service_Request1', { Sales_Order: 'SO-4' });
  const r = await read('Service_Request1', sr);
  assert.equal(r.Forecast_Delivery, inDays(7));
  assert.equal(r.Forecast_Status, 'On Track');
  assert.match(r.Forecast_Window, /Stock on hand \| 13d early$/);
  const [appointment] = await raw.find('Service_Appointment_Form', (a) => a.Sales_Order === 'SO-4');
  assert.equal(appointment.Forecast_Delivery, inDays(7)); // the Delivery stamp copies it to the rows with the same sales order text
});
