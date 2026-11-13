// The forecast ladder (server/forecast/engine.mjs), a pure function: no database. "today" is fixed at 12 Nov 2026.
// Tests marked "mirrors Zoho" follow the Deluge script literally; they are to be confirmed against Zoho Development.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeForecast, settingsFrom, DEFAULT_SETTINGS } from '../../server/forecast/engine.mjs';

const d = (y, m, day) => new Date(y, m - 1, day);
const today = d(2026, 11, 12);
const base = { today, settings: DEFAULT_SETTINGS, stage: '', stockOnHand: false, modeVal: '', sourcing: '', supLead: 0, prAdded: null, prepStart: null, prepFound: false, dateShipped: null, shipStatus: '', clientTarget: null };
const run = (extra = {}) => computeForecast({ ...base, ...extra });

test('settings: no record means the defaults; an empty field keeps its default; local and prep days set both ends', () => {
  assert.deepEqual(settingsFrom(null), DEFAULT_SETTINGS);
  const s = settingsFrom({ Air_Transit_Min: '4', Air_Transit_Max: '', Local_Transit_Days: '3', Prep_Days_Thru_QC: '5', Delivery_Days: '2', Re_anchor_on_Latest_Real_Event: 'true', Include_Supplier_Lead_Time: 'false' });
  assert.deepEqual([s.airTMin, s.airTMax], [4, 7]);
  assert.deepEqual([s.locTMin, s.locTMax, s.prepMin, s.prepMax, s.delMin, s.delMax], [3, 3, 5, 5, 2, 2]);
  assert.deepEqual([s.reAnchor, s.addSupLead], [true, false]);
});

test('mirrors Zoho: with a settings record the two switches are read as written, so a missing tick turns them off', () => {
  const s = settingsFrom({});
  assert.deepEqual([s.reAnchor, s.addSupLead], [false, false]);
  assert.deepEqual([settingsFrom({ Re_anchor_on_Latest_Real_Event: true }).reAnchor, settingsFrom({ Include_Supplier_Lead_Time: 'TRUE' }).addSupLead], [true, true]);
});

test('For Delivery: ready now (re-anchor on) with no days to add', () => {
  const r = run({ stage: 'For Delivery' });
  assert.deepEqual([r.skip, r.delivery, r.position, r.bucket], [false, '2026-11-12', 'Ready', 'LCL?']);
  assert.equal(r.window, 'Nov 12 - Nov 12, 2026 | LCL? | Ready');
  assert.equal(r.status, 'No Client Date');
});

test('a prep stage: the prep days not yet used, counted from when prep started', () => {
  const r = run({ stage: 'Picking', prepFound: true, prepStart: d(2026, 11, 9) }); // 3 of 7 days used
  assert.deepEqual([r.earliest, r.latest, r.delivery, r.position], ['2026-11-16', '2026-11-16', '2026-11-16', 'Picking']);
  const over = run({ stage: 'Pack', prepFound: true, prepStart: d(2026, 10, 1) }); // 42 days used: nothing left, never negative
  assert.deepEqual([over.earliest, over.latest], ['2026-11-12', '2026-11-12']);
  const none = run({ stage: 'Crate' }); // prep start unknown: nothing used
  assert.equal(none.earliest, '2026-11-19');
});

test('mirrors Zoho: Picking, Pack, Quality Checking and Crate are prep stages even with re-anchoring off; Order Readiness and For Delivery need it', () => {
  const off = { ...DEFAULT_SETTINGS, reAnchor: false };
  for (const stage of ['Picking', 'Pack', 'Quality Checking', 'Crate']) assert.equal(run({ stage, settings: off, stockOnHand: true }).position, stage);
  assert.equal(run({ stage: 'Order Readiness', settings: off, stockOnHand: true }).position, 'Stock on hand');
  assert.equal(run({ stage: 'For Delivery', settings: off, stockOnHand: true }).position, 'Stock on hand');
});

test('stock on hand: prep and delivery days only', () => {
  const r = run({ stockOnHand: true });
  assert.deepEqual([r.earliest, r.latest, r.delivery, r.position], ['2026-11-19', '2026-11-19', '2026-11-19', 'Stock on hand']);
});

test('a delivered shipment: at the warehouse, prep and delivery days from today', () => {
  const r = run({ shipStatus: 'Delivered', prAdded: d(2026, 9, 1) });
  assert.deepEqual([r.position, r.delivery], ['At WH', '2026-11-19']);
  assert.equal(run({ shipStatus: 'Delivered', prAdded: d(2026, 9, 1), settings: { ...DEFAULT_SETTINGS, reAnchor: false } }).position, 'Procurement');
});

test('in transit: from the day it shipped, transit and customs and prep and delivery (LCL), the middle date rounds half up', () => {
  const r = run({ dateShipped: d(2026, 11, 1), modeVal: 'LCL' });
  assert.deepEqual([r.earliest, r.latest, r.delivery, r.bucket, r.position], ['2026-12-20', '2027-01-17', '2027-01-03', 'LCL', 'In transit']);
  assert.equal(r.window, 'Dec 20 - Jan 17, 2027 | LCL | In transit');
  const odd = run({ dateShipped: d(2026, 11, 1), modeVal: 'Air Freight' }); // 14 to 17 days: span 3, half 1.5 rounds up to 2
  assert.deepEqual([odd.earliest, odd.latest, odd.delivery], ['2026-11-15', '2026-11-18', '2026-11-17']);
});

