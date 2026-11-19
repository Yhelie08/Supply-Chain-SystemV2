// Delivery sorting engine (server/modules/delivery-management/sorter.mjs): categorize, rank. Mirrors the test
// shape of tests/fulfillment-sorter.test.js (the same spec section, 05/01, applied to Delivery's own fields).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { categorize, rank } from '../../server/modules/delivery-management/sorter.mjs';

const SA = 'Service_Appointment_Form';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SA, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

test('the five queue columns exist on Service_Appointment_Form', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Category: 'on_time', Queue_Rank: '1' });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(r.Category, 'on_time');
  assert.equal(r.Queue_Rank, '1');
});

const NOW = new Date('2026-11-18T00:00:00Z');
const policy = () => null; // no settings configured: every categorize() call falls back to its defaults

test('categorize: blocked when there is an open exception', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-12-01', Exception_Status: 'Flagged', Contact: '09171234567', Customer_Address: '1 Main St' };
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'blocked');
  assert.match(out.blockedReason, /exception/i);
});

test('categorize: blocked when there is no contact or address on file', () => {
  const out = categorize({ Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-12-01' }, { now: NOW, policy });
  assert.equal(out.category, 'blocked');
  assert.match(out.blockedReason, /contact/i);
});

test('categorize: broken for a Complaint job, even with a future target', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-12-01', Complaint: 'CMP-1', Contact: '09171234567', Customer_Address: '1 Main St' };
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'broken');
});

test('categorize: broken for a Sales Return redelivery (RMA/Original SO), with no target set (never falls to the bottom)', () => {
  const sa = { Sales_Order: 'SO-1', RMA: 'RMA-1', Original_SO: 'SO-0', Order_Date: '2026-11-01', Contact: '09171234567', Customer_Address: '1 Main St' };
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'broken');
  assert.match(out.priorityReason, /no target set/i);
});

test('categorize: broken for a Dispatch-stage requeue (the nearest signal of "redo of a failed job")', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-12-01', Rescheduled_Via_Exception: 'EXC-1', Contact: '09171234567', Customer_Address: '1 Main St' };
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'broken');
});

test('categorize: late when today is past the target', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-11-10', Contact: '09171234567', Customer_Address: '1 Main St' };
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'late');
});

test('categorize: at_risk when the forecast misses the target', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-11-25', Forecast_Delivery: '2026-11-28', Contact: '09171234567', Customer_Address: '1 Main St' };
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'at_risk');
});

test('categorize: at_risk when slack is within the setting default (3 days) even if the forecast is fine', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-11-19', Contact: '09171234567', Customer_Address: '1 Main St' }; // 1 day out
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'at_risk');
});

test('categorize: on_time otherwise', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-12-15', Contact: '09171234567', Customer_Address: '1 Main St' };
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'on_time');
});

test('categorize: blocked wins over broken, broken wins over late', () => {
  const sa = { Sales_Order: 'SO-1', Requested_Delivery_Date: '2026-11-01', Complaint: 'CMP-1' }; // late AND broken, no contact/address -> also blocked
  const out = categorize(sa, { now: NOW, policy });
  assert.equal(out.category, 'blocked');
});

test('rank: within a category, oldest Order Date first, manual Priority ahead of that, record number the final tiebreak', () => {
  const older = { category: 'on_time', sa: { Sales_Order_Display: 'SO-1', Order_Date: '2026-11-01' } };
  const newer = { category: 'on_time', sa: { Sales_Order_Display: 'SO-2', Order_Date: '2026-11-10' } };
  const urgent = { category: 'on_time', sa: { Sales_Order_Display: 'SO-3', Order_Date: '2026-11-15', Priority: true } };
  const ranked = rank([older, newer, urgent]);
  assert.deepEqual(ranked.map((e) => e.sa.Sales_Order_Display), ['SO-3', 'SO-1', 'SO-2']);
  assert.deepEqual(ranked.map((e) => e.queueRank), [1, 2, 3]);
});

test('rank: category comes before date — a much older on_time job still ranks behind a newer broken one', () => {
  const oldOnTime = { category: 'on_time', sa: { Sales_Order_Display: 'SO-1', Order_Date: '2026-01-01' } };
  const newBroken = { category: 'broken', sa: { Sales_Order_Display: 'SO-99', Order_Date: '2026-11-15' } };
  const ranked = rank([oldOnTime, newBroken]);
  assert.deepEqual(ranked.map((e) => e.sa.Sales_Order_Display), ['SO-99', 'SO-1']);
  assert.deepEqual(ranked.map((e) => e.queueRank), [1, 2]);
});

test('rank: blocked is numbered on its own, starting back at 1, never mixed into the main queue', () => {
  const broken = { category: 'broken', sa: { Sales_Order_Display: 'SO-1', Order_Date: '2026-11-01' } };
  const blocked = { category: 'blocked', sa: { Sales_Order_Display: 'SO-2', Order_Date: '2026-10-01' } };
  const ranked = rank([broken, blocked]);
  const bySo = Object.fromEntries(ranked.map((e) => [e.sa.Sales_Order_Display, e.queueRank]));
  assert.deepEqual(bySo, { 'SO-1': 1, 'SO-2': 1 });
});

test('rank: determinism — two runs on the same unordered input give identical output', () => {
  const a = { category: 'on_time', sa: { Sales_Order_Display: 'SO-9', Order_Date: '2026-11-05' } };
  const b = { category: 'on_time', sa: { Sales_Order_Display: 'SO-1', Order_Date: '2026-11-05' } };
  const r1 = rank([a, b]).map((e) => e.sa.Sales_Order_Display);
  const r2 = rank([b, a]).map((e) => e.sa.Sales_Order_Display);
  assert.deepEqual(r1, r2);
  assert.deepEqual(r1, ['SO-1', 'SO-9']); // same Order_Date: record number (SO-1 < SO-9) breaks the tie
});
