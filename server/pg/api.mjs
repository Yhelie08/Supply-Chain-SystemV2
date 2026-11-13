// The widget SDK operations (what zoho-shim.js posts to /api/*) on top of the Postgres store.
// Same request and response shapes as localApi in index.mjs and zohoAdapter, so widgets cannot tell.
import fs from 'node:fs';
import path from 'node:path';
import { ZohoError } from '../criteria.mjs';
import { DATA_DIR } from '../db.mjs';
import { createPool } from './pool.mjs';
import { ensureSchema } from './schema.mjs';
import { createStore } from './store.mjs';
import { createHookedStore } from '../workflows/index.mjs';
import { workflows } from '../workflows/all.mjs';
import { reconcileFulfillment } from '../modules/fulfillment/pipeline.mjs';
import { functions as fulfillmentApis } from '../modules/fulfillment/apis.mjs';
import { createZohoApi } from '../books/client.mjs';
import { createAkeneoApi } from '../akeneo/client.mjs';
import { createShopifyApi } from '../shopify/client.mjs';

// `store` is the hooked store: widget writes run the form workflows (server/workflows). Custom APIs get
// `rawStore`, whose writes do not fire them again.
export function createPgApi(store, invokeCustomApi, rawStore = store, ctx = {}) {
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
    updateRecordById: async (b, user) => ({ code: 3000, data: { ID: await store.updateRecord(b.report_name, b.id, b.payload?.data ?? b.data ?? {}, { user }) }, message: 'Data Updated Successfully!' }),
    // Bulk update: every record of the report matching payload.criteria
    updateRecords: async (b, user) => {
      const crit = b.payload?.criteria ?? b.criteria;
      const recs = await store.getRecords(b.report_name, { criteria: crit, pageSize: 1000, user });
      if (!recs.length) throw new ZohoError(9280, 'No records found for the given criteria.');
      const data = b.payload?.data ?? b.data ?? {};
      const result = [];
      for (const r of recs) result.push({ code: 3000, data: { ID: await store.updateRecord(b.report_name, r.ID, data, { user }) }, message: 'Data Updated Successfully!' });
      return { code: 3000, result };
    },
    deleteRecordById: async (b, user) => ({ code: 3000, data: { ID: await store.deleteRecord(b.report_name, b.id, { user }) }, message: 'Record Deleted Successfully!' }),
    invokeCustomApi: async (b, user) => {
      const result = await invokeCustomApi(b.api_name, b.payload, rawStore, { ...ctx, user });
      // A custom API's writes do not fire the workflow hooks, so what a Fulfillment one wrote is carried on here (Readiness, Pick, QC).
      if (b.api_name in fulfillmentApis) await reconcileFulfillment(rawStore, { user }).catch((e) => console.error('[fulfillment] catch-up failed:', e));
      return { code: 3000, result };
    },
  };
}

// Connects, makes sure the tables exist, and returns the SDK operations plus the store.
export async function startPg(invokeCustomApi) {
  const pool = createPool();
  const changes = await ensureSchema(pool);
  console.log(`[pg] connected; schema ready (${changes} change${changes === 1 ? '' : 's'})`);
  const store = createStore(pool);
  const books = createZohoApi();
  console.log(`[books] Zoho Books/Inventory ${books.isConfigured() ? 'configured' : 'not configured (workflows and APIs that call Books will report it)'}`);
  const akeneo = createAkeneoApi();
  console.log(`[akeneo] ${akeneo.isConfigured() ? 'configured' : 'not configured (Items picker search will report it)'}`);
  const shopify = createShopifyApi();
  console.log(`[shopify] ${shopify.isConfigured() ? 'configured' : 'not configured (Akeneo item pick will skip the price lookup)'}`);
  const hooked = createHookedStore(store, workflows, { books });
  // Files a custom API downloads (an item's photo) go where widget uploads go: DATA_DIR/uploads, served at /uploads/.
  const saveUpload = async (name, buffer) => {
    const uploads = path.join(DATA_DIR, 'uploads');
    fs.mkdirSync(uploads, { recursive: true });
    const fileName = `${Date.now()}_${String(name).replace(/[^\w.-]+/g, '_')}`;
    fs.writeFileSync(path.join(uploads, fileName), buffer);
    return `/uploads/${fileName}`;
  };
  return { pool, store, api: createPgApi(hooked, invokeCustomApi, store, { books, akeneo, shopify, saveUpload }) };
}
