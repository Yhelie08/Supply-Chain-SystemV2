// The scheduling engine, ported from zoho-export/parsed/functions/dmsScheduleSlot.dg (521 lines of Deluge).
// It finds a team and a day for a Service Appointment, writes the suggestion, flags an exception when there is no
// room, and confirms a Priority order by itself. Callers: the custom API `dms_reschedule` (isRerun = true), the
// SA_Scheduling_Engine workflow (isRerun = false) and EXC_Resolve_Sync (isRerun = true).
//
// Compared with Zoho Development (results in vault/Plans/Plan - Delivery Management Open Items.md): the script is ported as
// written, quirks included ("mirrors Zoho"), with ONE deliberate difference, the clock (3).
//  1. Hours already used by a team. The Deluge text is `Installer == team && Confirmed == day || Suggested == day &&
//     Status != "Failed" && ID != this`, which read with the usual precedence would charge every team for every suggested
//     job of the day. Zoho does not do that (a team with an empty day was preferred over a team that has a suggested job,
//     in both orders of creation), so a team is charged for its OWN jobs of the day that are Confirmed or Suggested, not
//     Failed, not this record. An earlier version of this port copied the Deluge text and was wrong.
//  2. The winner test is `fits && remaining > best || (remaining == best && fewer jobs)`: the tie clause does not
//     re-check the SO cap or that the job fits.
//  3. DELIBERATE DIFFERENCE, a Zoho bug: `ctsTotalMin / 60` is a decimal division in Zoho. When a team already has hours that
//     day the total is rarely a whole number of hours (08:00 + 2.30 hours = 618 minutes = "10.3:00 AM"), that is not a
//     valid time and the whole script fails: nothing is written and the officer sees no suggestion (seen on Zoho
//     Development; it only worked when the total came out whole, 07:42 + 138 minutes = 10:00 AM). Here it is whole minutes
//     (10:18 AM).
//  4. Hours are printed with two decimals ("2.30 hrs"), and a blank driver or fleet prints "null", the way Deluge joins a
//     null into text (confirmed on Zoho Development).
//  5. "today" is the server's date, so the server must run with TZ=Asia/Manila.
// Teams and records are looped in ID order, like Zoho (its ids are not in creation order). Times are stored as
// "08:00:00 AM" (what Zoho's time field keeps and what the widgets send back) while the text of the summaries keeps the
// engine's "8:00 AM".
import { zohoNow } from '../../criteria.mjs';
import { withLock } from './locks.mjs';
import { idOf, truthy, blank, toNum, parseDate, ymd, addDays, todayDate } from '../../workflows/deluge.mjs';

export const SA = 'Service_Appointment_Form';
const EXC = 'DMS_Exception_Queue';

// Hours are decimals in Deluge; round away binary noise so 4 * 1.15 * 60 is 276, not 275.99999999999994.
export const r6 = (x) => Math.round(x * 1e6) / 1e6;
export const hrs = (x) => x.toFixed(2);
export const nullText = (v) => (blank(v) ? 'null' : String(v));
export const day = (v) => String(v ?? '').slice(0, 10);

export function customerName(rec) {
  const c = rec.Customer_Name;
  if (!c || typeof c !== 'object') return typeof c === 'string' ? c.trim() : '';
  return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
}

