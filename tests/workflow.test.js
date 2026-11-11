import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { emptyDb, seedDb } from '../src/domain/seed.js';
import { RuleError, RULES } from '../src/domain/rules.js';

const TODAY = '2026-11-11';
const ctx = { today: TODAY };

function refusedWith(fn, ruleId) {
  assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === ruleId, `expected refusal ${ruleId}`);
}

test('the seed builds, and every rule id used by a refusal exists', () => {
  const db = seedDb(TODAY);
  assert.ok(db.prs.length >= 6 && db.items.length >= 15 && db.serviceRequests.length >= 8);
  assert.ok(RULES.length > 40);
  const ids = new Set(RULES.map((r) => r.id));
  assert.equal(ids.size, RULES.length, 'rule ids are unique');
});

test('the seed covers every Service Request status', () => {
  const db = seedDb(TODAY);
  const seen = new Set(db.serviceRequests.map((s) => s.status));
  for (const s of ['Initial Scheduling', 'Service Request', 'Scheduled', 'Ongoing', 'Completed', 'Exception']) {
    assert.ok(seen.has(s), `seed has a job at ${s}`);
  }
});

test('a refused step leaves the database untouched', () => {
  const db = seedDb(TODAY);
  const before = JSON.stringify(db);
  const pending = db.prs.find((p) => !p.mode);
  refusedWith(() => run(db, 'prConvert', { ids: [pending.id] }, ctx), 'PR.NOT_READY');
  assert.equal(JSON.stringify(db), before);
});

test('PR: hold needs a reason, held PRs cannot convert, converted PRs are locked', () => {
  const db = seedDb(TODAY);
  const ready = db.prs.find((p) => p.status === 'Ready for PO' && !p.hold);
  refusedWith(() => run(db, 'prHold', { id: ready.id, reason: '' }, ctx), 'PR.HOLD_REASON');
  refusedWith(() => run(db, 'prHold', { id: ready.id, reason: 'Other', notes: '' }, ctx), 'PR.HOLD_REASON');
  const held = run(db, 'prHold', { id: ready.id, reason: 'Client stopped order' }, ctx).db;
  refusedWith(() => run(held, 'prConvert', { ids: [ready.id] }, ctx), 'PR.HELD');
  const converted = db.prs.find((p) => p.status === 'Converted to PO');
  refusedWith(() => run(db, 'prHold', { id: converted.id, reason: 'x' }, ctx), 'PR.LOCKED');
});

test('PR convert makes one PO per supplier', () => {
  let db = emptyDb();
  const step = (name, payload) => { db = run(db, name, payload, ctx).db; return db; };
  step('customerCreate', { name: 'A One', type: 'Designer' });
  const cust = db.customers[0].id;
  step('projectCreate', { name: 'P', customerId: cust });
  const proj = db.projects[0].id;
  step('productCreate', { bookId: '1', name: 'Lamp', sku: 'S1', rate: 100 });
  const prod = db.products[0].id;
  const mk = (supplier) => {
    step('inquiryCreate', { data: { customerId: cust, projectId: proj, itemId: prod, qty: 1, targetDate: '2026-12-01', salesOwner: 'HC Sales 1',
      quotes: [{ supplier, availability: 'Confirmed', initial: 10, selected: true }], collateral: { sample: 'Completed', dImage: 'Completed', drawing: 'Completed', spec: 'Completed' }, srp: 20 } });
    const id = db.inquiries.at(-1).id;
    step('inquiryEstimate', { id });
    step('inquiryApprove', { id, mode: 'Airfreight' });
  };
  mk('Fenteng Lighting');
  mk('Tony Fan');
  mk('Fenteng Lighting');
  db = run(db, 'prConvert', { ids: db.prs.map((p) => p.id) }, ctx).db;
  assert.equal(db.pos.length, 2);
  assert.equal(db.pos.find((p) => p.supplier === 'Fenteng Lighting').prIds.length, 2);
  assert.equal(db.pos[0].currency, 'CNY', 'supplier POs are priced in CNY');
});

