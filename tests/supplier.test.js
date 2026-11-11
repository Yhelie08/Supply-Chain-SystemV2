// The supplier portals (Tony Fan, Fenteng Lighting), ported from the live supplier widgets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { seedDb } from '../src/domain/seed.js';
import { RuleError } from '../src/domain/rules.js';
import {
  PORTAL_SUPPLIERS, inquiryRows, inquiryStatus, poRows, prRows, prStatus, rrLabel, rrRows, shipmentRows,
} from '../src/domain/supplier.js';

const TODAY = '2026-11-11';
const ctx = { today: TODAY, now: '2026-11-11T09:30:00.000Z' };
const refused = (fn, id) => assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === id, `expected refusal ${id}`);
const go = (db, name, payload) => run(db, name, payload, ctx).db;
const T = 'Tony Fan';
const F = 'Fenteng Lighting';
const withStatus = (db, supplier, status) => inquiryRows(db, supplier).find((i) => inquiryStatus(i, supplier) === status);

test('each portal shows only its own supplier, with lines at every status', () => {
  const db = seedDb(TODAY);
  for (const s of PORTAL_SUPPLIERS) {
    const seen = new Set(inquiryRows(db, s).map((i) => inquiryStatus(i, s)));
    for (const st of ['Waiting', 'Submit Response', 'Selected', 'Not Selected', 'Completed']) assert.ok(seen.has(st), `${s} has a ${st} inquiry`);
    assert.ok(inquiryRows(db, s).every((i) => i.quotes.some((q) => q.supplier === s)));
    assert.ok(poRows(db, s).every((p) => p.supplier === s));
    assert.ok(shipmentRows(db, s).every((x) => x.supplier === s));
    assert.ok(rrRows(db, s).every((r) => r.supplier === s));
  }
  assert.ok(inquiryRows(db, T).every((i) => !inquiryRows(db, F).includes(i) || i.quotes.length > 1), 'a line is shared only when both were quoted');
});

test('a supplier sees a PO only once it is sent, and its shipment only once acknowledged', () => {
  const db = seedDb(TODAY);
  const sent = poRows(db, T).filter((p) => p.status === 'Sent');
  assert.ok(sent.length >= 1);
  assert.ok(poRows(db, T).every((p) => p.status !== 'Draft'));
  assert.ok(sent.every((p) => !db.shipments.some((s) => s.poId === p.id)), 'no shipment before acknowledgement');
});

test('responding to an inquiry needs availability, an initial price and a lead time', () => {
  const db = seedDb(TODAY);
  const inq = withStatus(db, T, 'Waiting');
  refused(() => go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T }), 'SUP.RESPONSE');
  refused(() => go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T, availability: 'Confirmed', initial: 0, leadTime: '3 weeks' }), 'SUP.RESPONSE');
  refused(() => go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T, availability: 'Confirmed', initial: 500, leadTime: '' }), 'SUP.RESPONSE');
  refused(() => go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T, availability: 'Confirmed', initial: 500, negotiated: -1, leadTime: '3 weeks' }), 'GEN.FIELD');
  const after = go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T, availability: 'Confirmed', initial: 500, negotiated: 450, leadTime: '3 weeks' });
  const q = after.inquiries.find((x) => x.id === inq.id).quotes.find((x) => x.supplier === T);
  assert.equal(q.final, 450, 'final is the negotiated price');
  assert.equal(inquiryStatus(after.inquiries.find((x) => x.id === inq.id), T), 'Submit Response');
  assert.ok(after.timeline.some((t) => t.inqNo === inq.no && t.actor === T));
});

test('a supplier can answer only its own lines, and the buyer-side quotes of others are untouched', () => {
  const db = seedDb(TODAY);
  const inq = inquiryRows(db, T).find((i) => inquiryStatus(i, T) === 'Waiting' && i.quotes.length === 1);
  refused(() => go(db, 'supplierRespondInquiry', { id: inq.id, supplier: F, availability: 'Confirmed', initial: 5, leadTime: '1 week' }), 'SUP.OWN');
  const after = go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T, availability: 'Confirmed', initial: 5, leadTime: '1 week' });
  const was = db.inquiries.find((x) => x.id === inq.id).quotes.filter((q) => q.supplier !== T);
  assert.deepEqual(after.inquiries.find((x) => x.id === inq.id).quotes.filter((q) => q.supplier !== T), was);
});

test('Selected locks pricing, Not Selected and Completed lock everything', () => {
  const db = seedDb(TODAY);
  const body = { availability: 'Confirmed', initial: 9, leadTime: '1 week' };
  for (const st of ['Selected', 'Not Selected', 'Completed']) {
    const inq = withStatus(db, T, st);
    refused(() => go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T, ...body }), 'SUP.LOCKED');
  }
});

