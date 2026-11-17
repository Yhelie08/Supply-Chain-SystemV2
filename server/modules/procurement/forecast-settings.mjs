// One place for the forecast numbers: the Procurement Settings page (spec 05 Shared Engines / 08 Control Panel; the spec has one set
// of settings, not one for the forecast and another for the plan).
//
// The forecast engine (server/forecast/engine.mjs) always read the first record of the old Zoho `Forecast_Settings` form. It now reads
// THIS: a value saved on the Procurement Settings page wins, then the field of the old Forecast_Settings record, then what the engine
// did before. So nothing changes until someone saves a number, and the old record stays only as the starting point.
//
//   no Procurement_Settings row for a forecast key  ->  exactly what the engine did before (the old record, or its built-in defaults)
//   a row                                           ->  that field of the record is replaced, the rest keeps its value
import { settingsFrom, DEFAULT_SETTINGS as ENGINE } from '../../forecast/engine.mjs';

const blank = (v) => v == null || v === '';
const text = (v) => (blank(v) ? '' : String(v));

// catalogue key -> [field of the old Forecast_Settings form, key inside the engine's settings]
export const FORECAST_FIELDS = {
  transit_air_min_days: ['Air_Transit_Min', 'airTMin'], transit_air_max_days: ['Air_Transit_Max', 'airTMax'],
  customs_air_min_days: ['Air_Customs_to_WH_Min', 'airCMin'], customs_air_max_days: ['Air_Customs_to_WH_Max', 'airCMax'],
  transit_lcl_min_days: ['LCL_Transit_Min', 'lclTMin'], transit_lcl_max_days: ['LCL_Transit_Max', 'lclTMax'],
  customs_lcl_min_days: ['LCL_Customs_to_WH_Min', 'lclCMin'], customs_lcl_max_days: ['LCL_Customs_to_WH_Max', 'lclCMax'],
  transit_fcl_min_days: ['FCL_Transit_Min', 'fclTMin'], transit_fcl_max_days: ['FCL_Transit_Max', 'fclTMax'],
  customs_fcl_min_days: ['FCL_Customs_to_WH_Min', 'fclCMin'], customs_fcl_max_days: ['FCL_Customs_to_WH_Max', 'fclCMax'],
  local_transit_days: ['Local_Transit_Days', 'locTMin'], local_customs_days: ['Local_Customs_Days', 'locCMin'],
  fulfillment_days: ['Prep_Days_Thru_QC', 'prepMin'], delivery_days: ['Delivery_Days', 'delMin'],
  forecast_reanchor: ['Re_anchor_on_Latest_Real_Event', 'reAnchor'], forecast_include_supplier_lead_time: ['Include_Supplier_Lead_Time', 'addSupLead'],
};
export const isForecastKey = (k) => k in FORECAST_FIELDS;
export const ENGINE_DEFAULTS = ENGINE;

async function sources(store) {
  let legacy = null, rows = [];
  try { legacy = (await store.find('Forecast_Settings'))[0] ?? null; } catch { legacy = null; }
  try { rows = await store.find('Procurement_Settings'); } catch { rows = []; }
  return { legacy, rows };
}

// The record the engine's settingsFrom() reads. `overrides` = { key: value } tried on top (the preview of a change).
export async function forecastRecord(store, overrides = {}) {
  const { legacy, rows } = await sources(store);
  const set = new Map();
  for (const r of rows) if (isForecastKey(text(r.Setting_Key)) && !blank(r.Value)) set.set(text(r.Setting_Key), text(r.Value));
  for (const [k, v] of Object.entries(overrides)) if (isForecastKey(k)) set.set(k, text(v));
  if (set.size === 0) return legacy; // exactly what the engine did before
  // With a record present the engine reads the two switches as written (blank = off); with none it uses its defaults. Keep the defaults.
  const rec = legacy ? { ...legacy } : { Re_anchor_on_Latest_Real_Event: String(ENGINE.reAnchor), Include_Supplier_Lead_Time: String(ENGINE.addSupLead) };
  for (const [k, v] of set) rec[FORECAST_FIELDS[k][0]] = v;
  return rec;
}

export async function forecastSettings(store, overrides = {}) {
  return settingsFrom(await forecastRecord(store, overrides));
}

// The value in use for every forecast key, and where it comes from: saved (a row) / legacy (the old Forecast_Settings record) / default.
export async function forecastValues(store) {
  const { legacy, rows } = await sources(store);
  const s = settingsFrom(await forecastRecord(store));
  const out = {};
  for (const [key, [field, engineKey]] of Object.entries(FORECAST_FIELDS)) {
    const row = rows.find((r) => text(r.Setting_Key) === key && !blank(r.Value));
    out[key] = { value: s[engineKey], source: row ? 'saved' : legacy && !blank(legacy[field]) ? 'legacy' : 'default' };
  }
  return out;
}

// The few numbers the Ship & Track plan needs, from the same settings: the middle of each range, as the engine's forecast date is.
const mid = (a, b) => Math.round((Number(a) + Number(b)) / 2);
export function planNumbers(f) {
  return {
    transit_air_days: mid(f.airTMin, f.airTMax), transit_lcl_days: mid(f.lclTMin, f.lclTMax), transit_fcl_days: mid(f.fclTMin, f.fclTMax),
    customs_air_days: mid(f.airCMin, f.airCMax), customs_lcl_days: mid(f.lclCMin, f.lclCMax), customs_fcl_days: mid(f.fclCMin, f.fclCMax),
    fulfillment_days: Number(f.prepMin), delivery_days: Number(f.delMin),
  };
}
