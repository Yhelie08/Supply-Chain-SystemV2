// Day plans (spec v1.4, Delivery 02 §4, DP-R1-R6): one row per (Plan_Date, Installer), with the ordered list of
// that team-day's jobs. Nothing like this existed before — the scheduling engine only ever wrote a team and a
// date onto each Service Appointment one at a time; nobody kept the team-day's own stop order.
//
// DP-R1/DP-R2: a Service Appointment joins the plan by itself, in default order (earliest Confirmed_Time_Slot
// first), the moment scheduling-engine.mjs's confirmCalendarNow sets it Scheduled for a team and date — see the
// hook at the bottom. It leaves any OTHER team-day's plan it used to be on (a reschedule can move a job).
// DP-R3: reorderDayPlan is optimistic-concurrency: the caller must send the Version it read, or the save is
// refused ("This day changed, please refresh") — never a half-applied list.
// DP-R4: reorder is always a pure permutation of the same stop IDs — adding or removing a job is a separate call
// (addStopManually / removeStop), so "a driver can reorder but not add or remove" is true by construction, with
// no extra role check needed.
// DP-R5 (once a job is on-site it cannot move to another day plan), enforced since 2026-11-19: the job status chain
// now has an on_site stamp (Job_Arrived_At, from Field_Work "Started", job-status.mjs), so a job that has arrived
// and is not done cannot have its date or team changed (guardOnSite below). A Completed or Failed job is simply
// never re-synced by the hook below (Appointment_Status is neither of those), so it stays on the plan it was last on.
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank, truthy, toNum } from '../../workflows/deluge.mjs';
import { SA, day } from './scheduling.mjs';

const FORM = 'Day_Plan';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const refuse = (message) => { throw new ZohoError(2001, message); };

export async function findDayPlan(store, date, installer) {
  const [p] = await store.find(FORM, (r) => text(r.Plan_Date) === date && text(r.Installer) === installer);
  return p || null;
}

export async function ensureDayPlan(store, date, installer, { driver = '', user = '' } = {}) {
  const existing = await findDayPlan(store, date, installer);
  if (existing) return existing;
  const id = await store.addRecord(FORM, { Plan_Date: date, Installer: installer, Driver: driver, Stops: [], Version: 1, Locked: false }, user);
  return store.getRecordById(FORM, id, { raw: true });
}

export const stopIds = (plan) => (plan?.Stops || []).map((r) => text(r.SA_ID)).filter(Boolean);

