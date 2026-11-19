// Delivery settings, the Control Panel's "Delivery capacity" group (spec 05 Shared Engines / 08): validation (CP-R6),
// history (CP-R5), the effect before saving (CP-R4) and the editable team roster (Delivery 02, TM-R4). Admin only
// (server/access.mjs). The catalogue itself is settings-defs.mjs.
//
// Storage is the existing Policy_Settings table, not a new one: every module already reads it through
// policyReader(), so nothing else changes. A key that is NOT in the catalogue (another module's, or a custom one added
// through the old Policy Settings page) passes through untouched.
import { register } from '../../workflows/index.mjs';
import { ZohoError, zohoNow } from '../../criteria.mjs';
import { blank } from '../../workflows/deluge.mjs';
import { ok, fail } from '../../custom-api-helpers.mjs';
import { SETTING_DEFS, DEFS, GROUPS, isDeliveryKey, TYPE_FIELD, typed, problemWith, workdayProblem } from './settings-defs.mjs';
import { previewCategories, rescoreAll } from './sorter.mjs';
import { getDeliveryBacklog } from './backlog-calculator.mjs';
import { ROSTER, rosterFrom } from './rotation.mjs';

const POLICY = 'Policy_Settings';
const HISTORY = 'Delivery_Settings_History';
const ROSTER_FORM = 'Delivery_Roster';
const text = (v) => (blank(v) || String(v) === 'null' ? '' : String(v));
const wasValue = new Map(); // key -> the value in use before this write, for the history

// ---------- the value in use of every catalogue key ----------
export async function settingsInUse(store) {
  const rows = await store.find(POLICY, (r) => isDeliveryKey(text(r.Policy_Key)));
  const out = {};
  for (const d of SETTING_DEFS) {
    const row = rows.find((r) => text(r.Policy_Key) === d.key && !blank(r.Value));
    out[d.key] = { value: row ? typed(d, row.Value) : d.default, source: row ? 'saved' : 'default', row };
  }
  return out;
}
const valuesOf = (inUse) => Object.fromEntries(Object.entries(inUse).map(([k, v]) => [k, v.value]));
const shown = (v) => (blank(v) ? '' : String(v));

// The reason a value is refused, or null: the limits, then the workday pair.
function refusal(key, raw, current) {
  return problemWith(key, raw) || workdayProblem(key, raw, current);
}

// ---------- hooks on Policy_Settings: only for a catalogue key ----------
async function check({ input, previous, id, store }) {
  const key = text(input.Policy_Key ?? previous?.Policy_Key).trim();
  if (!isDeliveryKey(key)) return; // not a Delivery catalogue key: not ours
  if (previous && 'Policy_Key' in input && text(input.Policy_Key).trim() !== text(previous.Policy_Key)) throw new ZohoError(2001, 'A setting cannot change its key.');
  const clash = (await store.find(POLICY, (r) => text(r.Policy_Key) === key)).filter((r) => String(r.ID) !== String(id ?? ''));
  if (clash.length) throw new ZohoError(2001, `"${key}" already has a row: change that one.`);
  const d = DEFS[key];
  const value = text(input.Value ?? previous?.Value).trim();
  const current = valuesOf(await settingsInUse(store));
  const bad = refusal(key, value, current);
  if (bad) throw new ZohoError(2001, bad);
  input.Policy_Key = key;
  input.Value = d.type === 'time' ? value.replace(/\s+/g, ' ').toUpperCase() : value === '' ? '' : String(Number(value));
  if (blank(input.Description ?? previous?.Description)) input.Description = d.label;
  if (blank(input.Type_field ?? previous?.Type_field)) input.Type_field = TYPE_FIELD[d.type];
  wasValue.set(key, current[key]);
}

// CP-R3: a ranking number changes the category of open jobs right away, so the queue is re-scored now, not at 05:00.
async function history({ record, store, user }) {
  const key = text(record.Policy_Key);
  if (!isDeliveryKey(key)) return;
  const oldV = shown(wasValue.get(key));
  wasValue.delete(key);
  if (oldV === shown(record.Value)) return;
  let effect = '';
  if (DEFS[key].preview === 'ranking') { const r = await rescoreAll(store); effect = `Queue re-scored: ${r.changed} of ${r.scored} open job(s) changed.`; }
  await store.addRecord(HISTORY, { Setting_Key: key, Old_Value: oldV, New_Value: shown(record.Value), Changed_By: user || '', Changed_At: zohoNow(), Reason: text(record.Change_Reason), Effect: effect });
}

