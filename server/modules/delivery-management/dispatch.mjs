// Dispatch (spec v1.4, Delivery 03 §3, DS-R1-R5): the gate a team-day's jobs must pass before they leave the
// warehouse, locking the day plan and stamping each job dispatched.
//
// The full pre-delivery gate (Fulfillment 04, G1-G9) needs data this app does not have yet: G1 (every SO line is
// in the package(s) on this job — needs Fulfillment's own package/line data, not visible from an appointment)
// and G3 (a live Books payment re-check within 60 minutes — needs Books OAuth, not configured here; see
// "Checklist - Delivery Missing Functions.md" item 2). G5 (a DR number) has no field anywhere in this app.
// Those three are NOT checked — documented here rather than faked. What IS checked, with data this app already
// has: G2 (contact), G4 (no open exception), G6 (loading confirmed by box count, from the load sheet), G7 (site
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

async function checkStop(store, sa, stop) {
  const failures = [];
  if (blank(sa.Contact) && blank(sa.Email)) failures.push('G2: no contact on file');
  if (blank(sa.Customer_Address) && blank(sa.Address)) failures.push('G2: no delivery address on file');
  const open = await store.find(EXC, (r) => text(r.Sales_Order_Reference) === String(sa.ID) && r.Status === 'Open');
  if (open.length) failures.push('G4: an open exception is on this job');
  if (!truthy(stop?.Loading_Confirmed)) failures.push('G6: loading not confirmed on the load sheet');
  else if (Number(stop.Loaded_Box_Count) !== Number(sa.Box_Count || 0)) failures.push(`G6: loaded ${stop.Loaded_Box_Count} boxes, package has ${sa.Box_Count || 0}`);
  if (!truthy(sa.Checklist_Complete)) failures.push('G7: site requirements checklist incomplete');
  else if (permitPending(sa.Site_Checklist)) failures.push('G7: work permit / gate pass still Pending'); // SR-R4

  if (isThirdParty(sa) && blank(sa.Third_Party_Booking_Ref)) failures.push('G8: third-party job needs a booking reference');
  return failures;
}

// DS-R1: every package on the team-day, all failures shown at once (never stopping at the first one).
export async function runPreDeliveryGate(store, date, installer) {
  const plan = await findDayPlan(store, date, installer);
  if (!plan) return { ok: false, message: 'No day plan for that team and date.', stops: [] };
  const ids = stopIds(plan);
  const stopRows = plan.Stops || [];
  const stops = await Promise.all(ids.map(async (id) => {
    const sa = await store.getRecordById(SA, id, { raw: true });
    const stop = stopRows.find((r) => text(r.SA_ID) === id);
    const failures = sa ? await checkStop(store, sa, stop) : ['Job not found'];
    return { sa_id: id, sales_order: sa ? text(sa.Sales_Order) : '', thirdParty: sa ? isThirdParty(sa) : false, failures };
  }));
  return { ok: stops.length > 0 && stops.every((s) => s.failures.length === 0), stops };
}

// DS-R3/DS-R4/DS-R5: runs the gate. Every failing job is pulled off the day plan and sent back to the
// scheduling queue (Queued, no team/date) with its reason raised as a Dispatch exception — the sorter
// recomputes its rank on its own re-score, there is no "original rank" to restore by hand. Every passing job
// is stamped Dispatched; if at least one passed, the day plan locks (G9's dispatched-by/at, plus signatures).
export async function dispatchDay(store, date, installer, { user = '', driverSignature = '', dispatcherSignature = '' } = {}) {
  const gate = await runPreDeliveryGate(store, date, installer);
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
