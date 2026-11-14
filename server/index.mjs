// Supply Chain App server: serves the original Zoho widgets with a local SDK stand-in, answers their
// data calls from the backend chosen by BACKEND (pg = Postgres, local = SQLite; Zoho Creator is not a backend),
// and requires sign-in for everything. Users and sessions are in SQLite on local and in Postgres on pg.
//   npm start  ->  http://localhost:4000   (env: PORT, DATA_DIR, ADMIN_EMAIL, ADMIN_PASSWORD, BACKEND, DATABASE_URL; see .env.example)
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import * as store from './db.mjs';
import * as auth from './auth.mjs';
import { invokeCustomApi } from './custom-apis.mjs';
import { createAccess } from './access.mjs';
import { handleCmsIntegration } from './integrations/cms.mjs';

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

const access = createAccess(SECTIONS, WIDGETS); // tabs flagged adminOnly in pages.json (Policy Settings) are for admins

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4', '.pdf': 'application/pdf' };
const SECURITY_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "frame-ancestors 'self'" };
const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
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
// Theme layer (server/public/theme): tag which style system the widget uses and which section's
// line it belongs to, then load theme.css last in <head> so it wins over the widget's own styles.
const THEME_HEAD = '<script src="/theme/theme-init.js"></script>'
  + '<link rel="preload" href="/theme/fonts/overpass-latin.woff2" as="font" type="font/woff2" crossorigin>'
  + '<link rel="stylesheet" href="/theme/theme.css">'
  + '<link rel="stylesheet" href="/theme/views.css">'
  + '<script src="/theme/views.js" defer></script>';
