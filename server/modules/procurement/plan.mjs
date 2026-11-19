// The procurement feasibility calculator and the planned / forecast chain of one shipment, from the HomeCartel spec v1.4:
//   05 Shared Engines / 02 Calculators section 3, 03 Dates and Forecast, 02 Procurement / 04 Ship and Track.
// Plain arithmetic: no database in the chain functions, every number is a setting (the Procurement Settings page).
//
//   planned_arrival = PO_date + 1 (production starts) + production_days + consolidation_days + transit_days(mode) [+ customs_days(mode)] + receiving_days
//   feasible_by     = planned_arrival + fulfillment_days + delivery_days
//   shortfall_days  = feasible_by - target_delivery            (positive = will be late)
import { addDays, dayDiff, parseDate, ymd, todayDate, blank, toNum } from '../../workflows/deluge.mjs';
import { defaultSettings, problemWith } from './settings-defs.mjs';

// Settings = the catalogue (settings-defs.mjs) + the numbers derived from the forecast settings, so the plan and the forecast engine
// read the SAME values (forecast-settings.mjs). What an unconfigured system resolves to is what the forecast engine used before.
import { forecastSettings, planNumbers, isForecastKey } from './forecast-settings.mjs';
import { ENGINE_DEFAULTS } from './forecast-settings.mjs';

// The spec's own example numbers (Calculators section 3). Not the defaults: only what the calculator tests use, to check the
// arithmetic against the spec's worked example (target 20 days away, lead 20, LCL: 41 days short, Air still 25 short).
export const SPEC_NUMBERS = Object.freeze({ transit_lcl_days: 30, transit_fcl_days: 30, transit_air_days: 14, customs_lcl_days: 0, customs_fcl_days: 0, customs_air_days: 0, fulfillment_days: 3, delivery_days: 2 });

export const DEFAULT_SETTINGS = Object.freeze({ ...defaultSettings(), ...planNumbers(ENGINE_DEFAULTS) });

// Procurement_Settings rows (Setting_Key / Value) over the defaults. A row whose value is not valid keeps the default (CP-R6 refuses
// bad values at save; this only protects the plan from a row written some other way). `tryOut` = { key: value } on top of what is
// saved: the "show the effect before saving" preview (CP-R4).
export async function loadSettings(store, tryOut = null) {
  const s = { ...DEFAULT_SETTINGS };
  let rows = [];
  try { rows = await store.find('Procurement_Settings'); } catch { rows = []; }
  const set = new Map(rows.map((r) => [String(r.Setting_Key ?? '').trim(), r.Value]));
  for (const [k, v] of Object.entries(tryOut || {})) set.set(k, v);
  for (const [key, value] of set) {
    if (!(key in s) || isForecastKey(key)) continue;
    if (typeof DEFAULT_SETTINGS[key] === 'string') s[key] = String(value ?? '');
    else if (!blank(value) && problemWith(key, value) === null) s[key] = Number(value);
  }
  Object.assign(s, planNumbers(await forecastSettings(store, Object.fromEntries([...set].filter(([k]) => isForecastKey(k))))));
  return s;
}

// A supplier's own production / consolidation days (Suppliers form), matched by its exact name; blank = use the global setting.
const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const namesOf = (r) => [r.Supplier_Name?.first_name, r.Supplier_Name?.last_name, [r.Supplier_Name?.first_name, r.Supplier_Name?.last_name].filter(Boolean).join(' ')].map(norm).filter(Boolean);
const aliasesOf = (r) => String(r.Name_Aliases ?? '').split(/[,;|]/).map(norm).filter(Boolean);
// A supplier is found by its name or one of its listed other names. As a last, careful step a name that is the START (whole words) of exactly
// one supplier's name, or the other way round ("Tony" -> "Tony Fan"), is accepted when no other supplier fits: never a part of a word, never two.
// Returns { row, how } or null. (Spec INQ-R6: the old text matching must not come back.)
export function resolveSupplier(rows, name) {
  const want = norm(name);
  if (want === '') return null;
  const exact = rows.find((r) => namesOf(r).includes(want));
  if (exact) return { row: exact, how: 'name' };
  const alias = rows.find((r) => aliasesOf(r).includes(want));
  if (alias) return { row: alias, how: 'alias' };
  const startsWith = (a, b) => a === b || a.startsWith(b + ' ');
  const near = rows.filter((r) => [...namesOf(r), ...aliasesOf(r)].some((n) => startsWith(n, want) || startsWith(want, n)));
  return near.length === 1 ? { row: near[0], how: 'start of the name' } : null;
}
export const supplierRowFrom = (rows, name) => resolveSupplier(rows, name)?.row ?? null;
export function supplierDaysFrom(rows, name) {
  const row = supplierRowFrom(rows, name);
  if (!row) return {};
  const out = {};
  if (toNum(row.Default_Production_Days) > 0) out.production_days = toNum(row.Default_Production_Days);
  if (!blank(row.Default_Consolidation_Days)) out.consolidation_days = toNum(row.Default_Consolidation_Days);
  return out;
}
export async function supplierDays(store, name) {
  let rows = [];
  try { rows = await store.find('Suppliers'); } catch { rows = []; }
  return supplierDaysFrom(rows, name);
}

// A supplier's lead time is typed as text ("20", "20 days", "3 weeks", "2-3 weeks", "1 month", "20天"): read it as a number of days
// (spec INQ-R3: it becomes the production days of the feasibility calculator). A range takes the larger number. 0 = not understood.
export function parseLeadDays(v) {
  const t = String(v ?? '').toLowerCase().replace(/,/g, '');
  const nums = t.match(/\d+(?:\.\d+)?/g);
  if (!nums) return 0;
  const n = Number(nums[nums.length - 1]);
  const days = /week|wk|周|週/.test(t) ? n * 7 : /month|mo\b|月/.test(t) ? n * 30 : n;
  return Math.ceil(days);
}

