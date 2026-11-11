// Shipments flags, Receiving, Exceptions and Replacement Request rules, as on the live Procurement pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { seedDb } from '../src/domain/seed.js';
import { RuleError } from '../src/domain/rules.js';
import { exceptionOverdue, exceptionSeverity, receivingState, rrKind, shipmentFlags } from '../src/domain/procurement.js';

const TODAY = '2026-11-11';
const ctx = { today: TODAY, now: '2026-11-11T09:30:00.000Z' };
const refused = (fn, id) => assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === id, `expected refusal ${id}`);
const go = (db, name, payload) => run(db, name, payload, ctx).db;

test('shipment flags are worked out from dates: delayed, arriving in a week, needs attention', () => {
  const db = seedDb(TODAY);
  const s = db.shipments.find((x) => x.status === 'In Transit');
  const base = { ...s, eta: '2026-11-15' };
  assert.equal(shipmentFlags(base, db, TODAY).arrivingSoon, true);
  assert.equal(shipmentFlags(base, db, TODAY).remaining, 4);
  assert.equal(shipmentFlags({ ...s, eta: '2026-11-09' }, db, TODAY).delayed, true);
  assert.equal(shipmentFlags({ ...s, eta: '2026-11-09' }, db, TODAY).attention, true);
  assert.equal(shipmentFlags({ ...s, eta: '2027-03-01' }, db, TODAY).arrivingSoon, false);
  assert.equal(shipmentFlags({ ...s, status: 'Arrived', eta: '2026-11-01' }, db, TODAY).delayed, false, 'arrived is never delayed');
  assert.equal(shipmentFlags({ ...s, status: 'Pending', etd: '2026-11-01' }, db, TODAY).attention, true, 'pending after its ETD');
});

test('ship mode unmatched: the shipment mode differs from the PO', () => {
  const db = seedDb(TODAY);
  const s = db.shipments.find((x) => x.poId);
  assert.equal(shipmentFlags(s, db, TODAY).modeMismatch, false);
  assert.equal(shipmentFlags({ ...s, mode: 'FCL', ...{} }, { ...db, pos: db.pos.map((p) => (p.id === s.poId ? { ...p, mode: 'LCL' } : p)) }, TODAY).modeMismatch, true);
});

test('receiving: only a full count goes to Books, once', () => {
  const db = seedDb(TODAY);
  const full = db.receivings.find((r) => r.status === 'Received');
  const open = db.receivings.find((r) => r.status === 'Open');
  refused(() => go(db, 'receivingSendToBooks', { id: open.id }), 'RCV.BOOKS');
  const after = go(db, 'receivingSendToBooks', { id: full.id });
  assert.equal(after.receivings.find((r) => r.id === full.id).sentToBooks, TODAY);
  assert.equal(receivingState(after.receivings.find((r) => r.id === full.id), after).sentToBooks, true);
  refused(() => go(after, 'receivingSendToBooks', { id: full.id }), 'RCV.BOOKS');
});

test('receiving: awaiting replacement while the exception is still open', () => {
  const db = seedDb(TODAY);
  const r = db.receivings.find((x) => x.status === 'Closed – Exceptions' || x.damaged > 0);
  assert.ok(r, 'sample data has a receiving with damage');
  const st = receivingState(r, db);
  assert.equal(st.withExceptions, true);
});

test('receiving from scratch needs a supplier, an item and a quantity, and can be counted at once', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'receivingCreate', { item: 'Lamp', qty: 3 }), 'RCV.SCRATCH');
  refused(() => go(db, 'receivingCreate', { supplier: 'Tony Fan', qty: 3 }), 'RCV.SCRATCH');
  refused(() => go(db, 'receivingCreate', { supplier: 'Tony Fan', item: 'Lamp', qty: 0 }), 'RCV.SCRATCH');
  const after = go(db, 'receivingCreate', { supplier: 'Tony Fan', item: 'Lamp', qty: 3 });
  const rcv = after.receivings.at(-1);
  assert.equal(rcv.poNo, '');
  const counted = go(after, 'receive', { id: rcv.id, accepted: 3 });
  assert.equal(counted.receivings.find((r) => r.id === rcv.id).status, 'Received');
});