register(POLICY, {
  beforeAdd: check,
  beforeUpdate: check,
  afterAdd: history,
  afterUpdate: history,
  beforeDelete: async ({ previous, store }) => {
    const key = text(previous.Policy_Key);
    if (isDeliveryKey(key)) wasValue.set(`del:${key}`, shown(valuesOf(await settingsInUse(store))[key]));
  },
  afterDelete: async ({ previous, store, user }) => {
    const key = text(previous.Policy_Key);
    if (!isDeliveryKey(key)) return;
    const before = wasValue.get(`del:${key}`);
    wasValue.delete(`del:${key}`);
    let effect = '';
    if (DEFS[key].preview === 'ranking') { const r = await rescoreAll(store); effect = `Queue re-scored: ${r.changed} of ${r.scored} open job(s) changed.`; }
    await store.addRecord(HISTORY, { Setting_Key: key, Old_Value: before ?? text(previous.Value), New_Value: shown(DEFS[key].default), Changed_By: user || '', Changed_At: zohoNow(), Reason: 'Back to the default', Effect: effect });
  },
});

// ---------- the effect before saving (CP-R4): writes nothing ----------
const COUNT = ['broken', 'late', 'at_risk', 'on_time', 'blocked'];
const tally = (scored) => Object.fromEntries(COUNT.map((c) => [c, scored.filter((e) => e.category === c).length]));
const noOf = (e) => text(e.sa.Sales_Order) || `#${e.sa.ID}`;

export async function previewSetting(store, key, value) {
  if (!isDeliveryKey(String(key ?? ''))) return fail(`"${key}" is not a Delivery setting.`);
  const d = DEFS[key];
  const current = valuesOf(await settingsInUse(store));
  const bad = refusal(key, value, current);
  if (bad) return fail(bad);
  const trial = { [key]: String(value) };
  const shared = d.shared ? ` ${d.shared}'s own ranking reads this number too.` : '';

  if (d.preview === 'ranking') {
    const before = await previewCategories(store);
    const after = await previewCategories(store, trial);
    const was = new Map(before.map((e) => [String(e.sa.ID), e.category]));
    const moved = after.filter((e) => was.get(String(e.sa.ID)) !== e.category).map((e) => ({ no: noOf(e), from: was.get(String(e.sa.ID)), to: e.category }));
    return ok((moved.length ? `${moved.length} open job(s) would change category.` : 'No open job would change category.') + shared, { before: tally(before), after: tally(after), moved: moved.slice(0, 15) });
  }
  if (d.preview === 'backlog') {
    const before = await getDeliveryBacklog(store);
    const after = await getDeliveryBacklog(store, { overrides: trial });
    const days = (b) => (b.backlogDays === Infinity ? 'no capacity' : `${Math.round(b.backlogDays * 10) / 10} day(s)`);
    if (before.teamsPerDay === 0) return ok('No team is listed as available today, so the backlog shows no capacity either way. Add the teams for today in Daily Team Availability (or run the rotation) to see the effect.', { backlog: { before: { days: days(before), teamsPerDay: 0, sitesPerTeamPerDay: before.sitesPerTeamPerDay, openJobs: before.openJobs }, after: { days: days(after), teamsPerDay: 0, sitesPerTeamPerDay: after.sitesPerTeamPerDay, openJobs: after.openJobs } } });
    return ok(`Backlog on Delivery Analytics: ${days(before)} now, ${days(after)} with this number.`, { backlog: { before: { days: days(before), teamsPerDay: before.teamsPerDay, sitesPerTeamPerDay: before.sitesPerTeamPerDay, openJobs: before.openJobs }, after: { days: days(after), teamsPerDay: after.teamsPerDay, sitesPerTeamPerDay: after.sitesPerTeamPerDay, openJobs: after.openJobs } } });
  }
  return ok(`No open job changes right now: this number is read when it is needed. ${d.affects}${shared}`, {});
}

// ---------- the catalogue with the value in use (CP-R1) ----------
export async function getSettings(store) {
  const use = await settingsInUse(store);
  const hist = await store.find(HISTORY, (h) => isDeliveryKey(text(h.Setting_Key)));
  const current = valuesOf(use);
  const settings = SETTING_DEFS.map((d) => {
    const last = hist.filter((h) => text(h.Setting_Key) === d.key).sort((a, b) => (BigInt(a.ID) < BigInt(b.ID) ? 1 : -1))[0];
    const u = use[d.key];
    // A row saved before this page existed (through the old Policy Settings page) may not meet the limits: say so, do not hide it.
    const problem = u.source === 'saved' ? refusal(d.key, u.value, current) : null;
    return { ...d, value: u.value, source: u.source, is_default: u.source === 'default', row_id: u.row ? String(u.row.ID) : null, problem, last_changed_by: last?.Changed_By ?? '', last_changed_at: last?.Changed_At ?? '' };
  });
  return { settings, groups: GROUPS };
}

