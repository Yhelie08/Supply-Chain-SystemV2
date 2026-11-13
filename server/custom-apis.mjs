// Zoho Custom APIs (called from widgets via ZOHO.CREATOR.DATA.invokeCustomApi), ported from the Deluge
// functions in zoho-export/parsed/functions/. The handlers live with their module, in
// server/modules/<module>/apis.mjs; server/modules/index.mjs collects them. Each returns the Deluge "response" map.
//
// The data layer is the SQLite store by default; the Postgres backend passes its own store as `data`.
// Both offer find / addRecord / updateRecord, and every call is awaited so either one works.
import * as sqlite from './db.mjs';
import { customApis } from './modules/index.mjs';
import { fail } from './custom-api-helpers.mjs';

export { customApis };

// ctx = { books, user, saveUpload } : the Zoho Books/Inventory client (server/books/client.mjs), the signed-in
// user, and a file saver, when the backend has them.
export async function invokeCustomApi(name, payload, data = sqlite, ctx = {}) {
  const fn = customApis[name];
  if (!fn) return fail(`Unknown custom API "${name}".`);
  return fn(payload || {}, data, ctx);
}
