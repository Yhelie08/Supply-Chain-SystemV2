// Minimal Akeneo PIM client for the Items picker's live search + pick-time field fetch.
// OAuth2 password grant, same auth flow 8b_AkeneoToZoho/src/main/akeneo/client.ts uses against
// this same catalog. Deliberately thinner than that client: no product-model/variant-axis
// resolution, no category-tree walk -- this app only reads a single simple product per pick.
//
// Env: AKENEO_BASE_URL, AKENEO_CLIENT_ID, AKENEO_CLIENT_SECRET, AKENEO_USERNAME, AKENEO_PASSWORD

export class AkeneoError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = 'AkeneoError';
    this.status = status;
    this.details = details;
  }
}

export function createAkeneoApi({ env = process.env, fetch: fetchImpl = globalThis.fetch } = {}) {
  const config = () => ({
    baseUrl: String(env.AKENEO_BASE_URL || '').replace(/\/$/, ''),
    clientId: env.AKENEO_CLIENT_ID,
    clientSecret: env.AKENEO_CLIENT_SECRET,
    username: env.AKENEO_USERNAME,
    password: env.AKENEO_PASSWORD,
  });
  const isConfigured = () => { const c = config(); return !!(c.baseUrl && c.clientId && c.clientSecret && c.username && c.password); };

  let token = null;
  async function authenticate() {
    const c = config();
    const res = await fetchImpl(`${c.baseUrl}/api/oauth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64') },
      body: JSON.stringify({ grant_type: 'password', username: c.username, password: c.password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.access_token) throw new AkeneoError(`Akeneo token refresh failed: ${json.error || res.status}`, { status: res.status, details: json });
    token = json.access_token;
    return token;
  }

  async function get(path, params = {}) {
    if (!isConfigured()) throw new AkeneoError('Akeneo is not configured: set AKENEO_BASE_URL, AKENEO_CLIENT_ID, AKENEO_CLIENT_SECRET, AKENEO_USERNAME, AKENEO_PASSWORD.');
    const c = config();
    const url = new URL(`${c.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (!token) await authenticate();
    let res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { await authenticate(); res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } }); }
    if (!res.ok) throw new AkeneoError(`Akeneo answered HTTP ${res.status} for ${path}`, { status: res.status });
    return res.json();
  }

  // Media files (product images) live behind the same Bearer token but aren't JSON -- getItem's
  // values.image[0]._links.download.href is a full URL already, so this takes that whole URL
  // rather than a path+params pair like get() does.
  async function downloadMedia(url) {
    if (!isConfigured()) throw new AkeneoError('Akeneo is not configured: set AKENEO_BASE_URL, AKENEO_CLIENT_ID, AKENEO_CLIENT_SECRET, AKENEO_USERNAME, AKENEO_PASSWORD.');
    if (!token) await authenticate();
    let res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) { await authenticate(); res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } }); }
    if (!res.ok) throw new AkeneoError(`Akeneo answered HTTP ${res.status} downloading media`, { status: res.status });
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
  }

  // No parent filter: unlike 8b_AkeneoToZoho's bulk sync (which treats parent:EMPTY standalone
  // products and parent:!EMPTY variants as two different sync paths), this picker searches every
  // sellable product regardless of parent -- confirmed live that `parent:!EMPTY` (true variants)
  // carry Costing/dimensions/voltage, while `parent:EMPTY` carries only Product_Type and no price
  // data. Filtering to parent:EMPTY (as first drafted) silently hid every priced, orderable item.
  // Capped at `limit`, single page, no search_after follow-up -- a dropdown search fires on every
  // pause in typing, so this stays to one Akeneo call per search, never a paginated walk.
  async function searchItems(text, { limit = 20 } = {}) {
    const q = String(text || '').trim();
    if (!q) return [];
    const byIdentifier = await get('/api/rest/v1/products', {
      search: JSON.stringify({ identifier: [{ operator: 'CONTAINS', value: q }] }),
      limit: String(limit), pagination_type: 'search_after',
    });
    const items = byIdentifier._embedded?.items ?? [];
    if (items.length >= limit) return items;
    // Identifier search came back thin -- also try name, merged and deduped by identifier.
    const byName = await get('/api/rest/v1/products', {
      search: JSON.stringify({ name: [{ operator: 'CONTAINS', value: q, locale: 'en_US' }] }),
      limit: String(limit), pagination_type: 'search_after',
    });
    const seen = new Set(items.map((p) => p.identifier));
    for (const p of byName._embedded?.items ?? []) if (!seen.has(p.identifier)) { items.push(p); seen.add(p.identifier); }
    return items.slice(0, limit);
  }

  async function getItem(identifier) {
    return get(`/api/rest/v1/products/${encodeURIComponent(identifier)}`);
  }

  return { searchItems, getItem, downloadMedia, isConfigured };
}