test('declining asks nothing more, tells the buyer and removes the line from the queue', () => {
  const db = seedDb(TODAY);
  const inq = withStatus(db, T, 'Waiting');
  const after = go(db, 'supplierRespondInquiry', { id: inq.id, supplier: T, availability: 'Cannot Produce' });
  const q = after.inquiries.find((x) => x.id === inq.id).quotes.find((x) => x.supplier === T);
  assert.equal(q.stage, 'Declined');
  assert.ok(!inquiryRows(after, T).some((i) => i.id === inq.id), 'gone from the supplier queue');
  assert.ok(after.inquiries.find((x) => x.id === inq.id).quotes.some((x) => x.supplier === T), 'the buyer still sees the answer');
});

test('collateral opens only for the selected supplier, and finishing it completes and locks the response', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'supplierCollateral', { id: withStatus(db, T, 'Waiting').id, supplier: T, sample: 'Completed' }), 'SUP.LOCKED');
  const inq = withStatus(db, T, 'Selected');
  refused(() => go(db, 'supplierCollateral', { id: inq.id, supplier: T }), 'GEN.FIELD');
  refused(() => go(db, 'supplierCollateral', { id: inq.id, supplier: T, dImage: 'Maybe' }), 'GEN.FIELD');
  const done = go(db, 'supplierCollateral', { id: inq.id, supplier: T, sample: 'Completed', dImage: 'Completed', drawing: 'N/A', spec: 'Completed' });
  assert.equal(inquiryStatus(done.inquiries.find((x) => x.id === inq.id), T), 'Completed');
  refused(() => go(done, 'supplierCollateral', { id: inq.id, supplier: T, sample: 'Pending' }), 'SUP.LOCKED');
});

test('PR: a PR from an inquiry is view-only, a held one cannot be quoted, a manual one can', () => {
  const db = seedDb(TODAY);
  const fromInquiry = prRows(db, T).find((p) => p.inquiryNo);
  refused(() => go(db, 'supplierRespondPR', { id: fromInquiry.id, supplier: T, availability: 'Confirmed', initial: 5, leadTime: '1 week' }), 'SUP.PR_VIEW');
  const manual = prRows(db, T).find((p) => !p.inquiryNo && prStatus(p, T) === 'Waiting');
  const held = go(db, 'prHold', { id: manual.id, reason: 'Client stopped order', notes: '' });
  refused(() => go(held, 'supplierRespondPR', { id: manual.id, supplier: T, availability: 'Confirmed', initial: 5, leadTime: '1 week' }), 'SUP.PR_VIEW');
  refused(() => go(db, 'supplierRespondPR', { id: manual.id, supplier: F, availability: 'Confirmed', initial: 5, leadTime: '1 week' }), 'SUP.OWN');
  refused(() => go(db, 'supplierRespondPR', { id: manual.id, supplier: T, availability: 'Confirmed', initial: 0, leadTime: '1 week' }), 'SUP.RESPONSE');
  const after = go(db, 'supplierRespondPR', { id: manual.id, supplier: T, availability: 'Confirmed', initial: 640, leadTime: '10 days' });
  const pr = after.prs.find((p) => p.id === manual.id);
  assert.equal(pr.price, 640);
  assert.equal(pr.lead, '10 days');
  assert.equal(prStatus(pr, T), 'Submit Response');
});

test('PO: only the owning supplier acknowledges, once, with both dates; it then creates the shipment', () => {
  const db = seedDb(TODAY);
  const po = poRows(db, T).find((p) => p.status === 'Sent');
  refused(() => go(db, 'supplierAckPO', { id: po.id, supplier: F, etd: '2026-11-20', eta: '2026-12-10' }), 'SUP.OWN');
  refused(() => go(db, 'supplierAckPO', { id: po.id, supplier: T, etd: '2026-11-20' }), 'PO.ACK_DATES');
  const after = go(db, 'supplierAckPO', { id: po.id, supplier: T, etd: '2026-11-20', eta: '2026-12-10' });
  assert.equal(after.pos.find((p) => p.id === po.id).status, 'Confirmed');
  assert.ok(after.shipments.some((s) => s.poId === po.id && s.status === 'Pending'));
  refused(() => go(after, 'supplierAckPO', { id: po.id, supplier: T, etd: '2026-11-20', eta: '2026-12-10' }), 'PO.ACK_ONCE');
});

test('PO: refused while every line is held or cancelled', () => {
  let db = seedDb(TODAY);
  const po = poRows(db, F).find((p) => p.status === 'Sent');
  for (const id of po.prIds) {
    db = structuredClone(db);
    const pr = db.prs.find((p) => p.id === id);
    pr.hold = 'On Hold';
  }
  refused(() => go(db, 'supplierAckPO', { id: po.id, supplier: F, etd: '2026-11-20', eta: '2026-12-10' }), 'SUP.PO_HELD');
});

