// Dispatch (spec v1.4, Delivery 03 §3, DS-R1-R5): the gate a team-day's jobs must pass before they leave the
// warehouse, locking the day plan and stamping each job dispatched.
//
// The pre-delivery gate (Fulfillment 04, G1-G9). G1, G3 and G5 were added 2026-11-19 (owner: "gawin lahat, may skip
// kapag walang data"):
//   G1  the job's lines match the Fulfillment package record(s): same SKUs, no more of a SKU than the package holds,
//       and no package line missing from the job. A package with no Fulfillment record is NOT checked: it is reported
//       in the stop's `notes`, never failed.
//   G3  Books payment re-check, remembered on the job for 60 minutes. Runs only when Books is configured; fails only
//       when Books shows an invoice that is not paid. No Books, an error, or no invoice found is a note, never a
//       failure. NOT verified against live Books (no OAuth here): the response shape is assumed, see paymentCheck().
//   G5  a DR number is recorded for every package on the job (Dispatch_Checklist.DR_No, the widget's own DR series).
// Already checked before: G2 (contact), G4 (no open exception), G6 (loading confirmed by box count, from the load sheet), G7 (site
// checklist complete, and — SR-R4, added 2026-11-18 — a work permit still Pending), G8 (the dispatcher
// signature is always required, day-level; a driver signature is also
// required UNLESS every stop that day is third-party — a third-party stop needs its own booking reference
// instead, checked per stop, same as the spec's own table), and G9 (the dispatched-by/at stamp — recorded, not
// a check).
import { zohoNow } from '../../criteria.mjs';
import { blank, truthy } from '../../workflows/deluge.mjs';
import { SA, raiseException } from './scheduling.mjs';
import { findDayPlan, stopIds, removeStop, lockDayPlan } from './day-plans.mjs';
import { rescoreAll } from './sorter.mjs';
import { stampJobStatus } from './job-status.mjs';
import { permitPending } from './site-checklist.mjs';

const EXC = 'DMS_Exception_Queue';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

const isThirdParty = (sa) => sa.Fleet_Decision === '3rd Party';

const SOF = 'Sales_Order_Fulfillment';
const DISPATCH_CHECKLIST = 'Dispatch_Checklist';
const PAYMENT_RECHECK_MINUTES = 60;

// The packages a job carries: the distinct PAC of its item lines, or else the comma-separated Package_Number.
function jobPackages(sa) {
  const fromLines = (sa.Item_Details || []).map((l) => text(l?.PAC).trim()).filter(Boolean);
  const pacs = fromLines.length ? fromLines : text(sa.Package_Number).split(',').map((p) => p.trim()).filter(Boolean);
  return [...new Set(pacs)];
}

// "2026-11-18 03:45:00 PM" -> Date (local), null if it is not that shape.
function parseStamp(v) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{1,2}):([0-9]{2}):([0-9]{2}) (AM|PM)$/.exec(text(v).trim());
  if (!m) return null;
  const h = (Number(m[4]) % 12) + (m[7] === 'PM' ? 12 : 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5]), Number(m[6]));
}

// G1: job lines vs the Fulfillment package record(s) of the same sales order. { failures, notes }.
export async function packageLineCheck(store, sa) {
  const failures = [], notes = [];
  const pacs = jobPackages(sa);
  if (!pacs.length) return { failures, notes: ['G1: the job names no package, so its lines were not compared with Fulfillment'] };
  const so = text(sa.Sales_Order);
  const records = await store.find(SOF, (r) => text(r.SO_No) === so && pacs.includes(text(r.Package)));
  for (const pac of pacs) {
    const rec = records.find((r) => text(r.Package) === pac);
    if (!rec) { notes.push(`G1: no Fulfillment record for package ${pac}, not compared`); continue; }
    const have = new Map(); // SKU -> quantity in the package
    for (const l of rec.Item_Details1 || []) { const sku = text(l?.SKU).trim(); if (sku) have.set(sku, (have.get(sku) || 0) + (Number(l.Quantity) || 0)); }
    const onJob = new Map(); // SKU -> quantity on the job, for this package
    for (const l of sa.Item_Details || []) {
      const linePac = text(l?.PAC).trim() || (pacs.length === 1 ? pac : '');
      const sku = text(l?.SKU).trim();
      if (linePac === pac && sku) onJob.set(sku, (onJob.get(sku) || 0) + (Number(l.Quantity) || 0));
    }
    for (const [sku, qty] of onJob) {
      if (!have.has(sku)) failures.push(`G1: ${sku} is on the job but not in package ${pac}`);
      else if (qty > have.get(sku)) failures.push(`G1: ${sku} x${qty} on the job, package ${pac} holds ${have.get(sku)}`);
    }
    for (const sku of have.keys()) if (!onJob.has(sku)) failures.push(`G1: package ${pac} holds ${sku} but it is not on this job`);
  }
  return { failures, notes };
}

