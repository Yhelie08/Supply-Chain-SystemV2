// The Forecast Setting page's model (ported from the PR Forecast widget) and the Procurement Dashboard's numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { seedDb } from '../src/domain/seed.js';
import { RuleError } from '../src/domain/rules.js';
import { DEFAULTS, buildForecast, daysBetween, forecastRows, legsFor, resolveSettings, severityOf, startOfWeek, weeklyBuckets } from '../src/domain/forecast.js';
import { pctChange, procurementDashboard, timeAgo, weeklyBuckets as dashBuckets } from '../src/domain/dashboard.js';

const TODAY = '2026-11-11'; // a Wednesday
const refused = (fn, id) => assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === id, `expected ${id}`);
const S = DEFAULTS;
const order = (over = {}) => ({ mode: 'LCL', sourcing: 'Import', prAdded: '2026-11-01', hasSof: false, orderType: 'Normal', stage: '', ...over });

test('the defaults are the user\'s own spec', () => {
  assert.equal(S.fc_air_transit_min, 5); assert.equal(S.fc_air_transit_max, 7);
  assert.equal(S.fc_lcl_transit_min, 35); assert.equal(S.fc_lcl_transit_max, 60);
  assert.equal(S.fc_lcl_customs_min, 7); assert.equal(S.fc_lcl_customs_max, 10);
  assert.equal(S.fc_prep_min, 7); assert.equal(S.fc_delivery_max, 0);
  assert.equal(S.fc_reanchor, 1); assert.equal(S.fc_include_supplier_lead, 0); assert.equal(S.fc_horizon_weeks, 12);
});

test('which legs apply: Local, Air, FCL, LCL, and an assumed LCL for an unknown mode', () => {
  assert.equal(legsFor('Airfreight', 'Import', S).bucket, 'Air Freight');
  assert.equal(legsFor('FCL', 'Import', S).bucket, 'FCL');
  assert.equal(legsFor('LCL', 'Import', S).assumed, false);
  assert.equal(legsFor('', 'Import', S).bucket, 'LCL');
  assert.equal(legsFor('', 'Import', S).assumed, true, 'an assumed mode is flagged');
  assert.equal(legsFor('LCL', 'Local', S).bucket, 'Local (HC System)', 'Local ignores the mode');
});

test('a window from the PR date: LCL is 35-60 transit + 7-10 customs + 7 prep', () => {
  const f = buildForecast(order(), S, TODAY);
  assert.equal(f.position, 'Procurement');
  // 2026-11-01 + (35+7+7) = 49 days, + (60+10+7) = 77 days
  assert.equal(f.earliest, '2026-12-20');
  assert.equal(f.latest, '2027-01-17');
  assert.equal(f.likely, '2027-01-03', 'likely is the midpoint');
  assert.equal(f.legs.length, 4);
  assert.equal(f.assumedMode, false);
});

test('Air is much shorter than LCL, and Local has no freight', () => {
  const air = buildForecast(order({ mode: 'Airfreight' }), S, TODAY);
  const lcl = buildForecast(order(), S, TODAY);
  assert.ok(air.latest < lcl.earliest);
  const local = buildForecast(order({ sourcing: 'Local', mode: '' }), S, TODAY);
  assert.equal(local.earliest, '2026-11-11', 'prep only, and it is clamped to today');
});

test('re-anchoring tightens the window as the order moves', () => {
  const start = buildForecast(order(), S, TODAY);
  const sailed = buildForecast(order({ dateShipped: '2026-11-05' }), S, TODAY);
  assert.equal(sailed.position, 'In transit');
  assert.equal(sailed.anchorLabel, 'shipped 2026-11-05');
  const arrived = buildForecast(order({ dateShipped: '2026-11-05', shipArrived: true }), S, TODAY);
  assert.equal(arrived.position, 'At warehouse');
  assert.equal(arrived.earliest, '2026-11-18');
  const picking = buildForecast(order({ hasSof: true, stage: 'Picking', prepStart: '2026-11-09' }), S, TODAY);
  assert.equal(picking.position, 'In Picking');
  assert.match(picking.legs[0].name, /Preparation left \(2 of 7 days used\)/);
  assert.equal(picking.earliest, '2026-11-16', '7 days of prep, 2 already used, 5 left');
  const ready = buildForecast(order({ hasSof: true, stage: 'For Delivery' }), S, TODAY);
  assert.equal(ready.position, 'Ready for delivery');
  assert.equal(ready.likely, TODAY);
  // Once the goods are in transit the window narrows with every real event. (Counting from the ship date, not the PR date, can
  // legitimately land later than the PR-date estimate, because the ship date was four days after the PR.)
  assert.ok(sailed.latest > arrived.latest && arrived.latest >= ready.latest, 'each real event leaves less time to run');
  assert.ok(sailed.latest > start.latest, 'shipping four days after the PR date pushes the window out');
});

test('with re-anchoring off the whole chain always counts from the PR date', () => {
  const off = { ...S, fc_reanchor: 0 };
  const f = buildForecast(order({ dateShipped: '2026-11-05', shipArrived: true }), off, TODAY);
  assert.equal(f.position, 'Procurement');
  assert.equal(f.legs.length, 4);
});

