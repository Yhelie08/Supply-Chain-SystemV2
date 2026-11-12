// Client for Zoho Books (v3) and Zoho Inventory (v1), replacing the Deluge `invokeurl ... connection:"zhbooks3"`
// calls. It signs in with its own OAuth refresh token (not the Creator service account).
//
//   const zoho = createZohoApi();
//   const { contact } = await zoho.books.post('/contacts', { contact_name: 'ACME' });
//   const { salesorders } = await zoho.inventory.get('/salesorders', { query: { salesorder_number: 'SO-1' } });
//
// Env: ZOHO_BOOKS_CLIENT_ID, ZOHO_BOOKS_CLIENT_SECRET, ZOHO_BOOKS_REFRESH_TOKEN, ZOHO_BOOKS_ORG_ID
// (Books and Inventory share the organization id unless ZOHO_INVENTORY_ORG_ID is set), and optionally
// ZOHO_API_DOMAIN / ZOHO_ACCOUNTS_URL. `fetch` and `sleep` can be injected, so tests never touch Zoho.

const MAX_CONCURRENT = 4; // Books allows far more per minute than a back office will ever send; this keeps bursts polite
const MAX_RETRIES_429 = 3;

export class BooksError extends Error {
  constructor(message, { status = 0, code = null, details = null } = {}) {
    super(message);
    this.name = 'BooksError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function createZohoApi({
  env = process.env,
  fetch: fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
} = {}) {
  const config = () => ({
    clientId: env.ZOHO_BOOKS_CLIENT_ID,
    clientSecret: env.ZOHO_BOOKS_CLIENT_SECRET,
    refreshToken: env.ZOHO_BOOKS_REFRESH_TOKEN,
    org: env.ZOHO_BOOKS_ORG_ID,
    inventoryOrg: env.ZOHO_INVENTORY_ORG_ID || env.ZOHO_BOOKS_ORG_ID,
    api: env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com',
    accounts: env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com',
  });
  const isConfigured = () => { const c = config(); return !!(c.clientId && c.clientSecret && c.refreshToken && c.org); };

  // ----- access token: refreshed on demand, one refresh at a time -----
  let token = null;
  let expiresAt = 0;
  let refreshing = null;
  function accessToken(force = false) {
    if (!force && token && now() < expiresAt - 60_000) return Promise.resolve(token);
    refreshing ||= (async () => {
      const c = config();
      const res = await fetchImpl(`${c.accounts}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ refresh_token: c.refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.access_token) throw new BooksError(`Zoho token refresh failed: ${json.error || res.status}`, { status: res.status, details: json });
      token = json.access_token;
      expiresAt = now() + (Number(json.expires_in) || 3600) * 1000;
      return token;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  // ----- at most MAX_CONCURRENT requests in flight -----
  let active = 0;
  const waiters = [];
  async function acquire() { while (active >= MAX_CONCURRENT) await new Promise((resolve) => waiters.push(resolve)); active++; }
  function release() { active--; waiters.shift()?.(); }

  async function request(service, method, path, { query = {}, body, binary = false } = {}) {
    if (!isConfigured()) {
      throw new BooksError('Zoho Books is not configured: set ZOHO_BOOKS_CLIENT_ID, ZOHO_BOOKS_CLIENT_SECRET, ZOHO_BOOKS_REFRESH_TOKEN and ZOHO_BOOKS_ORG_ID.', { code: 'not_configured' });
    }
    const c = config();
    const base = service === 'inventory' ? `${c.api}/inventory/v1` : `${c.api}/books/v3`;
    const org = service === 'inventory' ? c.inventoryOrg : c.org;
    const url = `${base}${path}?${new URLSearchParams({ organization_id: org, ...query })}`;

    await acquire();
    try {
      let refreshedOnce = false;
      for (let tries429 = 0; ;) {
        const res = await fetchImpl(url, {
          method,
          headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401 && !refreshedOnce) { refreshedOnce = true; await accessToken(true); continue; }
        if (res.status === 429 && tries429 < MAX_RETRIES_429) { await sleep(1000 * 2 ** tries429++); continue; }
        // A file (an item's image): hand the bytes back as they are.
        if (binary && res.ok) return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers?.get?.('content-type') || '' };
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        // Books answers { code: 0, message: 'success', ... }; any other code is an error even on HTTP 200.
        if (!res.ok || (json && json.code !== undefined && json.code !== 0)) {
          throw new BooksError(json?.message || `Zoho ${service} answered HTTP ${res.status}`, { status: res.status, code: json?.code ?? null, details: json ?? text });
        }
        return json ?? {};
      }
    } finally { release(); }
  }

  const service = (name) => ({
    get: (path, opts) => request(name, 'GET', path, opts),
    download: (path, opts) => request(name, 'GET', path, { ...opts, binary: true }),
    post: (path, body, opts) => request(name, 'POST', path, { ...opts, body }),
    put: (path, body, opts) => request(name, 'PUT', path, { ...opts, body }),
    delete: (path, opts) => request(name, 'DELETE', path, opts),
  });
  return { books: service('books'), inventory: service('inventory'), isConfigured };
}