test('exceptions: raise by hand, review needs an assignee and due date, resolve needs a note', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'exceptionRaise', { source: 'Procurement', item: 'Lamp', qty: 2, type: 'Bogus' }), 'EXC.RAISE');
  refused(() => go(db, 'exceptionRaise', { source: 'Procurement', item: '', qty: 2, type: 'Damaged' }), 'EXC.RAISE');
  refused(() => go(db, 'exceptionRaise', { source: 'Procurement', item: 'Lamp', qty: 0, type: 'Damaged' }), 'EXC.RAISE');
  const raised = go(db, 'exceptionRaise', { source: 'Procurement', item: 'Lamp', qty: 2, type: 'Missing', supplier: 'Tony Fan' });
  const exc = raised.exceptions.at(-1);
  assert.equal(exc.status, 'Open');
  refused(() => go(raised, 'exceptionReview', { id: exc.id, assignee: 'Ben' }), 'EXC.REVIEW');
  const rev = go(raised, 'exceptionReview', { id: exc.id, assignee: 'Ben', dueDate: '2026-11-10' });
  const e2 = rev.exceptions.find((e) => e.id === exc.id);
  assert.equal(e2.status, 'Under Review');
  assert.equal(exceptionOverdue(e2, TODAY), true, 'due date passed');
  assert.equal(exceptionOverdue({ ...e2, status: 'Resolved' }, TODAY), false);
  refused(() => go(rev, 'exceptionResolve', { id: exc.id }), 'EXC.RESOLVE');
  const done = go(rev, 'exceptionResolve', { id: exc.id, note: 'Supplier credited the amount' });
  assert.equal(done.exceptions.find((e) => e.id === exc.id).status, 'Resolved');
  refused(() => go(done, 'exceptionResolve', { id: exc.id, note: 'again' }), 'EXC.RESOLVE');
  refused(() => go(done, 'exceptionReview', { id: exc.id, assignee: 'Ben', dueDate: '2026-12-01' }), 'GEN.STATE');
});

test('exception severity: damage or 5+ units is High, otherwise Medium', () => {
  assert.equal(exceptionSeverity({ type: 'Damaged', qty: 1 }), 'High');
  assert.equal(exceptionSeverity({ type: 'Missing', qty: 5 }), 'High');
  assert.equal(exceptionSeverity({ type: 'Missing', qty: 2 }), 'Medium');
});

test('a replacement can be created from an Under Review exception', () => {
  let db = seedDb(TODAY);
  const exc = db.exceptions.find((e) => e.status === 'Open');
  db = go(db, 'exceptionReview', { id: exc.id, assignee: 'Ben', dueDate: '2026-12-01' });
  db = go(db, 'exceptionCreateRR', { id: exc.id, supplier: exc.supplier });
  assert.equal(db.exceptions.find((e) => e.id === exc.id).status, 'RR Created');
});

test('RR cancel needs a reason, removes the pending shipment and reopens the exception', () => {
  const db = seedDb(TODAY);
  const rr = db.rrs.find((r) => r.status === 'Acknowledged' || r.status === 'In Production');
  refused(() => go(db, 'rrCancel', { id: rr.id }), 'RR.CANCEL');
  const after = go(db, 'rrCancel', { id: rr.id, reason: 'Client withdrew' });
  assert.equal(after.rrs.find((r) => r.id === rr.id).status, 'Cancelled');
  assert.ok(!after.shipments.some((s) => s.rrNo === rr.no));
  const exc = after.exceptions.find((e) => e.id === rr.excId);
  assert.equal(exc.status, 'Open');
  assert.equal(exc.rrNo, '');
  refused(() => go(after, 'rrCancel', { id: rr.id, reason: 'again' }), 'RR.CANCEL');
});

test('RR close only after it was received; kinds split into Procurement, Fulfillment and Local', () => {
  const db = seedDb(TODAY);
  const open = db.rrs.find((r) => r.status === 'Open');
  refused(() => go(db, 'rrClose', { id: open.id }), 'RR.CLOSE');
  assert.equal(rrKind({ supplier: 'HC System', source: 'Procurement' }), 'Local');
  assert.equal(rrKind({ supplier: 'Tony Fan', source: 'Fulfillment' }), 'Fulfillment');
  assert.equal(rrKind({ supplier: 'Tony Fan', source: 'Procurement' }), 'Procurement');
});
