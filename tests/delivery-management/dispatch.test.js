// Dispatch / the pre-delivery gate (spec v1.4, Delivery 03 §3, DS-R1-R5): server/modules/delivery-management/dispatch.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { runPreDeliveryGate, dispatchDay, packageLineCheck, drNumberCheck, paymentCheck } from '../../server/modules/delivery-management/dispatch.mjs';
import { findDayPlan, stopIds, confirmStopLoading } from '../../server/modules/delivery-management/day-plans.mjs';

const truthy = (v) => v === true || v === 'true';

const SA = 'Service_Appointment_Form';
const EXC = 'DMS_Exception_Queue';
const DISPATCH_CHECKLIST = 'Dispatch_Checklist';
const SOF = 'Sales_Order_Fulfillment';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, EXC, 'Day_Plan', DISPATCH_CHECKLIST, SOF]) await db.query(`DELETE FROM "${f}"`); });

// G5 (added 2026-11-19): a job only passes with a DR number on its Dispatch checklist.
const withDr = (saId, pac = '', dr = 'DR-0001') => raw.addRecord(DISPATCH_CHECKLIST, { Service_Appointment_ID: String(saId), Package_Number: pac, DR_No: dr });

const COMPLETE_CHECKLIST = [1, 2, 5, 7, 8, 9, 10].map((id) => ({ Line: id, Status: 'Yes' })).concat([
  { Line: 3, Detail: { Required: 'No' } }, { Line: 4, Detail: { Restricted: 'No' } },
  { Line: 6, Detail: { Meters: '2.4' } }, { Line: 11, Detail: { Start: '8:00 AM', End: '6:00 PM' } },
]);

const readyJob = (extra = {}) => ({
  Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Calendar_Entry_Created: true, Appointment_Status: 'Scheduled',
  Installer: 'CJ', Confirmed_Schedule_Date: '2027-06-01', Contact: '0917', Customer_Address: '123 St', Box_Count: 2,
  Site_Checklist: COMPLETE_CHECKLIST, ...extra,
});

test('runPreDeliveryGate: a fully-ready job passes once loading is confirmed with the matching box count', async () => {
  const id = await store.addRecord(SA, readyJob());
  await withDr(id);
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.stops[0].failures, []);
});

test('runPreDeliveryGate: no contact/address (G2), no loading confirmed (G6), incomplete checklist (G7) all list at once', async () => {
  await store.addRecord(SA, readyJob({ Contact: '', Email: '', Customer_Address: '', Address: '', Site_Checklist: [] }));
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, false);
  const failures = gate.stops[0].failures.join(' | ');
  assert.match(failures, /G2: no contact/);
  assert.match(failures, /G2: no delivery address/);
  assert.match(failures, /G6: loading not confirmed/);
  assert.match(failures, /G7: site requirements checklist incomplete/);
});

test('runPreDeliveryGate: G4 fails while an exception is open on the job', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  await raw.addRecord(EXC, { Sales_Order_Reference: id, Status: 'Open', Exception_Reason: 'Something' });
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, false);
  assert.match(gate.stops[0].failures.join(' | '), /G4: an open exception/);
});

test('runPreDeliveryGate: G7 fails on a still-Pending permit even though the checklist itself is complete (SR-R4)', async () => {
  const pendingPermit = COMPLETE_CHECKLIST.map((r) => (r.Line === 3 ? { Line: 3, Detail: { Required: 'Yes', ObtainedStatus: 'Pending' } } : r));
  const id = await store.addRecord(SA, readyJob({ Site_Checklist: pendingPermit }));
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Checklist_Complete, true, 'a Pending permit still counts as "answered"');
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, false);
  assert.match(gate.stops[0].failures.join(' | '), /G7: work permit \/ gate pass still Pending/);
});

test('runPreDeliveryGate: G6 fails on a box-count mismatch', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 1); // package has 2
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.match(gate.stops[0].failures.join(' | '), /G6: loaded 1 boxes, package has 2/);
});

