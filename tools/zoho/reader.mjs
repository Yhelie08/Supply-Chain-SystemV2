// Read-only Zoho Creator v2.1 reader for tools/export-zoho-data.mjs.
// It can only GET: there is no add, update or delete here, so an export can never write to Zoho.
// (The full read/write adapter used to live in server/zoho/; the app no longer talks to Zoho Creator.)
import { getAccessToken, getConfig, invalidateToken } from './auth.mjs';
import { cachedFetch } from './limits.mjs';

async function get(path, headers = {}, retried = false) {
  const token = await getAccessToken();
  const config = getConfig();
  const res = await fetch(`${config.baseUrl}${path}`, {
    method: 'GET',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, environment: config.env, Accept: 'application/json', ...headers },
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { code: res.status, message: text }; }

  // Next-block cursor for paged reads (header, not body).
  const cursorHeader = res.headers.get('record_cursor');
  if (cursorHeader) json.record_cursor = cursorHeader;

  // Expired/invalid token: refresh once and retry the same call.
  if (json.code === 1030 && !retried) {
    invalidateToken();
    return get(path, headers, true);
  }

  // Zoho's "No records found" is an empty list, not an error.
  if (json.code === 9220 || json.code === 9280) return { code: 3000, data: [] };

  if (!res.ok && json.code !== 3000) {
    const err = new Error(json.message || json.description || `Zoho API Error (${res.status})`);
    err.code = json.code || res.status;
    err.details = json;
    throw err;
  }
  return json;
}

export const zohoReader = {
  // Rows of a report. Zoho v2.1 ignores limit/from: it returns blocks of 200 and a record_cursor header
  // for the next block, so walk the cursor chain up to page x pageSize rows and slice.
  getRecords: async (b) => {
    const reportName = b.report_name;
    if (!reportName) throw new Error('report_name is required');

    const size = Number(b.pageSize || b.page_size || b.limit || b.max_records || 200);
    const start = (Number(b.page || 1) - 1) * size;
    const end = start + size;
    const params = new URLSearchParams({ max_records: '200' });
    if (b.criteria) params.append('criteria', b.criteria);
    const path = `/report/${reportName}?${params}`;

    let rows = [];
    let cursor = null;
    while (rows.length < end) {
      const cur = cursor;
      const res = await cachedFetch(`GET:${path}:${cur || 'first'}`, () => get(path, cur ? { record_cursor: cur } : {}));
      const block = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
      rows = rows.concat(block);
      cursor = res.record_cursor;
      if (!cursor || block.length < 200) break;
    }
    return { code: 3000, data: rows.slice(start, end) };
  },
};