// G5: every package on the job has a Dispatch checklist with a DR number. { failures, notes }.
export async function drNumberCheck(store, sa) {
  const rows = await store.find(DISPATCH_CHECKLIST, (r) => text(r.Service_Appointment_ID) === String(sa.ID) && !blank(r.DR_No));
  const pacs = jobPackages(sa);
  if (!pacs.length) return { failures: rows.length ? [] : ['G5: no DR number recorded for this job'], notes: [] };
  const failures = pacs.filter((p) => !rows.some((r) => text(r.Package_Number) === p)).map((p) => `G5: no DR number for package ${p}`);
  return { failures, notes: [] };
}

// G3: Books payment. { failures, notes }. The Books response shape is ASSUMED, not verified (no OAuth here): a sales
// order from /salesorders/{id} is expected to list its `invoices`, each with a `status`. Anything else is "not
// confirmed" (a note), never a failure, so a wrong guess about the shape cannot pull a job off the day plan.
export async function paymentCheck(store, sa, books, { now = new Date() } = {}) {
  const none = { failures: [], notes: [] };
  const so = text(sa.Sales_Order);
  if (!books || (typeof books.isConfigured === 'function' && !books.isConfigured())) return { ...none, notes: ['G3: Books is not configured, payment was not re-checked'] };
  const at = parseStamp(sa.Books_Payment_Checked_At);
  let status = at && now - at < PAYMENT_RECHECK_MINUTES * 60000 ? text(sa.Books_Payment_Status) : '';
  if (!status) {
    try {
      const found = await books.inventory.get('/salesorders', { query: { salesorder_number: so } });
      const id = found?.salesorders?.[0]?.salesorder_id;
      if (!id) return { ...none, notes: [`G3: ${so} was not found in Books, payment not confirmed`] };
      const invoices = (await books.inventory.get(`/salesorders/${id}`))?.salesorder?.invoices;
      status = !Array.isArray(invoices) || !invoices.length ? 'unknown' : invoices.every((i) => text(i.status).toLowerCase() === 'paid') ? 'paid' : 'unpaid';
    } catch (e) {
      return { ...none, notes: [`G3: Books could not be reached (${text(e?.message).slice(0, 80)}), payment not confirmed`] };
    }
    await store.updateRecord(SA, sa.ID, { Books_Payment_Status: status, Books_Payment_Checked_At: zohoNow(now) }, { byForm: true });
  }
  if (status === 'unpaid') return { ...none, failures: ['G3: Books shows an invoice for this order that is not paid'] };
  if (status === 'unknown') return { ...none, notes: [`G3: no invoice found for ${so} in Books, payment not confirmed`] };
  return none;
}

async function checkStop(store, sa, stop, { books } = {}) {
  const failures = [], notes = [];
  if (blank(sa.Contact) && blank(sa.Email)) failures.push('G2: no contact on file');
  if (blank(sa.Customer_Address) && blank(sa.Address)) failures.push('G2: no delivery address on file');
  const open = await store.find(EXC, (r) => text(r.Sales_Order_Reference) === String(sa.ID) && r.Status === 'Open');
  if (open.length) failures.push('G4: an open exception is on this job');
  if (!truthy(stop?.Loading_Confirmed)) failures.push('G6: loading not confirmed on the load sheet');
  else if (Number(stop.Loaded_Box_Count) !== Number(sa.Box_Count || 0)) failures.push(`G6: loaded ${stop.Loaded_Box_Count} boxes, package has ${sa.Box_Count || 0}`);
  if (!truthy(sa.Checklist_Complete)) failures.push('G7: site requirements checklist incomplete');
  else if (permitPending(sa.Site_Checklist)) failures.push('G7: work permit / gate pass still Pending'); // SR-R4

  if (isThirdParty(sa) && blank(sa.Third_Party_Booking_Ref)) failures.push('G8: third-party job needs a booking reference');

  for (const g of [await packageLineCheck(store, sa), await paymentCheck(store, sa, books), await drNumberCheck(store, sa)]) { failures.push(...g.failures); notes.push(...g.notes); }
  return { failures, notes };
}