export const MODES = ['Airfreight', 'LCL', 'FCL'];
// "Air", "Airfreight", "AIR" -> Airfreight; "sea" / blank and anything unknown -> LCL (the slow, safe assumption).
export function normMode(m) {
  const t = String(m ?? '').trim().toUpperCase();
  if (t.includes('AIR')) return 'Airfreight';
  if (t === 'FCL') return 'FCL';
  return 'LCL';
}
export const transitDays = (s, mode) => ({ Airfreight: s.transit_air_days, FCL: s.transit_fcl_days, LCL: s.transit_lcl_days })[normMode(mode)];
export const customsDays = (s, mode) => ({ Airfreight: s.customs_air_days, FCL: s.customs_fcl_days, LCL: s.customs_lcl_days })[normMode(mode)] || 0;
// shipout to the warehouse door: what an upgrade to air saves is the difference of these
export const leadDays = (s, mode) => transitDays(s, mode) + customsDays(s, mode);

const asDate = (v) => (v instanceof Date ? v : parseDate(v));

// The plan from the PO date: every stage's planned date. Never typed by a person (spec ST-R1).
export function plannedChain(s, { poDate, productionDays, mode }) {
  const po = asDate(poDate);
  if (!po) return null;
  const days = toNum(productionDays) > 0 ? toNum(productionDays) : s.production_days;
  const productionStart = addDays(po, 1);
  const productionEnd = addDays(productionStart, days);
  const shipout = addDays(productionEnd, s.consolidation_days);
  const arrival = addDays(shipout, transitDays(s, mode));
  const receive = addDays(arrival, customsDays(s, mode) + s.receiving_days);
  return { productionStart, productionEnd, shipout, arrival, receive, productionDays: days };
}

// The forecast: actual dates where they exist, planned where they do not. A stage that has not happened cannot be in the past, so
// each such date is moved to today and the later stages follow it ("latest actual or planned arrival", spec DT / forecast table).
// actual = { production_started, production_finished, shipped_out, arrived_port, arrived_warehouse } (Dates or yyyy-MM-dd text)
export function forecastChain(s, { poDate, productionDays, mode, actual = {}, expected = {}, today = todayDate() }) {
  const po = asDate(poDate);
  const a = Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, asDate(v)]));
  const days = toNum(productionDays) > 0 ? toNum(productionDays) : s.production_days;
  if (!po && !a.production_started && !a.production_finished && !a.shipped_out && !a.arrived_port && !a.arrived_warehouse) return null;
  const notBefore = (d) => (d < today ? today : d);

  let productionStart = a.production_started || (po ? addDays(po, 1) : today);
  if (!a.production_started) productionStart = notBefore(productionStart);
  let productionEnd = a.production_finished || addDays(productionStart, days);
  if (!a.production_finished) productionEnd = notBefore(productionEnd);
  const x = Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, asDate(v)])); // the supplier's own new date (delay report, SP-R5)
  let shipout = a.shipped_out || x.shipout || addDays(productionEnd, s.consolidation_days);
  if (!a.shipped_out) shipout = notBefore(shipout);
  let arrival = a.arrived_port || x.arrival || addDays(shipout, transitDays(s, mode));
  if (!a.arrived_port) arrival = notBefore(arrival);
  const warehouse = a.arrived_warehouse || null;
  const pickable = addDays(warehouse || arrival, (warehouse ? 0 : customsDays(s, mode)) + s.receiving_days);
  return { productionStart, productionEnd, shipout, arrival, pickable: !warehouse && pickable < today ? today : pickable };
}

// The date the goods must be pickable so the order still reaches the customer on time (Sorting Engine 01, Procurement).
export const dateNeeded = (s, target) => { const t = asDate(target); return t ? addDays(t, -(s.fulfillment_days + s.delivery_days)) : null; };

// Feasibility of a line (PR and PO gate): can it arrive in time for the promise?
//   feasible    shortfall <= 0 and slack >= proc_watch_slack_days
//   at_risk     shortfall <= 0 but the slack is small
//   impossible  shortfall > 0: also the earliest feasible date and the Air option
export function feasibility(s, { poDate, productionDays, mode, target }) {
  const t = asDate(target);
  const plan = plannedChain(s, { poDate, productionDays, mode });
  if (!plan || !t) return { feasibility: null, reason: !plan ? 'no PO date' : 'no target' };
  const feasibleBy = addDays(plan.receive, s.fulfillment_days + s.delivery_days);
  const shortfall = dayDiff(feasibleBy, t);
  const slack = -shortfall;
  const out = { feasibility: shortfall > 0 ? 'impossible' : slack < s.proc_watch_slack_days ? 'at_risk' : 'feasible', shortfall_days: shortfall, slack_days: slack, feasible_by: ymd(feasibleBy), earliest_feasible_date: shortfall > 0 ? ymd(feasibleBy) : null };
  if (shortfall > 0 && normMode(mode) !== 'Airfreight') {
    const air = plannedChain(s, { poDate, productionDays, mode: 'Airfreight' });
    const airBy = addDays(air.receive, s.fulfillment_days + s.delivery_days);
    const airShortfall = dayDiff(airBy, t);
    out.air_saving_days = leadDays(s, mode) - leadDays(s, 'Airfreight');
    out.air_shortfall_days = airShortfall;
    out.air_feasible_by = ymd(airBy);
    out.air_option = airShortfall <= 0 ? `Air saves ${out.air_saving_days} days -> feasible` : `Even by air, earliest is ${ymd(airBy)} (${airShortfall} days short)`;
  }
  return out;
}
