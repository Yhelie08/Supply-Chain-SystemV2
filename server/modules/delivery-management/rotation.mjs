// Team Rotation (spec v1.4, Delivery 02 §1, TM-R1): fills Daily_Team_Availability rows ahead of time with a
// deterministic rotating pairing of drivers, installers and vehicles, so an officer never again has to type the
// day's teams by hand before the Scheduling Engine can run (the Deluge script silently treats a day with no row as
// "no team available" — see the Daily Team Availability widget's own comment on this).
//
// The rotation formula below is NOT new: it is ported 1:1 from `genTeamsForDate()` in
// `modules/Delivery Management/Daily Team Availability/app/index.html` (its own "Generate Month" button, a proven,
// owner-verified manual trigger). This only automates WHEN it runs (TM-R1: a nightly job, ahead of time — not a
// click) and reads/writes through the store instead of the widget SDK. The formula itself, including the
// `dIdx % 7` / `dIdx % 11` offset terms, must not change — see teamsForDate()'s own comment for why.
//
// TM-R3/TM-R1 together: this never overwrites or deletes an existing row, auto-generated or hand-edited — it only
// fills a (date, installer) slot that is still empty, the same "Keep" rule the widget's own generator uses. TM-R4
// (drivers/installers/vehicles edited any time in a Control Panel) is done since 2026-11-19: rosterFrom() below reads
// the Delivery_Roster rows (Delivery Settings page), with the built-in list as the fallback.
import { policyReader } from './scheduling.mjs';
import { blank, toNum, todayDate } from '../../workflows/deluge.mjs';

const FORM = 'Daily_Team_Availability';
export const AUTO_TAG = 'Auto rotation';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));

// Same roster as the widget's GEN_INSTALLERS/GEN_DRIVERS/GEN_VEHICLES (2026-10-29 decision there, kept verbatim:
// only the 3 field vehicles, never the 3 forms-only ones that never go on a delivery; Norman is on both the
// installer and driver rosters on purpose).
export const ROSTER = {
  installers: ['CJ', 'Edmon', 'John Dave', 'Nherwin', 'Norman'],
  drivers: ['Judy', 'Norman', 'Patrick', 'Petz', 'Zaldy'],
  vehicles: ['Traviz (NIB-3823)', 'Hino (NBX-1446)', 'Traviz (NKI-4969)'],
};
// TM-R4: the roster is editable in the Control Panel (Delivery_Roster rows, settings.mjs). No rows at all, or no
// active row for a role, = the built-in list above for that role, so the nightly job can never run with an empty
// roster. Rows are walked in Sort_Order, then by ID.
export async function rosterFrom(store) {
  const rows = await store.find('Delivery_Roster', (r) => !blank(r.Name));
  const out = {};
  for (const [key, role] of [['installers', 'installer'], ['drivers', 'driver'], ['vehicles', 'vehicle']]) {
    const mine = rows.filter((r) => text(r.Role) === role && String(r.Active) !== 'false')
      .sort((a, b) => (toNum(a.Sort_Order) || 0) - (toNum(b.Sort_Order) || 0) || (BigInt(a.ID) < BigInt(b.ID) ? -1 : 1));
    out[key] = mine.length ? mine.map((r) => text(r.Name)) : ROSTER[key];
  }
  return out;
}
const WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Mon-Sat, same default the widget's own "Generate Month" modal ticks

// The day index: year*366 + day-of-year, deliberately not "days since an epoch" — this has to reproduce
// identically between the widget's JS and this server code. The one jump at New Year reshuffles pairings once;
// harmless (ported comment, unchanged from the widget).
export function dayIndex(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  return date.getFullYear() * 366 + dayOfYear;
}