// DS-R1: every package on the team-day, all failures shown at once (never stopping at the first one).
export async function runPreDeliveryGate(store, date, installer, { books } = {}) {
  const plan = await findDayPlan(store, date, installer);
  if (!plan) return { ok: false, message: 'No day plan for that team and date.', stops: [] };
  const ids = stopIds(plan);
  const stopRows = plan.Stops || [];
  const stops = await Promise.all(ids.map(async (id) => {
    const sa = await store.getRecordById(SA, id, { raw: true });
    const stop = stopRows.find((r) => text(r.SA_ID) === id);
    const { failures, notes } = sa ? await checkStop(store, sa, stop, { books }) : { failures: ['Job not found'], notes: [] };
    return { sa_id: id, sales_order: sa ? text(sa.Sales_Order) : '', thirdParty: sa ? isThirdParty(sa) : false, failures, notes };
  }));
  return { ok: stops.length > 0 && stops.every((s) => s.failures.length === 0), stops };
}

// DS-R3/DS-R4/DS-R5: runs the gate. Every failing job is pulled off the day plan and sent back to the
// scheduling queue (Queued, no team/date) with its reason raised as a Dispatch exception — the sorter
// recomputes its rank on its own re-score, there is no "original rank" to restore by hand. Every passing job
// is stamped Dispatched; if at least one passed, the day plan locks (G9's dispatched-by/at, plus signatures).
export async function dispatchDay(store, date, installer, { user = '', driverSignature = '', dispatcherSignature = '', books } = {}) {
  const gate = await runPreDeliveryGate(store, date, installer, { books });
  if (!gate.stops.length) return { ok: false, message: 'Nothing to dispatch.', stops: [] };
  // G8, day-level (captured once on the Dispatch screen, not per package): the dispatcher always signs; the
  // driver signs too unless every stop that day is third-party (those need their own booking reference instead,
  // checked per stop above).
  const needsDriverSignature = gate.stops.some((s) => !s.thirdParty);
  if (blank(dispatcherSignature) || (needsDriverSignature && blank(driverSignature))) {
    return { ok: false, message: `G8: ${needsDriverSignature ? 'driver and dispatcher signatures are' : 'a dispatcher signature is'} required before dispatch.`, stops: gate.stops };
  }

  const passing = gate.stops.filter((s) => s.failures.length === 0);
  const failing = gate.stops.filter((s) => s.failures.length > 0);

  for (const s of failing) {
    await removeStop(store, date, installer, s.sa_id, { user });
    const sa = await store.getRecordById(SA, s.sa_id, { raw: true });
    if (!sa) continue;
    await store.updateRecord(SA, s.sa_id, {
      Appointment_Status: 'Queued', Confirmed_Schedule_Date: '', Confirmed_Time_Slot: '', Calendar_Entry_Created: false,
    }, { byForm: true, user });
    await raiseException(store, sa, { stage: 'Dispatch', reason: `Failed pre-delivery gate: ${s.failures.join('; ')}`, severity: 'High' }, user);
    await stampJobStatus(store, s.sa_id); // this write is a plain raw-store write — job-status.mjs's own SA hook never sees it.
  }
  if (failing.length) await rescoreAll(store);

  if (!passing.length) return { ok: false, message: 'Every job on this day failed the gate.', stops: gate.stops };

  for (const s of passing) {
    await store.updateRecord(SA, s.sa_id, { Appointment_Status: 'Dispatched', Dispatched_At: zohoNow() }, { byForm: true, user });
    await stampJobStatus(store, s.sa_id);
  }
  await lockDayPlan(store, date, installer, { user, driverSignature, dispatcherSignature });
  return {
    ok: failing.length === 0,
    message: failing.length ? `Dispatched ${passing.length}, ${failing.length} sent back to the queue.` : 'Dispatched.',
    stops: gate.stops,
  };
}
