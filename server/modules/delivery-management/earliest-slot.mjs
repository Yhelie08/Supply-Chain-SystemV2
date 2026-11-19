// Earliest available date, with a reason, and a soft hold (spec v1.4, Delivery 01, "Earliest available date").
// `find_earliest_slot` already exists inside scheduleSlot (scheduling.mjs) — this does not change that proven,
// tested function. It reuses the SAME capacity math (team hours, the traffic buffer, the working day length) in a
// read-only, callable-before-an-SR-exists form, and adds the two things scheduleSlot does not do: a plain-words
// reason for the date it picked (or did not), and a short soft hold so two sales agents quoting at once cannot
// both walk away promising the same last slot (the real scheduling engine itself is not changed; a hold only
// affects later calls to THIS function, see the file-level note in its own test file).
import { zohoNow } from '../../criteria.mjs';
import { blank, toNum, truthy, parseDate, ymd, addDays, todayDate } from '../../workflows/deluge.mjs';
import { SA, day, r6, policyReader, toLong, normalizeType, defaultDuration, workdayLength } from './scheduling.mjs';

const HOLDS = 'Schedule_Holds';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso) => { const d = new Date(`${iso}T00:00:00`); return `${d.getDate()} ${MON[d.getMonth()]}`; };

// "2026-11-18 10:55:59 AM" -> Date. Local to this file (Delivery has no shared one): see decisions-core.mjs's
// parseZoho in Procurement for the same small parser, kept separate on purpose (no cross-module import).
function parseZoho(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i.exec(text(v));
  if (!m) return null;
  let h = m[4] == null ? 0 : Number(m[4]);
  if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5] ?? 0), Number(m[6] ?? 0));
}

// Active (not released, not expired) holds, as extra hours consumed per (installer, date) — same shape the real
// capacity check already uses for Suggested/Confirmed appointments.
async function activeHoldHours(store, now) {
  const holds = await store.find(HOLDS, (h) => !truthy(h.Released));
  const byKey = new Map();
  for (const h of holds) {
    const expires = parseZoho(h.Expires_At);
    if (expires && expires <= now) continue;
    const key = `${text(h.Installer)}|${day(h.Hold_Date)}`;
    byKey.set(key, (byKey.get(key) || 0) + toNum(h.Hours));
  }
  return byKey;
}

// Pure-ish: reads the store (availability, appointments, holds), writes nothing. Returns a day-by-day reason trail
// so the caller can show "19 Nov: 15-18 Nov full, 16 Nov on leave" rather than just a date (spec's own example).
export async function findEarliestSlot(store, { jobType, estMinutes, fromDate, now = new Date() } = {}) {
  const dType = normalizeType(jobType ?? '');
  const isFullDay = dType === 'Full-Day Install';
  const policy = await policyReader(store);
  const bufferPct = toLong(policy('traffic_buffer_percent'), 15);
  const factor = 1 + bufferPct / 100;
  const estHours = estMinutes != null ? Number(estMinutes) / 60 : defaultDuration(dType);
  const bufferedDuration = isFullDay ? 8 : r6(estHours * factor);
  const maxWindow = toLong(policy('max_days_scheduling_window'), 14);
  const workdayHours = workdayLength(policy);

  let searchStart = fromDate ? parseDate(fromDate) : todayDate();
  if (searchStart < todayDate()) searchStart = todayDate();

  const [availability, everything, heldHours] = await Promise.all([
    store.find('Daily_Team_Availability'),
    store.find(SA),
    activeHoldHours(store, now),
  ]);

  const trail = [];
  for (let n = 0; n < maxWindow; n++) {
    const candidate = ymd(addDays(searchStart, n));
    const teamsToday = availability.filter((t) => day(t.Availability_Date) === candidate);
    if (!teamsToday.length) { trail.push(`${dm(candidate)} no team scheduled`); continue; }
    const onLeave = teamsToday.filter((t) => t.Availability_Status === 'Not Available').map((t) => t.Installer);
    const active = teamsToday.filter((t) => t.Availability_Status !== 'Not Available');
    if (!active.length) { trail.push(`${dm(candidate)} ${onLeave.join(', ')} on leave`); continue; }

    let best = null, bestRemaining = -1, fullCount = 0;
    for (const t of active) {
      const cap = toNum(t.Max_Capacity_Hours) || workdayHours;
      const usedRecs = everything.filter((r) => r.Installer === t.Installer
        && (day(r.Confirmed_Schedule_Date) === candidate || day(r.Suggested_Schedule_Date) === candidate) && r.Appointment_Status !== 'Failed');
      let used = 0;
      for (const u of usedRecs) used = r6(used + (u.Type_of_Delivery === 'Full-Day Install' ? 8 : r6(toNum(u.Estimated_Duration) * factor)));
      used = r6(used + (heldHours.get(`${t.Installer}|${candidate}`) || 0));
      const remaining = r6(cap - used);
      // Same two conditions scheduleSlotNow checks: there is room, AND the job would not run past the working day.
      const fits = bufferedDuration <= remaining && r6(used + bufferedDuration) <= workdayHours;
      if (fits) { if (remaining > bestRemaining) { best = { ...t, used, cap }; bestRemaining = remaining; } }
      else fullCount++;
    }
    if (best) {
      const reason = trail.length ? `Earliest is ${dm(candidate)}: ${trail.join(', ')}.` : `Earliest is ${dm(candidate)}.`;
      return { found: true, date: candidate, installer: best.Installer, driver: best.Driver, vehicle: best.Vehicle, reason };
    }
    trail.push(`${dm(candidate)} full (${fullCount} of ${active.length} jobs)${onLeave.length ? `, ${onLeave.join(', ')} on leave` : ''}`);
  }
  return { found: false, date: null, reason: `No team available within ${maxWindow} days: ${trail.join('; ')}.` };
}

