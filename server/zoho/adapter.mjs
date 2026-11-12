// Zoho Creator REST API v2.1 Adapter
// Translates widget SDK shim requests from server/public/zoho-shim.js into Zoho Creator v2.1 calls
import { getAccessToken, getConfig, invalidateToken } from './auth.mjs';
import { cachedFetch, schedule, invalidateReport } from './limits.mjs';
import { invokeCustomApi as fallbackCustomApi } from '../custom-apis.mjs';

async function request(path, options = {}) {
  const token = await getAccessToken();
  const config = getConfig();
  const url = `${config.baseUrl}${path}`;

  const headers = {
    'Authorization': `Zoho-oauthtoken ${token}`,
    'environment': config.env,
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof Buffer)) {
    options = { ...options, body: JSON.stringify(options.body) };
    headers['Content-Type'] = 'application/json';
  } else if (typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'; // retry path: body is already JSON text
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { code: res.status, message: text };
  }

  // Next-block cursor for paged reads (header, not body).
  const cursorHeader = res.headers.get('record_cursor');
  if (cursorHeader) json.record_cursor = cursorHeader;

  // Expired/invalid token: refresh once and retry the same call.
  if (json.code === 1030 && !options.retried) {
    invalidateToken();
    return request(path, { ...options, retried: true });
  }

  // Handle Zoho's "No records found" gracefully as empty array
  if (json.code === 9220 || json.code === 9280) {
    return { code: 3000, data: [] };
  }

  if (!res.ok && json.code !== 3000) {
    const errorMsg = json.message || json.description || `Zoho API Error (${res.status})`;
    const err = new Error(errorMsg);
    err.code = json.code || res.status;
    err.details = json;
    throw err;
  }

  return json;
}

export const zohoAdapter = {
  // 1. Get Records from a report
  getRecords: async (b, user) => {
    const reportName = b.report_name;
    if (!reportName) throw new Error('report_name is required');

    // Zoho v2.1 ignores limit/from: it returns blocks of 200 and a record_cursor header for the next block.
    // So walk the cursor chain up to the rows the widget asked for (page x pageSize) and slice.
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
      const res = await cachedFetch(`GET:${path}:${cur || 'first'}`, () => request(path, { method: 'GET', headers: cur ? { record_cursor: cur } : {} }));
      const block = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
      rows = rows.concat(block);
      cursor = res.record_cursor;
      if (!cursor || block.length < 200) break;
    }

    return { code: 3000, data: rows.slice(start, end) };
  },

  // 2. Get single record by ID
  getRecordById: async (b) => {
    const { report_name, id } = b;
    if (!report_name || !id) throw new Error('report_name and id are required');

    const path = `/report/${report_name}/${id}`;
    const cacheKey = `GET:${path}`;
    const res = await cachedFetch(cacheKey, () => request(path, { method: 'GET' }));

    return {
      code: 3000,
      data: res.data || {},
    };
  },

  // 3. Add record(s) through a form
  addRecords: async (b, user) => {
    const formName = b.form_name;
    if (!formName) throw new Error('form_name is required');

    const rawData = b.payload?.data ?? b.data ?? {};
    const records = Array.isArray(rawData) ? rawData : [rawData];

    const body = { data: records };
    const path = `/form/${formName}`;

    const res = await schedule(() => request(path, { method: 'POST', body }));
    invalidateReport(formName);

    // Standardize result array
    const results = res.result || [{ code: 3000, data: res.data || {}, message: 'Data Added Successfully' }];
    return {
      code: 3000,
      result: results,
      data: results.map((r) => r.data),
      message: 'Data Added Successfully',
    };
  },

  // 4. Update single record by ID
  updateRecordById: async (b, user) => {
    const { report_name, id } = b;
    if (!report_name || !id) throw new Error('report_name and id are required');

    const data = b.payload?.data ?? b.data ?? {};
    const path = `/report/${report_name}/${id}`;

    const res = await schedule(() => request(path, {
      method: 'PATCH',
      body: { data },
    }));

    invalidateReport(report_name);
    return {
      code: 3000,
      data: res.data || { ID: id },
      message: 'Data Updated Successfully',
    };
  },

  // 5. Update records matching criteria
  updateRecords: async (b, user) => {
    const reportName = b.report_name;
    const crit = b.payload?.criteria ?? b.criteria;
    const data = b.payload?.data ?? b.data ?? {};

    const params = new URLSearchParams();
    if (crit) params.append('criteria', crit);
    const qs = params.toString() ? `?${params.toString()}` : '';

    const path = `/report/${reportName}${qs}`;
    const res = await schedule(() => request(path, {
      method: 'PATCH',
      body: { data },
    }));

    invalidateReport(reportName);
    return {
      code: 3000,
      result: res.result || [],
      message: 'Data Updated Successfully',
    };
  },

  // 6. Delete record by ID
  deleteRecordById: async (b) => {
    const { report_name, id } = b;
    if (!report_name || !id) throw new Error('report_name and id are required');

    const path = `/report/${report_name}/${id}`;
    const res = await schedule(() => request(path, { method: 'DELETE' }));

    invalidateReport(report_name);
    return {
      code: 3000,
      data: { ID: id },
      message: 'Record Deleted Successfully',
    };
  },

  // 7. Custom API execution
  invokeCustomApi: async (b) => {
    const apiName = b.api_name;
    // If public key is available, we can call Zoho custom API endpoint directly,
    // otherwise fallback to our ported custom API implementation (server/custom-apis.mjs, which collects the handlers of server/modules/*)
    try {
      return { code: 3000, result: await fallbackCustomApi(apiName, b.payload) };
    } catch (e) {
      console.warn(`[Custom API] Fallback error for ${apiName}:`, e.message);
      throw e;
    }
  },
};
