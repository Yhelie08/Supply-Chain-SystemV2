// Delivery Analytics #7, Ship -> Service Request gap: server/modules/delivery-management/ship-to-sr-gap.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { getShipToSrGap } from '../../server/modules/delivery-management/ship-to-sr-gap.mjs';

const SR = 'Service_Request1';
const SOF = 'Sales_Order_Fulfillment';
const EVENTS = 'Stage_Events';
let db, raw;
let eventName = 'package.order_aggregation'; // the name the test rows carry: the old one by default

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { eventName = 'package.order_aggregation'; for (const f of [SR, SOF, EVENTS]) await db.query(`DELETE FROM "${f}"`); });

// A package, and the moment it reached Order Aggregation.
async function pkg(so, name, aggregatedAt) {
  const id = await raw.addRecord(SOF, { SO_No: so, Package: name });
  if (aggregatedAt) await raw.addRecord(EVENTS, { Record_Type: 'package', Record_Id: String(id), Event: eventName, Occurred_At: aggregatedAt });
  return id;
}
// A Service Request; Added_Time is stamped by the store, so it is set afterwards to the time the test wants.
async function sr(so, packages, createdAt) {
  const id = await raw.addRecord(SR, { Sales_Order: so, Package_Number: packages });
  await db.query(`UPDATE "${SR}" SET "Added_Time" = $1 WHERE "ID"::text = $2`, [createdAt, String(id)]);
  return id;
}

test('gap = Service Request created minus the package reaching Order Aggregation, in hours', async () => {
  await pkg('SO-1', 'PAC-1', '2026-11-16 09:00:00 AM');
  await sr('SO-1', 'PAC-1', '2026-11-16 03:00:00 PM'); // 6 h
  await pkg('SO-2', 'PAC-2', '2026-11-16 09:00:00 AM');
  await sr('SO-2', 'PAC-2', '2026-11-17 09:00:00 AM'); // 24 h
  await pkg('SO-3', 'PAC-3', '2026-11-16 12:00:00 PM');
  await sr('SO-3', 'PAC-3', '2026-11-16 02:00:00 PM'); // 2 h

  const r = await getShipToSrGap(raw);
  assert.equal(r.count, 3);
  assert.equal(r.avgHours, 10.7); // (6 + 24 + 2) / 3 = 10.67
  assert.equal(r.medianHours, 6);
  assert.equal(r.maxHours, 24);
  assert.equal(r.unmatched, 0);
  assert.equal(r.negative, 0);
});

test('a Service Request with several packages counts from the LAST package to reach aggregation', async () => {
  await pkg('SO-1', 'PAC-A', '2026-11-16 08:00:00 AM');
  await pkg('SO-1', 'PAC-B', '2026-11-16 11:00:00 AM');
  await sr('SO-1', 'PAC-A, PAC-B', '2026-11-16 01:00:00 PM'); // 2 h from PAC-B, not 5 h from PAC-A
  const r = await getShipToSrGap(raw);
  assert.equal(r.count, 1);
  assert.equal(r.maxHours, 2);
});

test('a repeated aggregation event for the same package uses the earliest one', async () => {
  const id = await pkg('SO-1', 'PAC-1', '2026-11-16 09:00:00 AM');
  await raw.addRecord(EVENTS, { Record_Type: 'package', Record_Id: String(id), Event: 'package.order_aggregation', Occurred_At: '2026-11-16 11:00:00 AM' });
  await sr('SO-1', 'PAC-1', '2026-11-16 12:00:00 PM');
  assert.equal((await getShipToSrGap(raw)).maxHours, 3);
});

test('unmatched (no aggregation event, one of several packages missing, no package record) and negative gaps are counted, not averaged', async () => {
  await pkg('SO-NOEVENT', 'PAC-1', null);
  await sr('SO-NOEVENT', 'PAC-1', '2026-11-16 12:00:00 PM');
  await pkg('SO-PART', 'PAC-A', '2026-11-16 08:00:00 AM');
  await pkg('SO-PART', 'PAC-B', null);
  await sr('SO-PART', 'PAC-A, PAC-B', '2026-11-16 12:00:00 PM');
  await sr('SO-NOPKG', 'PAC-9', '2026-11-16 12:00:00 PM');
  await pkg('SO-EARLY', 'PAC-1', '2026-11-16 12:00:00 PM');
  await sr('SO-EARLY', 'PAC-1', '2026-11-16 09:00:00 AM'); // SR made BEFORE aggregation (manual SR)
  await pkg('SO-OK', 'PAC-1', '2026-11-16 08:00:00 AM');
  await sr('SO-OK', 'PAC-1', '2026-11-16 10:00:00 AM');

  const r = await getShipToSrGap(raw);
  assert.equal(r.count, 1);
  assert.equal(r.avgHours, 2);
  assert.equal(r.unmatched, 3);
  assert.equal(r.negative, 1);
});

test('a Service Request with no Added_Time (migrated from Zoho) is counted as unmatched, not dropped', async () => {
  await pkg('SO-1', 'PAC-1', '2026-11-16 09:00:00 AM');
  const id = await raw.addRecord(SR, { Sales_Order: 'SO-1', Package_Number: 'PAC-1' });
  await db.query(`UPDATE "${SR}" SET "Added_Time" = NULL WHERE "ID"::text = $1`, [String(id)]);
  const r = await getShipToSrGap(raw);
  assert.deepEqual([r.count, r.unmatched], [0, 1]);
});

test('only the right SO: the same package name on a different sales order is not matched', async () => {
  await pkg('SO-OTHER', 'PAC-1', '2026-11-16 08:00:00 AM');
  await sr('SO-1', 'PAC-1', '2026-11-16 10:00:00 AM');
  const r = await getShipToSrGap(raw);
  assert.equal(r.count, 0);
  assert.equal(r.unmatched, 1);
  assert.equal(r.avgHours, null);
});

test('nothing at all: zero counts and blank averages, no crash', async () => {
  const r = await getShipToSrGap(raw);
  assert.deepEqual(r, { count: 0, unmatched: 0, negative: 0, avgHours: null, medianHours: null, maxHours: null });
});

test('the spec v1.4 name package.aggregated (written by the Python Fulfillment) counts the same as the old package.order_aggregation, and the two can be mixed', async () => {
  eventName = 'package.aggregated';
  const fresh = await pkg('SO-NEW', 'PAC-1', '2026-11-16 09:00:00 AM');
  await sr('SO-NEW', 'PAC-1', '2026-11-16 11:00:00 AM');
  eventName = 'package.order_aggregation';
  await pkg('SO-OLD', 'PAC-1', '2026-11-16 09:00:00 AM');
  await sr('SO-OLD', 'PAC-1', '2026-11-16 13:00:00 PM');
  const r = await getShipToSrGap(raw);
  assert.equal(r.count, 2);
  assert.equal(r.maxHours, 4);
  assert.ok(fresh);
});