test('procurement: from the day the PR was added; the bucket follows sourcing and mode; an unknown mode is "LCL?"', () => {
  assert.deepEqual([run({ prAdded: d(2026, 11, 1), modeVal: 'Air' }).bucket, run({ prAdded: d(2026, 11, 1), modeVal: 'fcl' }).bucket, run({ prAdded: d(2026, 11, 1), modeVal: 'LCL' }).bucket, run({ prAdded: d(2026, 11, 1), modeVal: 'Truck' }).bucket], ['Air', 'FCL', 'LCL', 'LCL?']);
  const local = run({ prAdded: d(2026, 11, 1), sourcing: 'Local', modeVal: 'Air' }); // sourcing wins over the mode
  assert.deepEqual([local.bucket, local.earliest, local.latest], ['Local', '2026-11-12', '2026-11-12']);
  const air = run({ prAdded: d(2026, 11, 1), modeVal: 'Air' });
  assert.deepEqual([air.earliest, air.latest, air.position], ['2026-11-15', '2026-11-18', 'Procurement']);
});

test('the supplier lead time is added only when the switch is on', () => {
  const on = { ...DEFAULT_SETTINGS, addSupLead: true };
  assert.equal(run({ prAdded: d(2026, 11, 1), modeVal: 'Air', supLead: 10, settings: on }).earliest, '2026-11-25');
  assert.equal(run({ prAdded: d(2026, 11, 1), modeVal: 'Air', supLead: 10 }).earliest, '2026-11-15');
});

test('an estimate in the past is clamped to today and says so', () => {
  const r = run({ prAdded: d(2026, 1, 1), modeVal: 'Air' });
  assert.deepEqual([r.earliest, r.latest, r.delivery], ['2026-11-12', '2026-11-12', '2026-11-12']);
  assert.equal(r.window, 'Nov 12 - Nov 12, 2026 | Air | Procurement | lampas na sa tantiya');
  const partly = run({ prAdded: d(2026, 10, 28), modeVal: 'Air' }); // 14 to 17 days: Nov 11 (past) to Nov 14
  assert.deepEqual([partly.earliest, partly.latest], ['2026-11-12', '2026-11-14']);
  assert.ok(!partly.window.includes('lampas'));
});

test('status against the client date: On Track, At Risk, Will Miss, Overdue, No Client Date, and the days in the window text', () => {
  const air = { prAdded: d(2026, 11, 1), modeVal: 'Air' }; // window Nov 15 to Nov 18, forecast Nov 17
  const at = (target) => run({ ...air, clientTarget: target });
  assert.deepEqual([at(d(2026, 11, 20)).status, at(d(2026, 11, 18)).status], ['On Track', 'On Track']);
  assert.equal(at(d(2026, 11, 20)).window, 'Nov 15 - Nov 18, 2026 | Air | Procurement | 3d early');
  assert.equal(at(d(2026, 11, 16)).status, 'At Risk');
  assert.equal(at(d(2026, 11, 16)).window.endsWith('| +1d vs client'), true);
  assert.equal(at(d(2026, 11, 14)).status, 'Will Miss');
  assert.equal(at(d(2026, 11, 14)).window.endsWith('| +3d vs client'), true);
  assert.equal(at(d(2026, 11, 10)).status, 'Overdue');
  assert.equal(at(d(2026, 11, 17)).window.endsWith('| sakto sa client'), true);
  assert.equal(run({ ...air }).status, 'No Client Date');
  assert.ok(!run({ ...air }).window.includes('client'));
});

test('mirrors Zoho: Overdue wins over On Track when the target is already behind today, even if the forecast is today', () => {
  const r = run({ stage: 'For Delivery', clientTarget: d(2026, 11, 11) });
  assert.equal(r.status, 'Overdue');
  assert.equal(r.window.endsWith('| +1d vs client'), true);
});

test('no anchor at all (not stock, no PR date, nothing shipped): nothing is stamped', () => {
  assert.deepEqual(run({ stockOnHand: false, prAdded: null }), { skip: true });
});

test('property: the middle date is never outside the window and never before today, over many random orders', () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const stages = ['', 'For Delivery', 'Order Readiness', 'Picking', 'Pack', 'Quality Checking', 'Crate'];
  const modes = ['', 'Air', 'LCL', 'FCL', 'Truck'];
  for (let n = 0; n < 500; n += 1) {
    const r = run({
      stage: stages[rnd(stages.length)], stockOnHand: rnd(2) === 0, modeVal: modes[rnd(modes.length)], sourcing: rnd(4) === 0 ? 'Local' : '',
      prAdded: rnd(5) === 0 ? null : d(2026, 1 + rnd(11), 1 + rnd(28)), prepFound: rnd(2) === 0, prepStart: d(2026, 1 + rnd(11), 1 + rnd(28)),
      dateShipped: rnd(3) === 0 ? d(2026, 1 + rnd(11), 1 + rnd(28)) : null, shipStatus: rnd(6) === 0 ? 'Delivered' : '',
      clientTarget: rnd(3) === 0 ? null : d(2026, 1 + rnd(12), 1 + rnd(28)),
      settings: settingsFrom(rnd(2) === 0 ? null : { Re_anchor_on_Latest_Real_Event: rnd(2) ? 'true' : 'false', Include_Supplier_Lead_Time: rnd(2) ? 'true' : 'false' }), supLead: rnd(20),
    });
    if (r.skip) continue;
    assert.ok(r.earliest >= '2026-11-12', `${JSON.stringify(r)}`);
    assert.ok(r.earliest <= r.delivery && r.delivery <= r.latest, `${JSON.stringify(r)}`);
    assert.ok(['On Track', 'At Risk', 'Will Miss', 'Overdue', 'No Client Date'].includes(r.status));
  }
});