test('dispatchDay: a full pass stamps every job Dispatched and locks the day plan', async () => {
  const id = await store.addRecord(SA, readyJob());
  await withDr(id);
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const result = await dispatchDay(raw, '2027-06-01', 'CJ', { user: 'dispatcher@x.com', driverSignature: 'd', dispatcherSignature: 'e' });
  assert.equal(result.ok, true);
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(sa.Appointment_Status, 'Dispatched');
  assert.ok(sa.Dispatched_At);
  const plan = await findDayPlan(raw, '2027-06-01', 'CJ');
  assert.equal(plan.Locked, true);
  assert.equal(plan.Dispatched_By, 'dispatcher@x.com');
});

test('dispatchDay (DS-R4): a failing job is pulled off the plan, requeued, and raises a Dispatch exception; a passing job on the same day still goes out', async () => {
  const ok = await store.addRecord(SA, readyJob({ Sales_Order: 'SO-OK', Confirmed_Time_Slot: '08:00:00 AM' }));
  const bad = await store.addRecord(SA, readyJob({ Sales_Order: 'SO-BAD', Confirmed_Time_Slot: '09:00:00 AM', Contact: '', Email: '' }));
  await withDr(ok); await withDr(bad);
  await confirmStopLoading(raw, '2027-06-01', 'CJ', ok, 2);
  await confirmStopLoading(raw, '2027-06-01', 'CJ', bad, 2);
  const result = await dispatchDay(raw, '2027-06-01', 'CJ', { driverSignature: 'd', dispatcherSignature: 'e' });
  assert.equal(result.ok, false);
  assert.equal((await raw.getRecordById(SA, ok, { raw: true })).Appointment_Status, 'Dispatched');
  const badSa = await raw.getRecordById(SA, bad, { raw: true });
  assert.equal(badSa.Appointment_Status, 'Queued');
  assert.equal(badSa.Confirmed_Schedule_Date, '');
  const plan = await findDayPlan(raw, '2027-06-01', 'CJ');
  assert.deepEqual(stopIds(plan), [String(ok)]);
  const [exc] = await raw.find(EXC, (r) => String(r.Sales_Order_Reference) === String(bad));
  assert.equal(exc.Exception_Stage, 'Dispatch');
  assert.match(exc.Exception_Reason, /G2: no contact/);
});

test('dispatchDay: everything failing locks nothing and leaves the day plan unlocked', async () => {
  await store.addRecord(SA, readyJob({ Contact: '', Email: '' }));
  const result = await dispatchDay(raw, '2027-06-01', 'CJ', { driverSignature: 'd', dispatcherSignature: 'e' });
  assert.equal(result.ok, false);
  assert.match(result.message, /Every job on this day failed/);
  const plan = await findDayPlan(raw, '2027-06-01', 'CJ');
  assert.deepEqual(stopIds(plan), []); // the only stop was removed
  assert.equal(truthy(plan.Locked), false); // and the plan was never locked
});

test('dispatchDay (G8): refused without both signatures, even when every job would otherwise pass', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const noSignatures = await dispatchDay(raw, '2027-06-01', 'CJ');
  assert.equal(noSignatures.ok, false);
  assert.match(noSignatures.message, /G8/);
  const onlyDriver = await dispatchDay(raw, '2027-06-01', 'CJ', { driverSignature: 'd' });
  assert.equal(onlyDriver.ok, false);
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Appointment_Status, 'Scheduled'); // untouched
});

test('dispatchDay: nothing to dispatch when the team-day has no plan', async () => {
  const result = await dispatchDay(raw, '2099-01-01', 'Nobody');
  assert.equal(result.ok, false);
  assert.match(result.message, /Nothing to dispatch/);
});

// ---------- G1: the job's lines vs the Fulfillment package ----------
const pkg = (so, pac, lines) => raw.addRecord(SOF, { SO_No: so, Package: pac, Item_Details1: lines });
const jobWith = (lines, extra = {}) => store.addRecord(SA, readyJob({ Item_Details: lines, ...extra }));

