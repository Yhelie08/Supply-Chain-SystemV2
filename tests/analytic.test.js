// Supply Chain Conversion numbers (the Analytic tab).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDb } from '../src/domain/seed.js';
import { conversion } from '../src/domain/analytic.js';

test('conversion numbers agree with the records', () => {
  const db = seedDb('2026-11-11');
  const c = conversion(db);
  assert.equal(c.kpi.orders, new Set(db.items.map((i) => i.soNo)).size);
  assert.equal(c.funnel[0][1], c.kpi.orders);
  assert.equal(c.funnel[1][1], db.items.filter((i) => i.received).length);
  assert.equal(c.split.reduce((n, [, v]) => n + v, 0), db.serviceRequests.length);
  for (const k of ['overall', 'poCompletion', 'pickToPack', 'onTime']) assert.ok(c.kpi[k] >= 0 && c.kpi[k] <= 100, k);
  assert.equal(c.suppliers.reduce((n, s) => n + s.pos, 0), db.pos.filter((p) => p.status !== 'Cancelled').length);
  assert.ok(c.insights.length >= 1);
});

test('a drop of 15% or more between funnel steps is flagged, and so is an exception rate of 10%', () => {
  const db = seedDb('2026-11-11');
  const c = conversion(db);
  const drops = c.funnel.slice(1).filter(([, v], i) => c.funnel[i][1] > 0 && ((c.funnel[i][1] - v) * 100) / c.funnel[i][1] >= 15).length;
  assert.equal(c.insights.filter((i) => i.text.startsWith('Bottleneck')).length, drops);
  assert.equal(c.insights.some((i) => i.text.startsWith('Exception rate')), c.kpi.impact >= 10);
});

test('an empty database gives zeros, not NaN', () => {
  const db = seedDb('2026-11-11');
  for (const k of ['items', 'pos', 'serviceRequests', 'exceptions']) db[k] = [];
  const c = conversion(db);
  assert.deepEqual(Object.values(c.kpi).filter((v) => Number.isNaN(v)), []);
  assert.equal(c.kpi.overall, 0);
});