// Step 3 of "Suggesting a schedule" (Delivery 02 §3): every team with room on ONE given date, most-remaining-
// capacity first — findEarliestSlot only ever keeps its own single best pick and discards the rest, so the city
// tie-break in suggest-schedule.mjs needs this instead. A small, separate re-run of the same per-day capacity
// check (not a shared helper) — findEarliestSlot itself is left completely unchanged.
export async function teamsWithRoomOn(store, date, { jobType, estMinutes, now = new Date() } = {}) {
  const dType = normalizeType(jobType ?? '');
  const isFullDay = dType === 'Full-Day Install';
  const policy = await policyReader(store);
  const bufferPct = toLong(policy('traffic_buffer_percent'), 15);
  const factor = 1 + bufferPct / 100;
  const estHours = estMinutes != null ? Number(estMinutes) / 60 : defaultDuration(dType);
  const bufferedDuration = isFullDay ? 8 : r6(estHours * factor);
  const workdayHours = workdayLength(policy);

  const [teamsToday, everything, heldHours] = await Promise.all([
    store.find('Daily_Team_Availability', (t) => day(t.Availability_Date) === date),
    store.find(SA),
    activeHoldHours(store, now),
  ]);
  const active = teamsToday.filter((t) => t.Availability_Status !== 'Not Available');
  const fitting = [];
  for (const t of active) {
    const cap = toNum(t.Max_Capacity_Hours) || workdayHours;
    const usedRecs = everything.filter((r) => r.Installer === t.Installer
      && (day(r.Confirmed_Schedule_Date) === date || day(r.Suggested_Schedule_Date) === date) && r.Appointment_Status !== 'Failed');
    let used = 0;
    for (const u of usedRecs) used = r6(used + (u.Type_of_Delivery === 'Full-Day Install' ? 8 : r6(toNum(u.Estimated_Duration) * factor)));
    used = r6(used + (heldHours.get(`${t.Installer}|${date}`) || 0));
    const remaining = r6(cap - used);
    if (bufferedDuration <= remaining && r6(used + bufferedDuration) <= workdayHours) {
      fitting.push({ installer: t.Installer, driver: t.Driver, vehicle: t.Vehicle, remaining });
    }
  }
  return fitting.sort((a, b) => b.remaining - a.remaining);
}

// Quotes AND holds the slot for soft_hold_minutes (default 20), so a second agent quoting in the meantime sees it
// as taken. A hold is advisory capacity only — it does not touch the appointment it may become; converting it into
// a real appointment (or letting it expire) is the caller's job.
export async function quoteAndHold(store, { jobType, estMinutes, fromDate, quotedBy = '', srNo = '' } = {}) {
  const policy = await policyReader(store);
  const holdMinutes = toLong(policy('soft_hold_minutes'), 20);
  const now = new Date();
  const result = await findEarliestSlot(store, { jobType, estMinutes, fromDate, now });
  if (!result.found) return result;
  const estHours = estMinutes != null ? Number(estMinutes) / 60 : defaultDuration(normalizeType(jobType ?? ''));
  const bufferPct = toLong(policy('traffic_buffer_percent'), 15);
  const hours = normalizeType(jobType ?? '') === 'Full-Day Install' ? 8 : r6(estHours * (1 + bufferPct / 100));
  const holdId = await store.addRecord(HOLDS, {
    Installer: result.installer, Hold_Date: result.date, Hours: hours,
    Expires_At: zohoNow(new Date(now.getTime() + holdMinutes * 60000)), Quoted_By: quotedBy, Service_Request_No: srNo, Released: false,
  });
  return { ...result, holdId: String(holdId) };
}

// Converting a hold into a real appointment, or giving up on it, both just mean it stops counting (SR-R... the
// spec: "the hold expires on its own if the SR is not submitted" — this also lets a submitted SR release it early
// rather than waiting out the full 20 minutes and double-counting against the real appointment it became).
export async function releaseHold(store, holdId) {
  if (blank(holdId)) return;
  await store.updateRecord(HOLDS, holdId, { Released: true }, { byForm: true });
}
