// Fulfillment (packages, Pack & QC, Exception Control, Transfer Item) and Delivery (returns, site visits, trucks, schedule requests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/domain/actions.js';
import { seedDb } from '../src/domain/seed.js';
import { RuleError } from '../src/domain/rules.js';
import { orderRows, orderStage } from '../src/domain/fulfillment.js';

const TODAY = '2026-11-11';
const ctx = { today: TODAY, now: '2026-11-11T09:30:00.000Z' };
const refused = (fn, id) => assert.throws(fn, (e) => e instanceof RuleError && e.ruleId === id, `expected refusal ${id}`);
const go = (db, name, payload) => run(db, name, payload, ctx).db;

test('the Pack stage is gone: Pick goes straight to QC, and QC needs a packer before approve or reject', () => {
  const db = seedDb(TODAY);
  assert.ok(!db.items.some((i) => i.stage === 'Pack'));
  const it = db.items.find((i) => i.stage === 'Pick');
  const picked = go(db, 'pickDone', { id: it.id });
  const now = picked.items.find((i) => i.id === it.id);
  assert.deepEqual([now.stage, now.qcStatus, now.checker], ['QC', 'Pending', '']);
  refused(() => go(picked, 'qcReject', { id: it.id, reason: 'Scratched' }), 'PACK.PACKER');
  refused(() => go(picked, 'qcApprove', { id: it.id }), 'PACK.PACKER');
  const assigned = go(picked, 'qcAssign', { id: it.id, packer: 'Faye Lopez' });
  assert.equal(assigned.items.find((i) => i.id === it.id).checker, 'Faye Lopez');
  assert.equal(go(assigned, 'qcApprove', { id: it.id }).items.find((i) => i.id === it.id).qcStatus, 'Approved');
});

test('a recheck puts the item back in QC with nobody assigned', () => {
  const db = seedDb(TODAY);
  const rej = db.items.find((i) => i.qcStatus === 'Rejected');
  const after = go(db, 'qcRecheck', { id: rej.id });
  const it = after.items.find((i) => i.id === rej.id);
  assert.deepEqual([it.stage, it.qcStatus, it.checker], ['QC', 'Pending', '']);
});

test('Create Package: one package per Sales Order, needs a Delivery Type, and every item received', () => {
  const db = seedDb(TODAY);
  const so = orderRows(db).find((o) => o.canPackage);
  assert.ok(so, 'sample data has an order ready to package');
  refused(() => go(db, 'packageCreateOrder', { soNo: so.soNo }), 'SOR.TYPE');
  refused(() => go(db, 'packageCreateOrder', { soNo: so.soNo, deliveryType: 'Teleport' }), 'SOR.TYPE');
  const after = go(db, 'packageCreateOrder', { soNo: so.soNo, deliveryType: 'Pick Up' });
  const items = after.items.filter((i) => i.soNo === so.soNo);
  assert.ok(items.every((i) => i.pac && i.pac === items[0].pac && i.deliveryType === 'Pick Up'));
  refused(() => go(after, 'packageCreateOrder', { soNo: so.soNo, deliveryType: 'Delivery' }), 'SOR.ONE_PACKAGE');
  const onOrder = db.items.find((i) => !i.received);
  refused(() => go(db, 'packageCreateOrder', { soNo: onOrder.soNo, deliveryType: 'Delivery' }), 'SOR.READY');
});

test('the order stage is the earliest stage any item is in', () => {
  assert.equal(orderStage([{ stage: 'Order Aggregation' }, { stage: 'Pick' }]), 'Picking');
  assert.equal(orderStage([{ stage: 'Readiness Gate', pac: '' }]), 'Waiting for Package');
  assert.equal(orderStage([{ stage: 'Readiness Gate', pac: 'PAC-1' }]), 'Order Readiness');
  assert.equal(orderStage([{ stage: 'Dispatched' }, { stage: 'Dispatched' }]), 'Delivered');
});