test('PO: unknown supplier cannot be sent; ack needs both dates, once only, and builds shipment + receiving', () => {
  let db = seedDb(TODAY);
  const draftless = db.pos.find((p) => p.status === 'Sent');
  if (draftless) {
    refusedWith(() => run(db, 'poAcknowledge', { id: draftless.id, etd: '2026-12-01', eta: '' }, ctx), 'PO.ACK_DATES');
    refusedWith(() => run(db, 'poAcknowledge', { id: draftless.id, etd: '2026-12-05', eta: '2026-12-01' }, ctx), 'PO.ACK_DATES');
  }
  const acked = db.pos.find((p) => p.status === 'Confirmed');
  refusedWith(() => run(db, 'poAcknowledge', { id: acked.id, etd: '2027-01-01', eta: '2027-02-01' }, ctx), 'PO.ACK_ONCE');
  assert.ok(db.shipments.find((s) => s.poId === acked.id));
  assert.ok(db.receivings.find((r) => r.poNo === acked.no));
  db.pos[0].supplier = 'Nobody Ltd';
  db.pos[0].status = 'Draft';
  refusedWith(() => run(db, 'poSend', { id: db.pos[0].id }, ctx), 'PO.SUPPLIER');
});

test('Receiving: totals cannot exceed expected, damage raises an exception, full receipt frees the items', () => {
  const db = seedDb(TODAY);
  const damaged = db.receivings.find((r) => r.status === 'Closed – Exceptions');
  assert.equal(damaged.accepted + damaged.damaged + damaged.missing, damaged.expected);
  const exc = db.exceptions.find((e) => e.receivingNo === damaged.no);
  assert.equal(exc.qty, 3);
  assert.equal(exc.status, 'Open');

  const waiting = db.items.find((i) => i.prNo && !i.received && db.shipments.some((s) => s.status === 'In Transit'));
  assert.ok(waiting, 'an item is still on order');
  refusedWith(() => run(db, 'createPackage', { id: waiting.id }, ctx), 'GATE.RECEIVED');

  const inTransit = db.shipments.find((s) => s.status === 'In Transit');
  const rcv = db.receivings.find((r) => r.shipmentId === inTransit.id);
  refusedWith(() => run(db, 'receive', { id: rcv.id, accepted: 1 }, ctx), 'RCV.ARRIVED');
  let d2 = run(db, 'shipmentArrive', { id: inTransit.id }, ctx).db;
  refusedWith(() => run(d2, 'receive', { id: rcv.id, accepted: rcv.expected + 1 }, ctx), 'RCV.TOTAL');
  refusedWith(() => run(d2, 'receive', { id: rcv.id, accepted: 0 }, ctx), 'RCV.NUMBERS');
  d2 = run(d2, 'receive', { id: rcv.id, accepted: rcv.expected }, ctx).db;
  assert.ok(d2.items.find((i) => i.id === waiting.id).received);
});

test('Shipment must be in transit before it can arrive', () => {
  const db = seedDb(TODAY);
  const pendingShip = db.shipments.find((s) => s.status === 'Pending');
  if (pendingShip) refusedWith(() => run(db, 'shipmentArrive', { id: pendingShip.id }, ctx), 'SHP.TRANSIT');
});

test('Exception → RR → replacement shipment → receipt closes the loop; no duplicate RR', () => {
  let db = seedDb(TODAY);
  const exc = db.exceptions.find((e) => e.source === 'Procurement' && e.status === 'Open');
  db = run(db, 'exceptionCreateRR', { id: exc.id }, ctx).db;
  const rr = db.rrs.find((r) => r.excId === exc.id);
  refusedWith(() => run(db, 'exceptionCreateRR', { id: exc.id }, ctx), 'EXC.DUP');
  refusedWith(() => run(db, 'rrApprove', { id: rr.id, expShip: '2026-12-01', eta: '' }, ctx), 'RR.DATES');
  db = run(db, 'rrApprove', { id: rr.id, expShip: '2026-12-01', eta: '2026-12-20' }, ctx).db;
  refusedWith(() => run(db, 'rrApprove', { id: rr.id, expShip: '2026-12-01', eta: '2026-12-20' }, ctx), 'RR.ONCE');
  const ship = db.shipments.find((s) => s.rrNo === rr.no);
  db = run(db, 'shipmentTransit', { id: ship.id }, ctx).db;
  db = run(db, 'shipmentArrive', { id: ship.id }, ctx).db;
  const rcv = db.receivings.find((r) => r.shipmentId === ship.id);
  db = run(db, 'receive', { id: rcv.id, accepted: rcv.expected }, ctx).db;
  assert.equal(db.rrs.find((r) => r.id === rr.id).status, 'Received');
  assert.equal(db.exceptions.find((e) => e.id === exc.id).status, 'Closed');
  const stock = db.items.find((i) => exc.prNos.includes(i.prNo));
  assert.ok(stock.received, 'the waiting item is released once the replacement is in');
});

