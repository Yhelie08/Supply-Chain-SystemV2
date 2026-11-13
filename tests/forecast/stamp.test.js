// fcStampBySoNo (server/forecast/stamp.mjs) on PGlite: it gathers the facts of one sales order and stamps the forecast on
// the rows that belong to it. "today" is passed in (12 Nov 2026). Tests marked "mirrors Zoho" follow the Deluge literally;
// the ones marked (?) are to be confirmed against Zoho Development.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { fcStampBySoNo, toDate } from '../../server/forecast/stamp.mjs';

const FORMS = ['Forecast_Settings', 'Sales_Order_Fulfillment', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Pick1', 'Checker_Checklist', 'Order_Aggregation1', 'Crate_Checklist', 'Receiving', 'Purchase_Request1', 'Shipments'];
const today = new Date(2026, 10, 12);
let db, raw, writes, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  // counts the writes the stamp makes
  store = { ...raw, updateRecord: async (...a) => { writes += 1; return raw.updateRecord(...a); } };
});
beforeEach(async () => { writes = 0; for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const add = (form, data) => raw.addRecord(form, data);
const read = (form, id) => raw.getRecordById(form, id, { raw: true });
const addedOn = (form, id, text) => db.query(`UPDATE "${form}" SET "Added_Time" = $1 WHERE "ID" = $2::bigint`, [text, id]);
const stamp = (so) => fcStampBySoNo(store, so, { today });
const forecast = (r) => [r.Forecast_Delivery, r.Forecast_Window, r.Forecast_Status];

test('dates are read from the forms Zoho and the widgets use', () => {
  assert.equal(toDate('2026-11-12').getDate(), 12);
  assert.equal(toDate('2026-11-12 09:00:00 AM').getMonth(), 10);
  assert.deepEqual([toDate('05-Nov-2026').getMonth(), toDate('05-Nov-2026').getDate()], [10, 5]);
  assert.equal(toDate('soon'), null);
  assert.equal(toDate(''), null);
});

test('a blank sales order number is answered, nothing is stamped', async () => {
  for (const so of ['', null, undefined, 'null']) assert.equal(await stamp(so), 'walang SO number na ipinasa');
});

test('a stock-on-hand order: prep and delivery days from today, stamped on its SOF row, with the client date in the text', async () => {
  const id = await add('Sales_Order_Fulfillment', { SO_No: 'SO-1', order_type: 'STOCK', target_delivery_date: '2026-11-25' });
  const out = await stamp('SO-1');
  const r = await read('Sales_Order_Fulfillment', id);
  assert.deepEqual(forecast(r), ['2026-11-19', 'Nov 19 - Nov 19, 2026 | LCL? | Stock on hand | 6d early', 'On Track']);
  assert.equal(out, 'SO-1 -> Nov 19, 2026 | Nov 19 - Nov 19, 2026 | LCL? | Stock on hand | 6d early | On Track | 1 record');
});

test('a Gate row with no SOF puts the order at Order Readiness; the prep days used are counted from that row Added_Time', async () => {
  const g = await add('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-2', Order_Type: 'Stock', Target_Delivery_Date: '2026-11-30' });
  await addedOn('Sales_Order_Readiness_Gate', g, '2026-11-09 09:00:00 AM'); // 3 of 7 days used
  await stamp('SO-2');
  const r = await read('Sales_Order_Readiness_Gate', g);
  assert.deepEqual(forecast(r), ['2026-11-16', 'Nov 16 - Nov 16, 2026 | LCL? | Order Readiness | 14d early', 'On Track']);
});

test('only a Pre Order row: the PR gives the start, the sourcing and the mode; the PR and the Pre Order row are stamped', async () => {
  const pr = await add('Purchase_Request1', { PR_No: 'PR-1', Sourcing_Type: 'Import', Shipment_Mode: 'Air', Required_Days_Lead: 3 });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  const po = await add('Pre_Order_FF', { SO: 'SO-3', PR: 'PR-1', Order_Type: 'Pre Order', Target_Delivery: '2026-11-16' });
  const out = await stamp('SO-3');
  assert.deepEqual(forecast(await read('Pre_Order_FF', po)), ['2026-11-17', 'Nov 15 - Nov 18, 2026 | Air | Procurement | +1d vs client', 'At Risk']);
  assert.deepEqual(forecast(await read('Purchase_Request1', pr)), forecast(await read('Pre_Order_FF', po)));
  assert.match(out, /\| 2 record$/);
});

test('an order already shipped: from the day it shipped (the shipment is found by the PR number in its rows)', async () => {
  const sof = await add('Sales_Order_Fulfillment', { SO_No: 'SO-4', order_type: 'PRE ORDER', PR_No: 'PR-2', Shipment_Mode: 'LCL', Fulfillment_Stage: 'Pre Order' });
  await add('Purchase_Request1', { PR_No: 'PR-2', Sourcing_Type: 'Import' });
  await add('Shipments', { Shipment_Status: 'In Transit', Supplier_Shipment_Details: [{ PR_No: 'PR-9', Date_Shipped: '2026-10-01' }, { PR_No: 'PR-2', Date_Shipped: '2026-11-01', Shipment_Mode: 'LCL' }] });
  await stamp('SO-4');
  const r = await read('Sales_Order_Fulfillment', sof);
  assert.equal(r.Forecast_Window, 'Dec 20 - Jan 17, 2027 | LCL | In transit');
  assert.equal(r.Forecast_Delivery, '2027-01-03');
});

test('a delivered shipment puts the order at the warehouse', async () => {
  const sof = await add('Sales_Order_Fulfillment', { SO_No: 'SO-5', order_type: 'PRE ORDER', PR_No: 'PR-3', Shipment_Mode: 'LCL' });
  await add('Purchase_Request1', { PR_No: 'PR-3' });
  await add('Shipments', { Shipment_Status: 'Delivered', Supplier_Shipment_Details: [{ PR_No: 'PR-3', Date_Shipped: '2026-09-01' }] });
  await stamp('SO-5');
  assert.equal((await read('Sales_Order_Fulfillment', sof)).Forecast_Window, 'Nov 19 - Nov 19, 2026 | LCL | At WH');
});

test('rows that name another PR than the order are left out of the stamping', async () => {
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-6', order_type: 'STOCK', PR_No: 'PR-4', Fulfillment_Stage: 'Picking', Shipment_Mode: 'LCL' });
  const mine = await add('Pick1', { SO: 'SO-6', PR_if_any: 'PR-4' });
  const noPr = await add('Pick1', { SO: 'SO-6', PR_if_any: '' });
  const other = await add('Pick1', { SO: 'SO-6', PR_if_any: 'PR-OTHER' });
  await stamp('SO-6');
  assert.notEqual((await read('Pick1', mine)).Forecast_Delivery, '');
  assert.notEqual((await read('Pick1', noPr)).Forecast_Delivery, '');
  assert.equal((await read('Pick1', other)).Forecast_Delivery, '');
});

test('every form of the order is stamped: SOF, Gate, Pre Order, Pick, QC, Order Aggregation, Crate and Receiving', async () => {
  const ids = {
    Sales_Order_Fulfillment: await add('Sales_Order_Fulfillment', { SO_No: 'SO-7', order_type: 'STOCK' }),
    Sales_Order_Readiness_Gate: await add('Sales_Order_Readiness_Gate', { sales_order_number: 'SO-7' }),
    Pre_Order_FF: await add('Pre_Order_FF', { SO: 'SO-7' }),
    Pick1: await add('Pick1', { SO: 'SO-7' }),
    Checker_Checklist: await add('Checker_Checklist', { SO: 'SO-7' }),
    Order_Aggregation1: await add('Order_Aggregation1', { SO: 'SO-7' }),
    Crate_Checklist: await add('Crate_Checklist', { SO: 'SO-7' }),
    Receiving: await add('Receiving', { SO_No: 'SO-7' }),
  };
  await stamp('SO-7');
  for (const [form, id] of Object.entries(ids)) assert.equal((await read(form, id)).Forecast_Status, 'No Client Date', form);
});

test('mirrors Zoho: only the first Sales_Order_Fulfillment row of the order is stamped', async () => {
  const a = await add('Sales_Order_Fulfillment', { SO_No: 'SO-8', order_type: 'STOCK' });
  const b = await add('Sales_Order_Fulfillment', { SO_No: 'SO-8', order_type: 'STOCK' });
  await stamp('SO-8');
  assert.notEqual((await read('Sales_Order_Fulfillment', a)).Forecast_Delivery, '');
  assert.equal((await read('Sales_Order_Fulfillment', b)).Forecast_Delivery, '');
});

test('a second run writes nothing (this is what stops the stamp from firing itself forever)', async () => {
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-9', order_type: 'STOCK' });
  await add('Pick1', { SO: 'SO-9' });
  await stamp('SO-9');
  assert.equal(writes, 2);
  writes = 0;
  await stamp('SO-9');
  assert.equal(writes, 0);
});

test('the settings record changes the days: prep and delivery days, and the supplier lead time', async () => {
  await add('Forecast_Settings', { Prep_Days_Thru_QC: 2, Delivery_Days: 1, Re_anchor_on_Latest_Real_Event: true, Include_Supplier_Lead_Time: true });
  const id = await add('Sales_Order_Fulfillment', { SO_No: 'SO-10', order_type: 'STOCK' });
  await stamp('SO-10');
  assert.equal((await read('Sales_Order_Fulfillment', id)).Forecast_Delivery, '2026-11-15'); // 2 prep + 1 delivery
  const pr = await add('Purchase_Request1', { PR_No: 'PR-5', Sourcing_Type: 'Import', Shipment_Mode: 'Air', Required_Days_Lead: 10 });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  const po = await add('Pre_Order_FF', { SO: 'SO-11', PR: 'PR-5', Order_Type: 'Pre Order' });
  await stamp('SO-11');
  // Air: 5+2 transit and customs, 2 prep, 1 delivery = 10 days at the early end, 3+... the range is 5-7 and 2-3: earliest
  // Nov 1 + (5+2+2+1) + 10 lead = Nov 21; latest Nov 1 + (7+3+2+1) + 10 = Nov 24; the middle date rounds half up
  assert.equal((await read('Pre_Order_FF', po)).Forecast_Delivery, '2026-11-23');
});

test('mirrors Zoho (?): a blank Shipment_Mode on the SOF is the text "null", which is not empty, so the PR mode is not used', async () => {
  const sof = await add('Sales_Order_Fulfillment', { SO_No: 'SO-12', order_type: 'PRE ORDER', PR_No: 'PR-6' });
  const pr = await add('Purchase_Request1', { PR_No: 'PR-6', Sourcing_Type: 'Import', Shipment_Mode: 'Air' });
  await addedOn('Purchase_Request1', pr, '2026-11-01 08:00:00 AM');
  await stamp('SO-12');
  assert.match((await read('Sales_Order_Fulfillment', sof)).Forecast_Window, /\| LCL\? \| Procurement/);
});

test('no SOF, Gate or Pre Order row at all: it counts as stock on hand but there is nothing to stamp', async () => {
  assert.match(await stamp('SO-NOTHING'), /\| Stock on hand \| .*\| 0 record$/);
  assert.equal(writes, 0);
});
