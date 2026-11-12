// The purchase-request side of the forecast (server/forecast/purchase-request.mjs): fcStampPurchaseRequest, fcPrToPreOrder and the
// PR1_Forecast_Stamp hook, on PGlite. "today" is passed in (12 Nov 2026). Tests marked "mirrors Zoho" follow the Deluge
// literally; the ones marked (?) are to be confirmed against Zoho Development.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { fcStampPurchaseRequest, fcPrToPreOrder } from '../../server/forecast/purchase-request.mjs';
import { NULL_TEXT } from '../../server/forecast/stamp.mjs';

const FORMS = ['Forecast_Settings', 'Sales_Order_Fulfillment', 'Sales_Order_Readiness_Gate', 'Pre_Order_FF', 'Pick1', 'Checker_Checklist', 'Crate_Checklist', 'Purchase_Request1', 'Shipments'];
const today = new Date(2026, 10, 12);
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const add = (form, data) => raw.addRecord(form, data);
const read = (form, id) => raw.getRecordById(form, id, { raw: true });
const addedOn = (form, id, text) => db.query(`UPDATE "${form}" SET "Added_Time" = $1 WHERE "ID" = $2::bigint`, [text, id]);
const pr = async (extra = {}, added = '2026-11-01 08:00:00 AM') => { const id = await add('Purchase_Request1', { PR_No: 'PR-1', Shipment_Mode: 'Air', Sourcing_Type: 'Import', ...extra }); await addedOn('Purchase_Request1', id, added); return id; };
const stampPr = (id) => fcStampPurchaseRequest(raw, id, { today });

test('a PR with a mode and no order: from the day it was added, no "vs client" text, status "No Client Date"', async () => {
  const id = await pr();
  const out = await stampPr(id);
  const r = await read('Purchase_Request1', id);
  assert.deepEqual([r.Forecast_Delivery, r.Forecast_Window, r.Forecast_Status], ['2026-11-17', 'Nov 15 - Nov 18, 2026 | Air | Procurement', 'No Client Date']);
  assert.equal(out, 'PR-1 -> Nov 17, 2026 | Nov 15 - Nov 18, 2026 | Air | Procurement | No Client Date');
});

test('a missing PR, or one with no Added_Time, is answered and nothing is written', async () => {
  assert.equal(await stampPr('4662244000099999999'), 'walang PR o walang Added_Time: 4662244000099999999');
  const id = await add('Purchase_Request1', { PR_No: 'PR-2', Shipment_Mode: 'Air' });
  await db.query('UPDATE "Purchase_Request1" SET "Added_Time" = $1 WHERE "ID" = $2::bigint', ['', id]);
  assert.match(await stampPr(id), /^walang PR o walang Added_Time/);
});

test('mirrors Zoho (?): nothing is stamped until the PR has a shipment mode, except Local sourcing (depends on NULL_TEXT: does a blank mode count as blank)', async () => {
  const id = await pr({ Shipment_Mode: '', Sourcing_Type: 'Import' });
  const out = await stampPr(id);
  if (NULL_TEXT) assert.match(out, /| LCL? | Procurement/); // a blank picklist joined to text is "null": not empty, so the gate does not stop it
  else assert.equal(out, 'wala pang Shipment Mode ang PR-1 — hindi muna nagtatatak');
  const local = await pr({ PR_No: 'PR-3', Shipment_Mode: '', Sourcing_Type: 'Local' });
  assert.match(await stampPr(local), /\| Local \| Procurement/);
});

test('the status uses the client date of the PR\'s order, and the order is stamped with the PR', async () => {
  const id = await pr();
  const sof = await add('Sales_Order_Fulfillment', { SO_No: 'SO-1', PR_No: 'PR-1', order_type: 'PRE ORDER', target_delivery_date: '2026-11-16' });
  await stampPr(id);
  const r = await read('Purchase_Request1', id);
  assert.equal(r.Forecast_Status, 'At Risk');
  assert.equal(r.Forecast_Window, 'Nov 15 - Nov 18, 2026 | Air | Procurement'); // still no client text in this version
  assert.deepEqual([(await read('Sales_Order_Fulfillment', sof)).Forecast_Delivery, (await read('Sales_Order_Fulfillment', sof)).Forecast_Status], ['2026-11-17', 'At Risk']);
});

test('an order in stock is stock on hand; an order with a stage is on the ladder; with no order the PR is never stock', async () => {
  const id = await pr();
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-2', PR_No: 'PR-1', order_type: 'STOCK' });
  await stampPr(id);
  assert.equal((await read('Purchase_Request1', id)).Forecast_Window, 'Nov 19 - Nov 19, 2026 | Air | Stock on hand');

  await db.query('DELETE FROM "Sales_Order_Fulfillment"');
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-3', PR_No: 'PR-1', order_type: 'PRE ORDER', Fulfillment_Stage: 'For Delivery' });
  await stampPr(id);
  assert.equal((await read('Purchase_Request1', id)).Forecast_Window, 'Nov 12 - Nov 12, 2026 | Air | Ready');
});

