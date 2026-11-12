// The widget SDK operations (what zoho-shim.js posts to /api/*) on top of the Postgres store.
// Same request and response shapes as localApi in index.mjs and zohoAdapter, so widgets cannot tell.
import { ZohoError } from '../criteria.mjs';
import { createPool } from './pool.mjs';
import { ensureSchema } from './schema.mjs';
import { createStore } from './store.mjs';

export function createPgApi(store, invokeCustomApi) {
  return {
    getRecords: async (b, user) => ({ code: 3000, data: await store.getRecords(b.report_name, { ...b, user }) }),
    getRecordById: async (b) => ({ code: 3000, data: await store.getRecordById(b.report_name, b.id) }),
    addRecords: async (b, user) => {
      const data = b.payload?.data ?? b.data ?? {};
      if (Array.isArray(data)) {
        const result = [];
        for (const d of data) result.push({ code: 3000, data: { ID: await store.addRecord(b.form_name, d, user) }, message: 'Data Added Successfully!' });
        return { code: 3000, result, data: result.map((r) => r.data) };
      }
      return { code: 3000, data: { ID: await store.addRecord(b.form_name, data, user) }, message: 'Data Added Successfully!' };
    },
    updateRecordById: async (b) => ({ code: 3000, data: { ID: await store.updateRecord(b.report_name, b.id, b.payload?.data ?? b.data ?? {}) }, message: 'Data Updated Successfully!' }),
    // Bulk update: every record of the report matching payload.criteria
    updateRecords: async (b, user) => {
      const crit = b.payload?.criteria ?? b.criteria;
      const recs = await store.getRecords(b.report_name, { criteria: crit, pageSize: 1000, user });
      if (!recs.length) throw new ZohoError(9280, 'No records found for the given criteria.');
      const data = b.payload?.data ?? b.data ?? {};
      const result = [];
      for (const r of recs) result.push({ code: 3000, data: { ID: await store.updateRecord(b.report_name, r.ID, data) }, message: 'Data Updated Successfully!' });
      return { code: 3000, result };
    },
    deleteRecordById: async (b) => ({ code: 3000, data: { ID: await store.deleteRecord(b.report_name, b.id) }, message: 'Record Deleted Successfully!' }),
    invokeCustomApi: async (b) => ({ code: 3000, result: await invokeCustomApi(b.api_name, b.payload, store) }),
  };
}

// Connects, makes sure the tables exist, and returns the SDK operations plus the store.
export async function startPg(invokeCustomApi) {
  const pool = createPool();
  const changes = await ensureSchema(pool);
  console.log(`[pg] connected; schema ready (${changes} change${changes === 1 ? '' : 's'})`);
  const store = createStore(pool);
  return { pool, store, api: createPgApi(store, invokeCustomApi) };
}