// ---------- the team roster (TM-R4) ----------
const ROLES = ['installer', 'driver', 'vehicle'];
let seeding = false; // "Make editable" writes 13 rows but logs ONE history row, not 13
const activeRows = (rows, role, exceptId) => rows.filter((r) => text(r.Role) === role && String(r.Active) !== 'false' && String(r.ID) !== String(exceptId ?? ''));
const rowText = (r) => `${text(r.Name)} (${String(r.Active) === 'false' ? 'inactive' : 'active'}${blank(r.Sort_Order) ? '' : `, order ${text(r.Sort_Order)}`})`;

async function checkRoster({ input, previous, id, store }) {
  const role = text(input.Role ?? previous?.Role).trim();
  const name = text(input.Name ?? previous?.Name).trim();
  if (!ROLES.includes(role)) throw new ZohoError(2001, 'Role must be installer, driver or vehicle.');
  if (!name) throw new ZohoError(2001, 'Enter a name.');
  if (name.length > 60) throw new ZohoError(2001, 'The name is too long (60 characters at most).');
  const rows = await store.find(ROSTER_FORM);
  if (rows.some((r) => String(r.ID) !== String(id ?? '') && text(r.Role) === role && text(r.Name).trim().toLowerCase() === name.toLowerCase())) throw new ZohoError(2001, `${name} is already on the ${role} roster.`);
  input.Role = role;
  input.Name = name;
  // The roster must never run empty for a role: someone has to stay active.
  const willBeActive = String(input.Active ?? previous?.Active ?? 'true') !== 'false';
  if (previous && !willBeActive && String(previous.Active) !== 'false' && activeRows(rows, text(previous.Role), id).length === 0) {
    throw new ZohoError(2001, `At least one ${text(previous.Role)} must stay active.`);
  }
  if (previous && text(previous.Role) !== role && activeRows(rows, text(previous.Role), id).length === 0 && String(previous.Active) !== 'false') {
    throw new ZohoError(2001, `At least one ${text(previous.Role)} must stay active.`);
  }
}
async function logRoster(store, user, role, oldV, newV) {
  await store.addRecord(HISTORY, { Setting_Key: `roster:${role}`, Old_Value: oldV, New_Value: newV, Changed_By: user || '', Changed_At: zohoNow(), Reason: '', Effect: 'Used from the next nightly rotation; team rows that already exist are not changed.' });
}
register(ROSTER_FORM, {
  beforeAdd: checkRoster,
  beforeUpdate: checkRoster,
  afterAdd: async ({ record, store, user }) => { if (!seeding) await logRoster(store, user, text(record.Role), '', rowText(record)); },
  afterUpdate: async ({ record, previous, store, user }) => {
    if (previous && rowText(previous) === rowText(record) && text(previous.Role) === text(record.Role)) return;
    await logRoster(store, user, text(record.Role), previous ? rowText(previous) : '', rowText(record));
  },
  beforeDelete: async ({ previous, store }) => {
    const rows = await store.find(ROSTER_FORM);
    if (String(previous.Active) !== 'false' && activeRows(rows, text(previous.Role), previous.ID).length === 0) throw new ZohoError(2001, `At least one ${text(previous.Role)} must stay active.`);
  },
  afterDelete: async ({ previous, store, user }) => logRoster(store, user, text(previous.Role), rowText(previous), ''),
});

// The lists the nightly rotation (and the Daily Team Availability widget) will use, and whether they are editable rows yet.
export async function getRoster(store) {
  const rows = await store.find(ROSTER_FORM);
  return { ...(await rosterFrom(store)), editable: rows.length > 0 };
}

// "Make the roster editable": copies the built-in list into rows, once. Does nothing if rows already exist.
export async function seedRoster(store, user = '') {
  const rows = await store.find(ROSTER_FORM);
  if (rows.length) return { seeded: 0 };
  let seeded = 0;
  seeding = true;
  try {
    for (const [key, role] of [['installers', 'installer'], ['drivers', 'driver'], ['vehicles', 'vehicle']]) {
      for (const [i, name] of ROSTER[key].entries()) {
        await store.addRecord(ROSTER_FORM, { Role: role, Name: name, Active: true, Sort_Order: i + 1 }, user);
        seeded++;
      }
    }
  } finally { seeding = false; }
  await store.addRecord(HISTORY, { Setting_Key: 'roster:all', Old_Value: 'Built-in list', New_Value: `${seeded} editable rows`, Changed_By: user || '', Changed_At: zohoNow(), Reason: 'Made the roster editable', Effect: 'Same people and vehicles as before.' });
  return { seeded };
}