test('G1: lines that match the package pass; the same SKU in a smaller quantity than the package is fine too', async () => {
  await pkg('SO-1', 'PAC-1', [{ SKU: 'LAMP', Quantity: 2 }]);
  const id = await jobWith([{ SKU: 'LAMP', Quantity: 2, PAC: 'PAC-1' }]);
  const r = await packageLineCheck(raw, await raw.getRecordById(SA, id, { raw: true }));
  assert.deepEqual(r, { failures: [], notes: [] });
});

test('G1: a SKU not in the package, more of a SKU than the package holds, and a package line missing from the job each fail', async () => {
  await pkg('SO-1', 'PAC-1', [{ SKU: 'LAMP', Quantity: 2 }, { SKU: 'FAN', Quantity: 1 }]);
  const id = await jobWith([{ SKU: 'LAMP', Quantity: 3, PAC: 'PAC-1' }, { SKU: 'MIRROR', Quantity: 1, PAC: 'PAC-1' }]);
  const { failures } = await packageLineCheck(raw, await raw.getRecordById(SA, id, { raw: true }));
  assert.ok(failures.includes('G1: LAMP x3 on the job, package PAC-1 holds 2'));
  assert.ok(failures.includes('G1: MIRROR is on the job but not in package PAC-1'));
  assert.ok(failures.includes('G1: package PAC-1 holds FAN but it is not on this job'));
  assert.equal(failures.length, 3);
});

test('G1: a package with no Fulfillment record is a note, not a failure; a job with no package is a note too', async () => {
  const id = await jobWith([{ SKU: 'LAMP', Quantity: 1, PAC: 'PAC-9' }]);
  const r = await packageLineCheck(raw, await raw.getRecordById(SA, id, { raw: true }));
  assert.deepEqual(r.failures, []);
  assert.match(r.notes[0], /no Fulfillment record for package PAC-9/);
  const bare = await jobWith([]);
  assert.match((await packageLineCheck(raw, await raw.getRecordById(SA, bare, { raw: true }))).notes[0], /names no package/);
});

test("G1: the same package name on a different sales order is not used; a line with no PAC belongs to the job's only package", async () => {
  await pkg('SO-OTHER', 'PAC-1', [{ SKU: 'LAMP', Quantity: 1 }]);
  const id = await jobWith([{ SKU: 'LAMP', Quantity: 1 }], { Package_Number: 'PAC-1' });
  const r = await packageLineCheck(raw, await raw.getRecordById(SA, id, { raw: true }));
  assert.deepEqual(r.failures, []);
  assert.match(r.notes[0], /no Fulfillment record/);
  await pkg('SO-1', 'PAC-1', [{ SKU: 'LAMP', Quantity: 1 }]);
  assert.deepEqual((await packageLineCheck(raw, await raw.getRecordById(SA, id, { raw: true }))), { failures: [], notes: [] });
});

// ---------- G5: DR number ----------
test('G5: a package without a DR number fails; with one it passes; a job with no package needs any DR number', async () => {
  const id = await jobWith([{ SKU: 'LAMP', Quantity: 1, PAC: 'PAC-1' }, { SKU: 'FAN', Quantity: 1, PAC: 'PAC-2' }]);
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.deepEqual((await drNumberCheck(raw, sa)).failures, ['G5: no DR number for package PAC-1', 'G5: no DR number for package PAC-2']);
  await withDr(id, 'PAC-1');
  assert.deepEqual((await drNumberCheck(raw, sa)).failures, ['G5: no DR number for package PAC-2']);
  await withDr(id, 'PAC-2', 'DR-0002');
  assert.deepEqual((await drNumberCheck(raw, sa)).failures, []);

  const bare = await jobWith([]);
  const bareSa = await raw.getRecordById(SA, bare, { raw: true });
  assert.deepEqual((await drNumberCheck(raw, bareSa)).failures, ['G5: no DR number recorded for this job']);
  await withDr(bare);
  assert.deepEqual((await drNumberCheck(raw, bareSa)).failures, []);
});

test('G5: a checklist row with a blank DR number does not count', async () => {
  const id = await jobWith([{ SKU: 'LAMP', Quantity: 1, PAC: 'PAC-1' }]);
  await withDr(id, 'PAC-1', '');
  assert.equal((await drNumberCheck(raw, await raw.getRecordById(SA, id, { raw: true }))).failures.length, 1);
});