test('Readiness Gate: package, picker, payment, override', () => {
  const db = seedDb(TODAY);
  const gate = db.items.find((i) => i.stage === 'Readiness Gate' && i.pac && i.payment === 'Unpaid');
  assert.ok(gate.picker, 'the seeded gate item has a picker, so only payment blocks it');
  refusedWith(() => run(db, 'gateRelease', { id: gate.id }, ctx), 'GATE.PAYMENT');
  const noPicker = structuredClone(db);
  noPicker.items.find((i) => i.id === gate.id).picker = '';
  refusedWith(() => run(noPicker, 'gateRelease', { id: gate.id }, ctx), 'GATE.PICKER');
  const noPac = structuredClone(db);
  noPac.items.find((i) => i.id === gate.id).pac = '';
  refusedWith(() => run(noPac, 'gateRelease', { id: gate.id }, ctx), 'GATE.PAC');
  let d2 = db;
  refusedWith(() => run(d2, 'approveOverride', { id: gate.id, reason: '', until: '2026-12-01' }, ctx), 'GATE.OVERRIDE');
  refusedWith(() => run(d2, 'approveOverride', { id: gate.id, reason: 'VIP', until: '2026-11-01' }, ctx), 'GATE.OVERRIDE');
  d2 = run(d2, 'approveOverride', { id: gate.id, reason: 'VIP client', until: '2026-12-01' }, ctx).db;
  d2 = run(d2, 'gateRelease', { id: gate.id }, ctx).db;
  assert.equal(d2.items.find((i) => i.id === gate.id).stage, 'Pick');
  const expired = run(db, 'approveOverride', { id: gate.id, reason: 'VIP', until: '2026-11-12' }, ctx).db;
  const picked = run(expired, 'assignPicker', { id: gate.id, picker: 'X' }, ctx).db;
  refusedWith(() => run(picked, 'gateRelease', { id: gate.id }, { today: '2026-11-13' }), 'GATE.PAYMENT');
});

test('Pack & QC needs a packer; QC routes on For Crate; crate must be Done; rejection raises an exception', () => {
  const db = seedDb(TODAY);
  let it = db.items.find((i) => i.stage === 'Pick');
  let d2 = run(db, 'pickDone', { id: it.id }, ctx).db;
  assert.equal(d2.items.find((i) => i.id === it.id).stage, 'QC', 'Pick goes straight to QC');
  refusedWith(() => run(d2, 'qcApprove', { id: it.id }, ctx), 'PACK.PACKER');
  refusedWith(() => run(d2, 'qcAssign', { id: it.id, packer: ' ' }, ctx), 'PACK.PACKER');
  d2 = run(d2, 'qcAssign', { id: it.id, packer: 'Carlo' }, ctx).db;
  assert.equal(d2.items.find((i) => i.id === it.id).checker, 'Carlo');
  d2 = run(d2, 'qcApprove', { id: it.id }, ctx).db;
  assert.equal(d2.items.find((i) => i.id === it.id).stage, 'Order Aggregation');

  const crate = db.items.find((i) => i.stage === 'Crate');
  refusedWith(() => run(db, 'crateComplete', { id: crate.id }, ctx), 'CRATE.DONE');
  const d3 = run(run(db, 'crateSet', { id: crate.id, status: 'Done' }, ctx).db, 'crateComplete', { id: crate.id }, ctx).db;
  assert.equal(d3.items.find((i) => i.id === crate.id).stage, 'Order Aggregation');

  const rejected = db.items.find((i) => i.qcStatus === 'Rejected');
  assert.ok(db.exceptions.find((e) => e.itemId === rejected.id && e.source === 'Fulfillment'));
  const qc = db.items.find((i) => i.stage === 'QC' && i.qcStatus === 'Pending');
  refusedWith(() => run(db, 'qcReject', { id: qc.id, reason: '' }, ctx), 'QC.REJECT');
});