test('Shipments: needs a date and a mode, not a future date, and only the owner can ship', () => {
  const db = seedDb(TODAY);
  const ship = shipmentRows(db, T).find((s) => s.status === 'Pending');
  refused(() => go(db, 'supplierShip', { id: ship.id, supplier: T, mode: 'LCL' }), 'SUP.SHIP');
  refused(() => go(db, 'supplierShip', { id: ship.id, supplier: T, dateShipped: TODAY }), 'SUP.SHIP');
  refused(() => go(db, 'supplierShip', { id: ship.id, supplier: T, dateShipped: '2026-12-31', mode: 'LCL' }), 'SUP.SHIP');
  refused(() => go(db, 'supplierShip', { id: ship.id, supplier: F, dateShipped: TODAY, mode: 'LCL' }), 'SUP.OWN');
  const after = go(db, 'supplierShip', { id: ship.id, supplier: T, dateShipped: TODAY, mode: 'FCL' });
  const s = after.shipments.find((x) => x.id === ship.id);
  assert.deepEqual([s.status, s.mode, s.dateShipped], ['In Transit', 'FCL', TODAY]);
  refused(() => go(after, 'supplierShip', { id: ship.id, supplier: T, dateShipped: TODAY, mode: 'FCL' }), 'GEN.STATE');
});

test('RR: approve needs a mode and both dates, then progress only moves forward until the goods are received', () => {
  const db = seedDb(TODAY);
  const open = rrRows(db, T).find((r) => r.status === 'Open');
  assert.equal(rrLabel(open), 'Awaiting Approval');
  refused(() => go(db, 'supplierRRProgress', { id: open.id, supplier: T, status: 'Shipped' }), 'RR.PROGRESS');
  refused(() => go(db, 'supplierApproveRR', { id: open.id, supplier: T, expShip: '2026-11-15', eta: '2026-12-01' }), 'RR.DATES');
  refused(() => go(db, 'supplierApproveRR', { id: open.id, supplier: F, mode: 'LCL', expShip: '2026-11-15', eta: '2026-12-01' }), 'SUP.OWN');
  const ack = go(db, 'supplierApproveRR', { id: open.id, supplier: T, mode: 'LCL', expShip: '2026-11-15', eta: '2026-12-01' });
  assert.equal(ack.rrs.find((r) => r.id === open.id).status, 'Acknowledged');
  const replacement = ack.shipments.find((s) => s.rrNo === open.no);
  assert.equal(replacement.mode, 'LCL', 'the supplier\'s mode is used for the replacement shipment');
  refused(() => go(ack, 'supplierApproveRR', { id: open.id, supplier: T, mode: 'LCL', expShip: '2026-11-15', eta: '2026-12-01' }), 'RR.ONCE');

  const prod = go(ack, 'supplierRRProgress', { id: open.id, supplier: T, status: 'In Production', eta: '2026-12-05' });
  assert.equal(prod.rrs.find((r) => r.id === open.id).eta, '2026-12-05');
  refused(() => go(prod, 'supplierRRProgress', { id: open.id, supplier: T, status: 'Acknowledged' }), 'GEN.FIELD');
  refused(() => go(prod, 'supplierRRProgress', { id: open.id, supplier: T, status: 'In Production' }), 'RR.PROGRESS');
  refused(() => go(prod, 'supplierRRProgress', { id: open.id, supplier: T, status: 'Shipped', eta: '2026-11-01' }), 'RR.DATES');

  const shipped = go(prod, 'supplierRRProgress', { id: open.id, supplier: T, status: 'Shipped' });
  assert.equal(shipped.shipments.find((s) => s.rrNo === open.no).status, 'In Transit', 'shipping the RR ships the replacement');
  refused(() => go(shipped, 'supplierRRProgress', { id: open.id, supplier: T, status: 'Shipped' }), 'RR.PROGRESS');

  const arrived = go(shipped, 'shipmentArrive', { id: shipped.shipments.find((s) => s.rrNo === open.no).id });
  const rcv = arrived.receivings.find((r) => r.rrId === open.id);
  const received = go(arrived, 'receive', { id: rcv.id, accepted: rcv.expected });
  assert.equal(received.rrs.find((r) => r.id === open.id).status, 'Received');
});

test('a refused supplier step leaves the data untouched', () => {
  const db = seedDb(TODAY);
  const snap = JSON.stringify(db);
  refused(() => go(db, 'supplierRespondInquiry', { id: withStatus(db, T, 'Selected').id, supplier: T, availability: 'Confirmed', initial: 1, leadTime: 'x' }), 'SUP.LOCKED');
  assert.equal(JSON.stringify(db), snap);
});