test('stock on hand has no import leg, but a pre-order does', () => {
  const stock = buildForecast(order({ hasSof: true, orderType: 'Normal' }), S, TODAY);
  assert.equal(stock.position, 'Stock on hand');
  assert.deepEqual(stock.legs.map((l) => l.name), ['Preparation thru QC', 'Delivery']);
  const pre = buildForecast(order({ hasSof: true, orderType: 'Pre Order' }), S, TODAY);
  assert.equal(pre.position, 'Procurement', 'a pre-order still has the import leg ahead');
});

test('the supplier lead time is added only when the toggle is on', () => {
  const off = buildForecast(order({ supplierLead: 14 }), S, TODAY);
  const on = buildForecast(order({ supplierLead: 14 }), { ...S, fc_include_supplier_lead: 1 }, TODAY);
  assert.equal(on.legs[0].name, 'Supplier production lead');
  assert.equal(daysBetween(off.latest, on.latest), 14);
});

test('a chain that already blew past its own estimate is flagged and pulled to today', () => {
  const f = buildForecast(order({ prAdded: '2025-01-01' }), S, TODAY);
  assert.equal(f.overdueModel, true);
  assert.equal(f.earliest, TODAY);
  assert.equal(f.latest, TODAY);
});

test('an order with no PR date has no forecast, instead of a made-up one', () => {
  const f = buildForecast(order({ prAdded: null }), S, TODAY);
  assert.equal(f.likely, null);
  assert.equal(f.position, 'No PR date');
  assert.equal(severityOf(f, '2026-12-01', TODAY).code, 'unknown');
});

test('severity against the date the client expects', () => {
  const f = { likely: '2026-12-10', earliest: '2026-12-05', latest: '2026-12-15' };
  assert.equal(severityOf(f, '2026-12-20', TODAY).code, 'ontrack', 'the latest date fits');
  assert.equal(severityOf(f, '2026-12-12', TODAY).code, 'atrisk', 'only the earliest fits');
  assert.equal(severityOf(f, '2026-12-01', TODAY).code, 'miss', 'even the earliest is too late');
  assert.equal(severityOf(f, '2026-11-01', TODAY).label, 'Overdue', 'today is already past the client date');
  assert.equal(severityOf(f, null, TODAY).code, 'notarget', 'no promise recorded, so never "on time"');
});

test('weeks start on Monday', () => {
  assert.equal(startOfWeek('2026-11-11'), '2026-11-09'); // Wed -> Mon
  assert.equal(startOfWeek('2026-11-09'), '2026-11-09');
  assert.equal(startOfWeek('2026-11-15'), '2026-11-09'); // Sunday belongs to the week that began on Monday
});

test('forecast rows come from the real records, soonest first, and leave out cancelled and delivered orders', () => {
  const db = seedDb(TODAY);
  const rows = forecastRows(db, resolveSettings(db.settings.forecast), TODAY);
  assert.ok(rows.length >= 5);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].f.likely <= rows[i].f.likely, 'sorted by likely date');
  assert.ok(rows.every((r) => r.o.prNo.startsWith('PR-')), 'the PR is the spine');

  const picking = rows.find((r) => r.o.prNo === 'PR-00001');
  assert.equal(picking.f.position, 'In Picking', 'a received item that has been released to Pick');
  const sailing = rows.find((r) => r.o.prNo === 'PR-00002');
  assert.equal(sailing.f.position, 'In transit');

  const cancelled = structuredClone(db);
  cancelled.prs.find((p) => p.no === 'PR-00003').hold = 'Cancelled';
  assert.ok(!forecastRows(cancelled, S, TODAY).some((r) => r.o.prNo === 'PR-00003'));
});

test('the weekly volume chart buckets by likely date and respects the horizon', () => {
  const db = seedDb(TODAY);
  const rows = forecastRows(db, S, TODAY);
  const weeks = weeklyBuckets(rows, { ...S, fc_horizon_weeks: 6 }, TODAY);
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0].start, '2026-11-09');
  assert.ok(weeks.every((w) => w.total === w.ontrack + w.atrisk + w.miss));
  assert.equal(weeklyBuckets(rows, { ...S, fc_horizon_weeks: 99 }, TODAY).length, 52, 'capped at 52');
});