function applyTheme(html, line) {
  const kit = /dms-tokens\.css/.test(html) ? 'dms' : /cdn\.tailwindcss\.com/.test(html) ? 'tw' : 'legacy';
  const attrs = `data-hc-kit="${kit}" data-hc-line="${line}"`;
  html = /<html\b/i.test(html) ? html.replace(/<html\b/i, `<html ${attrs}`) : `<html ${attrs}>${html}`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${THEME_HEAD}</head>`) : THEME_HEAD + html;
}
// The widgets still say "Zoho Creator" in a few messages people read. There is no Zoho any more, so say what is true.
const plainWords = (html) => html
  .replace(/Loading from Zoho Creator(…|\.\.\.)/g, 'Loading$1')
  .replace(/正在从 Zoho Creator 加载…/g, '正在加载…')
  .replace(/Loaded from Zoho Creator:/g, 'Loaded from the local database:')
  .replace(/Failed to load records from Zoho Creator\./g, 'Failed to load records.')
  // The scoreboards read dates as MM-dd-yyyy only; the local database stores yyyy-MM-dd. Let them read both.
  .replace(/var mm=parseInt\(parts\[0\],10\), dd=parseInt\(parts\[1\],10\), yyyy=parseInt\(parts\[2\],10\);/g,
    'if (parts[0].length === 4) parts = [parts[1], parts[2], parts[0]]; var mm=parseInt(parts[0],10), dd=parseInt(parts[1],10), yyyy=parseInt(parts[2],10);');
const inside = (base, p) => { const f = path.resolve(base, p); return f.startsWith(base + path.sep) ? f : null; };

// Backend mode: 'local' (offline SQLite, default) or 'pg' (Postgres). Zoho Creator is no longer used.
const BACKEND = process.env.BACKEND || 'local';
if (BACKEND !== 'local' && BACKEND !== 'pg') {
  console.warn(`[server] BACKEND=${BACKEND} is not supported (use local or pg); running on local SQLite.`);
}
if (BACKEND !== 'pg') {
  console.warn('[server] Delivery workflows are OFF without BACKEND=pg (scheduling engine, field work, exception queue). Use BACKEND=pg or npm run dev:pg.');
}

// ---------- the SDK operations (answered from SQLite; there is no Zoho Creator connection) ----------
const localApi = {
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
  invokeCustomApi: async (b) => ({ code: 3000, result: await invokeCustomApi(b.api_name, b.payload) }),
};

const DATA_SOURCE = BACKEND === 'pg' ? 'Postgres' : 'Local SQLite';

// 'pg' keeps the business data, the users and the sessions in Postgres (DATABASE_URL).
let api;
let activeStore;
let tableCounts = () => store.tableCounts();
if (BACKEND === 'pg') {
  const { startPg } = await import('./pg/api.mjs');
  const pg = await startPg(invokeCustomApi);
  api = pg.api;
  activeStore = pg.store;
  tableCounts = () => pg.store.tableCounts();
  // The scheduled workflows the modules list (off unless SCHEDULES=on): see server/schedules.mjs.
  const { startSchedules } = await import('./schedules.mjs');
  const { modules } = await import('./modules/index.mjs');
  startSchedules({ pool: pg.pool, store: pg.store, schedules: modules.flatMap((m) => m.schedules || []) });
} else {
  api = localApi;
  activeStore = store;
}

// ---------- sign-in helpers ----------
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).filter((c) => c.includes('='))
  .map((c) => { const i = c.indexOf('='); return [c.slice(0, i), decodeURIComponent(c.slice(i + 1))]; }));
const isHttps = (req) => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const sessionCookie = (req, token, maxAge) => `${auth.COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
// Behind Railway's proxy the last X-Forwarded-For entry is the address the proxy saw; earlier
// entries come from the client and could be forged to dodge the sign-in lockout.
const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',').pop().trim();
const redirect = (res, to, headers = {}) => { res.writeHead(302, { Location: to, 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...headers }); res.end(); };
const readJson = async (req) => JSON.parse((await readBody(req)).toString('utf8') || '{}');
const readForm = async (req) => Object.fromEntries(new URLSearchParams((await readBody(req)).toString('utf8')));
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/');
const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

// Account and user-management endpoints (signed-in users; /api/admin/* admins only).
async function accountApi(req, res, p, me) {
  try {
    // Admins also see where the data comes from (shown in the account menu).
    if (p === '/api/me') return send(res, 200, me.role === 'admin' ? { ...me, dataSource: DATA_SOURCE } : me);
    if (p === '/api/account/password' && req.method === 'POST') {
      const b = await readJson(req);
      await auth.changeOwnPassword(me.id, b.current, b.next);
      // Changing the password ends every session, this one included: sign in again with the new one.
      const { token } = await auth.signIn(me.email, b.next, clientIp(req));
      res.setHeader('Set-Cookie', sessionCookie(req, token, auth.cookieMaxAge));
      return send(res, 200, { ok: true });
    }
    if (!p.startsWith('/api/admin/')) return false;
    if (me.role !== 'admin') return send(res, 403, { message: 'Only admins can manage users.' });
    const m = /^\/api\/admin\/users(?:\/(\d+)(\/reset)?)?$/.exec(p);
    if (!m) return send(res, 404, { message: 'Not found' });
    const [, id, reset] = m;
    if (!id && req.method === 'GET') return send(res, 200, await auth.listUsers());
    if (!id && req.method === 'POST') {
      const b = await readJson(req);
      const password = auth.newPassword();
      const user = await auth.createUser({ email: b.email, name: b.name, role: b.role, team_name: b.team_name, password, mustChange: true });
      return send(res, 200, { user, password });
    }
    if (id && reset && req.method === 'POST') {
      const password = auth.newPassword();
      await auth.setPassword(id, password, { mustChange: true });
      return send(res, 200, { user: await auth.getUser(id), password });
    }
    if (id && req.method === 'POST') {
      if (Number(id) === me.id) {
        const b = await readJson(req);
        if (b.role === 'user' || b.active === false) return send(res, 400, { message: 'You cannot remove your own admin access.' });
        return send(res, 200, await auth.updateUser(id, b));
      }
      return send(res, 200, await auth.updateUser(id, await readJson(req)));
    }
    if (id && req.method === 'DELETE') {
      if (Number(id) === me.id) return send(res, 400, { message: 'You cannot delete your own account.' });
      await auth.deleteUser(id);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { message: 'Method not allowed' });
  } catch (e) {
    return send(res, 400, { message: e.message });
  }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = decodeURIComponent(url.pathname);

  // ---------- public: health check, sign-in page, theme files ----------
  if (p === '/healthz') return send(res, 200, { ok: true });
  if (p.startsWith('/theme/')) { const f = inside(path.join(PUBLIC, 'theme'), p.slice(7)); return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain'); }

  // ---------- external integrations (authenticate via API key, bypass session cookie) ----------
  if (p.startsWith('/api/integrations/cms/')) {
    return handleCmsIntegration(req, res, p, activeStore, readJson, send);
  }
  const token = cookies(req)[auth.COOKIE];
  const me = await auth.userForToken(token);
  if (p === '/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const b = await readForm(req);
    const next = safeNext(b.next);
    if (auth.tooManyAttempts(ip)) return redirect(res, `/login?e=locked&next=${encodeURIComponent(next)}`);
    const s = await auth.signIn(b.email, b.password, ip);
    if (!s) return redirect(res, `/login?e=1&next=${encodeURIComponent(next)}`);
    return redirect(res, s.user.mustChangePassword ? '/account?first=1' : next, { 'Set-Cookie': sessionCookie(req, s.token, auth.cookieMaxAge) });
  }
  if (p === '/login') return me ? redirect(res, '/') : serveFile(res, path.join(PUBLIC, 'login.html'));
  if (p === '/logout' && req.method === 'POST') {
    await auth.signOut(token);
    return redirect(res, '/login', { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  // ---------- everything below needs a signed-in user ----------
  if (!me) return p.startsWith('/api/') ? send(res, 401, { code: 401, message: 'Sign in first.' }) : redirect(res, `/login?next=${encodeURIComponent(p.startsWith('/w/') ? '/' : url.pathname + url.search)}`);
  const accountPage = p === '/account' || p === '/api/me' || p === '/api/account/password';
  if (me.mustChangePassword && !accountPage) return p.startsWith('/api/') ? send(res, 403, { code: 403, message: 'Set a new password first.' }) : redirect(res, '/account?first=1');
  if (p.startsWith('/api/me') || p.startsWith('/api/account/') || p.startsWith('/api/admin/')) {
    const handled = await accountApi(req, res, p, me);
    if (handled !== false) return;
  }
  if (p === '/account') return serveFile(res, path.join(PUBLIC, 'account.html'));
  if (p === '/admin/users') return me.role === 'admin' ? serveFile(res, path.join(PUBLIC, 'users.html')) : redirect(res, '/');
  const user = me.email;

  if (req.method === 'POST' && p === '/api/uploadFile') {
    const { report, id, field, name } = Object.fromEntries(url.searchParams);
    const denied = access.checkUpload(me, report);
    if (denied) return send(res, 200, denied);
    const fileName = `${Date.now()}_${String(name).replace(/[^\w.-]+/g, '_')}`;
    fs.writeFileSync(path.join(UPLOADS, fileName), await readBody(req));
    const fileUrl = `/uploads/${fileName}`;
    try { await api.updateRecordById({ report_name: report, id, payload: { data: { [field]: fileUrl } } }); } catch (e) { return send(res, 200, { code: e.code || 3000, message: e.message }); }
    return send(res, 200, { code: 3000, data: { filepath: fileUrl, ID: id }, message: 'File uploaded' });
  }
  if (req.method === 'POST' && p === '/api/readFile') {
    const b = await readJson(req);
    try {
      const rec = (await api.getRecordById({ report_name: b.report_name, id: b.id })).data;
      const deniedRec = access.checkRecordAccess(me, b.report_name, rec);
      if (deniedRec) return send(res, 403, deniedRec);
      const v = String(rec[b.field_name] || '');
      const f = v.startsWith('/uploads/') ? inside(UPLOADS, v.slice(9)) : null;
      if (!f || !fs.existsSync(f)) return send(res, 404, { code: 9280, message: 'File not found' });
      return serveFile(res, f);
    } catch (e) { return send(res, 404, { code: e.code || 9280, message: e.message }); }
  }
  if (req.method === 'POST' && p.startsWith('/api/')) {
    const op = api[p.slice(5)];
    if (!op) return send(res, 404, { code: 404, message: `Unknown operation ${p}` });
    try {
      const body = await readJson(req);
      const denied = access.checkCall(me, p.slice(5), body);
      if (denied) return send(res, 200, denied);

      const opName = p.slice(5);

      if (opName === 'getRecords' && body.report_name) {
        body.criteria = access.scopeCriteria(me, body.report_name, body.criteria);
      } else if (opName === 'updateRecords' && body.report_name) {
        const crit = body.payload?.criteria ?? body.criteria;
        const scoped = access.scopeCriteria(me, body.report_name, crit);
        if (body.payload && 'criteria' in body.payload) body.payload.criteria = scoped;
        else body.criteria = scoped;

        if (me.team_name) {
          const data = body.payload?.data ?? body.data ?? {};
          if ((data.Installer && data.Installer !== me.team_name) || (data.Assigned_to_Installer && data.Assigned_to_Installer !== me.team_name)) {
            return send(res, 200, { code: 403, message: 'Cannot assign records to other teams.' });
          }
        }
      } else if (opName === 'updateRecordById' || opName === 'deleteRecordById') {
        if (me.team_name && body.report_name && body.id) {
          try {
            const existing = await activeStore.getRecordById(body.report_name, body.id);
            const record = existing?.data ?? existing;
            const deniedRec = access.checkRecordAccess(me, body.report_name, record);
            if (deniedRec) return send(res, 200, deniedRec);
          } catch (e) {
            // Let op handle not found
          }
          if (opName === 'updateRecordById') {
            const data = body.payload?.data ?? body.data ?? {};
            if ((data.Installer && data.Installer !== me.team_name) || (data.Assigned_to_Installer && data.Assigned_to_Installer !== me.team_name)) {
              return send(res, 200, { code: 403, message: 'Cannot assign records to other teams.' });
            }
          }
        }
      }

      const result = await op(body, user);
      if (opName === 'getRecordById' && me.team_name && body.report_name && result?.data) {
        const deniedRec = access.checkRecordAccess(me, body.report_name, result.data);
        if (deniedRec) return send(res, 404, { code: 9280, message: 'No records found for the given criteria.' });
      }
      return send(res, 200, result);
    } catch (e) {
      if (!(e instanceof store.ZohoError)) console.error(`[${p}]`, e);
      return send(res, 200, { code: e.code || 500, message: e.message });
    }
  }
  if (p === '/api/pages') return send(res, 200, access.visibleSections(me));
  if (p === '/api/tables') return send(res, 200, await tableCounts());
  if (p.startsWith('/uploads/')) { const f = inside(UPLOADS, p.slice(9)); return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain'); }
  if (p.startsWith('/w/')) {
    // /w/<Section>/<Tab>/<file>  ->  modules/<Section>/<Tab>/app/<file>
    const f = inside(WIDGETS, p.slice(3).replace(/^([^/]+\/[^/]+)\//, '$1/app/'));
    if (!f) return send(res, 404, 'Not found', 'text/plain');
    if (!access.canServeFile(me, f)) return redirect(res, '/'); // admin-only tab (Policy Settings), checked on the resolved path
    // Swap Zoho's SDK for the local stand-in (told who is signed in) and add the theme layer.
    // Everything else in the widget is untouched.
    return serveFile(res, f, f.endsWith('.html') ? (html) => {
      const who = `<script>window.HC_USER=${jsonForScript({ email: me.email, name: me.name, team_name: me.team_name || null })}</script>`;
      html = html.replace(/<script[^>]*src="[^"]*widgetsdk[^"]*"[^>]*><\/script>/i, `${who}<script src="/zoho-shim.js"></script>`);
      html = plainWords(html);
      const section = SECTIONS.find((s) => s.label === p.slice(3).split('/')[0]);
      return applyTheme(html, section ? section.id : 'analytic');
    } : undefined);
  }
  if (p === '/' ) return serveFile(res, path.join(PUBLIC, 'index.html'));
  const f = inside(PUBLIC, p.slice(1));
  return f ? serveFile(res, f) : send(res, 404, 'Not found', 'text/plain');
}

http.createServer((req, res) => handle(req, res).catch((e) => { console.error(e); send(res, 500, { code: 500, message: e.message }); }))
  .listen(PORT, async () => {
    const note = await auth.bootstrapAdmin();
    if (note) console.log(note);
    console.log(`Supply Chain App running on port ${PORT}`);
    console.log(`Database: ${path.join(store.DATA_DIR, 'app.db')}  (${Object.keys(store.columns).length} tables from the .ds)`);
    const filled = (await tableCounts()).reduce((n, t) => n + t.rows, 0);
    if (!filled) console.log('Database is empty. Load mock data with: npm run seed');
    console.log(`Pages: ${SECTIONS.map((s) => `${s.label} ${s.tabs.length}`).join(', ')}`);
  });
