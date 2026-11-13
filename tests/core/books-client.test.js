// Zoho Books/Inventory client, with a fake fetch: no network, nothing is ever sent to Zoho.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZohoApi, BooksError } from '../../server/books/client.mjs';

const ENV = { ZOHO_BOOKS_CLIENT_ID: 'cid', ZOHO_BOOKS_CLIENT_SECRET: 'secret', ZOHO_BOOKS_REFRESH_TOKEN: 'refresh', ZOHO_BOOKS_ORG_ID: '111' };
const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });

// A fake Zoho: answers token refreshes and API calls from a queue of handlers, and records every call.
function fake(handler) {
  const calls = [];
  let tokens = 0;
  const fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method, headers: init.headers || {}, body: init.body };
    calls.push(call);
    if (call.url.includes('/oauth/v2/token')) return json(200, { access_token: `token-${++tokens}`, expires_in: 3600 });
    return handler(call, calls.filter((c) => !c.url.includes('/oauth/')).length);
  };
  return { fetch, calls, tokenCalls: () => calls.filter((c) => c.url.includes('/oauth/')).length };
}

test('not configured: a clear error and no network call', async () => {
  const f = fake(() => json(200, {}));
  const zoho = createZohoApi({ env: {}, fetch: f.fetch });
  assert.equal(zoho.isConfigured(), false);
  await assert.rejects(() => zoho.books.get('/contacts'), (e) => e instanceof BooksError && e.code === 'not_configured' && /ZOHO_BOOKS_CLIENT_ID/.test(e.message));
  assert.equal(f.calls.length, 0);
});

test('sends the organization id, the token and a JSON body; reuses the token', async () => {
  const f = fake(() => json(200, { code: 0, message: 'success', contact: { contact_id: '99' } }));
  const zoho = createZohoApi({ env: ENV, fetch: f.fetch });
  const out = await zoho.books.post('/contacts', { contact_name: 'ACME' });
  await zoho.books.get('/items', { query: { search_text: 'lamp' } });
  assert.equal(out.contact.contact_id, '99');
  const [, post, get] = f.calls;
  assert.equal(post.url, 'https://www.zohoapis.com/books/v3/contacts?organization_id=111');
  assert.equal(post.method, 'POST');
  assert.equal(post.headers.Authorization, 'Zoho-oauthtoken token-1');
  assert.equal(post.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(post.body), { contact_name: 'ACME' });
  assert.equal(get.url, 'https://www.zohoapis.com/books/v3/items?organization_id=111&search_text=lamp');
  assert.equal(get.body, undefined);
  assert.equal(f.tokenCalls(), 1, 'one refresh served both calls');
});

test('Inventory uses its own base URL, and the Books organization id unless told otherwise', async () => {
  const f = fake(() => json(200, { code: 0, salesorders: [] }));
  await createZohoApi({ env: ENV, fetch: f.fetch }).inventory.get('/salesorders', { query: { salesorder_number: 'SO-1' } });
  assert.equal(f.calls.at(-1).url, 'https://www.zohoapis.com/inventory/v1/salesorders?organization_id=111&salesorder_number=SO-1');
  await createZohoApi({ env: { ...ENV, ZOHO_INVENTORY_ORG_ID: '222' }, fetch: f.fetch }).inventory.get('/packages');
  assert.match(f.calls.at(-1).url, /organization_id=222/);
});

test('parallel calls share one token refresh', async () => {
  const f = fake(() => json(200, { code: 0 }));
  const zoho = createZohoApi({ env: ENV, fetch: f.fetch });
  await Promise.all([1, 2, 3, 4, 5].map(() => zoho.books.get('/items')));
  assert.equal(f.tokenCalls(), 1);
});

test('401: refreshes the token once and retries; a second 401 is an error', async () => {
  const f = fake((call, n) => (n === 1 ? json(401, { code: 57, message: 'invalid token' }) : json(200, { code: 0, ok: true })));
  const zoho = createZohoApi({ env: ENV, fetch: f.fetch });
  assert.equal((await zoho.books.get('/items')).ok, true);
  assert.equal(f.tokenCalls(), 2);
  assert.equal(f.calls.at(-1).headers.Authorization, 'Zoho-oauthtoken token-2');

  const always401 = fake(() => json(401, { code: 57, message: 'invalid token' }));
  await assert.rejects(() => createZohoApi({ env: ENV, fetch: always401.fetch }).books.get('/items'), (e) => e.status === 401 && e.code === 57);
});

test('429: backs off 1s, 2s, 4s then gives up', async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  const recovers = fake((call, n) => (n <= 2 ? json(429, { message: 'slow down' }) : json(200, { code: 0, done: true })));
  assert.equal((await createZohoApi({ env: ENV, fetch: recovers.fetch, sleep }).books.get('/items')).done, true);
  assert.deepEqual(waits, [1000, 2000]);

  waits.length = 0;
  const never = fake(() => json(429, { message: 'slow down' }));
  await assert.rejects(() => createZohoApi({ env: ENV, fetch: never.fetch, sleep }).books.get('/items'), (e) => e.status === 429);
  assert.deepEqual(waits, [1000, 2000, 4000]);
});

test('a Books error code is an error even on HTTP 200, and carries Books\' message', async () => {
  const f = fake(() => json(200, { code: 3062, message: 'Contact name already exists.' }));
  await assert.rejects(() => createZohoApi({ env: ENV, fetch: f.fetch }).books.post('/contacts', {}), (e) => e instanceof BooksError && e.code === 3062 && /already exists/.test(e.message));
});

test('a failed token refresh is reported, not retried forever', async () => {
  const fetch = async () => json(400, { error: 'invalid_code' });
  await assert.rejects(() => createZohoApi({ env: ENV, fetch }).books.get('/items'), /token refresh failed: invalid_code/);
});

test('at most 4 requests are in flight at once', async () => {
  let inFlight = 0, peak = 0;
  const fetch = async (url) => {
    if (String(url).includes('/oauth/')) return json(200, { access_token: 't', expires_in: 3600 });
    peak = Math.max(peak, ++inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return json(200, { code: 0 });
  };
  const zoho = createZohoApi({ env: ENV, fetch });
  await Promise.all(Array.from({ length: 12 }, () => zoho.books.get('/items')));
  assert.equal(peak, 4);
});