test('saving settings: ranges, whole-number horizon, and reset', () => {
  const db = seedDb(TODAY);
  const go = (name, payload) => run(db, name, payload, { today: TODAY }).db;
  refused(() => go('forecastSettingsSave', { values: { fc_lcl_transit_min: 70, fc_lcl_transit_max: 60 } }), 'FC.RANGE');
  refused(() => go('forecastSettingsSave', { values: { fc_prep_min: -1 } }), 'FC.VALUES');
  refused(() => go('forecastSettingsSave', { values: { fc_horizon_weeks: 0 } }), 'FC.VALUES');
  refused(() => go('forecastSettingsSave', { values: { fc_horizon_weeks: 2.5 } }), 'FC.VALUES');
  const saved = go('forecastSettingsSave', { values: { fc_lcl_transit_min: 20, fc_lcl_transit_max: 30, fc_reanchor: 0 } });
  assert.equal(saved.settings.forecast.fc_lcl_transit_min, 20);
  assert.equal(saved.settings.forecast.fc_reanchor, 0);
  assert.equal(saved.settings.forecast.fc_air_transit_min, 5, 'untouched settings keep their value');
  const before = forecastRows(db, resolveSettings(db.settings.forecast), TODAY).find((r) => r.o.prNo === 'PR-00004');
  const after = forecastRows(saved, resolveSettings(saved.settings.forecast), TODAY).find((r) => r.o.prNo === 'PR-00004');
  assert.ok(after.f.latest < before.f.latest, 'shorter lead times mean an earlier forecast');
  const back = run(saved, 'forecastSettingsReset', {}, { today: TODAY }).db;
  assert.deepEqual(resolveSettings(back.settings.forecast), DEFAULTS);
  assert.equal(db.settings.forecast.fc_lcl_transit_min, undefined, 'the original data was not touched');
});

// ───────────── Procurement Dashboard ─────────────

test('dashboard weekly buckets: eight weeks ending with the current one, Monday to Sunday', () => {
  const b = dashBuckets(['2026-11-09', '2026-11-15', '2026-11-16', '2026-09-21', '2026-01-01', null], 8, TODAY);
  assert.equal(b.length, 8);
  assert.equal(b.at(-1).start, '2026-11-09');
  assert.equal(b.at(-1).count, 2, 'Monday and Sunday are the same week');
  assert.equal(b.at(-2).count, 0);
  assert.equal(b[0].start, '2026-09-21');
  assert.equal(b[0].count, 1);
  assert.equal(b.reduce((t, x) => t + x.count, 0), 3, 'dates outside the window are not counted');
});

test('percent change against the prior four weeks', () => {
  assert.equal(pctChange(6, 3), 100);
  assert.equal(pctChange(3, 6), -50);
  assert.equal(pctChange(0, 0), 0);
  assert.equal(pctChange(4, 0), 100, 'growth from nothing reads as +100%');
});

test('time ago wording', () => {
  assert.equal(timeAgo('2026-11-11', TODAY), 'Today');
  assert.equal(timeAgo('2026-11-10', TODAY), 'Yesterday');
  assert.equal(timeAgo('2026-11-07', TODAY), '4d ago');
  assert.equal(timeAgo('2026-10-28', TODAY), '2w ago');
  assert.equal(timeAgo('2026-08-01', TODAY), '2026-08-01');
});

test('the dashboard counts what the other pages show', () => {
  const db = seedDb(TODAY);
  const d = procurementDashboard(db, TODAY);
  assert.equal(d.pr.count, db.prs.length);
  assert.equal(d.po.count, db.pos.filter((p) => p.status !== 'Completed' && p.status !== 'Cancelled').length);
  assert.equal(d.exc.count, db.exceptions.filter((e) => e.status !== 'Closed').length);
  assert.equal(d.inq.count, db.inquiries.length);
  assert.equal(d.ship.count, db.shipments.filter((s) => s.status !== 'Arrived').length);
  assert.equal(d.recv.count, db.receivings.filter((r) => r.status === 'Open' || r.status === 'Partial').length);
  assert.equal(d.totalMissing, db.receivings.reduce((t, r) => t + r.missing, 0));
  assert.equal(d.supplierCount, db.suppliers.filter((s) => !s.stock).length);
  assert.equal(d.chart.length, 8);
  assert.equal(d.pr.spark.length, 8);
  assert.ok(d.activity.length > 0 && d.activity.length <= 9);
  for (let i = 1; i < d.activity.length; i += 1) assert.ok(d.activity[i - 1].date >= d.activity[i].date, 'newest first');
  const quoteTotal = d.breakdowns.Inquiries.reduce((t, r) => t + r.count, 0);
  assert.ok(quoteTotal >= db.inquiries.length, 'every inquiry is counted at least once');
  assert.equal(d.breakdowns['Purchase Orders'].reduce((t, r) => t + r.count, 0), db.pos.length);
});

test('top suppliers are ranked by spend and only include suppliers with PO lines', () => {
  const db = seedDb(TODAY);
  const d = procurementDashboard(db, TODAY);
  assert.ok(d.topSuppliers.every((s) => s.count > 0));
  for (let i = 1; i < d.topSuppliers.length; i += 1) assert.ok(d.topSuppliers[i - 1].spend >= d.topSuppliers[i].spend);
  assert.ok(d.suppliers.some((s) => s.count === 0), 'a supplier with no PO is still in the suppliers table');
  assert.ok(Object.keys(d.spendByCurrency).length >= 1, 'spend is kept per currency, never summed across them');
});

test('every record that appears after a step carries the day it was created', () => {
  const db = seedDb(TODAY);
  for (const coll of ['pos', 'shipments', 'receivings', 'exceptions', 'rrs', 'serviceRequests']) {
    assert.ok(db[coll].every((r) => r.createdOn === TODAY), `${coll} are stamped`);
  }
});