// ---------- G3: Books payment ----------
const fakeBooks = ({ configured = true, invoices, found = true, throws = false } = {}) => {
  const calls = [];
  return {
    calls,
    isConfigured: () => configured,
    inventory: { get: async (path) => {
      calls.push(path);
      if (throws) throw new Error('Books is down');
      if (path === '/salesorders') return { salesorders: found ? [{ salesorder_id: 'B1' }] : [] };
      return { salesorder: { invoices } };
    } },
  };
};
const freshJob = async () => { const id = await jobWith([]); return raw.getRecordById(SA, id, { raw: true }); };

test('G3: no Books, or Books not configured = a note, never a failure', async () => {
  const sa = await freshJob();
  assert.deepEqual(await paymentCheck(raw, sa, undefined), { failures: [], notes: ['G3: Books is not configured, payment was not re-checked'] });
  assert.match((await paymentCheck(raw, sa, fakeBooks({ configured: false }))).notes[0], /not configured/);
});

test('G3: all invoices paid passes; any not paid fails; the answer is stamped on the job', async () => {
  const paid = await freshJob();
  assert.deepEqual(await paymentCheck(raw, paid, fakeBooks({ invoices: [{ status: 'paid' }, { status: 'Paid' }] })), { failures: [], notes: [] });
  assert.equal((await raw.getRecordById(SA, paid.ID, { raw: true })).Books_Payment_Status, 'paid');

  const unpaid = await freshJob();
  assert.deepEqual((await paymentCheck(raw, unpaid, fakeBooks({ invoices: [{ status: 'paid' }, { status: 'partially_paid' }] }))).failures, ['G3: Books shows an invoice for this order that is not paid']);
});

test('G3: an order not in Books, no invoices, a response without the expected shape, or a Books error are all notes, not failures', async () => {
  const sa = await freshJob();
  assert.match((await paymentCheck(raw, sa, fakeBooks({ found: false }))).notes[0], /not found in Books/);
  assert.match((await paymentCheck(raw, sa, fakeBooks({ invoices: [] }))).notes[0], /no invoice found/);
  assert.match((await paymentCheck(raw, sa, fakeBooks({ invoices: undefined }))).notes[0], /no invoice found/);
  const down = await paymentCheck(raw, sa, fakeBooks({ throws: true }));
  assert.deepEqual(down.failures, []);
  assert.match(down.notes[0], /could not be reached \(Books is down\)/);
});

test('G3: the answer is remembered for 60 minutes, then Books is asked again', async () => {
  const sa = await freshJob();
  const books = fakeBooks({ invoices: [{ status: 'paid' }] });
  await paymentCheck(raw, sa, books);
  assert.equal(books.calls.length, 2, 'one search + one read');
  const stamped = await raw.getRecordById(SA, sa.ID, { raw: true });
  await paymentCheck(raw, stamped, books);
  assert.equal(books.calls.length, 2, 'asked again within 60 minutes: answered from the job, Books not called');
  await paymentCheck(raw, stamped, books, { now: new Date(Date.now() + 61 * 60000) });
  assert.equal(books.calls.length, 4, 'after 60 minutes Books is asked again');
});

test('the gate carries the notes of G1/G3 on each stop and fails a job on an unpaid invoice; with no Books it still passes', async () => {
  const id = await store.addRecord(SA, readyJob());
  await withDr(id);
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const noBooks = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(noBooks.ok, true);
  assert.ok(noBooks.stops[0].notes.some((n) => n.startsWith('G3: Books is not configured')));
  assert.ok(noBooks.stops[0].notes.some((n) => n.startsWith('G1: the job names no package')));

  const unpaid = await runPreDeliveryGate(raw, '2027-06-01', 'CJ', { books: fakeBooks({ invoices: [{ status: 'sent' }] }) });
  assert.equal(unpaid.ok, false);
  assert.match(unpaid.stops[0].failures.join(' | '), /G3: Books shows an invoice/);
});