test('Exception Control: pending, rework, completed or unrepairable; only unrepairable gets a replacement', () => {
  const db = seedDb(TODAY);
  const pending = db.exceptions.find((e) => e.source === 'Fulfillment' && !e.fcStatus);
  refused(() => go(db, 'exceptionCreateRR', { id: pending.id, supplier: 'Tony Fan' }), 'EC.RR');
  refused(() => go(db, 'ecComplete', { id: pending.id }), 'EC.STATE');
  const rework = go(db, 'ecRework', { id: pending.id });
  refused(() => go(rework, 'ecRework', { id: pending.id }), 'EC.STATE');
  const done = go(rework, 'ecComplete', { id: pending.id });
  const e = done.exceptions.find((x) => x.id === pending.id);
  assert.deepEqual([e.fcStatus, e.status], ['Completed', 'Closed']);
  refused(() => go(done, 'ecUnrepairable', { id: pending.id }), 'EC.STATE');

  const bad = go(db, 'ecUnrepairable', { id: pending.id });
  const withRR = go(bad, 'exceptionCreateRR', { id: pending.id, supplier: 'Tony Fan' });
  assert.ok(withRR.rrs.some((r) => r.excId === pending.id));
  const procurement = db.exceptions.find((x) => x.source === 'Procurement');
  refused(() => go(db, 'ecRework', { id: procurement.id }), 'EC.STATE');
});

test('Transfer Item: validation, and each kind has its own flow that stops at the end', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'transferCreate', { kind: 'Warehouse Request', item: 'Lamp', qty: 0, from: 'Showroom', to: 'Bodega 2' }), 'XFER.NEW');
  refused(() => go(db, 'transferCreate', { kind: 'Warehouse Request', item: 'Lamp', qty: 1, from: 'Showroom', to: 'Showroom' }), 'XFER.NEW');
  const req = go(db, 'transferCreate', { kind: 'Warehouse Request', item: 'Lamp', qty: 2, from: 'Showroom', to: 'Bodega 2' });
  const r = req.transfers.at(-1);
  assert.equal(r.status, 'Pending');
  const done = go(req, 'transferAdvance', { id: r.id });
  assert.equal(done.transfers.find((x) => x.id === r.id).status, 'Done');
  refused(() => go(done, 'transferAdvance', { id: r.id }), 'XFER.DONE');
  const xf = go(db, 'transferCreate', { kind: 'Transfer Warehouse', item: 'Lamp', qty: 2, from: 'Showroom', to: 'Bodega 2' });
  let cur = xf;
  const id = cur.transfers.at(-1).id;
  assert.equal(cur.transfers.at(-1).status, 'Pending Dispatch');
  cur = go(cur, 'transferAdvance', { id });
  cur = go(cur, 'transferAdvance', { id });
  assert.equal(cur.transfers.find((x) => x.id === id).status, 'Received');
  refused(() => go(cur, 'transferAdvance', { id }), 'XFER.DONE');
});

test('Sales Returns: only for completed or failed deliveries, once; Books needs RMA, reason, qty and signature', () => {
  const db = seedDb(TODAY);
  const open = db.serviceRequests.find((s) => s.status === 'Scheduled');
  refused(() => go(db, 'salesReturnCreate', { id: open.id }), 'RET.NEW');
  const done = db.serviceRequests.find((s) => s.status === 'Completed' && !db.salesReturns.some((r) => r.srNo === s.no));
  const failed = db.serviceRequests.find((s) => s.status === 'Exception' && db.salesReturns.some((r) => r.srNo === s.no));
  assert.ok(failed, 'sample data has a pending return on a failed delivery');
  refused(() => go(db, 'salesReturnCreate', { id: failed.id }), 'RET.NEW');
  if (done) assert.ok(go(db, 'salesReturnCreate', { id: done.id }).salesReturns.length > db.salesReturns.length);
  const pending = db.salesReturns.find((r) => r.status === 'Pending');
  refused(() => go(db, 'salesReturnSendToBooks', { id: pending.id, rma: 'R1', reason: 'x', qty: 1 }), 'RET.BOOKS');
  refused(() => go(db, 'salesReturnSendToBooks', { id: pending.id, rma: 'R1', reason: 'x', qty: 0, signature: 'A' }), 'RET.BOOKS');
  const sent = go(db, 'salesReturnSendToBooks', { id: pending.id, rma: 'R1', reason: 'Wrong colour', qty: 1, signature: 'A' });
  assert.equal(sent.salesReturns.find((r) => r.id === pending.id).status, 'Created');
  refused(() => go(sent, 'salesReturnSendToBooks', { id: pending.id, rma: 'R1', reason: 'x', qty: 1, signature: 'A' }), 'GEN.STATE');
});