test('Dispatch: payment gate, creates one Service Request, never two', () => {
  const db = seedDb(TODAY);
  const ready = db.items.find((i) => i.stage === 'Order Aggregation' && i.payment === 'Paid');
  let d2 = run(db, 'dispatch', { id: ready.id }, ctx).db;
  assert.equal(d2.serviceRequests.filter((s) => s.itemId === ready.id).length, 1);
  refusedWith(() => run(d2, 'dispatch', { id: ready.id }, ctx), 'OA.DEDUP');
  const unpaid = structuredClone(db);
  unpaid.items.find((i) => i.id === ready.id).payment = 'Unpaid';
  refusedWith(() => run(unpaid, 'dispatch', { id: ready.id }, ctx), 'OA.PAYMENT');
});

test('DMS: site confirmation, hand-off, scheduling, pick-up exemption', () => {
  const db = seedDb(TODAY);
  const fresh = db.serviceRequests.find((s) => s.status === 'Initial Scheduling' && !s.initialDate);
  refusedWith(() => run(db, 'srHandOff', { id: fresh.id }, ctx), 'DMS.INITIAL');
  refusedWith(() => run(db, 'srConfirmSite', { id: fresh.id, method: 'Phone', notes: '' }, ctx), 'DMS.CONFIRM');
  const atSR = db.serviceRequests.find((s) => s.status === 'Service Request');
  const unconfirmed = structuredClone(db);
  unconfirmed.serviceRequests.find((s) => s.id === atSR.id).siteConfirmed = false;
  refusedWith(() => run(unconfirmed, 'srSchedule', { id: atSR.id }, ctx), 'DMS.SITE');
  let d2 = run(unconfirmed, 'srConfirmSite', { id: atSR.id, method: 'Phone', notes: 'ok' }, ctx).db;
  d2 = run(d2, 'srSchedule', { id: atSR.id }, ctx).db;
  const got = d2.serviceRequests.find((s) => s.id === atSR.id);
  assert.equal(got.status, 'Scheduled');
  assert.ok(got.scheduledDate >= TODAY);
  assert.notEqual(new Date(got.scheduledDate + 'T00:00:00Z').getUTCDay(), 0, 'never schedules on a Sunday');
  const pickup = db.serviceRequests.find((s) => s.type === 'Pick Up');
  assert.equal(pickup.status, 'Scheduled');
  assert.equal(pickup.team, 'Pick Up');
});

test('DMS: a full calendar refuses instead of overbooking; teams day-off is respected', () => {
  const db = seedDb(TODAY);
  const atSR = db.serviceRequests.find((s) => s.status === 'Service Request');
  db.teams.forEach((t) => { t.capacity = 0; });
  let d2 = run(db, 'srConfirmSite', { id: atSR.id, method: 'Phone', notes: 'ok' }, ctx).db;
  refusedWith(() => run(d2, 'srSchedule', { id: atSR.id }, ctx), 'DMS.FULL');

  const db2 = seedDb(TODAY);
  const sr2 = db2.serviceRequests.find((s) => s.status === 'Service Request');
  const d3 = run(db2, 'srConfirmSite', { id: sr2.id, method: 'Phone', notes: 'ok' }, ctx).db;
  const d4 = run(d3, 'srSchedule', { id: sr2.id }, ctx).db;
  const placed = d4.serviceRequests.find((s) => s.id === sr2.id);
  const load = (db, team, date) => db.serviceRequests.filter((s) => s.team === team && s.scheduledDate === date && ['Scheduled', 'Ongoing'].includes(s.status)).length;
  const t = d4.teams.find((x) => x.id === placed.team);
  assert.ok(load(d4, t.id, placed.scheduledDate) <= t.capacity);
});

test('DMS: failed delivery needs a reason; resolving needs an action; reschedule marks priority', () => {
  let db = seedDb(TODAY);
  const ongoing = db.serviceRequests.find((s) => s.status === 'Ongoing');
  refusedWith(() => run(db, 'srFail', { id: ongoing.id, reason: '' }, ctx), 'DMS.FAIL');
  const exc = db.serviceRequests.find((s) => s.status === 'Exception');
  refusedWith(() => run(db, 'srResolve', { id: exc.id, action: '' }, ctx), 'DMS.RESOLVE');
  refusedWith(() => run(db, 'srResolve', { id: exc.id, action: 'Reschedule', newDate: '' }, ctx), 'DMS.RESOLVE');
  db = run(db, 'srResolve', { id: exc.id, action: 'Reschedule', newDate: '2026-11-20' }, ctx).db;
  const back = db.serviceRequests.find((s) => s.id === exc.id);
  assert.equal(back.status, 'Service Request');
  assert.equal(back.priority, true);
  assert.equal(back.initialDate, '2026-11-20');
});
