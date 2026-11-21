// Procurement settings (spec 05 Shared Engines / 08 Control Panel): validation (CP-R6), history (CP-R5), the effect before saving
// (CP-R4) and "Recalculate now" (CP-R3). Only admins can write Procurement_Settings (server/access.mjs).
// This is also the page of the forecast numbers: the forecast engine reads them from here (forecast-settings.mjs).
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { DEFS, SETTING_DEFS, GROUPS, problemWith, rangeProblem, ladderProblem } from './settings-defs.mjs';
import { isForecastKey, forecastValues } from './forecast-settings.mjs';
import { rescoreShipments } from './ship-track.mjs';
import { ok, fail } from '../../custom-api-helpers.mjs';

const FORM = 'Procurement_Settings';
const text = (v) => (blank(v) ? '' : String(v));
const typed = (key, raw) => (DEFS[key].type === 'text' ? text(raw) : DEFS[key].type === 'yes_no' ? text(raw).toLowerCase() === 'true' : Number(raw));
const shown = (v) => (typeof v === 'boolean' ? String(v) : text(v));
const wasValue = new Map(); // key -> the value in use before this write, for the history

// The value in use of every catalogue key, and where it comes from: saved (a row), legacy (the old Forecast_Settings record), default.
export async function settingsInUse(store) {
  const rows = await store.find(FORM);
  const forecast = await forecastValues(store);
  const out = {};
  for (const d of SETTING_DEFS) {
    const row = rows.find((r) => text(r.Setting_Key) === d.key && !blank(r.Value));
    if (isForecastKey(d.key)) out[d.key] = { value: forecast[d.key].value, source: forecast[d.key].source, row };
    else out[d.key] = { value: row ? typed(d.key, row.Value) : d.default, source: row ? 'saved' : 'default', row };
  }
  return out;
}
const values = (inUse) => Object.fromEntries(Object.entries(inUse).map(([k, v]) => [k, v.value]));

// The reason a value is refused, or null: the limits, a crossed shortest / longest pair, a ladder that does not go up.
function refusal(key, raw, current) {
  const bad = problemWith(key, raw);
  if (bad) return bad;
  const v = { ...current, [key]: typed(key, raw) };
  return rangeProblem(key, raw, v) || (key.startsWith('ladder_rung') ? ladderProblem(v) : null);
}

async function check({ input, previous, id, store }) {
  const key = text(input.Setting_Key ?? previous?.Setting_Key).trim();
  if (!(key in DEFS)) throw new ZohoError(2001, `"${key}" is not a Procurement setting.`);
  if (previous && 'Setting_Key' in input && text(input.Setting_Key).trim() !== text(previous.Setting_Key)) throw new ZohoError(2001, 'A setting cannot change its key.');
  input.Setting_Key = key;
  const clash = (await store.find(FORM, (r) => text(r.Setting_Key) === key)).filter((r) => String(r.ID) !== String(id ?? ''));
  if (clash.length) throw new ZohoError(2001, `"${key}" already has a row: change that one.`);
  const value = text(input.Value ?? previous?.Value).trim();
  const current = values(await settingsInUse(store));
  const bad = refusal(key, value, current);
  if (bad) throw new ZohoError(2001, bad);
  input.Value = DEFS[key].type === 'text' ? value : DEFS[key].type === 'yes_no' ? String(value.toLowerCase() === 'true') : String(Number(value));
  wasValue.set(key, current[key]);
}

async function history({ record, store, user }) {
  const key = text(record.Setting_Key);
  const oldV = shown(wasValue.get(key));
  wasValue.delete(key);
  if (oldV === text(record.Value)) return;
  const r = await rescoreShipments(store, { cause: `settings.${key}_changed` }); // CP-R3: the change takes effect now
  await store.addRecord('Procurement_Settings_History', { Setting_Key: key, Old_Value: oldV, New_Value: text(record.Value), Changed_By: user || '', Changed_At: zohoNow(), Reason: text(record.Change_Reason), Effect: `${r.changed} shipment(s) re-scored` });
}

register(FORM, {
  beforeAdd: check,
  beforeUpdate: check,
  afterAdd: history,
  afterUpdate: history,
  beforeDelete: async ({ previous, store }) => { wasValue.set(`del:${text(previous.Setting_Key)}`, shown(values(await settingsInUse(store))[text(previous.Setting_Key)])); },
  afterDelete: async ({ previous, store, user }) => {
    // no row = back to the old Forecast_Settings value, or the default
    const key = text(previous.Setting_Key);
    const now = shown(values(await settingsInUse(store))[key]);
    await store.addRecord('Procurement_Settings_History', { Setting_Key: key, Old_Value: wasValue.get(`del:${key}`) ?? text(previous.Value), New_Value: now, Changed_By: user || '', Changed_At: zohoNow(), Reason: 'Back to the default' });
    wasValue.delete(`del:${key}`);
    await rescoreShipments(store, { cause: `settings.${key}_reset` });
  },
});

const COUNT = ['act_now', 'tell_customer', 'watch', 'on_track', 'blocked'];
const tally = (results) => Object.fromEntries(COUNT.map((c) => [c, results.filter((r) => r.category === c).length]));

// Custom API: what would this value do to the open shipments? Writes nothing.
export async function preview_procurement_setting({ key, value }, store) {
  if (!(String(key ?? '') in DEFS)) return fail(`"${key}" is not a Procurement setting.`);
  const bad = refusal(key, value, values(await settingsInUse(store)));
  if (bad) return fail(bad);
  const tryOut = { [key]: DEFS[key].type === 'text' ? String(value) : DEFS[key].type === 'yes_no' ? String(value).toLowerCase() : Number(value) };
  const before = await rescoreShipments(store, { dryRun: true });
  const after = await rescoreShipments(store, { dryRun: true, settings: tryOut });
  const was = new Map(before.results.map((r) => [r.id, r.category]));
  const moved = after.results.filter((r) => was.get(r.id) !== r.category).map((r) => ({ no: r.no, from: was.get(r.id), to: r.category }));
  const forecast = isForecastKey(key) ? ' The forecast of the orders (Fulfillment and Delivery too) also uses this number.' : '';
  return ok((moved.length ? `${moved.length} open shipment(s) would change category.` : 'No open shipment would change category.') + forecast, { before: tally(before.results), after: tally(after.results), moved: moved.slice(0, 15), moved_count: moved.length });
}

// Custom API: "Recalculate now" (full re-read of the PO and Sales Order dates, then rank everything again).
export async function recalculate_shipments(_payload, store) {
  const r = await rescoreShipments(store, { full: true, cause: 'user.recalculate_now' });
  return ok(`Recalculated ${r.scored} shipment(s); ${r.changed} changed.`, r);
}

// Custom API: the catalogue with the value in use, where it comes from, the default, the row that holds a change, and who changed it last (CP-R1).
export async function get_procurement_settings(_payload, store) {
  const use = await settingsInUse(store);
  const hist = await store.find('Procurement_Settings_History');
  const settings = SETTING_DEFS.map((d) => {
    const last = hist.filter((h) => text(h.Setting_Key) === d.key).sort((a, b) => Number(b.ID) - Number(a.ID))[0];
    const u = use[d.key];
    return { ...d, value: u.value, source: u.source, is_default: u.source === 'default', row_id: u.row ? String(u.row.ID) : null, last_changed_by: last?.Changed_By ?? '', last_changed_at: last?.Changed_At ?? '' };
  });
  return ok('Procurement settings.', { settings, groups: GROUPS });
}
