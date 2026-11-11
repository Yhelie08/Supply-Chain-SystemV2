// Local Supply Chain App server: serves the original Zoho widgets with a local SDK stand-in,
// and answers their data calls from SQLite.   npm run server  ->  http://localhost:4000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as store from './db.mjs';
import { invokeCustomApi } from './custom-apis.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const WIDGETS = path.join(ROOT, 'modules'); // one folder per section, see tools/import-widgets.mjs
const PUBLIC = path.join(import.meta.dirname, 'public');
const UPLOADS = path.join(store.DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const PORT = Number(process.env.PORT || 4000);

// Sections and tabs in Zoho menu order, written by tools/import-widgets.mjs.
const SECTIONS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'pages.json'), 'utf8')).map((s) => ({
  ...s,
  tabs: s.tabs.map((t) => ({ ...t, src: `/w/${t.widget.split('/').map(encodeURIComponent).join('/')}/${encodeURIComponent(t.entry)}` })),
}));

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject);
});
function serveFile(res, file, transform) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'Not found', 'text/plain');
  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  if (transform) body = transform(body.toString('utf8'));
  send(res, 200, body, MIME[ext] || 'application/octet-stream');
}
const inside = (base, p) => { const f = path.resolve(base, p); return f.startsWith(base + path.sep) ? f : null; };

// ---------- the SDK operations ----------
const api = {
  getRecords: (b, user) => ({ code: 3000, data: store.getRecords(b.report_name, { ...b, user }) }),
  getRecordById: (b) => ({ code: 3000, data: store.getRecordById(b.report_name, b.id) }),
  addRecords: (b, user) => {
    const data = b.payload?.data ?? b.data ?? {};
    if (Array.isArray(data)) {
      const result = data.map((d) => ({ code: 3000, data: { ID: store.addRecord(b.form_name, d, user) }, message: 'Data Added Successfully!' }));
      return { code: 3000, result, data: result.map((r) => r.data) };
    }
    return { code: 3000, data: { ID: store.addRecord(b.form_name, data, user) }, message: 'Data Added Successfully!' };
  },
  updateRecordById: (b) => ({ code: 3000, data: { ID: store.updateRecord(b.report_name, b.id, b.payload?.data ?? b.data ?? {}) }, message: 'Data Updated Successfully!' }),
  // Bulk update: every record of the report matching payload.criteria
  updateRecords: (b, user) => {
    const crit = b.payload?.criteria ?? b.criteria;
    const recs = store.getRecords(b.report_name, { criteria: crit, pageSize: 1000, user });
    if (!recs.length) throw new store.ZohoError(9280, 'No records found for the given criteria.');
    const data = b.payload?.data ?? b.data ?? {};
    const result = recs.map((r) => ({ code: 3000, data: { ID: store.updateRecord(b.report_name, r.ID, data) }, message: 'Data Updated Successfully!' }));
    return { code: 3000, result };
  },
  deleteRecordById: (b) => ({ code: 3000, data: { ID: store.deleteRecord(b.report_name, b.id) }, message: 'Record Deleted Successfully!' }),
  invokeCustomApi: (b) => ({ code: 3000, result: invokeCustomApi(b.api_name, b.payload) }),
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);
  const user = String(req.headers['x-user'] || 'admin@local');

  if (req.method === 'POST' && p === '/api/uploadFile') {
    const { report, id, field, name } = Object.fromEntries(url.searchParams);
    const fileName = `${Date.now()}_${String(name).replace(/[^\w.-]+/g, '_')}`;
    fs.writeFileSync(path.join(UPLOADS, fileName), await readBody(req));
    const fileUrl = `/uploads/${fileName}`;
    try { store.updateRecord(report, id, { [field]: fileUrl }); } catch (e) { return send(res, 200, { code: e.code || 3000, message: e.message }); }
    return send(res, 200, { code: 3000, data: { filepath: fileUrl, ID: id }, message: 'File uploaded' });
  }
  if (req.method === 'POST' && p.startsWith('/api/')) {
    const op = api[p.slice(5)];
    if (!op) return send(res, 404, { code: 404, message: `Unknown operation ${p}` });
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      return send(res, 200, op(body, user));
    } catch (e) {
      if (!(e instanceof store.ZohoError)) console.error(`[${p}]`, e);
      return send(res, 200, { code: e.code || 500, message: e.message });
    }
  }
  if (req.method === 'POST' && p === '/api/readFile') {
    const b = JSON.parse((await readBody(req)).toString('utf8') || '{}');
    try {
      const rec = store.getRecordById(b.report_name, b.id);
      const v = String(rec[b.field_name] || '');
      const f = v.startsWith('/uploads/') ? inside(UPLOADS, v.slice(9)) : null;
      if (!f || !fs.existsSync(f)) return send(res, 404, { code: 9280, message: 'File not found' });
      return serveFile(res, f);
    } catch (e) { return send(res, 404, { code: e.code || 9280, message: e.message }); }
  }
  if (p === '/api/pages') return send(res, 200, SECTIONS);
  if (p === '/api/tables') return send(res, 200, store.tableCounts());
  if (p.startsWith('/uploads/')) { const f = inside(UPLOADS, p.slice(9)); return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain'); }
  if (p.startsWith('/w/')) {
    // /w/<Section>/<Tab>/<file>  ->  modules/<Section>/<Tab>/app/<file>
    const f = inside(WIDGETS, p.slice(3).replace(/^([^/]+\/[^/]+)\//, '$1/app/'));
    if (!f) return send(res, 404, 'Not found', 'text/plain');
    // Swap Zoho's SDK for the local stand-in; everything else in the widget is untouched.
    return serveFile(res, f, f.endsWith('.html') ? (html) => html.replace(/<script[^>]*src="[^"]*widgetsdk[^"]*"[^>]*><\/script>/i, '<script src="/zoho-shim.js"></script>') : undefined);
  }
  if (p === '/' ) return serveFile(res, path.join(PUBLIC, 'index.html'));
  const f = inside(PUBLIC, p.slice(1));
  return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain');
}

http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); send(res, 500, { code: 500, message: e.message }); }))
  .listen(PORT, () => {
    console.log(`Supply Chain App (local) running at http://localhost:${PORT}`);
    console.log(`Database: ${path.join(store.DATA_DIR, 'app.db')}  (${Object.keys(store.columns).length} tables from the .ds)`);
    console.log(`Pages: ${SECTIONS.map((s) => `${s.label} ${s.tabs.length}`).join(', ')}`);
  });
