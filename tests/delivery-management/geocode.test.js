// Delivery Management, D3d: SA_Geocode_Address (server/modules/delivery-management/geocode.mjs), run on PGlite with the
// hooked store. Geoapify is never called: global fetch is replaced. Tests marked "mirrors Zoho" follow the Deluge script
// literally; they are to be confirmed against Zoho Development.
import { test, before, beforeEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { addressQuery, bestResult } from '../../server/modules/delivery-management/geocode.mjs';

const SA = 'Service_Appointment_Form';
let db, raw, store, savedKey;

before(async () => {
  savedKey = process.env.GEOAPIFY_API_KEY;
  process.env.GEOAPIFY_API_KEY = 'test-key';
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
after(() => { if (savedKey === undefined) delete process.env.GEOAPIFY_API_KEY; else process.env.GEOAPIFY_API_KEY = savedKey; });
beforeEach(async () => { await db.query(`DELETE FROM "${SA}"`); });

// Replaces fetch for one test; returns the list of URLs asked.
function geoapify(results, { fail = false } = {}) {
  const asked = [];
  mock.method(globalThis, 'fetch', async (url) => {
    asked.push(url);
    if (fail) throw new Error('network down');
    return { json: async () => (results === undefined ? {} : { results }) };
  });
  return asked;
}
const read = (id) => raw.getRecordById(SA, id, { raw: true });
const save = (extra = {}) => store.addRecord(SA, { Sales_Order: 'SO-1', Customer_Address: '1 Main St', City: 'Quezon City', ...extra });
const good = { lat: 14.65, lon: 121.04, result_type: 'building', rank: { confidence: 0.9 }, city: 'Quezon City' };

test('the text sent: cut at the first corner marker, city added when missing, ", Philippines" always', () => {
  assert.equal(addressQuery('1 Main St', 'Quezon City'), '1 Main St, Quezon City, Philippines');
  assert.equal(addressQuery('1 Main St, Quezon City', 'quezon city'), '1 Main St, Quezon City, Philippines');
  assert.equal(addressQuery('12 Oak Corner Pine St, Makati', 'Makati'), '12 Oak, Makati, Philippines');
  assert.equal(addressQuery('12 Oak COR. Pine St', ''), '12 Oak, Philippines');
  assert.equal(addressQuery('5 Elm', null), '5 Elm, Philippines');
});

test('the best result has the highest score (city +2, neighbourhood or suburb +1); the first wins a tie', () => {
  const rows = [{ city: 'Manila' }, { city: 'Quezon City', suburb: 'Cubao' }, { city: 'Quezon City' }];
  assert.equal(bestResult(rows, '1 main st, cubao, quezon city, philippines', 'Quezon City'), rows[1]);
  const tie = [{ city: 'A' }, { city: 'B' }];
  assert.equal(bestResult(tie, 'x', ''), tie[0]);
  assert.equal(bestResult([{ lat: 1 }, { lat: 2 }], 'x', 'Manila').lat, 1); // a result with no city never matches the city
});

test('a good result is written as Success with the coordinates as text, and the call carries the escaped text and the key', async (t) => {
  t.after(() => mock.restoreAll());
  const asked = geoapify([good]);
  const id = await save({ Customer_Address: '1 Main St #5' });
  const r = await read(id);
  assert.deepEqual([r.Delivery_Latitude, r.Delivery_Longitude, r.Geocode_Status], ['14.65', '121.04', 'Success']);
  assert.equal(asked.length, 1);
  assert.equal(asked[0], 'https://api.geoapify.com/v1/geocode/search?text=1%20Main%20St%20%235%2C%20Quezon%20City%2C%20Philippines&format=json&apiKey=test-key');
});

test('mirrors Zoho: a city, state or country result, or a confidence under 0.4 (or none), is "Approximate (City Level)"', async (t) => {
  t.after(() => mock.restoreAll());
  for (const result of [{ ...good, result_type: 'city' }, { ...good, result_type: 'state' }, { ...good, rank: { confidence: 0.39 } }, { ...good, rank: undefined }]) {
    mock.restoreAll();
    geoapify([result]);
    assert.equal((await read(await save())).Geocode_Status, 'Approximate (City Level)');
  }
});

test('no result, or a result with no coordinates, is "No Match"; an error answer from Geoapify counts as no result', async (t) => {
  t.after(() => mock.restoreAll());
  geoapify([]);
  assert.equal((await read(await save())).Geocode_Status, 'No Match');
  mock.restoreAll();
  geoapify([{ city: 'Quezon City' }]);
  assert.equal((await read(await save())).Geocode_Status, 'No Match');
  mock.restoreAll();
  geoapify(undefined);
  const r = await read(await save());
  assert.deepEqual([r.Geocode_Status, r.Delivery_Latitude], ['No Match', '']);
});

test('when the call itself fails nothing is written, so the next save tries again', async (t) => {
  t.after(() => mock.restoreAll());
  geoapify(null, { fail: true });
  const id = await save();
  assert.equal((await read(id)).Geocode_Status, '');
  mock.restoreAll();
  const asked = geoapify([good]);
  await store.updateRecord(SA, id, { City: 'Quezon City' }, { byForm: true });
  assert.equal(asked.length, 1);
  assert.equal((await read(id)).Geocode_Status, 'Success');
});

test('nothing is asked when the latitude is already there, when there is no address, or when no key is set', async (t) => {
  t.after(() => mock.restoreAll());
  const asked = geoapify([good]);
  await save({ Delivery_Latitude: '14.1' });
  await save({ Customer_Address: '' });
  assert.equal(asked.length, 0);
  const key = process.env.GEOAPIFY_API_KEY;
  delete process.env.GEOAPIFY_API_KEY;
  try { await save(); } finally { process.env.GEOAPIFY_API_KEY = key; }
  assert.equal(asked.length, 0);
});

test('it runs after an edit too, and the write does not run it again', async (t) => {
  t.after(() => mock.restoreAll());
  const id = await save({ Customer_Address: '' });
  const asked = geoapify([good]);
  await store.updateRecord(SA, id, { Customer_Address: '2 Side St' }, { byForm: true });
  assert.equal(asked.length, 1);
  await store.updateRecord(SA, id, { City: 'Pasig' }, { byForm: true }); // has a latitude now
  assert.equal(asked.length, 1);
});