test('a prep stage counts the days used from the earliest Gate, Pick, QC or Crate row of the SO (no PR filter in this version)', async () => {
  const id = await pr();
  await add('Sales_Order_Fulfillment', { SO_No: 'SO-4', PR_No: 'PR-1', order_type: 'PRE ORDER', Fulfillment_Stage: 'Picking' });
  const pick = await add('Pick1', { SO: 'SO-4', PR_if_any: 'PR-OTHER' });
  await addedOn('Pick1', pick, '2026-11-09 09:00:00 AM'); // 3 of 7 days used, even though the row names another PR
  await stampPr(id);
  assert.equal((await read('Purchase_Request1', id)).Forecast_Window, 'Nov 16 - Nov 16, 2026 | Air | Picking');
});

test('a shipped PR is in transit from the day it shipped; a delivered one is at the warehouse', async () => {
  const id = await pr({}, '2026-10-01 08:00:00 AM');
  await add('Shipments', { Shipment_Status: 'In Transit', Supplier_Shipment_Details: [{ PR_No: 'PR-1', Date_Shipped: '2026-11-01' }] });
  await stampPr(id);
  assert.equal((await read('Purchase_Request1', id)).Forecast_Window, 'Nov 15 - Nov 18, 2026 | Air | In transit');
  await db.query('DELETE FROM "Shipments"');
  await add('Shipments', { Shipment_Status: 'Delivered', Supplier_Shipment_Details: [{ PR_No: 'PR-1', Date_Shipped: '2026-11-01' }] });
  await stampPr(id);
  assert.equal((await read('Purchase_Request1', id)).Forecast_Window, 'Nov 19 - Nov 19, 2026 | Air | At WH');
});

test('mirrors Zoho: the supplier lead time is added only when the shipment branch is not taken (re-anchoring off)', async () => {
  const id = await pr({ Required_Days_Lead: 10 });
  await add('Forecast_Settings', { Re_anchor_on_Latest_Real_Event: false, Include_Supplier_Lead_Time: true });
  await stampPr(id);
  assert.equal((await read('Purchase_Request1', id)).Forecast_Window, 'Nov 25 - Nov 28, 2026 | Air | Procurement'); // Nov 1 + 14 + 10
  await db.query('DELETE FROM "Forecast_Settings"');
  await add('Forecast_Settings', { Re_anchor_on_Latest_Real_Event: true, Include_Supplier_Lead_Time: true });
  await stampPr(id);
  assert.equal((await read('Purchase_Request1', id)).Forecast_Window, 'Nov 15 - Nov 18, 2026 | Air | Procurement'); // re-anchoring on: the lead time is not added
});

test('mirrors Zoho: a second run writes nothing, and the stamp is the same as the order version except the client text', async () => {
  const id = await pr();
  await stampPr(id);
  const first = await read('Purchase_Request1', id);
  await stampPr(id);
  assert.deepEqual(forecastOf(await read('Purchase_Request1', id)), forecastOf(first));
});
const forecastOf = (r) => [r.Forecast_Delivery, r.Forecast_Window, r.Forecast_Status, r.Modified_Time];

test('fcPrToPreOrder copies the PR forecast onto every Pre Order row of the PR, and leaves other rows alone', async () => {
  const id = await pr();
  const a = await add('Pre_Order_FF', { SO: 'SO-5', PR: 'PR-1' });
  const b = await add('Pre_Order_FF', { SO: 'SO-6', PR: 'PR-1' });
  const other = await add('Pre_Order_FF', { SO: 'SO-7', PR: 'PR-9' });
  const out = await fcPrToPreOrder(raw, id, { today });
  assert.equal(out, 'PR-1 -> 2 pre-order row | Nov 15 - Nov 18, 2026 | Air | Procurement | No Client Date');
  for (const row of [a, b]) assert.equal((await read('Pre_Order_FF', row)).Forecast_Delivery, '2026-11-17');
  assert.equal((await read('Pre_Order_FF', other)).Forecast_Delivery, '');
});

test('fcPrToPreOrder does not wipe a Pre Order date when the PR has no forecast yet (no mode)', async () => {
  const id = await pr({ Shipment_Mode: '', Sourcing_Type: 'Import' });
  const po = await add('Pre_Order_FF', { SO: 'SO-8', PR: 'PR-1', Forecast_Delivery: '2026-12-01', Forecast_Status: 'On Track' });
  const out = await fcPrToPreOrder(raw, id, { today });
  if (NULL_TEXT) assert.match(out, /^PR-1 -> 1 pre-order row/);
  else { assert.match(out, /wala pang forecast ang PR mismo/); assert.equal((await read('Pre_Order_FF', po)).Forecast_Delivery, '2026-12-01'); }
  assert.match(await fcPrToPreOrder(raw, '4662244000099999999', { today }), /^walang PR na /);
});

test('saving a PR through the hooks stamps it and its Pre Order rows (PR1_Forecast_Stamp)', async () => {
  const hooked = createHookedStore(raw, workflows);
  const id = await hooked.addRecord('Purchase_Request1', { Shipment_Mode: 'Air', Sourcing_Type: 'Import' }); // the number is made by PR_Generate_Number
  const r = await read('Purchase_Request1', id);
  assert.notEqual(r.Forecast_Delivery, '');
  const po = await add('Pre_Order_FF', { SO: 'SO-9', PR: r.PR_No });
  await hooked.updateRecord('Purchase_Request1', id, { description: 'saved again' }, { byForm: true });
  assert.equal((await read('Pre_Order_FF', po)).Forecast_Delivery, (await read('Purchase_Request1', id)).Forecast_Delivery);
});
