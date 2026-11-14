// tests/e2e/helpers/e2e-harness.mjs
// Comprehensive E2E test harness for Supply Chain System V2.
// Manages server child process on ephemeral ports, dual-backend storage (PGlite/Postgres & SQLite),
// user seeding with must_change_password=0, cookie authentication, and opaque-box HTTP API client.

import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { DatabaseSync } from 'node:sqlite';

export const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

export const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function startE2EHarness(options = {}) {
  const backend = options.backend || process.env.BACKEND || 'pg';
  const tmpDir = options.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'scs-e2e-'));
  fs.mkdirSync(path.join(tmpDir, 'uploads'), { recursive: true });

  const serverPort = options.port || (await freePort());
  const adminEmail = (options.adminEmail || 'admin@test.com').toLowerCase();
  const adminPassword = options.adminPassword || 'test-admin-password-1234';

  let db = null;
  let pgSocket = null;
  let pgPort = null;
  let databaseUrl = options.databaseUrl || (backend === 'pg' ? process.env.DATABASE_URL : undefined);

  if (backend === 'pg') {
    if (!databaseUrl) {
      db = new PGlite();
      pgPort = await freePort();
      pgSocket = new PGLiteSocketServer({ db, port: pgPort, host: '127.0.0.1' });
      await pgSocket.start();
      databaseUrl = `postgres://postgres:postgres@127.0.0.1:${pgPort}/postgres`;
    }
  }

  const env = {
    ...process.env,
    PORT: String(serverPort),
    DATA_DIR: tmpDir,
    BACKEND: backend,
    DATABASE_URL: databaseUrl || '',
    PGSSL: 'disable',
    PG_POOL_MAX: '1',
    ADMIN_EMAIL: adminEmail,
    ADMIN_PASSWORD: adminPassword,
    ADMIN_NAME: 'Test Admin',
    ...(options.env || {}),
  };

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.mjs')], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  child.stdout.on('data', (d) => logs.push(`[stdout] ${d}`));
  child.stderr.on('data', (d) => logs.push(`[stderr] ${d}`));

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  // Poll /healthz for server readiness
  let ready = false;
  const timeoutAt = Date.now() + 20000;
  while (Date.now() < timeoutAt) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.status === 200) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  if (!ready) {
    child.kill();
    if (pgSocket) await pgSocket.stop();
    if (db) await db.close();
    throw new Error(`Server failed to start on ${baseUrl} within 20s.\nLogs:\n${logs.join('')}`);
  }

  // Ensure _users table has team_name column if schema sync hasn't added it
  if (db) {
    try {
      await db.query(`ALTER TABLE _users ADD COLUMN IF NOT EXISTS team_name TEXT DEFAULT NULL`);
    } catch {}
  } else if (backend === 'local') {
    const sdb = new DatabaseSync(path.join(tmpDir, 'app.db'));
    try {
      sdb.exec(`ALTER TABLE _users ADD COLUMN team_name TEXT DEFAULT NULL`);
    } catch {}
  }

  // Raw query execution helper
  const query = async (sql, params = []) => {
    if (db) {
      const res = await db.query(sql, params);
      return res.rows;
    }
    const sdb = new DatabaseSync(path.join(tmpDir, 'app.db'));
    return sdb.prepare(sql).all(...params);
  };

  // Seed user with must_change_password = 0 and role/team
  const seedUser = async ({ email, password, role = 'user', team_name = null, name = '' }) => {
    const pwHash = hashPassword(password);
    const now = new Date().toISOString();
    const cleanEmail = email.toLowerCase().trim();
    const displayName = name || cleanEmail;

    if (db) {
      await db.query(
        `INSERT INTO _users (email, name, password_hash, role, team_name, active, must_change_password, created_at)
         VALUES ($1, $2, $3, $4, $5, 1, 0, $6)
         ON CONFLICT (email) DO UPDATE SET password_hash = $3, role = $4, team_name = $5, must_change_password = 0, active = 1`,
        [cleanEmail, displayName, pwHash, role, team_name, now]
      );
    } else {
      const sdb = new DatabaseSync(path.join(tmpDir, 'app.db'));
      sdb.prepare(
        `INSERT INTO _users (email, name, password_hash, role, team_name, active, must_change_password, created_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?)
         ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role, team_name = excluded.team_name, must_change_password = 0, active = 1`
      ).run(cleanEmail, displayName, pwHash, role, team_name, now);
    }
  };

  // Seed record into database
  const seedRecord = async (table, recordData = {}) => {
    const cols = Object.keys(recordData);
    if (db) {
      if (cols.length === 0) {
        const res = await db.query(`INSERT INTO "${table}" DEFAULT VALUES RETURNING "ID"`);
        return String(res.rows[0].ID);
      }
      const colNames = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const vals = cols.map((c) => recordData[c]);
      const res = await db.query(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) RETURNING "ID"`, vals);
      return String(res.rows[0].ID);
    } else {
      const sdb = new DatabaseSync(path.join(tmpDir, 'app.db'));
      if (cols.length === 0) {
        const info = sdb.prepare(`INSERT INTO "${table}" DEFAULT VALUES`).run();
        return String(info.lastInsertRowid);
      }
      const colNames = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map(() => `?`).join(', ');
      const vals = cols.map((c) => recordData[c]);
      const info = sdb.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`).run(...vals);
      return String(recordData.ID || info.lastInsertRowid);
    }
  };

  // Clean table records
  const clearTable = async (table) => {
    if (db) {
      await db.query(`DELETE FROM "${table}"`);
    } else {
      const sdb = new DatabaseSync(path.join(tmpDir, 'app.db'));
      sdb.prepare(`DELETE FROM "${table}"`).run();
    }
  };

  // Sign in and return authenticated client
  const login = async (email, password) => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, password }).toString(),
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie') || '';
    const m = /hc_session=([^;]+)/.exec(setCookie);
    const cookieHeader = m ? `hc_session=${m[1]}` : '';
    return {
      status: res.status,
      location: res.headers.get('location'),
      token: m ? m[1] : null,
      cookie: cookieHeader,
      client: createHttpClient(baseUrl, cookieHeader),
    };
  };

  // Run CLI tool in child process
  const runCli = (scriptRelPath, args = [], envOverrides = {}) => new Promise((resolve) => {
    const fullScriptPath = path.join(ROOT, scriptRelPath);
    const cliEnv = {
      ...process.env,
      DATA_DIR: tmpDir,
      BACKEND: backend,
      DATABASE_URL: databaseUrl || '',
      PGSSL: 'disable',
      PG_POOL_MAX: '1',
      ...envOverrides,
    };

    const cp = spawn(process.execPath, [fullScriptPath, ...args], {
      cwd: ROOT,
      env: cliEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    cp.stdout.on('data', (d) => { stdout += d.toString(); });
    cp.stderr.on('data', (d) => { stderr += d.toString(); });

    cp.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });

  // Migrate media files directly against active DB
  const migrateFiles = async (options = {}) => {
    const outDir = options.outDir || path.join(tmpDir, 'uploads');
    const toolPath = pathToFileURL(path.join(ROOT, 'tools', 'migrate-zoho-files.mjs')).href;
    const { migratePgDb, migrateSqliteDb } = await import(toolPath);
    const config = {
      apiDomain: options.apiDomain || env.ZOHO_API_DOMAIN || baseUrl,
      ...(options.config || {}),
    };
    if (db) {
      return migratePgDb(db, {
        outDir,
        forms: options.forms,
        limit: options.limit,
        dryRun: options.dryRun,
        force: options.force,
        maxRetries: options.maxRetries || 2,
        delay: 0,
        config,
        ...options,
      });
    } else {
      const sdb = new DatabaseSync(path.join(tmpDir, 'app.db'));
      return migrateSqliteDb(sdb, {
        outDir,
        forms: options.forms,
        limit: options.limit,
        dryRun: options.dryRun,
        force: options.force,
        maxRetries: options.maxRetries || 2,
        delay: 0,
        config,
        ...options,
      });
    }
  };

  const stop = async () => {
    child.kill();
    await new Promise((r) => child.on('exit', r));
    if (pgSocket) await pgSocket.stop();
    if (db) await db.close();

    // Cleanup temp directory on Windows with retries
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  };

  return {
    baseUrl,
    port: serverPort,
    backend,
    tmpDir,
    uploadsDir: path.join(tmpDir, 'uploads'),
    databaseUrl,
    db,
    query,
    seedUser,
    seedRecord,
    clearTable,
    login,
    migrateFiles,
    createClient: (cookie) => createHttpClient(baseUrl, cookie),
    runCli,
    stop,
    logs,
  };
}

export function createHttpClient(baseUrl, cookieHeader = '') {
  const request = async (p, options = {}) => {
    const headers = {
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(options.headers || {}),
    };
    return fetch(`${baseUrl}${p}`, { ...options, headers });
  };

  const postJson = async (p, body = {}) => {
    const res = await request(p, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data, res };
  };

  return {
    request,
    postJson,
    getRecords: (report_name, criteria) => {
      const payload = { report_name };
      if (criteria !== undefined) payload.criteria = criteria;
      return postJson('/api/getRecords', payload);
    },
    getRecordById: (report_name, id) => postJson('/api/getRecordById', { report_name, id: String(id) }),
    addRecords: (form_name, data) => postJson('/api/addRecords', { form_name, payload: { data } }),
    updateRecordById: (report_name, id, data) => postJson('/api/updateRecordById', { report_name, id: String(id), payload: { data } }),
    updateRecords: (report_name, criteria, data) => postJson('/api/updateRecords', { report_name, payload: { criteria, data } }),
    deleteRecordById: (report_name, id) => postJson('/api/deleteRecordById', { report_name, id: String(id) }),
    invokeCustomApi: (api_name, payload) => postJson('/api/invokeCustomApi', { api_name, payload }),
    getPages: async () => {
      const res = await request('/api/pages');
      return { status: res.status, data: await res.json().catch(() => null), res };
    },
    uploadFile: async (report, id, field, name, fileBuffer) => {
      const queryParams = new URLSearchParams({ report, id: String(id), field, name });
      const res = await request(`/api/uploadFile?${queryParams.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: fileBuffer,
      });
      const data = await res.json().catch(() => null);
      return { status: res.status, data, res };
    },
    readFile: async (report_name, id, field_name) => {
      const res = await request('/api/readFile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_name, id: String(id), field_name }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json().catch(() => null);
        return { status: res.status, data, res, contentType };
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return { status: res.status, buffer, res, contentType };
    },
    getWidget: (section, tab, file = 'index.html') => request(`/w/${encodeURIComponent(section)}/${encodeURIComponent(tab)}/${encodeURIComponent(file)}`, { redirect: 'manual' }),
  };
}