test('Site visits: pick a type, then record whether the site is ready', () => {
  const db = seedDb(TODAY);
  const sr = db.serviceRequests.find((s) => s.status === 'Service Request');
  refused(() => go(db, 'siteVisitCreate', { id: sr.id, kind: 'Picnic' }), 'GEN.FIELD');
  const made = go(db, 'siteVisitCreate', { id: sr.id, kind: 'Other' });
  const v = made.siteVisits.at(-1);
  assert.equal(v.siteReady, false);
  assert.equal(go(made, 'siteVisitUpdate', { id: v.id, siteReady: true, notes: 'ok' }).siteVisits.find((x) => x.id === v.id).siteReady, true);
});

test('Truck Maintenance: Open to In Progress to Completed needs a signature; entries need a cost', () => {
  const db = seedDb(TODAY);
  refused(() => go(db, 'truckChecklistCreate', { truck: 'Truck 9', date: TODAY }), 'TRUCK.NEW');
  const made = go(db, 'truckChecklistCreate', { truck: 'Truck 1', date: TODAY, issues: 1 });
  const id = made.truckChecks.at(-1).id;
  const prog = go(made, 'truckChecklistAdvance', { id });
  refused(() => go(prog, 'truckChecklistAdvance', { id }), 'TRUCK.SIGN');
  const fin = go(prog, 'truckChecklistAdvance', { id, signature: 'Driver' });
  assert.equal(fin.truckChecks.find((c) => c.id === id).status, 'Completed');
  refused(() => go(fin, 'truckChecklistAdvance', { id, signature: 'Driver' }), 'GEN.STATE');
  refused(() => go(db, 'truckEntryAdd', { kind: 'fuel', truck: 'Truck 1', date: TODAY, cost: 0 }), 'TRUCK.ENTRY');
  assert.equal(go(db, 'truckEntryAdd', { kind: 'service', truck: 'Truck 1', date: TODAY, cost: 500 }).truckEntries.length, db.truckEntries.length + 1);
});

test('Schedule requests: need a date and reason; confirming moves the start date; declining needs a reason', () => {
  const db = seedDb(TODAY);
  const sr = db.serviceRequests.find((s) => s.status === 'Service Request' && !db.scheduleRequests.some((r) => r.srNo === s.no));
  const waiting = db.scheduleRequests.find((r) => r.status === 'Pending Review');
  const dup = db.serviceRequests.find((s) => s.no === waiting.srNo);
  refused(() => go(db, 'scheduleRequestCreate', { id: dup.id, newDate: '2026-12-01', reason: 'again' }), 'SCHED.NEW');
  refused(() => go(db, 'scheduleRequestCreate', { id: dup.id, newDate: '', reason: '' }), 'SCHED.NEW');
  if (sr) assert.ok(go(db, 'scheduleRequestCreate', { id: sr.id, newDate: '2026-12-01', reason: 'Away' }).scheduleRequests.length > db.scheduleRequests.length);
  refused(() => go(db, 'scheduleRequestDecide', { id: waiting.id, decision: 'Decline' }), 'SCHED.DECIDE');
  const dec = go(db, 'scheduleRequestDecide', { id: waiting.id, decision: 'Decline', note: 'Booked' });
  assert.equal(dec.scheduleRequests.find((r) => r.id === waiting.id).status, 'Declined');
  refused(() => go(dec, 'scheduleRequestDecide', { id: waiting.id, decision: 'Confirm' }), 'GEN.STATE');
  const ok = go(db, 'scheduleRequestDecide', { id: waiting.id, decision: 'Confirm' });
  assert.equal(ok.serviceRequests.find((s) => s.no === waiting.srNo).initialDate, waiting.newDate);
});