function clockMinutes(v) {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(String(v ?? ''));
  if (!m) return null;
  let h = Number(m[1]);
  const pm = m[3].toUpperCase() === 'PM';
  if (pm && h !== 12) h += 12;
  if (!pm && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

// DP-R2 default: by window start, earliest first. A stop with no time slot goes to the end (nearest-next from
// the warehouse by city/zone is NOT implemented — no distance matrix exists here — so this is time-only).
function insertSorted(stops, saId, timeSlot) {
  const minutes = clockMinutes(timeSlot);
  const out = stops.slice();
  let i = out.length;
  if (minutes != null) {
    const at = out.findIndex((r) => { const m = clockMinutes(r.Time_Slot); return m == null || m > minutes; });
    if (at !== -1) i = at;
  }
  out.splice(i, 0, { SA_ID: saId, Time_Slot: timeSlot || '', Loaded_Box_Count: 0, Loading_Confirmed: false });
  return out;
}

async function bump(store, plan, stops, user) {
  await store.updateRecord(FORM, plan.ID, { Stops: stops, Version: toNum(plan.Version) + 1 }, { byForm: true, user });
}

// Leaves `saId` off `plan`, unless the plan is locked (a locked plan is the dispatcher's business from here).
async function dropFrom(store, plan, saId, user) {
  if (truthy(plan.Locked)) return false;
  const stops = (plan.Stops || []).filter((r) => text(r.SA_ID) !== String(saId));
  if (stops.length === (plan.Stops || []).length) return false;
  await bump(store, plan, stops, user);
  return true;
}

export async function removeStop(store, date, installer, saId, { user = '' } = {}) {
  const plan = await findDayPlan(store, date, installer);
  if (!plan) return false;
  return dropFrom(store, plan, saId, user);
}

// DP-R1/DP-R2: called after every Service Appointment save. Moves the job onto its team-day's plan (inserted in
// default stop order) when it is Scheduled with a team and a date, and off any other plan it used to be on.
export async function syncStopForAppointment(store, saId, { user = '' } = {}) {
  const sa = await store.getRecordById(SA, saId, { raw: true });
  if (!sa) return;
  const scheduled = sa.Appointment_Status === 'Scheduled' && !blank(sa.Confirmed_Schedule_Date) && !blank(sa.Installer);
  const date = scheduled ? day(sa.Confirmed_Schedule_Date) : '';

  const onPlans = await store.find(FORM, (r) => stopIds(r).includes(String(saId)));
  for (const plan of onPlans) {
    const samePlan = scheduled && text(plan.Plan_Date) === date && text(plan.Installer) === sa.Installer;
    if (!samePlan) await dropFrom(store, plan, saId, user);
  }
  if (!scheduled) return;

  const already = onPlans.some((p) => text(p.Plan_Date) === date && text(p.Installer) === sa.Installer);
  if (already) return;
  const plan = await findDayPlan(store, date, sa.Installer);
  if (!plan) {
    await store.addRecord(FORM, {
      Plan_Date: date, Installer: sa.Installer, Driver: sa.Assigned_to_Driver,
      Stops: insertSorted([], String(saId), sa.Confirmed_Time_Slot), Version: 1, Locked: false,
    }, user);
    return;
  }
  if (truthy(plan.Locked)) return; // DP-R6: a late reschedule onto an already-dispatched day needs the dispatcher by hand.
  await bump(store, plan, insertSorted(plan.Stops || [], String(saId), sa.Confirmed_Time_Slot), user);
}

// DP-R3: optimistic concurrency, whole list only. DP-R4: always a pure permutation of the SAME stop IDs — adding
// or removing a job is a different call, so a driver's reorder can never smuggle in an add or a remove.
export async function reorderDayPlan(store, { date, installer, version, order, user = '' }) {
  const plan = await findDayPlan(store, date, installer);
  if (!plan) refuse('No day plan for that team and date.');
  if (toNum(plan.Version) !== toNum(version)) refuse('This day changed, please refresh.');
  const current = stopIds(plan);
  const next = (order || []).map(String);
  const sameSet = next.length === current.length && new Set(next).size === next.length && current.every((id) => next.includes(id));
  if (!sameSet) refuse('The stop list must contain exactly the same jobs, only reordered.');
  const byId = new Map((plan.Stops || []).map((r) => [text(r.SA_ID), r]));
  await bump(store, plan, next.map((id) => byId.get(id)), user);
  return { version: toNum(plan.Version) + 1 };
}

// LS-R3: records a loaded box count against a stop (the load sheet's own confirm step).
export async function confirmStopLoading(store, date, installer, saId, loadedBoxCount, { user = '' } = {}) {
  const plan = await findDayPlan(store, date, installer);
  if (!plan) refuse('No day plan for that team and date.');
  if (truthy(plan.Locked)) refuse('This day plan is locked.');
  const stops = (plan.Stops || []).map((r) => (text(r.SA_ID) === String(saId) ? { ...r, Loaded_Box_Count: toNum(loadedBoxCount), Loading_Confirmed: true } : r));
  await bump(store, plan, stops, user);
}

// DS-R3: passing the gate locks the day plan and stamps who/when.
export async function lockDayPlan(store, date, installer, { user = '', driverSignature = '', dispatcherSignature = '' } = {}) {
  const plan = await findDayPlan(store, date, installer);
  if (!plan) refuse('No day plan for that team and date.');
  if (truthy(plan.Locked)) return plan;
  await store.updateRecord(FORM, plan.ID, {
    Locked: true, Locked_At: zohoNow(), Dispatched_By: user, Dispatched_At: zohoNow(),
    Driver_Signature: driverSignature, Dispatcher_Signature: dispatcherSignature,
  }, { byForm: true, user });
  return store.getRecordById(FORM, plan.ID, { raw: true });
}

// DP-R5: a job that has arrived on site (and is not done) cannot be moved to another date or team, i.e. to another day plan.
async function guardOnSite({ input, previous }) {
  if (!previous || blank(previous.Job_Arrived_At)) return;
  if (['Completed', 'Failed'].includes(text(previous.Appointment_Status))) return;
  const movedDate = 'Confirmed_Schedule_Date' in input && day(input.Confirmed_Schedule_Date) !== day(previous.Confirmed_Schedule_Date);
  const movedTeam = 'Installer' in input && text(input.Installer) !== text(previous.Installer);
  if (movedDate || movedTeam) refuse('This job is on site: it cannot be moved to another day plan.');
}

async function onSave({ id, store, user }) {
  await syncStopForAppointment(store, id, { user });
}
// Registered after scheduling-engine.mjs (see workflows.mjs) so the fresh read above sees its Scheduled write.
register(SA, { beforeUpdate: guardOnSite, afterAdd: onSave, afterUpdate: onSave });
