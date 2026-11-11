// Purchase Order: Confirmed, Completed and Cancelled, as on the live PO page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { seedDb } from '../src/domain/seed.js';
import { RuleError } from '../src/domain/rules.js';

const TODAY = '2026-11-11';
const ctx = { today: TODAY, now: '2026-11-11T09:30:00.000Z' };
const refused = (fn, id) => assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === id, `expected refusal ${id}`);
const go = (db, name, payload) => run(db, name, payload, ctx).db;

test('acknowledging a PO makes it Confirmed', () => {
  const db = seedDb(TODAY);
  const sent = db.pos.find((p) => p.status === 'Sent');
  const after = go(db, 'poAcknowledge', { id: sent.id, etd: '2026-11-20', eta: '2026-12-10' });
  assert.equal(after.pos.find((p) => p.id === sent.id).status, 'Confirmed');
  assert.ok(!db.pos.some((p) => p.status === 'Acknowledged'), 'no PO keeps the old status name');
});

test('cancelling needs a reason, removes the pending shipment and receiving, and puts the PRs back in the queue', () => {
  const db = seedDb(TODAY);
  const po = db.pos.find((p) => p.status === 'Confirmed' && db.shipments.filter((s) => s.poId === p.id).every((s) => s.status === 'Pending'));
  refused(() => go(db, 'poCancel', { id: po.id }), 'PO.CANCEL');
  const after = go(db, 'poCancel', { id: po.id, reason: 'Client cancelled the order' });
  const p = after.pos.find((x) => x.id === po.id);
  assert.equal(p.status, 'Cancelled');
  assert.equal(p.cancelReason, 'Client cancelled the order');
  assert.ok(!after.shipments.some((s) => s.poId === po.id));
  assert.ok(!after.receivings.some((r) => r.poNo === po.no));
  for (const id of po.prIds) {
    const pr = after.prs.find((x) => x.id === id);
    assert.equal(pr.poNo, '');
    assert.notEqual(pr.status, 'Converted to PO');
  }
  refused(() => go(after, 'poCancel', { id: po.id, reason: 'again' }), 'PO.CANCEL');
});

test('a PO whose goods are already on the way cannot be cancelled', () => {
  const db = seedDb(TODAY);
  const shipped = db.shipments.find((s) => s.poId && s.status !== 'Pending');
  refused(() => go(db, 'poCancel', { id: shipped.poId, reason: 'Too late' }), 'PO.CANCEL');
});

test('a PO becomes Completed once all of its shipments are received in full', () => {
  let db = seedDb(TODAY);
  const po = db.pos.find((p) => p.status === 'Confirmed');
  const ship = db.shipments.find((s) => s.poId === po.id);
  if (ship.status === 'Pending') db = go(db, 'shipmentTransit', { id: ship.id });
  if (db.shipments.find((s) => s.id === ship.id).status === 'In Transit') db = go(db, 'shipmentArrive', { id: ship.id });
  const rcv = db.receivings.find((r) => r.shipmentId === ship.id);
  if (rcv.status === 'Open') db = go(db, 'receive', { id: rcv.id, accepted: rcv.expected });
  assert.equal(db.pos.find((p) => p.id === po.id).status, 'Completed');
});

test('a PO with damaged goods is not Completed until the goods are right', () => {
  const db = seedDb(TODAY);
  const exc = db.exceptions.find((e) => e.source === 'Procurement' && e.shipmentNo);
  const ship = db.shipments.find((s) => s.no === exc.shipmentNo);
  const po = db.pos.find((p) => p.id === ship.poId);
  assert.notEqual(po.status, 'Completed');
});
