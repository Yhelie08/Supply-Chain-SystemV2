// One set of numbers: the forecast engine and the Ship & Track plan both read the Procurement Settings page (the old Forecast Setting
// tab is merged into it). Nothing changes until a number is saved.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { settingsFrom, DEFAULT_SETTINGS as ENGINE } from '../server/forecast/engine.mjs';
import { forecastSettings, forecastRecord, forecastValues } from '../server/modules/procurement/forecast-settings.mjs';
import { loadSettings, DEFAULT_SETTINGS } from '../server/modules/procurement/plan.mjs';
import { get_procurement_settings } from '../server/modules/procurement/settings-hooks.mjs';

let db, raw, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of ['Forecast_Settings', 'Procurement_Settings', 'Procurement_Settings_History', 'Shipments']) await db.query(`DELETE FROM "${f}"`); });

// the live record on Railway when this was written: Air 5-7, customs 2-3, LCL 35-60 and LCL customs from 7; everything else blank
const LIVE = { Air_Transit_Min: '5', Air_Transit_Max: '7', Air_Customs_to_WH_Min: '2', Air_Customs_to_WH_Max: '3', LCL_Transit_Min: '35', LCL_Transit_Max: '60', LCL_Customs_to_WH_Min: '7' };
const rejects = (fn, re) => assert.rejects(fn, (e) => re.test(e.message));

test('nothing saved and no old record: the engine uses exactly what it always used', async () => {
  assert.equal(await forecastRecord(raw), null);
  assert.deepEqual(await forecastSettings(raw), ENGINE);
  const v = await forecastValues(raw);
  assert.deepEqual([v.transit_lcl_min_days.value, v.transit_lcl_max_days.value, v.transit_lcl_min_days.source], [35, 60, 'default']);
});

test('nothing saved, the old Forecast_Settings record present: the engine reads it exactly as before (the live numbers stay)', async () => {
  const id = await raw.addRecord('Forecast_Settings', LIVE);
  const rec = await raw.getRecordById('Forecast_Settings', id, { raw: true });
  assert.deepEqual(await forecastSettings(raw), settingsFrom(rec));
  const v = await forecastValues(raw);
  assert.deepEqual([v.transit_air_min_days.value, v.transit_air_min_days.source], [5, 'legacy']);
  assert.equal(v.fulfillment_days.source, 'default', 'a blank field of the old record is not "from" it');
});

test('a saved number replaces that one field; the rest of the old record keeps its value, and its switches stay as written', async () => {
  await raw.addRecord('Forecast_Settings', { ...LIVE, Re_anchor_on_Latest_Real_Event: 'false' });
  await raw.addRecord('Procurement_Settings', { Setting_Key: 'transit_air_max_days', Value: '9' });
  const s = await forecastSettings(raw);
  assert.deepEqual([s.airTMin, s.airTMax, s.lclTMin, s.lclTMax, s.reAnchor], [5, 9, 35, 60, false]);
  assert.equal((await forecastValues(raw)).transit_air_max_days.source, 'saved');
});

test('saving a number with no old record keeps the engine\'s default switches (re-anchor stays on)', async () => {
  await raw.addRecord('Procurement_Settings', { Setting_Key: 'delivery_days', Value: '2' });
  const s = await forecastSettings(raw);
  assert.equal(s.delMin, 2);
  assert.equal(s.reAnchor, true);
  assert.equal(s.lclTMin, ENGINE.lclTMin);
});

test('the plan and the forecast read the same numbers: the plan takes the middle of each range, and customs time is part of it', async () => {
  await raw.addRecord('Forecast_Settings', LIVE);
  const s = await loadSettings(raw);
  assert.deepEqual([s.transit_air_days, s.transit_lcl_days, s.customs_air_days, s.customs_lcl_days], [6, 48, 3, 9]);
  await store.addRecord('Procurement_Settings', { Setting_Key: 'transit_lcl_max_days', Value: '40' });
  const t = await loadSettings(raw);
  assert.equal(t.transit_lcl_days, 38, 'the same save moved the plan...');
  assert.equal((await forecastSettings(raw)).lclTMax, 40, '...and the forecast');
});

test('unconfigured, the plan resolves to the engine\'s numbers too (one set, not two)', async () => {
  const s = await loadSettings(raw);
  assert.equal(s.transit_lcl_days, DEFAULT_SETTINGS.transit_lcl_days);
  assert.equal(s.transit_lcl_days, Math.round((ENGINE.lclTMin + ENGINE.lclTMax) / 2));
  assert.equal(s.fulfillment_days, ENGINE.prepMin);
});

test('the settings page lists the forecast numbers with where each comes from, and a switch is yes / no only', async () => {
  await raw.addRecord('Forecast_Settings', LIVE);
  const r = await get_procurement_settings({}, raw);
  const by = Object.fromEntries(r.settings.map((x) => [x.key, x]));
  assert.deepEqual([by.transit_lcl_min_days.value, by.transit_lcl_min_days.source, by.transit_lcl_min_days.is_default], [35, 'legacy', false]);
  assert.equal(by.forecast_reanchor.type, 'yes_no');
  await rejects(() => store.addRecord('Procurement_Settings', { Setting_Key: 'forecast_reanchor', Value: 'maybe' }), /yes or no/);
  await store.addRecord('Procurement_Settings', { Setting_Key: 'forecast_reanchor', Value: 'FALSE' });
  assert.equal((await forecastSettings(raw)).reAnchor, false);
});

test('the history keeps the value that was in use (from the old record), not just the default', async () => {
  await raw.addRecord('Forecast_Settings', LIVE);
  await store.addRecord('Procurement_Settings', { Setting_Key: 'transit_lcl_min_days', Value: '30' }, 'admin@x');
  const [h] = await raw.find('Procurement_Settings_History');
  assert.deepEqual([h.Setting_Key, h.Old_Value, h.New_Value], ['transit_lcl_min_days', '35', '30']);
  // deleting the row goes back to the old record's value
  const row = (await raw.find('Procurement_Settings'))[0];
  await store.deleteRecord('Procurement_Settings', row.ID, { user: 'admin@x' });
  const back = (await raw.find('Procurement_Settings_History')).find((x) => x.Reason === 'Back to the default');
  assert.deepEqual([back.Old_Value, back.New_Value], ['30', '35']);
});