// Ported 1:1 from genTeamsForDate(). THE (dIdx % 7) AND (dIdx % 11) TERMS ARE LOAD-BEARING — do not simplify them
// away. Without them the installer and driver indexes cycle on the same period (equal roster lengths), so they
// advance in lock-step and the pairings freeze. Measured over 120 days in the widget: 24 of 25 possible
// installer/driver pairings (the missing one is Norman with himself) and 30 of 30 vehicle pairings.
export function teamsForDate(date, teamsPerDay, roster = ROSTER) {
  const { installers, drivers, vehicles } = roster;
  const I = installers.length, D = drivers.length, V = vehicles.length;
  const T = Math.max(1, Math.min(teamsPerDay, I, D, V));
  const dIdx = dayIndex(date);
  const dayInstallers = [];
  for (let i = 0; i < T; i++) dayInstallers.push(installers[(dIdx * T + i) % I]);
  const usedDrivers = [], usedVehicles = [], out = [];
  for (let s = 0; s < T; s++) {
    let driver = '';
    for (let kd = 0; kd < D; kd++) {
      const cd = drivers[(dIdx * (T + 1) + s + (dIdx % 7) + kd) % D];
      // Not already out today, and not someone who is installing today (Norman is on both rosters).
      if (!usedDrivers.includes(cd) && !dayInstallers.includes(cd)) { driver = cd; break; }
    }
    if (driver) usedDrivers.push(driver);
    let vehicle = '';
    for (let kv = 0; kv < V; kv++) {
      const cv = vehicles[(dIdx * (T + 2) + s + (dIdx % 11) + kv) % V];
      if (!usedVehicles.includes(cv)) { vehicle = cv; break; }
    }
    if (vehicle) usedVehicles.push(vehicle);
    out.push({ installer: dayInstallers[s], driver, vehicle, slot: s + 1 });
  }
  return out;
}

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Planned rows for `days` days starting at `from` (inclusive), work days only. Pure: no store access.
export function plannedRows(from, days, teamsPerDay, { workDays = WORK_DAYS, roster = ROSTER } = {}) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (!workDays.includes(d.getDay())) continue;
    for (const t of teamsForDate(d, teamsPerDay, roster)) rows.push({ date: ymd(d), ...t });
  }
  return rows;
}

// TM-R1: fills team-days ahead of time (`rotation_days_ahead`, default 14). TM-R3: never touches a row that
// already exists for that (date, installer) slot, auto-generated earlier or hand-edited by the dispatcher.
export async function generateRotation(store, { today = todayDate(), days, teamsPerDay, hours, maxSo, roster } = {}) {
  const policy = await policyReader(store);
  const aheadDays = days ?? (toNum(policy('rotation_days_ahead')) || 14);
  const teams = teamsPerDay ?? (toNum(policy('rotation_teams_per_day')) || 3);
  const maxHours = hours ?? (toNum(policy('rotation_max_hours')) || 8);
  const soCap = maxSo ?? toNum(policy('rotation_max_so_capacity'));

  const planned = plannedRows(today, aheadDays, teams, { roster: roster ?? await rosterFrom(store) });
  if (!planned.length) return { planned: 0, added: 0 };

  const windowEnd = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + aheadDays));
  const todayIso = ymd(today);
  const existing = await store.find(FORM, (r) => text(r.Availability_Date) >= todayIso && text(r.Availability_Date) <= windowEnd);
  const taken = new Set(existing.map((r) => `${text(r.Availability_Date)}|${text(r.Installer)}`));

  let added = 0;
  for (const p of planned) {
    const key = `${p.date}|${p.installer}`;
    if (taken.has(key)) continue;
    taken.add(key);
    await store.addRecord(FORM, {
      Availability_Date: p.date, Installer: p.installer, Driver: p.driver, Vehicle: p.vehicle,
      Availability_Status: 'Full Day', Max_Capacity_Hours: maxHours, Max_SO_Capacity: soCap,
      Notes: `${AUTO_TAG} · ${p.date} · slot ${p.slot}`,
    });
    added++;
  }
  return { planned: planned.length, added };
}