// "8:00 AM" or "08:00:00 AM" -> { hour: 0-23, minute } ; null when it is not a clock text.
function clock(text) {
  const parts = String(text ?? '').trim().split(' ');
  if (parts.length !== 2) return null;
  const hm = parts[0].split(':');
  if (hm.length < 2) return null;
  let hour = parseInt(hm[0], 10);
  const minute = parseInt(hm[1], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const ap = parts[1].toUpperCase();
  if (ap === 'PM' && hour !== 12) hour += 12;
  if (ap === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}

// "8:00 AM" -> "08:00:00 AM", the form Zoho's time field stores and the widgets send.
export function storedClock(text) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(String(text ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:00 ${m[3].toUpperCase()}` : text;
}

// The team's start time plus the hours it has already used that day, as "H:MM AM".
export function slotText(startText, usedHours) {
  const base = blank(startText) ? '8:00 AM' : String(startText);
  const c = clock(base);
  if (!c) return base;
  const total = c.hour * 60 + c.minute + Math.trunc(r6(usedHours * 60));
  const hr24 = Math.trunc(total / 60);
  const minute = total - hr24 * 60;
  const shown = hr24 === 0 ? 12 : hr24 > 12 ? hr24 - 12 : hr24;
  return `${shown}:${String(minute).padStart(2, '0')} ${hr24 >= 12 ? 'PM' : 'AM'}`;
}

// Policy_Settings by key: the first record's value, or null when missing or empty.
export async function policyReader(store) {
  const rows = await store.find('Policy_Settings');
  return (key) => { const r = rows.find((p) => p.Policy_Key === key); return r && !blank(r.Value) ? String(r.Value) : null; };
}
export const toLong = (v, fallback) => { if (blank(v)) return fallback; const n = Math.trunc(Number(v)); return Number.isNaN(n) ? fallback : n; };

// Hours in the working day from the two clock policies (default 9, as in the script).
function workdayLength(policy) {
  const s = policy('workday_start_time');
  const e = policy('workday_end_time');
  if (s && e) {
    const a = clock(s);
    const b = clock(e);
    if (a && b && b.hour > a.hour) return b.hour - a.hour;
  }
  return 9;
}

// The default length of a job when Estimated_Duration is empty.
export const defaultDuration = (dType) => (dType === 'With Installation' ? 4 : dType === 'Full-Day Install' ? 8 : dType === 'Site Visit' ? 1 : 2);
// The two spellings of the delivery type (Initial Scheduling and Service Appointment) are one.
export const normalizeType = (raw) => (raw === 'Delivery and Installation' ? 'With Installation' : raw === 'Pull Out' ? 'Pullout' : (raw ?? ''));

// Adds an Open exception to the queue unless the same one is already open for this appointment (FIX 5 in the script).
export async function raiseException(store, rec, { stage, reason, severity }, user = '') {
  const open = await store.find(EXC, (r) => idOf(r.Sales_Order_Reference) === rec.ID && r.Exception_Reason === reason && r.Status === 'Open');
  if (open.length) return false;
  await store.addRecord(EXC, {
    Sales_Order_Reference: rec.ID, Customer_Name: customerName(rec), Exception_Stage: stage, Exception_Reason: reason,
    Severity: severity, Raised_By: 'System', Date_Raised: zohoNow(), Status: 'Open',
  }, user);
  return true;
}

// scheduleSlot(store, recordId, isRerun) -> { status: success | flagged | blocked | skipped | error, message, ... }
// Two people asking for a slot at the same moment would both read the same picture of the day: the work is queued (locks.mjs),
// one at a time. (Decided by the owner. The queue is inside one server process.)
export const scheduleSlot = (store, recordId, isRerun, options) => withLock('scheduling', () => scheduleSlotNow(store, recordId, isRerun, options));

async function scheduleSlotNow(store, recordId, isRerun, { user = '' } = {}) {
  const saId = String(recordId ?? '').trim();
  const everything = /^\d+$/.test(saId) ? await store.find(SA) : [];
  const rec = everything.find((r) => r.ID === saId);
  if (!rec) return { status: 'error', message: 'Record not found.' };

  // Every `rec.Field = x` of the script is collected here and written once, before each return.
  const changes = {};
  const set = (k, v) => { rec[k] = v; changes[k] = v; };
  const finish = async (resp) => {
    if (Object.keys(changes).length) await store.updateRecord(SA, saId, changes, { byForm: true });
    return resp;
  };
  const flag = async (reason, stage, severity) => { set('Exception_Status', 'Flagged'); set('Exception_Reason', reason); await raiseException(store, rec, { stage, reason, severity }, user); };

  // GUARD 1: the job is finished. GUARD 2: Pick Up needs no team.
  if (rec.Appointment_Status === 'Completed' || rec.Appointment_Status === 'Failed') return { status: 'blocked', message: 'Hindi na maaaring i-schedule - tapos na ang delivery na ito.' };
  if (rec.Type_of_Delivery === 'Pick Up') return { status: 'skipped', message: 'Pick Up - i-set na lang diretso ang Confirmed Date at Time.' };
  // GUARD 3: a Flagged exception stops the automatic run; a manual re-schedule resolves it on purpose.
  if (rec.Exception_Status === 'Flagged') {
    if (isRerun) set('Exception_Status', 'Resolved');
    else return { status: 'blocked', message: 'Naka-Flagged pa ang Exception - i-resolve muna.' };
  }

  const dTypeRaw = rec.Type_of_Delivery ?? '';
  const dType = normalizeType(dTypeRaw);
  if (dType === 'Multi-Day Install') {
    await flag('Requires Manual Planning', 'Scheduling', 'Medium');
    return finish({ status: 'flagged', message: 'Multi-Day Install - kailangan ng manual planning.' });
  }

  const isFullDay = dType === 'Full-Day Install';
  const fleetAssignment = 'Own Fleet';
  let estDuration = toNum(rec.Estimated_Duration);
  if (estDuration === 0) { estDuration = defaultDuration(dType); set('Estimated_Duration', estDuration); }

  const policy = await policyReader(store);
  const bufferPct = toLong(policy('traffic_buffer_percent'), 15);
  const factor = 1 + bufferPct / 100;
  const bufferedDuration = isFullDay ? 8 : r6(estDuration * factor);
  const maxWindow = toLong(policy('max_days_scheduling_window'), 14);
  const workdayHours = workdayLength(policy);

  // SLOT SEARCH: day by day from the anchor date, the first day with a team that fits wins.
  let searchStart = todayDate();
  const requested = day(rec.Requested_Delivery_Date);
  if (requested !== '' && requested >= ymd(searchStart)) searchStart = parseDate(requested);
  const availability = await store.find('Daily_Team_Availability');
  let found = null;
  for (let n = 0; n < maxWindow && !found; n += 1) {
    const candidate = ymd(addDays(searchStart, n));
    const teams = availability.filter((t) => day(t.Availability_Date) === candidate && t.Availability_Status !== 'Not Available');
    let best = null;
    let bestRemaining = -1;
    let bestSoCount = 999999;
    for (const t of teams) {
      let cap = toNum(t.Max_Capacity_Hours);
      if (cap <= 0) cap = workdayHours; // FIX 4: an empty cap is not invisible
      // FIX 3: Suggested and Confirmed jobs of this team both count (quirk 1 is fixed here, see the header).
      const usedRecs = everything.filter((r) => r.Installer === t.Installer
        && (day(r.Confirmed_Schedule_Date) === candidate || day(r.Suggested_Schedule_Date) === candidate)
        && r.Appointment_Status !== 'Failed' && r.ID !== saId);
      let used = 0;
      for (const u of usedRecs) used = r6(used + (u.Type_of_Delivery === 'Full-Day Install' ? 8 : r6(toNum(u.Estimated_Duration) * factor)));
      const soCountToday = usedRecs.length;
      const remaining = r6(cap - used);
      const maxSO = toNum(t.Max_SO_Capacity);
      const soCapOk = !(maxSO > 0 && soCountToday >= maxSO);
      if ((soCapOk && bufferedDuration <= remaining && remaining > bestRemaining) || (remaining === bestRemaining && soCountToday < bestSoCount)) {
        best = { installer: t.Installer, driver: t.Driver, vehicle: t.Vehicle, start: t.Start_Time1, used, cap };
        bestRemaining = remaining;
        bestSoCount = soCountToday;
      }
    }
    if (best) found = { ...best, date: candidate };
  }

  // NOTHING FOUND: Calendar Full, or the job would run past the working day.
  let failReason = '';
  if (!found) failReason = 'Calendar Full';
  else if (r6(found.used + bufferedDuration) > workdayHours && fleetAssignment === 'Own Fleet') failReason = 'Slot Pushed — Overtime Declined';
  if (failReason) {
    set('Suggested_Schedule_Date', '');
    set('Suggested_Time_Slot', '');
    set('Installer', '');
    set('Assigned_to_Driver', '');
    set('Fleet_Assignment', '');
    await flag(failReason, 'Scheduling', 'Medium');
    return finish({ status: 'flagged', message: `${failReason} - walang available na team sa loob ng ${maxWindow} araw.` });
  }

  // THE SUGGESTION: the winning team's start time plus the hours it already has that day.
  const timeSlot = slotText(found.start, found.used);
  const fleetDisplay = blank(found.vehicle) ? fleetAssignment : found.vehicle;
  set('Suggested_Schedule_Date', found.date);
  set('Suggested_Time_Slot', storedClock(timeSlot));
  set('Fleet_Assignment', fleetDisplay);
  set('Installation_Required', dType === 'With Installation' || dType === 'Full-Day Install');
  set('Calendar_Entry_Created', false);
  set('Appointment_Status', 'Queued');
  set('Installer', found.installer);
  set('Assigned_to_Driver', found.driver ?? '');
  set('Original_System_Suggestion', `System suggested: ${found.installer} / ${nullText(found.driver)} on ${found.date} (${fleetDisplay})`);

  const resp = { status: 'success' };
  // PRIORITY: confirms itself when nobody took the team's day in the meantime.
  if (truthy(rec.Priority)) {
    const others = everything.filter((r) => r.Installer === found.installer && day(r.Confirmed_Schedule_Date) === found.date && truthy(r.Calendar_Entry_Created) && r.ID !== saId);
    let otherHours = 0;
    for (const o of others) otherHours = r6(otherHours + (o.Type_of_Delivery === 'Full-Day Install' ? 8 : r6(toNum(o.Estimated_Duration) * factor)));
    if (r6(otherHours + bufferedDuration) <= found.cap) {
      const where = `${rec.Customer_Address ?? ''}${blank(rec.City) ? '' : `, ${rec.City}`}`;
      set('Confirmed_Schedule_Date', found.date);
      set('Confirmed_Time_Slot', storedClock(timeSlot));
      set('Calendar_Event_Summary', `Title: ${rec.Sales_Order} - ${customerName(rec)} | Date: ${found.date} | Time: ${timeSlot} (${isFullDay ? bufferedDuration : hrs(bufferedDuration)} hrs) | Team: ${found.installer} / ${nullText(found.driver)} | Fleet: ${fleetDisplay} | Type: ${blank(dTypeRaw) ? '-' : dTypeRaw} | Location: ${where} | Notes: Auto-confirmed (Priority)`);
      set('Calendar_Entry_Created', true);
      set('Appointment_Status', 'Scheduled');
    }
  }
  return finish({
    ...resp,
    message: `Suggested: ${found.installer} / ${nullText(found.driver)} - ${found.date} ${timeSlot}`,
    date: found.date, time: timeSlot, installer: found.installer,
  });
}
