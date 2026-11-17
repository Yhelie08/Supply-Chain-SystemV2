// Fulfillment sorting engine (server/modules/fulfillment/sorter.mjs): categorize, rank, cut line.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { categorize, rankAndCutLine } from '../server/modules/fulfillment/sorter.mjs';

const SOF = 'Sales_Order_Fulfillment';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SOF, 'Sales_Order_Readiness_Gate', 'Exception_Control1', 'Customer']) await db.query(`DELETE FROM "${f}"`); });

test('the six queue columns exist on Sales_Order_Fulfillment', async () => {
  const id = await raw.addRecord(SOF, { SO_No: 'SO-1', Category: 'on_time', Queue_Rank: '1', Suggested_Release: true });
  const r = await raw.getRecordById(SOF, id, { raw: true });
  assert.equal(r.Category, 'on_time');
  assert.equal(r.Queue_Rank, '1');
  assert.equal(r.Suggested_Release, true);
});

const NOW = new Date('2026-11-17T00:00:00Z');
const policy = () => null; // no settings configured: every categorize() call falls back to its defaults

test('categorize: blocked when payment not cleared and no credit terms', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-01', order_type: 'Normal' };
  const gates = [{ sales_order_number: 'SO-1', payment_status: 'Partial', Has_Credit_Terms: false, Override_Approved: false }];
  const out = categorize(sof, { gates, openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'blocked');
  assert.match(out.blockedReason, /payment/i);
});

test('categorize: blocked when an exception on this package is still open', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-01', order_type: 'Normal' };
  const openExceptions = [{ Sales_Order: 'SO-1', Status: 'Pending' }];
  const out = categorize(sof, { gates: [], openExceptions, now: NOW, policy });
  assert.equal(out.category, 'blocked');
  assert.match(out.blockedReason, /exception/i);
});

test('categorize: broken for replacement order type, even with a future target', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-01', order_type: 'Replacement', Shipping_Address: '1 Main St' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'broken');
});

test('categorize: broken for a replacement with no target date at all (never falls to the bottom)', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '', order_type: 'Replacement', SO_Created_Date: '2026-11-01', Shipping_Address: '1 Main St' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'broken');
  assert.match(out.priorityReason, /no target set/i);
});

test('categorize: late when today is past the target', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-10', order_type: 'Normal', Shipping_Address: '1 Main St' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'late');
});

test('categorize: at_risk when forecast misses the target', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-25', Forecast_Delivery: '2026-11-28', order_type: 'Normal', Shipping_Address: '1 Main St' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'at_risk');
});

test('categorize: at_risk when slack is within the setting default (3 days) even if forecast is fine', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-19', order_type: 'Normal', Shipping_Address: '1 Main St' }; // 2 days out
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'at_risk');
});

test('categorize: on_time otherwise', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-12-15', order_type: 'Normal', Shipping_Address: '1 Main St' };
  const out = categorize(sof, { gates: [], openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'on_time');
});

test('categorize: blocked wins over broken, broken wins over late', () => {
  const sof = { SO_No: 'SO-1', target_delivery_date: '2026-11-01', order_type: 'Replacement' }; // late AND broken
  const gates = [{ sales_order_number: 'SO-1', payment_status: 'No', Has_Credit_Terms: false, Override_Approved: false }]; // also blocked
  const out = categorize(sof, { gates, openExceptions: [], now: NOW, policy });
  assert.equal(out.category, 'blocked'); // blocked beats everything
});

function entry(so, { created, target, items = [{ Quantity: '1' }], category = 'on_time' } = {}) {
  return { sof: { SO_No: so, SO_Created_Date: created, target_delivery_date: target, Item_Details1: items }, category, priorityReason: 'x' };
}

test('rankAndCutLine: oldest SO_Created_Date ranks first regardless of input order', () => {
  const entries = [entry('SO-2', { created: '2026-11-10' }), entry('SO-1', { created: '2026-11-01' })];
  const out = rankAndCutLine(entries, { policy: () => null });
  assert.deepEqual(out.map((e) => e.sof.SO_No), ['SO-1', 'SO-2']);
  assert.deepEqual(out.map((e) => e.queueRank), [1, 2]);
});

test('rankAndCutLine: same created date, earlier target_delivery_date wins the tiebreak', () => {
  const entries = [
    entry('SO-2', { created: '2026-11-01', target: '2026-12-05' }),
    entry('SO-1', { created: '2026-11-01', target: '2026-11-20' }),
  ];
  const out = rankAndCutLine(entries, { policy: () => null });
  assert.deepEqual(out.map((e) => e.sof.SO_No), ['SO-1', 'SO-2']);
});

test('rankAndCutLine: SO_No ascending is the final tiebreak', () => {
  const entries = [entry('SO-20', { created: '2026-11-01' }), entry('SO-3', { created: '2026-11-01' })];
  const out = rankAndCutLine(entries, { policy: () => null });
  assert.deepEqual(out.map((e) => e.sof.SO_No), ['SO-3', 'SO-20']);
});

test('rankAndCutLine: cut line marks suggested_release up to the box-count setting, using line-quantity sum as the box-count stand-in', () => {
  const entries = [
    entry('SO-1', { created: '2026-11-01', items: [{ Quantity: '5' }] }),
    entry('SO-2', { created: '2026-11-02', items: [{ Quantity: '5' }] }),
    entry('SO-3', { created: '2026-11-03', items: [{ Quantity: '5' }] }),
  ];
  const policy = (key) => (key === 'fulfillment_cut_line_boxes' ? '8' : null); // room for SO-1 (5) + part of SO-2 (5) = 10 > 8, so SO-1 and SO-2 both fit, SO-3 does not
  const out = rankAndCutLine(entries, { policy });
  assert.deepEqual(out.map((e) => [e.sof.SO_No, e.suggestedRelease]), [['SO-1', true], ['SO-2', true], ['SO-3', false]]);
});

test('rankAndCutLine: determinism — two runs on the same unordered input give identical output', () => {
  const entries = [entry('SO-5', { created: '2026-11-05' }), entry('SO-1', { created: '2026-11-01' }), entry('SO-3', { created: '2026-11-03' })];
  const a = rankAndCutLine(entries, { policy: () => null });
  const b = rankAndCutLine(entries.slice().reverse(), { policy: () => null });
  assert.deepEqual(a.map((e) => e.sof.SO_No), b.map((e) => e.sof.SO_No));
  assert.deepEqual(a.map((e) => e.queueRank), b.map((e) => e.queueRank));
});
