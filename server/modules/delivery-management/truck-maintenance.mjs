// Truck Maintenance (spec v1.4, Delivery 08 §2, TK-R1-R4). TK-R1 ("daily vehicle check-in... is also the 'left
// warehouse' stamp") is NOT built here — the field app (04/04) where that check-in happens doesn't exist yet in
// this app (the same gap noted throughout this session); the existing `Daily_Checklist_for_Vehicle` form is a
// separate, older Zoho object this file does not touch. This covers TK-R2 (maintenance due warning), TK-R3
// (marking a vehicle down removes its future team-days and flags affected jobs), and TK-R4 (the maintenance log).
import { zohoNow, ZohoError } from '../../criteria.mjs';
import { blank, todayDate, ymd } from '../../workflows/deluge.mjs';
import { SA, day, raiseException, policyReader, toLong } from './scheduling.mjs';

const AVAIL = 'Daily_Team_Availability';
const STATUS = 'Vehicle_Status';
const LOG = 'Vehicle_Maintenance_Log';
const EXC = 'DMS_Exception_Queue';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const refuse = (message) => { throw new ZohoError(2001, message); };
const OPEN_STATUSES = new Set(['Queued', 'Scheduled', 'Confirmed', 'Dispatched']);
const DOWN_TAG = 'Vehicle down:';

async function vehicleStatusRow(store, vehicle) {
  const [row] = await store.find(STATUS, (r) => r.Vehicle === vehicle);
  return row || null;
}

// TK-R4: type, date, km, shop, cost, receipts — plain write, always moves Last_Service_KM/Date forward to this
// entry if it is the newest one seen (a backfilled older record never overwrites a newer one already logged).
export async function recordMaintenance(store, { vehicle, type, date, km, shop, cost, receipts, user = '' } = {}) {
  if (blank(vehicle)) refuse('Vehicle is required.');
  await store.addRecord(LOG, { Vehicle: vehicle, Type: type, Date: date, KM: km, Shop: shop, Cost: cost, Receipts: receipts }, user);
  const existing = await vehicleStatusRow(store, vehicle);
  const changes = {};
  if (!existing || blank(existing.Last_Service_Date) || text(date) >= text(existing.Last_Service_Date)) {
    changes.Last_Service_KM = km;
    changes.Last_Service_Date = date;
  }
  if (existing) await store.updateRecord(STATUS, existing.ID, changes, { byForm: true, user });
  else await store.addRecord(STATUS, { Vehicle: vehicle, Status: 'Active', ...changes }, user);
}

// TK-R3: removes the vehicle's FUTURE team-days from scheduling (today onward; a day already underway is left
// alone) and flags every open job already on one of those team-days. Tags each row it changes so
// markVehicleFixed can tell "down because of this" apart from a day the dispatcher set Not Available by hand.
export async function markVehicleDown(store, vehicle, { reason, user = '' } = {}) {
  if (blank(reason)) refuse('A reason is required to mark a vehicle down.');
  const today = ymd(todayDate());
  const rows = await store.find(AVAIL, (r) => r.Vehicle === vehicle && day(r.Availability_Date) >= today && r.Availability_Status !== 'Not Available');
  const affectedJobs = [];
  for (const r of rows) {
    await store.updateRecord(AVAIL, r.ID, {
      Availability_Status: 'Not Available', Notes: `${text(r.Notes)}${text(r.Notes) ? ' | ' : ''}${DOWN_TAG} ${reason}`.trim(),
    }, { byForm: true, user });
    const jobs = await store.find(SA, (j) => j.Installer === r.Installer && OPEN_STATUSES.has(text(j.Appointment_Status))
      && (day(j.Confirmed_Schedule_Date) === day(r.Availability_Date) || day(j.Suggested_Schedule_Date) === day(r.Availability_Date)));
    for (const job of jobs) {
      await raiseException(store, job, { stage: 'Fleet', reason: `Vehicle ${vehicle} marked down: ${reason}`, severity: 'High' }, user);
      affectedJobs.push(job.ID);
    }
  }
  const existing = await vehicleStatusRow(store, vehicle);
  const changes = { Status: 'Down', Down_Reason: reason, Down_At: zohoNow() };
  if (existing) await store.updateRecord(STATUS, existing.ID, changes, { byForm: true, user });
  else await store.addRecord(STATUS, { Vehicle: vehicle, ...changes }, user);
  return { affectedTeamDays: rows.length, affectedJobs };
}

// Restores only the rows markVehicleDown itself changed (tagged with DOWN_TAG), and only future ones — a day
// that has since passed is left as history, and a day the dispatcher separately marked unavailable for some
// other reason (no tag) is never touched.
export async function markVehicleFixed(store, vehicle, { user = '' } = {}) {
  const today = ymd(todayDate());
  const rows = await store.find(AVAIL, (r) => r.Vehicle === vehicle && day(r.Availability_Date) >= today
    && r.Availability_Status === 'Not Available' && text(r.Notes).includes(DOWN_TAG));
  let restored = 0;
  for (const r of rows) {
    const notes = text(r.Notes).split(' | ').filter((n) => !n.startsWith(DOWN_TAG)).join(' | ');
    await store.updateRecord(AVAIL, r.ID, { Availability_Status: 'Full Day', Notes: notes }, { byForm: true, user });
    restored++;
  }
  const existing = await vehicleStatusRow(store, vehicle);
  if (existing) await store.updateRecord(STATUS, existing.ID, { Status: 'Active', Down_Reason: '' }, { byForm: true, user });
  return { restoredTeamDays: restored };
}

// TK-R2: warns maintenance_warn_days [DEFAULT 7] before a date-based due date, or once Current_KM is within
// warn_km_threshold [DEFAULT 300] of (Last_Service_KM + Interval_KM [DEFAULT 5000]) for a km-based vehicle.
// "7 days before" has no clean km equivalent without an assumed daily-km rate this app does not track, so the
// km side warns by a km buffer instead of a day count — documented, not guessed at.
export async function checkMaintenanceDue(store, { now = new Date() } = {}) {
  const policy = await policyReader(store);
  const warnDays = toLong(policy('maintenance_warn_days'), 7);
  const warnKm = toLong(policy('maintenance_warn_km'), 300);
  const todayIso = ymd(todayDate());
  const warnByIso = ymd(new Date(now.getTime() + warnDays * 86400000));
  const vehicles = await store.find(STATUS);
  let warned = 0;
  for (const v of vehicles) {
    const reasons = [];
    if (!blank(v.Next_Service_Due_Date) && text(v.Next_Service_Due_Date) <= warnByIso && text(v.Next_Service_Due_Date) >= todayIso) {
      reasons.push(`due by date ${text(v.Next_Service_Due_Date)}`);
    }
    const interval = toLong(v.Interval_KM, 5000);
    if (!blank(v.Current_KM) && !blank(v.Last_Service_KM)) {
      const dueAtKm = Number(v.Last_Service_KM) + interval;
      if (Number(v.Current_KM) >= dueAtKm - warnKm) reasons.push(`due by km (at ${text(v.Current_KM)} of ${dueAtKm})`);
    }
    if (!reasons.length) continue;
    const raised = await raiseException(store, { ID: '', Customer_Name: v.Vehicle }, {
      stage: 'Fleet', reason: `${v.Vehicle}: maintenance ${reasons.join(' and ')}`, severity: 'Medium',
    });
    if (raised) warned++;
  }
  return { checked: vehicles.length, warned };
}
